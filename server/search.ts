import { createRequire } from "node:module";
import type { DatabaseSync as Db } from "node:sqlite";
import { createReadStream, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { aoHome } from "./config";
import { codexMessageOf } from "./adapters/codex/search";

/**
 * Full-text search over everything said in your sessions (the "data room"). Local only: one SQLite file in
 * ~/.agent-office/. It is a copy of text SparkBots already reads; the transcripts themselves are never modified.
 */
export interface Hit { session: string; at: number; role: string; snippet: string; source: string }
export interface Msg { at: number; role: "user" | "assistant"; text: string }

/** Turn a typed query into a safe FTS5 expression: every word is quoted and prefix-matched (so "deploy" finds "deployment"). */
export function ftsQuery(q: string): string {
  const words = q.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  return words.slice(0, 8).map((w) => `"${w}"*`).join(" ");
}

/** Text of one JSONL record if it is a human or assistant text turn (tool calls, meta and sub-agent chatter are skipped). */
export function messageOf(line: string): Msg | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(line) as Record<string, unknown>; } catch { return null; }
  if (o.isSidechain === true || o.isMeta === true || (o.type !== "user" && o.type !== "assistant")) return null;
  const msg = o.message as { content?: unknown } | undefined;
  const c = msg?.content;
  const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === "object" && (p as { type?: string }).type === "text" ? String((p as { text?: unknown }).text ?? "") : "")).join("\n") : "";
  const t = text.trim();
  if (!t || t.startsWith("<")) return null;
  const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : 0;
  return { at: Number.isFinite(at) ? at : 0, role: o.type as "user" | "assistant", text: t.slice(0, 20_000) };
}

// node:sqlite is loaded through require so bundlers/test runners that do not know this newer built-in leave it alone
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export class SearchIndex {
  private db: Db;
  building = false;
  constructor(file = join(aoHome(), "index.sqlite")) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("create table if not exists files(path text primary key, session text, size integer, mtime integer)");
    try { this.db.exec("alter table files add column source text"); } catch { /* column already there */ }
    this.db.exec("create virtual table if not exists msgs using fts5(session unindexed, at unindexed, role unindexed, text, tokenize='unicode61 remove_diacritics 2')");
  }

  isCurrent(path: string, size: number, mtime: number, source = "claude"): boolean {
    const r = this.db.prepare("select size, mtime, source from files where path = ?").get(path) as { size: number; mtime: number; source: string | null } | undefined;
    // rows written before sources were recorded are Claude's, except that Codex files then indexed as empty and must be redone
    return !!r && r.size === size && r.mtime === Math.floor(mtime) && (r.source ?? "claude") === source;
  }

  /** (Re)index one session transcript. Replaces whatever was stored for it. */
  async indexFile(path: string, session: string, size: number, mtime: number, source = "claude"): Promise<number> {
    const rows: Msg[] = [];
    try {
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of rl) { const m = source === "codex" ? codexMessageOf(line) : messageOf(line); if (m) rows.push(m); }
    } catch { return 0; }
    const del = this.db.prepare("delete from msgs where session = ?"), ins = this.db.prepare("insert into msgs(session, at, role, text) values (?, ?, ?, ?)");
    this.db.exec("begin");
    try {
      del.run(session);
      for (const m of rows) ins.run(session, m.at, m.role, m.text);
      this.db.prepare("insert or replace into files(path, session, size, mtime, source) values (?, ?, ?, ?, ?)").run(path, session, size, Math.floor(mtime), source);
      this.db.exec("commit");
    } catch (e) { this.db.exec("rollback"); throw e; }
    return rows.length;
  }

  /** Index every session that is new or changed, one at a time so the server stays responsive. */
  async build(files: { path: string; session: string; size: number; mtime: number; source?: string }[], onProgress?: () => void): Promise<void> {
    if (this.building) return;
    this.building = true;
    try {
      for (const f of files) {
        if (!this.isCurrent(f.path, f.size, f.mtime, f.source)) { await this.indexFile(f.path, f.session, f.size, f.mtime, f.source); onProgress?.(); }
        await new Promise((r) => setImmediate(r));
      }
    } finally { this.building = false; }
  }

  search(q: string, opts: { sessions?: Set<string>; limit?: number } = {}): Hit[] {
    const expr = ftsQuery(q);
    if (!expr) return [];
    const limit = Math.min(100, opts.limit ?? 30);
    const rows = this.db.prepare(
      "select msgs.session as session, at, role, snippet(msgs, 3, '[[', ']]', '…', 14) as snippet, (select source from files where files.session = msgs.session limit 1) as source from msgs where msgs match ? order by rank limit ?",
    ).all(expr, opts.sessions ? 400 : limit) as unknown as { session: string; at: number | string; role: string; snippet: string; source: string | null }[];
    const out = rows.filter((r) => !opts.sessions || opts.sessions.has(r.session)).map((r) => ({ session: r.session, at: Number(r.at) || 0, role: r.role, snippet: r.snippet, source: r.source ?? "claude" }));
    return out.slice(0, limit);
  }

  stats(): { sessions: number; messages: number } {
    const s = this.db.prepare("select count(*) as n from files").get() as { n: number };
    const m = this.db.prepare("select count(*) as n from msgs").get() as { n: number };
    return { sessions: s.n, messages: m.n };
  }
  close() { this.db.close(); }
}
