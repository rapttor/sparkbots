import type { FastifyInstance } from "fastify";
import type { Company } from "./model/company";
import { RunManager, CommandError, type RunEvent } from "./adapters/claude-code/command";
import { teamFor } from "./adapters/claude-code/discover";
import { registerBoard } from "./board/routes";
import { LabelError } from "./labels";
import { BotColorError } from "./botColors";
import { recentMessages } from "./adapters/claude-code/transcript";
import { runPrompt, taskInfo, type TaskInfo } from "./tasks";
import { saveJson, type Config, type Teams } from "./config";
import { hookToEvents, isInstalled, readSettings, settingsPath } from "./adapters/claude-code/hooks";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 && v.length < 100_000 ? v : undefined);

export function registerRoutes(app: FastifyInstance, c: Company, onChange: () => void = () => {}): RunManager {
  const runs = new RunManager((id) => c.live.get(id)?.kind === "interactive");
  const log = new Map<string, unknown[]>(); // runId -> recent stream lines (in memory, for the chat panel)
  runs.listeners.add((e: RunEvent) => { const a = log.get(e.runId) ?? []; a.push(e.line); log.set(e.runId, a.slice(-200)); });

  const overrides = (cwd: string) => c.teams.overrides[teamFor(cwd, c.teams.merges)] ?? {};
  const wrap = <T>(fn: () => T) => { try { return fn(); } catch (e) { if (e instanceof CommandError) throw Object.assign(new Error(e.message), { statusCode: e.status }); throw e; } };

  app.get("/api/runs", async () => runs.runs.slice(-50));
  app.get<{ Params: { id: string } }>("/api/runs/:id/log", async (r) => log.get(r.params.id) ?? []);
  app.post<{ Body: { session?: string; prompt?: string; fork?: boolean } }>("/api/send", async (req) => {
    const session = str(req.body?.session), prompt = str(req.body?.prompt);
    const s = session ? c.sessions.get(session) : undefined;
    if (!s || !prompt) throw Object.assign(new Error("session and prompt required"), { statusCode: 400 });
    return wrap(() => runs.send(s.id, s.cwd, prompt, { ...overrides(s.cwd), fork: !!req.body.fork }));
  });
  app.post<{ Body: { cwd?: string; prompt?: string } }>("/api/spawn", async (req) => {
    const cwd = str(req.body?.cwd), prompt = str(req.body?.prompt);
    if (!cwd || !prompt || ![...c.sessions.values()].some((s) => s.cwd === cwd)) throw Object.assign(new Error("known project cwd and prompt required"), { statusCode: 400 });
    return wrap(() => runs.spawnNew(cwd, prompt, overrides(cwd)));
  });
  app.post<{ Body: { runId?: string } }>("/api/stop", async (req) => wrap(() => { runs.stop(str(req.body?.runId) ?? ""); return { ok: true }; }));
  app.get("/api/processes", async () => ({
    live: [...c.live.entries()].map(([session, i]) => ({ session, pid: i.pid, kind: i.kind, startedAt: i.startedAt, cwd: c.sessions.get(session)?.cwd, title: c.sessions.get(session)?.title })),
    runs: runs.runs.slice(-50),
  }));
  app.post<{ Body: Record<string, unknown> }>("/hook", async (req) => { await c.applyHook(hookToEvents(req.body ?? {})); onChange(); return {}; });
  const teamSessions = (team: string) => [...c.sessions.values()].filter((x) => teamFor(x.cwd, c.teams.merges) === team).sort((a, b) => b.mtimeMs - a.mtimeMs);
  app.get("/api/tasks", async () => {
    const out: Record<string, TaskInfo | null> = {}; const seen = new Set<string>();
    for (const s of c.sessions.values()) { const t = teamFor(s.cwd, c.teams.merges); if (!seen.has(t)) { seen.add(t); out[t] = taskInfo(teamSessions(t)[0].cwd); } }
    return out;
  });
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
    return { messages: await recentMessages(s.file).catch(() => []) };
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
  app.delete<{ Params: { id: string } }>("/api/labels/:id", async (r) => lw(() => { c.labels.remove(r.params.id); return { ok: true }; }));
  app.get("/api/hooks", async () => ({ installed: isInstalled(readSettings()), settingsPath: settingsPath() }));

  const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });
  app.get("/api/config", async () => c.cfg);
  app.put<{ Body: Partial<Config> }>("/api/config", async (req) => {
    const b = req.body ?? {}; const next: Config = { ...c.cfg };
    for (const k of ["idleThresholdSec", "asleepAfterMin", "historyDays", "doneWaveSec", "errorSec"] as const) {
      if (b[k] !== undefined) { if (typeof b[k] !== "number" || !Number.isFinite(b[k]) || b[k]! <= 0 || b[k]! > 100_000) throw bad(`${k} must be a positive number`); next[k] = b[k]!; }
    }
    if (b.streamingMode !== undefined) { if (typeof b.streamingMode !== "boolean") throw bad("streamingMode must be boolean"); next.streamingMode = b.streamingMode; }
    Object.assign(c.cfg, next); saveJson("config.json", c.cfg); onChange(); return c.cfg;
  });
  app.get("/api/teams", async () => c.teams);
  app.put<{ Body: Teams }>("/api/teams", async (req) => {
    const b = req.body; if (!b || typeof b !== "object") throw bad("body required");
    const strs = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "string");
    for (const v of Object.values(b.merges ?? {})) if (!strs(v)) throw bad("merges must map to string arrays");
    for (const o of Object.values(b.overrides ?? {})) {
      if (o.permissionMode === "bypassPermissions") throw bad("bypassPermissions is never allowed");
      if (o.allowedTools !== undefined && !strs(o.allowedTools)) throw bad("allowedTools must be string array");
    }
    c.teams.merges = b.merges ?? {}; c.teams.colors = b.colors ?? {}; c.teams.overrides = b.overrides ?? {};
    saveJson("teams.json", c.teams); onChange(); return c.teams;
  });
  registerBoard(app, c, runs);
  return runs;
}
