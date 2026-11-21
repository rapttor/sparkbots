import type { RunRecord } from "../server/adapters/claude-code/command";
import type { Config, Teams } from "../server/config";
import type { Card, Column } from "../server/board/routes";
import type { LabelDef } from "../server/adapters/types";
import type { WorkSpan } from "../server/history";

export type { Config, Teams };
import type { ChatMessage } from "../server/adapters/claude-code/transcript";

export type { RunRecord, Card, Column, WorkSpan, ChatMessage };
export interface LiveProc { session: string; pid: number; kind: string; startedAt: number; cwd?: string; title?: string }
export interface Processes { live: LiveProc[]; runs: RunRecord[] }
export type SendResult = { queued: true; position: number } | { queued: false; run: RunRecord } | { queued: false; codex: true } | { queued: false; opencode: true };
export type NerdInfo = ReturnType<typeof import("../server/nerd").nerdSnapshot>;
export interface SearchHit { session: string; at: number; role: string; snippet: string; title: string; team: string; name?: string; archived: boolean }
export interface SubagentInfo { id: string; type: string; description: string; model?: string; finished: boolean; mtimeMs: number }
export interface ArchivedItem { id: string; at: number; title: string; team: string; name?: string }
export type StreamLine = { type?: string; message?: { content?: { type?: string; text?: string }[] }; result?: string };

export interface TaskInfo { file: string; open: number; done: number; phase?: string }
export type TeamTasks = Record<string, TaskInfo | null>;
export interface TeamRunResult { prompt: string; cwd: string; target: "continue" | "new"; session?: string; queued?: boolean; started: boolean }

const token = () => new URLSearchParams(location.search).get("t") ?? "";

export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${path}?t=${encodeURIComponent(token())}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) {
    const d = data as { error?: string; message?: string } | null;
    throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
  }
  return data as T;
}

export const api = {
  runs: () => call<RunRecord[]>("GET", "/api/runs"),
  runLog: (id: string) => call<StreamLine[]>("GET", `/api/runs/${id}/log`),
  send: (session: string, prompt: string, fork = false, model?: string, attachments?: string[]) => call<SendResult>("POST", "/api/send", { session, prompt, fork, model, attachments }),
  upload: (name: string, data: string) => call<{ id: string; name: string; size: number }>("POST", "/api/uploads", { name, data }),
  spawn: (cwd: string, prompt: string, model?: string) => call<RunRecord>("POST", "/api/spawn", { cwd, prompt, model }),
  stop: (runId: string) => call<{ ok: true }>("POST", "/api/stop", { runId }),
  board: () => call<Card[]>("GET", "/api/board"),
  importTasks: (team: string) => call<{ added: number; skipped: number; file: string }>("POST", "/api/board/import", { team }),
  addCard: (title: string, body: string, team: string) => call<Card>("POST", "/api/board", { title, body, team }),
  patchCard: (id: string, p: { column?: Column; title?: string; body?: string; archived?: boolean }) => call<Card>("PATCH", `/api/board/${id}`, p),
  deleteCard: (id: string) => call<{ ok: true }>("DELETE", `/api/board/${id}`),
  assign: (id: string, target: { session?: string; cwd?: string; fork?: boolean }) => call<Card>("POST", `/api/board/${id}/assign`, target),
  config: () => call<Config>("GET", "/api/config"),
  saveConfig: (c: Partial<Config>) => call<Config>("PUT", "/api/config", c),
  teams: () => call<Teams>("GET", "/api/teams"),
  saveTeams: (t: Teams) => call<Teams>("PUT", "/api/teams", t),
  hooks: () => call<{ installed: boolean; settingsPath: string }>("GET", "/api/hooks"),
  tasks: () => call<TeamTasks>("GET", "/api/tasks"),
  teamRun: (team: string, mode: "phase" | "all", target: "continue" | "new", dryRun?: boolean) =>
    call<TeamRunResult>("POST", "/api/teams/run", { team, mode, target, ...(dryRun ? { dryRun: true } : {}) }),
  createLabel: (name: string, color: string, onMap: boolean) => call<LabelDef>("POST", "/api/labels", { name, color, onMap }),
  setTeamLabels: (team: string, labels: string[]) =>
    call<{ labels: string[] }>("PUT", `/api/labels/teams/${encodeURIComponent(team)}`, { labels }),
  history: () => call<{ spans: WorkSpan[] }>("GET", "/api/history"),
  setTeamBotColor: (team: string, color: string | null) => call<{ color: string | null }>("PUT", `/api/bots/teams/${encodeURIComponent(team)}/color`, { color }),
  search: (q: string, team = "") => call<SearchHit[]>("GET", `/api/search?q=${encodeURIComponent(q)}${team ? `&team=${encodeURIComponent(team)}` : ""}`),
  searchStatus: () => call<{ sessions: number; messages: number; building: boolean }>("GET", "/api/search/status"),
  nerd: () => call<NerdInfo>("GET", "/api/nerd"),
  subagents: () => call<Record<string, SubagentInfo[]>>("GET", "/api/subagents"),
  archived: () => call<ArchivedItem[]>("GET", "/api/archive"),
  archive: (id: string, archived: boolean) => call<{ ok: true }>("POST", `/api/archive/${encodeURIComponent(id)}`, { archived, confirm: true }),
  claudeSetup: () => call<{ cleanEnv: boolean; model: string; inheritedGatewayHost: string | null; inheritedToken: boolean }>("GET", "/api/claude-setup"),
  testRun: () => call<RunRecord>("POST", "/api/test-run"),
  setBotName: (id: string, name: string | null) => call<{ name: string | null }>("PUT", `/api/bots/${encodeURIComponent(id)}/name`, { name }),
  setBotColor: (id: string, color: string | null) => call<{ color: string }>("PUT", `/api/bots/${encodeURIComponent(id)}/color`, { color }),
  deleteLabel: (id: string) => call<unknown>("DELETE", `/api/labels/${encodeURIComponent(id)}`),
  sessionMessages: (id: string) => call<{ messages: ChatMessage[] }>("GET", `/api/sessions/${encodeURIComponent(id)}/messages`),
  processes: () => call<Processes>("GET", "/api/processes"),
};

/** Poll helper: runs fn now and every ms; returns a cleanup. */
export function poll(fn: () => void | Promise<void>, ms: number): () => void {
  void fn();
  const t = setInterval(() => void fn(), ms);
  return () => clearInterval(t);
}

export const fmtAge = (from: number) => {
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
