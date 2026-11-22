import type { FastifyInstance } from "fastify";
import type { Company } from "./model/company";
import { RunManager, CommandError, type RunEvent } from "./adapters/claude-code/command";
import { foldLog, isStreamEvent, permissionDenials, textDelta } from "../src/shared/claudeStream";
import { teamFor } from "./adapters/claude-code/discover";
import type { Slice } from "../src/shared/sync";
import { registerBoard } from "./board/routes";
import { LabelError } from "./labels";
import { BotColorError } from "./botColors";
import { ArchiveError } from "./archive";
import { cleanEnv } from "./adapters/claude-code/command";
import { registerNotes } from "./notes";
import { listSlashCommands } from "./slashCommands";
import { registerUploads, resolveAttachments, withAttachments } from "./uploads";
import { registerServices } from "./services/routes";
import { registerGames } from "./games";
import { listSubagents } from "./adapters/claude-code/subagents";
import { recentMessages } from "./adapters/claude-code/transcript";
import { recentMessages as recentCodexMessages } from "./adapters/codex/transcript";
import { recentMessages as recentOpenCodeMessages } from "./adapters/opencode/transcript";
import { listArchived as listCodexArchived, loadArchived as loadCodexArchived } from "./adapters/codex/archive";
import { CodexCommandError, queueMessage as queueCodexMessage } from "./adapters/codex/command";
import { listModels as listOpenCodeModels, OpenCodeCommandError, queueMessage as queueOpenCodeMessage, setRunTracker as setOpenCodeTracker, spawnSession as spawnOpenCodeSession } from "./adapters/opencode/command";
import { listMcp } from "./mcp";
import { runPrompt, taskInfo, type TaskInfo } from "./tasks";
import { saveJson, type Config, type TeamOverride, type Teams } from "./config";
import { statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { AgentSource } from "./adapters/types";
import { CAFFEINE_START } from "./caffeine";
import { hookToEvents, isInstalled, readSettings, settingsPath } from "./adapters/claude-code/hooks";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 && v.length < 100_000 ? v : undefined);
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,100}$/;
const SOURCES: readonly AgentSource[] = ["claude", "codex", "opencode"];

/** Lets index.ts ask whether the task lists changed (it pings browsers when the signature differs). */
export const tasks: { fn: () => string } = { fn: () => "" };

export function registerRoutes(app: FastifyInstance, c: Company, onChange: () => void = () => {}, ping: (kind: Slice, id?: string) => void = () => {}): RunManager {
  const runs = new RunManager((id) => c.live.get(id)?.kind === "interactive");
  setOpenCodeTracker(runs);
  const log = new Map<string, unknown[]>(); // runId -> recent stream lines (in memory, for the chat panel)
  let lastDeltaPing = 0;
  runs.listeners.add((e: RunEvent) => {
    const a = foldLog(log.get(e.runId) ?? [], e.line); log.set(e.runId, a.length > 200 ? a.slice(-200) : a);
    if (c.rateLimit.observe(a)) onChange(); // 429 / usage limit seen (or cleared): the office gets nervous
    if (textDelta(e.line) !== null) { const now = Date.now(); if (now - lastDeltaPing < 120) return; lastDeltaPing = now; } // streamed text: do not wake every browser per token
    else if (isStreamEvent(e.line)) return;
    ping("runs");
  });
  runs.onChange = () => { ping("runs"); ping("processes"); };

  const teamOverride = (cwd: string): TeamOverride => c.teams.overrides[teamFor(cwd, c.teams.merges)] ?? {};
  /** Claude runs: the project's own model (when it is a Claude project) wins over the global Claude model. */
  const overrides = (cwd: string) => {
    const o = teamOverride(cwd);
    const model = o.source === "claude" && o.model ? o.model : c.cfg.runModel;
    return { ...(model ? { model } : {}), ...(o.allowedTools ? { allowedTools: o.allowedTools } : {}), ...(o.permissionMode ? { permissionMode: o.permissionMode } : {}) };
  };
  c.ownPids = () => runs.livePids();
  runs.liveMode = () => c.cfg.liveApproval === true;
  runs.envProvider = () => (c.cfg.cleanEnv ? cleanEnv(process.env) : process.env);
  const wrap = <T>(fn: () => T) => { try { return fn(); } catch (e) { if (e instanceof CommandError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; } };

  app.get("/api/caffeine", async () => ({ start: CAFFEINE_START, levels: c.caffeine.all() }));
  app.post<{ Params: { id: string }; Body: { kind?: string } }>("/api/caffeine/:id/bump", async (r) => {
    const kind = r.body?.kind === "food" ? "food" : "coffee";
    return { level: c.caffeine.bump(r.params.id, kind) };
  });
  app.post<{ Body: { on?: boolean } }>("/api/rate-limit", async (r) => { c.rateLimit.setManual(r.body?.on === true); onChange(); return { until: c.rateLimit.until() }; });

  app.get("/api/runs", async () => runs.runs.slice(-50));
  app.get<{ Params: { id: string } }>("/api/runs/:id/log", async (r) => log.get(r.params.id) ?? []);
  /** "Allow this tool & retry": only tools the run was actually denied can be allowed, for that one re-run. */
  app.post<{ Params: { id: string }; Body: { tools?: unknown } }>("/api/runs/:id/retry", async (req) => {
    const t = req.body?.tools; const asked = Array.isArray(t) && t.every((x) => typeof x === "string") ? (t as string[]) : [];
    const denied = new Set(permissionDenials(log.get(req.params.id) ?? []).map((d) => d.tool));
    if (!asked.length || !asked.every((t) => denied.has(t))) throw Object.assign(new Error("tools must be ones this run was denied"), { statusCode: 400 });
    const cwd = runs.runs.find((r) => r.runId === req.params.id)?.cwd;
    return wrap(() => runs.retryWithTools(req.params.id, asked, cwd ? overrides(cwd) : {}));
  });
  /** Live approval: answer a permission question of a running turn (allow once / deny). */
  app.post<{ Params: { id: string }; Body: { requestId?: unknown; allow?: unknown } }>("/api/runs/:id/approve", async (req) => {
    const rid = req.body?.requestId, allow = req.body?.allow;
    if (typeof rid !== "string" || !rid || typeof allow !== "boolean") throw bad("requestId and allow (boolean) required");
    return wrap(() => { runs.respondApproval(req.params.id, rid, allow); return { ok: true }; });
  });
  app.get<{ Querystring: { cwd?: string } }>("/api/slash-commands", async (r) => {
    const cwd = str(r.query?.cwd);
    if (!cwd || ![...c.sessions.values()].some((s) => s.cwd === cwd)) throw bad("a known project cwd is required");
    return listSlashCommands(cwd);
  });
  app.post<{ Body: { session?: string; prompt?: string; fork?: boolean; model?: string; attachments?: unknown } }>("/api/send", async (req) => {
    const session = str(req.body?.session), prompt = str(req.body?.prompt);
    const s = session ? c.sessions.get(session) : undefined;
    if (!s || !prompt) throw Object.assign(new Error("session and prompt required"), { statusCode: 400 });
    if (s.source === "codex") {
      if (req.body?.fork) throw Object.assign(new Error("Forking Codex chats is not supported yet"), { statusCode: 409 });
      if (Array.isArray(req.body?.attachments) && req.body.attachments.length) throw Object.assign(new Error("Attachments to Codex chats are not supported yet"), { statusCode: 409 });
      if (c.live.get(s.id)?.kind === "interactive") throw Object.assign(new Error("This Codex chat is open in a terminal. Close it there first so its transcript is not written by two writers."), { statusCode: 409 });
      try { await queueCodexMessage(s.id, prompt, s.cwd); }
      catch (e) { if (e instanceof CodexCommandError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; }
      ping("messages", s.id);
      return { queued: false as const, codex: true as const };
    }
    if (s.source === "opencode") {
      const att = resolveAttachments(req.body?.attachments);
      const team = teamOverride(s.cwd);
      // Explicit choice, then the project's model, then the global OpenCode model, then the chat's own model.
      const model = str(req.body?.model) || (team.source === "opencode" ? team.model : undefined) || c.cfg.opencodeModel || s.model;
      try { await queueOpenCodeMessage(s.id, withAttachments(prompt, att.files), s.cwd, { fork: !!req.body?.fork, files: att.files.map((f) => f.path), model }); }
      catch (e) { if (e instanceof OpenCodeCommandError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; }
      ping("messages", s.id);
      return { queued: false as const, opencode: true as const, model: model ?? null };
    }
    const att = resolveAttachments(req.body.attachments);
    return wrap(() => runs.send(s.id, s.cwd, withAttachments(prompt, att.files), { ...overrides(s.cwd), fork: !!req.body.fork, ...(str(req.body.model) ? { model: str(req.body.model) } : {}), ...(att.dirs.length ? { addDirs: att.dirs } : {}) }));
  });
  app.post<{ Body: { cwd?: string; prompt?: string; model?: string } }>("/api/spawn", async (req) => {
    const cwd = str(req.body?.cwd), prompt = str(req.body?.prompt);
    if (!cwd || !prompt || ![...c.sessions.values()].some((s) => s.cwd === cwd)) throw Object.assign(new Error("known project cwd and prompt required"), { statusCode: 400 });
    return wrap(() => runs.spawnNew(cwd, prompt, { ...overrides(cwd), ...(str(req.body?.model) ? { model: str(req.body?.model) } : {}) }));
  });
  /** Hire a new agent in a project: picks the project's configured working directory, source and model by default. */
  app.post<{ Body: { team?: string; cwd?: string; source?: string; model?: string; prompt?: string } }>("/api/hire", async (req) => {
    const body = req.body ?? {};
    const teamName = str(body.team);
    const ov: TeamOverride = (teamName ? c.teams.overrides[teamName] : undefined) ?? {};
    const cwd = str(body.cwd) ?? ov.cwd ?? (teamName ? [...c.sessions.values()].filter((s) => teamFor(s.cwd, c.teams.merges) === teamName).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.cwd : undefined);
    if (!cwd) throw Object.assign(new Error("a working directory (or a known project) is required"), { statusCode: 400 });
    if (!isAbsolute(cwd)) throw Object.assign(new Error("working directory must be an absolute path"), { statusCode: 400 });
    try { if (!statSync(cwd).isDirectory()) throw new Error(); } catch { throw Object.assign(new Error(`working directory does not exist: ${cwd}`), { statusCode: 400 }); }
    const prompt = str(body.prompt);
    if (!prompt) throw Object.assign(new Error("prompt required"), { statusCode: 400 });
    const source = (str(body.source) ?? ov.source ?? "claude") as AgentSource;
    if (!SOURCES.includes(source)) throw Object.assign(new Error("source must be claude, codex or opencode"), { statusCode: 400 });
    const model = str(body.model) ?? ov.model ?? (source === "opencode" ? c.cfg.opencodeModel : c.cfg.runModel) ?? undefined;
    if (model && !MODEL.test(model)) throw Object.assign(new Error("invalid model name"), { statusCode: 400 });
    if (source === "codex") throw Object.assign(new Error("Hiring Codex agents is not supported yet"), { statusCode: 400 });
    if (source === "opencode") {
      try { await spawnOpenCodeSession(cwd, prompt, { model }); }
      catch (e) { if (e instanceof OpenCodeCommandError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; }
      return { started: true, source, cwd, model: model ?? null };
    }
    return wrap(() => { const r = runs.spawnNew(cwd, prompt, { ...overrides(cwd), ...(model ? { model } : {}) }); return { started: true, source, cwd, model: model ?? null, runId: r.runId }; });
  });
  /** The model ids the local OpenCode CLI can use, for pickers and per-project defaults. */
  app.get("/api/opencode/models", async () => ({ models: await listOpenCodeModels() }));
  app.post<{ Body: { runId?: string } }>("/api/stop", async (req) => wrap(() => { runs.stop(str(req.body?.runId) ?? ""); return { ok: true }; }));
  app.get("/api/processes", async () => ({
    live: [...c.live.entries()].map(([session, i]) => ({ session, pid: i.pid, kind: i.kind, startedAt: i.startedAt, cwd: c.sessions.get(session)?.cwd, title: c.sessions.get(session)?.title })),
    runs: runs.runs.slice(-50),
  }));
  /** MCP servers configured per project (read-only; never started or contacted). */
  app.get("/api/mcp", async () => ({ projects: listMcp(new Set([...c.sessions.values()].map((x) => x.cwd))) }));
  app.post<{ Body: Record<string, unknown> }>("/hook", async (req) => { await c.applyHook(hookToEvents(req.body ?? {})); onChange(); return {}; });
  const teamSessions = (team: string) => [...c.sessions.values()].filter((x) => teamFor(x.cwd, c.teams.merges) === team).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const tasksNow = () => {
    const out: Record<string, TaskInfo | null> = {}; const seen = new Set<string>();
    for (const s of c.sessions.values()) { const t = teamFor(s.cwd, c.teams.merges); if (!seen.has(t)) { seen.add(t); out[t] = taskInfo(teamSessions(t)[0].cwd); } }
    return out;
  };
  app.get("/api/tasks", async () => tasksNow());
  tasks.fn = () => JSON.stringify(tasksNow());
  /** Run/Continue buttons: resume the team's newest session (not live in a terminal) or start a new one. */
  app.post<{ Body: { team?: string; mode?: string; target?: string; dryRun?: boolean } }>("/api/teams/run", async (req) => {
    const { team, mode, target, dryRun } = req.body ?? {};
    if (!team || (mode !== "phase" && mode !== "all") || (target !== "continue" && target !== "new")) throw Object.assign(new Error("team, mode (phase|all) and target (continue|new) required"), { statusCode: 400 });
    const sessions = teamSessions(team); if (!sessions.length) throw Object.assign(new Error("unknown team"), { statusCode: 404 });
    const cwd = sessions[0].cwd; // most recently active directory of the team
    const prompt = runPrompt(mode, taskInfo(cwd)?.file);
    const resumable = target === "continue" ? sessions.find((x) => x.cwd === cwd && c.live.get(x.id)?.kind !== "interactive") : undefined;
    const resolved = resumable ? "continue" : "new";
    if (dryRun) return { prompt, cwd, target: resolved, session: resumable?.id, started: false };
    return wrap(() => {
      if (resumable) { const r = runs.send(resumable.id, resumable.cwd, prompt, overrides(cwd)); return { prompt, cwd, target: resolved, session: resumable.id, queued: r.queued, started: !r.queued }; }
      runs.spawnNew(cwd, prompt, overrides(cwd)); return { prompt, cwd, target: resolved, started: true };
    });
  });
  const lw = <T>(fn: () => T) => { try { const r = fn(); onChange(); return r; } catch (e) { if (e instanceof LabelError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; } };
  app.get("/api/labels", async () => ({ defs: c.labels.defs, teams: c.labels.teams }));
  app.post<{ Body: { name?: string; color?: string; onMap?: boolean } }>("/api/labels", async (r) => lw(() => c.labels.create(r.body?.name, r.body?.color, r.body?.onMap)));
  app.put<{ Params: { team: string }; Body: { labels?: unknown } }>("/api/labels/teams/:team", async (r) => lw(() => { c.labels.setTeam(r.params.team, r.body?.labels); return { labels: c.labels.forTeam(r.params.team) }; }));
  app.get<{ Params: { id: string } }>("/api/sessions/:id/messages", async (r) => {
    const s = c.sessions.get(r.params.id);
    if (!s) throw Object.assign(new Error("unknown session"), { statusCode: 404 });
    const read = s.source === "codex" ? recentCodexMessages : s.source === "opencode" ? recentOpenCodeMessages : recentMessages;
    return { messages: await read(s.file).catch(() => []) };
  });
  app.get("/api/history", async () => ({ spans: c.history.list() }));
  app.put<{ Params: { team: string }; Body: { color?: unknown } }>("/api/bots/teams/:team/color", async (r) => {
    try { c.botColors.setTeam(r.params.team, r.body?.color ?? null); } catch (e) {
      if (e instanceof BotColorError) throw Object.assign(e, { statusCode: e.status }); throw e;
    }
    onChange(); return { color: c.botColors.teams[r.params.team] ?? null };
  });
  app.put<{ Params: { id: string }; Body: { color?: unknown } }>("/api/bots/:id/color", async (r) => {
    if (!c.sessions.has(r.params.id)) throw Object.assign(new Error("unknown session"), { statusCode: 404 });
    try { c.botColors.set(r.params.id, r.body?.color ?? null); } catch (e) {
      if (e instanceof BotColorError) throw Object.assign(e, { statusCode: e.status }); throw e;
    }
    onChange(); return { color: c.botColors.colors[r.params.id] ?? null };
  });
  app.put<{ Params: { id: string }; Body: { name?: unknown } }>("/api/bots/:id/name", async (r) => {
    if (!c.sessions.has(r.params.id)) throw Object.assign(new Error("unknown session"), { statusCode: 404 });
    try { c.botColors.setName(r.params.id, r.body?.name ?? null); } catch (e) {
      if (e instanceof BotColorError) throw Object.assign(e, { statusCode: e.status }); throw e;
    }
    onChange(); return { name: c.botColors.names[r.params.id] ?? null };
  });
  /** Sub-agents of recently active sessions (for the minibots in the 3D office). */
  app.get("/api/subagents", async () => {
    const since = Date.now() - 24 * 3_600_000;
    const out: Record<string, ReturnType<typeof listSubagents>> = {};
    for (const s of c.sessions.values()) {
      if (s.source !== "claude") continue;
      if (s.mtimeMs < since) continue;
      const l = listSubagents(s.file).filter((x) => !x.finished || Date.now() - x.mtimeMs < 10 * 60_000).slice(0, 12);
      if (l.length) out[s.id] = l;
    }
    return out;
  });
  /** Data room: full-text search over everything said in the sessions. Optional `team` narrows it to one project. */
  app.get<{ Querystring: { q?: string; team?: string; limit?: string } }>("/api/search", async (r) => {
    const q = String(r.query.q ?? "").slice(0, 200), team = r.query.team ? String(r.query.team) : "";
    const ids = team ? new Set([...c.sessions.values()].filter((s) => teamFor(s.cwd, c.teams.merges) === team).map((s) => s.id)) : undefined;
    const hits = c.search.search(q, { sessions: ids, limit: Number(r.query.limit) || 30 });
    return hits.map((h) => {
      const s = c.sessions.get(h.session);
      return { ...h, title: s?.title ?? h.session, team: s ? teamFor(s.cwd, c.teams.merges) : "", name: c.botColors.names[h.session], archived: c.archive.has(h.session) };
    });
  });
  /** Archived Codex sessions (.jsonl.zst). Listing is cheap; loading decompresses into ~/.agent-office/cache/codex/ on request only. */
  app.get("/api/codex/archived", async () => (await listCodexArchived()).map((a) => ({ id: a.id, sizeBytes: a.sizeBytes, mtimeMs: a.mtimeMs, loaded: a.loaded })));
  app.post<{ Body: { ids?: string[] } }>("/api/codex/archived/load", async (r) => {
    const ids = Array.isArray(r.body?.ids) ? r.body.ids.filter((x) => typeof x === "string").slice(0, 500) : undefined;
    const res = await loadCodexArchived({ ids });
    if (res.loaded) {
      const known = new Set(c.sessions.keys());
      await c.refreshSessions();
      for (const id of c.sessions.keys()) if (!known.has(id)) await c.ingest(id, true);
      c.indexSessions().catch(() => {});
      ping("stats");
    }
    return res;
  });
  /** Data center labels (SQLite): GET all, PUT one. `project` omitted/empty = the room itself. */
  app.get("/api/rack-alias", async () => c.db.rackAliases());
  app.put<{ Body: { project?: unknown; alias?: unknown } }>("/api/rack-alias", async (r) => {
    const project = typeof r.body?.project === "string" ? r.body.project.slice(0, 300) : "";
    const alias = r.body?.alias;
    if (alias != null && typeof alias !== "string") throw Object.assign(new Error("alias must be a string"), { statusCode: 400 });
    c.db.setRackAlias(project, alias as string | null | undefined);
    return c.db.rackAliases();
  });
  app.get("/api/search/status", async () => ({ ...c.search.stats(), building: c.search.building, sessions: c.sessions.size }));
  app.get("/api/archive", async () => Object.entries(c.archive.items).map(([id, i]) => {
    const s = c.sessions.get(id);
    return { id, at: i.at, title: s?.title ?? id, team: s ? teamFor(s.cwd, c.teams.merges) : "", name: c.botColors.names[id] };
  }).sort((a, b) => b.at - a.at));
  app.post<{ Params: { id: string }; Body: { archived?: unknown; confirm?: unknown } }>("/api/archive/:id", async (r) => {
    const s = c.sessions.get(r.params.id);
    if (!s) throw Object.assign(new Error("unknown session"), { statusCode: 404 });
    try { c.archive.set(s.id, r.body?.archived, r.body?.confirm, c.live.get(s.id)?.kind === "interactive"); } catch (e) {
      if (e instanceof ArchiveError) throw Object.assign(e, { statusCode: e.status }); throw e;
    }
    onChange(); ping("archive"); return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/labels/:id", async (r) => lw(() => { c.labels.remove(r.params.id); return { ok: true }; }));
  app.get("/api/hooks", async () => ({ installed: isInstalled(readSettings()), settingsPath: settingsPath() }));

  const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });
  app.get("/api/config", async () => c.cfg);
  /** What the next run will talk to, without ever showing a token: the gateway host (if one is inherited) and the model. */
  app.get("/api/claude-setup", async () => {
    const env = c.cfg.cleanEnv ? cleanEnv(process.env) : process.env;
    let host: string | null = null;
    try { host = env.ANTHROPIC_BASE_URL ? new URL(env.ANTHROPIC_BASE_URL).host : null; } catch { host = "(invalid URL)"; }
    return { cleanEnv: c.cfg.cleanEnv, model: c.cfg.runModel || "(Claude Code default)", inheritedGatewayHost: host, inheritedToken: !!(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) };
  });
  /** "Test run": a tiny prompt in a known project, so the Settings page can show whether the setup works. */
  app.post("/api/test-run", async () => {
    const cwd = [...c.sessions.values()].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.cwd;
    if (!cwd) throw Object.assign(new Error("no project known yet"), { statusCode: 400 });
    return wrap(() => runs.spawnNew(cwd, "Reply with just the word: hello", overrides(cwd)));
  });
  app.put<{ Body: Partial<Config> }>("/api/config", async (req) => {
    const b = req.body ?? {}; const next: Config = { ...c.cfg };
    for (const k of ["idleThresholdSec", "asleepAfterMin", "historyDays", "doneWaveSec", "errorSec"] as const) {
      if (b[k] !== undefined) { if (typeof b[k] !== "number" || !Number.isFinite(b[k]) || b[k]! <= 0 || b[k]! > 100_000) throw bad(`${k} must be a positive number`); next[k] = b[k]!; }
    }
    if (b.runModel !== undefined) { if (typeof b.runModel !== "string" || (b.runModel !== "" && !/^[A-Za-z0-9][A-Za-z0-9._:\-\[\]]{0,79}$/.test(b.runModel))) throw bad("runModel must be empty or a model name"); next.runModel = b.runModel; }
    if (b.opencodeModel !== undefined) { if (typeof b.opencodeModel !== "string" || (b.opencodeModel !== "" && !MODEL.test(b.opencodeModel))) throw bad("opencodeModel must be empty or provider/model"); next.opencodeModel = b.opencodeModel; }
    if (b.cleanEnv !== undefined) { if (typeof b.cleanEnv !== "boolean") throw bad("cleanEnv must be boolean"); next.cleanEnv = b.cleanEnv; }
    if (b.liveApproval !== undefined) { if (typeof b.liveApproval !== "boolean") throw bad("liveApproval must be boolean"); next.liveApproval = b.liveApproval; if (!b.liveApproval) runs.closeLive(); }
    if (b.streamingMode !== undefined) { if (typeof b.streamingMode !== "boolean") throw bad("streamingMode must be boolean"); next.streamingMode = b.streamingMode; }
    Object.assign(c.cfg, next); saveJson("config.json", c.cfg); onChange(); return c.cfg;
  });
  app.get("/api/teams", async () => c.teams);
  app.put<{ Body: Teams }>("/api/teams", async (req) => {
    const b = req.body; if (!b || typeof b !== "object") throw bad("body required");
    const strs = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "string");
    for (const v of Object.values(b.merges ?? {})) if (!strs(v)) throw bad("merges must map to string arrays");
    for (const o of Object.values(b.overrides ?? {})) {
      if (!o || typeof o !== "object") throw bad("team overrides must be objects");
      if (o.permissionMode === "bypassPermissions") throw bad("bypassPermissions is never allowed");
      if (o.allowedTools !== undefined && !strs(o.allowedTools)) throw bad("allowedTools must be string array");
      if (o.model !== undefined && (typeof o.model !== "string" || !MODEL.test(o.model))) throw bad("team model must be provider/model or empty");
      if (o.source !== undefined && !SOURCES.includes(o.source as AgentSource)) throw bad("team source must be claude, codex or opencode");
      if (o.cwd !== undefined && (typeof o.cwd !== "string" || !isAbsolute(o.cwd))) throw bad("team cwd must be an absolute path");
    }
    c.teams.merges = b.merges ?? {}; c.teams.colors = b.colors ?? {}; c.teams.overrides = b.overrides ?? {};
    saveJson("teams.json", c.teams); onChange(); return c.teams;
  });
  registerBoard(app, c, runs, () => ping("board"));
  registerNotes(app, () => ping("notes"));
  registerUploads(app);
  registerServices(app, () => ping("services"));
  registerGames(app, () => c.db);
  return runs;
}
