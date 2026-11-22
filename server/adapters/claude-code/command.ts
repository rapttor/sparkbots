import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "../../config";
import type { SendOpts } from "../types";
import { SAFE_TOOL } from "../../../src/shared/claudeStream";

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

  /** SIGTERM only children this process spawned. */
  stop(runId: string) {
    const c = this.children.get(runId); const r = this.runs.find((x) => x.runId === runId);
    if (!c || !r) throw new CommandError(404, "Not an office-owned running run");
    r.status = "stopped"; c.kill("SIGTERM");
  }
}
