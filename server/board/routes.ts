import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "../config";
import type { Company } from "../model/company";
import type { RunManager } from "../adapters/claude-code/command";
import { teamFor } from "../adapters/claude-code/discover";
import { findTaskFile, listTasks } from "../tasks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const COLUMNS = ["backlog", "ready", "in_progress", "review", "done"] as const;
export type Column = (typeof COLUMNS)[number];
export interface Card { id: string; key?: string; archived?: boolean; title: string; body: string; team?: string; column: Column; session?: string; runId?: string; createdAt: number; updatedAt: number }
interface BoardFile { schemaVersion: 1; cards: Card[] }

const load = () => loadJson<BoardFile>("board.json", { schemaVersion: 1, cards: [] });
const save = (b: BoardFile) => saveJson("board.json", b);
const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });

export function registerBoard(app: FastifyInstance, c: Company, runs: RunManager, changed: () => void = () => {}) {
  app.get("/api/board", async () => { if (sync(runs)) changed(); return load().cards; });

  app.post<{ Body: { title?: string; body?: string; team?: string } }>("/api/board", async (req) => {
    if (!req.body?.title) throw bad("title required");
    const b = load(); const now = Date.now();
    const card: Card = { id: randomUUID(), title: String(req.body.title).slice(0, 200), body: String(req.body.body ?? ""), team: req.body.team, column: "backlog", createdAt: now, updatedAt: now };
    b.cards.push(card); save(b); changed(); return card;
  });
  app.patch<{ Params: { id: string }; Body: Partial<Pick<Card, "title" | "body" | "team" | "column" | "archived">> }>("/api/board/:id", async (req) => {
    const b = load(); const card = b.cards.find((x) => x.id === req.params.id); if (!card) throw bad("no such card");
    const p = req.body ?? {};
    if (p.column !== undefined) { if (!COLUMNS.includes(p.column)) throw bad("bad column"); card.column = p.column; }
    if (p.title !== undefined) card.title = String(p.title).slice(0, 200);
    if (p.body !== undefined) card.body = String(p.body);
    if (p.team !== undefined) card.team = p.team;
    if (p.archived !== undefined) { if (typeof p.archived !== "boolean") throw bad("archived must be boolean"); card.archived = p.archived || undefined; }
    card.updatedAt = Date.now(); save(b); changed(); return card;
  });
  app.delete<{ Params: { id: string } }>("/api/board/:id", async (req) => { const b = load(); b.cards = b.cards.filter((x) => x.id !== req.params.id); save(b); changed(); return { ok: true }; });

  /**
   * Fill the board from a project's task list file (docs/TASKS.md and friends). Explicit button only. Unchecked items go to
   * Backlog, checked ones to Done (they are already done in the file); items already imported are skipped.
   */
  app.post<{ Body: { team?: string } }>("/api/board/import", async (req) => {
    const team = String(req.body?.team ?? "");
    const sessions = [...c.sessions.values()].filter((s) => teamFor(s.cwd, c.teams.merges) === team).sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!team || !sessions.length) throw bad("unknown team");
    const cwd = sessions[0]!.cwd, file = findTaskFile(cwd);
    if (!file) throw bad("this project has no task list file (docs/TASKS.md, TASKS.md, TODO.md ...)");
    let items;
    try { items = listTasks(readFileSync(join(cwd, file), "utf8")); } catch { throw bad("could not read the task list"); }
    const b = load(), have = new Set(b.cards.map((x) => x.key).filter(Boolean)), now = Date.now();
    let added = 0;
    for (const it of items) {
      const key = `${team}|${file}|${it.text}`;
      if (have.has(key)) continue;
      b.cards.push({ id: randomUUID(), key, title: it.text.slice(0, 200), body: it.phase ? `From ${file} — ${it.phase}` : `From ${file}`, team, column: it.done ? "done" : "backlog", createdAt: now, updatedAt: now });
      have.add(key); added++;
    }
    if (added) { save(b); changed(); }
    return { added, skipped: items.length - added, file };
  });

  /** Assign: to a worker (existing session) or to a team (spawns a new worker). Moves to In progress; never Done. */
  app.post<{ Params: { id: string }; Body: { session?: string; cwd?: string; fork?: boolean } }>("/api/board/:id/assign", async (req) => {
    const b = load(); const card = b.cards.find((x) => x.id === req.params.id); if (!card) throw bad("no such card");
    const prompt = `${card.title}\n\n${card.body}`.trim();
    const overrides = (cwd: string) => c.teams?.overrides[teamFor(cwd, c.teams.merges)] ?? {}; // team tool/permission settings apply to cards too
    let runId: string, session: string | undefined;
    if (req.body?.session) {
      const s = c.sessions.get(req.body.session); if (!s) throw bad("unknown session");
      if (s.source === "opencode") throw bad("OpenCode card assignment is not wired yet; message the agent from its chat instead");
      const fork = !!req.body.fork; // fork = continue from that conversation as a NEW worker; also the only way into a live-in-terminal session
      let r;
      try { r = runs.send(s.id, s.cwd, prompt, { ...overrides(s.cwd), fork }); } catch (e) { throw Object.assign(new Error((e as Error).message), { statusCode: (e as { status?: number }).status ?? 400 }); }
      session = fork ? undefined : s.id;
      if (r.queued) { card.session = session; card.column = "in_progress"; card.updatedAt = Date.now(); save(b); return card; }
      runId = r.run.runId;
    } else {
      if (!req.body?.cwd || ![...c.sessions.values()].some((s) => s.cwd === req.body!.cwd)) throw bad("known cwd required");
      const r = runs.spawnNew(req.body.cwd, prompt, overrides(req.body.cwd)); runId = r.runId;
    }
    card.runId = runId; card.session = session; card.column = "in_progress"; card.updatedAt = Date.now(); save(b); changed(); return card;
  });
}

/** Cards follow run state: a finished run moves In progress -> Review. Never to Done automatically. */
export function sync(runs: RunManager): boolean {
  const b = load(); let dirty = false;
  for (const card of b.cards) {
    if (card.column !== "in_progress" || !card.runId) continue;
    const r = runs.runs.find((x) => x.runId === card.runId);
    if (r && r.status !== "running") { card.column = "review"; card.session ??= r.session; card.updatedAt = Date.now(); dirty = true; }
  }
  if (dirty) save(b);
  return dirty;
}
