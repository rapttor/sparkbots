import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "../../config";
import type { SendOpts } from "../types";
import { SAFE_TOOL, describeToolInput, type ApprovalResolvedLine } from "../../../src/shared/claudeStream";
import { LiveProcess } from "./live";

export interface RunRecord {
  runId: string; session?: string; cwd: string; prompt: string; pid: number;
  status: "running" | "done" | "error" | "stopped" | "orphaned"; startedAt: number; endedAt?: number; exitCode?: number | null;
}
interface Registry { schemaVersion: 1; runs: RunRecord[] }
export type RunEvent = { runId: string; session?: string; line: unknown };

export class CommandError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const FORBIDDEN_MODES = new Set(["bypassPermissions"]);

/** Build the argv for `claude`. Pure + exported so it can be unit-tested. Never a shell string. */
export function buildArgs(prompt: string, session: string | undefined, opts: SendOpts): string[] {
  if (opts.permissionMode && FORBIDDEN_MODES.has(opts.permissionMode)) throw new CommandError(400, "bypassPermissions is never allowed");
  const safePrompt = prompt.startsWith("-") ? " " + prompt : prompt; // can't be read as a flag
  const a = ["-p", safePrompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
  if (session) a.push("--resume", session);
  if (session && opts.fork) a.push("--fork-session");
  return [...a, ...optionArgs(opts)];
}

/**
 * Argv for a live (long-lived, stdin stream-json) process: permission questions come back to us as control requests.
 * Same validation as `buildArgs`; bypassPermissions is refused, no `--dangerously-*` flag ever appears.
 */
export function buildLiveArgs(session: string, opts: SendOpts): string[] {
  if (opts.permissionMode && FORBIDDEN_MODES.has(opts.permissionMode)) throw new CommandError(400, "bypassPermissions is never allowed");
  return ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-prompt-tool", "stdio", "--resume", session, ...optionArgs(opts)];
}

/** The `--model`, `--add-dir`, `--permission-mode` and `--allowedTools` arguments, validated. */
function optionArgs(opts: SendOpts): string[] {
  const a: string[] = [];
  if (opts.model !== undefined && opts.model !== "") {
    // alias (opus, sonnet, haiku) or a model id; never anything that could be read as a flag
    if (!/^[A-Za-z0-9][A-Za-z0-9._:\-\[\]]{0,79}$/.test(opts.model)) throw new CommandError(400, "invalid model name");
    a.push("--model", opts.model);
  }
  for (const d of opts.addDirs ?? []) { // folders the run may read (attached files): absolute, no parent hops, never flag-like
    if (!d.startsWith("/") || d.split("/").includes("..") || /[\0\n]/.test(d)) throw new CommandError(400, "invalid attachment folder");
    a.push(`--add-dir=${d}`);
  }
  if (opts.permissionMode) a.push("--permission-mode", opts.permissionMode);
  if (opts.allowedTools?.length) a.push(`--allowedTools=${opts.allowedTools.join(",")}`);
  return a;
}

/** A copy of `env` without the ANTHROPIC_* variables (gateway URL, tokens, model overrides) a shell may have exported. */
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith("ANTHROPIC_")));
}

export class RunManager {
  private children = new Map<string, ChildProcess>();
  private queues = new Map<string, { prompt: string; cwd: string; opts: SendOpts }[]>();
  private busy = new Set<string>();
  listeners = new Set<(e: RunEvent) => void>();
  /** Called whenever the run registry changes (start, finish, session id learned). */
  onChange?: () => void;
  /** Environment for spawned `claude` processes (default: ours). */
  envProvider: () => NodeJS.ProcessEnv = () => process.env;
  runs: RunRecord[];
  /** Options each run was started with (memory only), so "Allow this tool & retry" can repeat the run. */
  private optsByRun = new Map<string, SendOpts>();
  /** Opt-in (Settings): keep one `claude` process per chat so permission questions can be answered from the chat. Default off. */
  liveMode: () => boolean = () => false;
  /** Live processes by session; `cur` is the turn (run) in progress, `open` the unanswered permission questions. */
  private lives = new Map<string, { lp: LiveProcess; cur?: RunRecord; open: Set<string> }>();

  /** `isLiveInTerminal(sessionId)` comes from liveness; `bin` is injectable for tests. */
  constructor(private isLiveInTerminal: (s: string) => boolean, private bin = "claude", private pidAlive = (p: number) => { try { process.kill(p, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } }) {
    this.runs = loadJson<Registry>("runs.json", { schemaVersion: 1, runs: [] }).runs;
    for (const r of this.runs) if (r.status === "running") r.status = this.pidAlive(r.pid) ? "orphaned" : "error"; // started by a previous server
    this.persist();
  }
  private persist() { saveJson("runs.json", { schemaVersion: 1, runs: this.runs.slice(-200) }); this.onChange?.(); }

  queueLength(session: string) { return this.queues.get(session)?.length ?? 0; }

  send(session: string, cwd: string, prompt: string, opts: SendOpts = {}) {
    if (!opts.fork && this.isLiveInTerminal(session)) throw new CommandError(409, "Session is live in a terminal — fork it to a new worker instead");
    buildArgs(prompt, session, opts); // validate early
    if (this.busy.has(session)) { (this.queues.get(session) ?? this.queues.set(session, []).get(session)!).push({ prompt, cwd, opts }); return { queued: true as const, position: this.queueLength(session) }; }
    return { queued: false as const, run: this.start(session, cwd, prompt, opts) };
  }
  spawnNew(cwd: string, prompt: string, opts: SendOpts = {}) { return this.start(undefined, cwd, prompt, opts); }

  private start(session: string | undefined, cwd: string, prompt: string, opts: SendOpts): RunRecord {
    if (session && !opts.fork && this.liveMode()) return this.startLive(session, cwd, prompt, opts);
    const args = buildArgs(prompt, session, opts);
    const child = spawn(this.bin, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env: this.envProvider() });
    const rec: RunRecord = { runId: randomUUID(), session: opts.fork ? undefined : session, cwd, prompt, pid: child.pid ?? -1, status: "running", startedAt: Date.now() };
    this.optsByRun.set(rec.runId, opts); if (this.optsByRun.size > 200) this.optsByRun.delete(this.optsByRun.keys().next().value!);
    this.runs.push(rec); this.children.set(rec.runId, child); if (session && !opts.fork) this.busy.add(session); this.persist();
    let buf = "";
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString("utf8"); const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) { try { const j = JSON.parse(l); if (!rec.session && typeof j.session_id === "string") { rec.session = j.session_id; this.persist(); } this.emit({ runId: rec.runId, session: rec.session, line: j }); } catch { /* non-JSON noise */ } }
    });
    const end = (code: number | null, err = false) => {
      if (rec.endedAt) return;
      rec.endedAt = Date.now(); rec.exitCode = code;
      if (rec.status === "running") rec.status = err || code !== 0 ? "error" : "done";
      this.children.delete(rec.runId); this.persist();
      const s = session && !opts.fork ? session : undefined;
      if (s) { this.busy.delete(s); const next = this.queues.get(s)?.shift(); if (next) { try { this.start(s, next.cwd, next.prompt, next.opts); } catch { /* ignore */ } } }
    };
    child.on("error", () => end(null, true)); child.on("close", (c) => end(c));
    return rec;
  }
  /** One turn of a chat through its long-lived process (spawned on demand, resumed by session id). */
  private startLive(session: string, cwd: string, prompt: string, opts: SendOpts): RunRecord {
    const args = buildLiveArgs(session, opts), key = JSON.stringify([cwd, args]);
    let e = this.lives.get(session);
    if (e && (e.lp.exited || e.lp.key !== key)) { if (!e.lp.exited) e.lp.close(); this.lives.delete(session); e = undefined; } // options changed: resume in a fresh process
    if (!e) {
      const entry = { open: new Set<string>() } as { lp: LiveProcess; cur?: RunRecord; open: Set<string> };
      const say = (line: unknown) => { if (entry.cur) this.emit({ runId: entry.cur.runId, session, line }); };
      entry.lp = new LiveProcess(this.bin, args, cwd, this.envProvider(), {
        onLine: say,
        onApproval: (req) => {
          if (!entry.cur || req.tool === "AskUserQuestion") { entry.lp.respond(req.requestId, false, req.tool === "AskUserQuestion" ? "Questions are not supported in the SparkBots chat; decide yourself and say what you assumed." : "No active run"); return; }
          entry.open.add(req.requestId);
          say({ type: "approval_request", request_id: req.requestId, tool_name: req.tool, input: req.input, description: req.description || describeToolInput(req.tool, req.input) });
        },
        onCancel: (id) => { entry.open.delete(id); say({ type: "approval_resolved", request_id: id, decision: "cancelled" } satisfies ApprovalResolvedLine); },
        onResult: (line) => { this.endTurn(session, entry, line.is_error === true ? 1 : 0); },
        onExit: (code, err) => {
          if (this.lives.get(session) === entry) this.lives.delete(session);
          for (const id of entry.open) say({ type: "approval_resolved", request_id: id, decision: "cancelled" } satisfies ApprovalResolvedLine);
          entry.open.clear();
          this.endTurn(session, entry, err ? null : code, err);
        },
      }, key);
      this.lives.set(session, entry); e = entry;
    }
    const entry = e;
    const rec: RunRecord = { runId: randomUUID(), session, cwd, prompt, pid: entry.lp.pid, status: "running", startedAt: Date.now() };
    this.optsByRun.set(rec.runId, opts); if (this.optsByRun.size > 200) this.optsByRun.delete(this.optsByRun.keys().next().value!);
    this.runs.push(rec); this.children.set(rec.runId, entry.lp.child); this.busy.add(session); entry.cur = rec; this.persist();
    entry.lp.sendPrompt(prompt);
    return rec;
  }
  /** The turn in progress finished (result line) or its process ended: close its record, then start the next queued message. */
  private endTurn(session: string, entry: { lp: LiveProcess; cur?: RunRecord }, code: number | null, err = false) {
    const rec = entry.cur; if (!rec) return;
    entry.cur = undefined;
    rec.endedAt = Date.now(); rec.exitCode = code;
    if (rec.status === "running") rec.status = err || code !== 0 ? "error" : "done";
    this.children.delete(rec.runId); this.busy.delete(session); this.persist();
    if (!entry.lp.exited) entry.lp.closeWhenIdle();
    const next = this.queues.get(session)?.shift();
    if (next) { try { this.start(session, next.cwd, next.prompt, next.opts); } catch { /* ignore */ } }
  }
  /** Answer a permission question of a running live turn (from the chat's Allow / Deny buttons). Allow once; never persisted. */
  respondApproval(runId: string, requestId: string, allow: boolean) {
    for (const [session, e] of this.lives) {
      if (e.cur?.runId !== runId) continue;
      if (!e.open.has(requestId) || !e.lp.respond(requestId, allow, "Denied in the SparkBots chat")) throw new CommandError(404, "That question is no longer open");
      e.open.delete(requestId);
      this.emit({ runId, session, line: { type: "approval_resolved", request_id: requestId, decision: allow ? "allow" : "deny" } satisfies ApprovalResolvedLine });
      return;
    }
    throw new CommandError(404, "That run is not waiting for an answer");
  }
  /** PIDs of the live processes we own (so liveness does not mistake them for a terminal). */
  livePids(): Set<number> { return new Set([...this.lives.values()].filter((e) => !e.lp.exited).map((e) => e.lp.pid)); }
  /** Close every live process (graceful: stdin ends, the CLI exits). */
  closeLive() { for (const e of this.lives.values()) e.lp.close(); }

  /**
   * Re-send a finished run's prompt with extra tools allowed for this one run only (`--allowedTools`, never persisted, never bypassPermissions).
   * `base` is used when the original options are no longer known (server restart).
   */
  retryWithTools(runId: string, tools: string[], base: SendOpts = {}) {
    const rec = this.runs.find((r) => r.runId === runId);
    if (!rec) throw new CommandError(404, "Unknown run");
    if (rec.status === "running") throw new CommandError(409, "That run is still going");
    if (!tools.length || tools.length > 20 || !tools.every((t) => SAFE_TOOL.test(t))) throw new CommandError(400, "invalid tool name");
    const o = { ...(this.optsByRun.get(runId) ?? base) };
    const opts: SendOpts = { ...o, fork: false, allowedTools: [...new Set([...(o.allowedTools ?? []), ...tools])] };
    return rec.session ? this.send(rec.session, rec.cwd, rec.prompt, opts) : { queued: false as const, run: this.spawnNew(rec.cwd, rec.prompt, opts) };
  }
  private emit(e: RunEvent) { for (const l of this.listeners) l(e); }

  /**
   * Register a child another adapter (OpenCode) spawned so it shows in the run registry, can be stopped, and is
   * flagged orphaned after a restart. `onEnd` runs once the child is gone. Parsing stays with the adapter.
   */
  track(child: ChildProcess, info: { session?: string; cwd: string; prompt: string }, onEnd?: () => void): RunRecord {
    const rec: RunRecord = { runId: randomUUID(), session: info.session, cwd: info.cwd, prompt: info.prompt, pid: child.pid ?? -1, status: "running", startedAt: Date.now() };
    this.runs.push(rec); this.children.set(rec.runId, child); this.persist();
    const end = (code: number | null, err = false) => {
      if (rec.endedAt) return;
      rec.endedAt = Date.now(); rec.exitCode = code;
      if (rec.status === "running") rec.status = err || code !== 0 ? "error" : "done";
      this.children.delete(rec.runId); this.persist(); onEnd?.();
    };
    child.on("error", () => end(null, true)); child.on("close", (c) => end(c));
    return rec;
  }

  /** SIGTERM only children this process spawned. */
  stop(runId: string) {
    const c = this.children.get(runId); const r = this.runs.find((x) => x.runId === runId);
    if (!c || !r) throw new CommandError(404, "Not an office-owned running run");
    r.status = "stopped"; c.kill("SIGTERM");
  }
}
