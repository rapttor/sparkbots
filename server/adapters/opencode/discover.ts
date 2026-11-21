import { createRequire } from "node:module";
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { aoHome, loadJson, saveJson } from "../../config";
import type { SessionRef } from "../types";

/**
 * OpenCode keeps its chats in one local SQLite database. SparkBots never writes to it: every discovery pass reads
 * the database read-only and mirrors new messages into a small JSONL cache in ~/.agent-office/cache/opencode/.
 * The rest of the app (tailer, search, stats, transcript reader) can then treat an OpenCode chat like any other
 * session without knowing that the source is a database. `[VERIFY]` against newer OpenCode versions.
 */

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const CACHE_VERSION = 1;
const MAX_AGE_MS = 30 * 86_400_000;

export function opencodeDbPath(): string {
  const data = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return process.env.OPENCODE_DB ?? join(data, "opencode", "opencode.db");
}
export function opencodeCacheDir(): string { return join(aoHome(), "cache", "opencode"); }

interface SessionRow {
  id: string; project_id: string; parent_id: string | null; directory: string | null; title: string;
  time_created: number; time_updated: number; time_archived: number | null; model: string | null;
}
interface PartRow { id: string; message_id: string; time_created: number; data: string; mdata: string }
interface Meta { updated: number; title: string; cwd: string; lastTime: number; lastId: string; texts: string[] }
interface Index { schemaVersion: 1; sessions: Record<string, Meta> }

const isInternal = (text: string): boolean =>
  !text || text.startsWith("<") || text.startsWith("# AGENTS.md") || text.includes("<environment_context>");

const cleanTitle = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 60);

/** OpenCode stores the model as JSON (`{providerID,id,variant}`); older rows may already be `provider/model`. */
function sessionModel(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw) as { providerID?: unknown; id?: unknown };
    const provider = typeof o.providerID === "string" ? o.providerID.trim() : "";
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (provider && id) return `${provider}/${id}`;
    return id || undefined;
  } catch {
    return raw.includes("/") ? raw.trim() : undefined;
  }
}

/** One-line records shared with the JSONL tailer. Text records mimic Claude Code so search/recent chats reuse the same readers. */
function jsonLine(o: unknown): string { return `${JSON.stringify(o)}\n`; }

function appendParts(db: import("node:sqlite").DatabaseSync, session: SessionRow, meta: Meta, file: string): Meta {
  const next = { ...meta, texts: [...meta.texts] };
  const rows = db.prepare(
    `select p.id, p.message_id, p.time_created, p.data, m.data as mdata
       from part p join message m on m.id = p.message_id
      where p.session_id = ?
        and (p.time_created > ? or (p.time_created = ? and p.id > ?))
      order by p.time_created, p.id`,
  ).all(session.id, next.lastTime, next.lastTime, next.lastId) as unknown as PartRow[];
  if (!rows.length) return next;

  const out: string[] = [];
  for (const row of rows) {
    let part: any, message: any;
    try { part = JSON.parse(row.data); message = JSON.parse(row.mdata); } catch { /* skip a corrupt part */ }
    if (!part || !message) { next.lastTime = row.time_created; next.lastId = row.id; continue; }
    const at = new Date(row.time_created).toISOString();
    const base = { sessionId: session.id, timestamp: at };
    if (part.type === "text" && typeof part.text === "string" && message.role === "user") {
      const text = part.text.trim();
      if (!isInternal(text)) out.push(jsonLine({ type: "user", ...base, message: { role: "user", content: [{ type: "text", text }] } }));
    } else if (part.type === "tool" && typeof part.tool === "string") {
      const target = part.state?.input?.command ?? part.state?.input?.file_path ?? part.state?.input?.path ?? part.state?.input?.description;
      out.push(jsonLine({ type: "opencode_tool", ...base, tool: part.tool, target: typeof target === "string" ? target.slice(0, 120) : undefined }));
    } else if (part.type === "step-finish") {
      // The step is complete: now the text parts of this message are final, so export all of them at once.
      if (!next.texts.includes(row.message_id)) {
        const texts = db.prepare(
          `select p.time_created, p.data from part p join message m on m.id = p.message_id
            where p.message_id = ? and p.session_id = ? and json_extract(m.data, '$.role') = 'assistant'
              and json_extract(p.data, '$.type') = 'text' order by p.time_created, p.id`,
        ).all(row.message_id, session.id) as unknown as { time_created: number; data: string }[];
        for (const t of texts) {
          try {
            const text = String(JSON.parse(t.data).text ?? "").trim();
            if (text) out.push(jsonLine({ type: "assistant", sessionId: session.id, timestamp: new Date(t.time_created).toISOString(), msg: row.message_id, message: { role: "assistant", content: [{ type: "text", text }] } }));
          } catch { /* skip a corrupt text part */ }
        }
        next.texts.push(row.message_id);
      }
      const tokens = part.tokens ?? {};
      const input = Number(tokens.input) || 0, output = Number(tokens.output) || 0;
      const cacheRead = Number(tokens.cache?.read) || 0, cacheWrite = Number(tokens.cache?.write) || 0;
      if (input || output || cacheRead || cacheWrite) {
        out.push(jsonLine({ type: "opencode_usage", ...base, model: part.model ?? message.modelID ?? "opencode", input, output, cacheRead, cacheWrite }));
      }
      if (typeof part.reason === "string" && part.reason !== "tool-calls") out.push(jsonLine({ type: "opencode_turn_end", ...base }));
    }
    next.lastTime = row.time_created;
    next.lastId = row.id;
  }
  if (out.length) appendFileSync(file, out.join(""));
  return next;
}

function firstUserText(db: import("node:sqlite").DatabaseSync, id: string): string {
  const row = db.prepare(
    `select p.data from part p join message m on m.id = p.message_id
      where p.session_id = ? and json_extract(m.data, '$.role') = 'user'
        and json_extract(p.data, '$.type') = 'text' order by p.time_created, p.id limit 1`,
  ).get(id) as { data?: string } | undefined;
  try { const t = row?.data ? JSON.parse(row.data).text : ""; return typeof t === "string" ? t : ""; } catch { return ""; }
}

export async function discoverSessions(dbFile = opencodeDbPath()): Promise<SessionRef[]> {
  if (!existsSync(dbFile)) return [];
  let db: import("node:sqlite").DatabaseSync;
  try { db = new DatabaseSync(dbFile, { readOnly: true }); } catch { return []; }
  try {
    const index = loadJson<Index>("cache/opencode/index.json", { schemaVersion: CACHE_VERSION, sessions: {} });
    const meta = index.schemaVersion === CACHE_VERSION ? index.sessions : {};
    const dir = opencodeCacheDir();
    mkdirSync(dir, { recursive: true });
    const since = Date.now() - MAX_AGE_MS;
    // Only top-level chats are agents. Sessions with a parent are subagents: they belong to their parent, not a desk.
    const rows = db.prepare(
      `select id, project_id, parent_id, directory, title, time_created, time_updated, time_archived, model
         from session where time_archived is null and parent_id is null and time_updated >= ? order by time_updated desc`,
    ).all(since) as unknown as SessionRow[];
    const projects = new Map((db.prepare("select id, worktree from project").all() as unknown as { id: string; worktree: string }[]).map((p) => [p.id, p.worktree]));
    const out: SessionRef[] = [];
    let dirty = false;
    for (const s of rows) {
      const cwd = (s.directory || projects.get(s.project_id) || "").trim();
      if (!cwd) continue;
      const file = join(dir, `${s.id.replace(/[^A-Za-z0-9_-]/g, "_")}.jsonl`);
      const old = meta[s.id];
      let m = old;
      if (!m || m.updated !== s.time_updated || !existsSync(file)) {
        const fresh = !m || m.updated > s.time_updated || !existsSync(file);
        if (fresh) writeFileSync(file, "");
        m = { updated: s.time_updated, title: old?.title ?? s.title, cwd, lastTime: fresh ? 0 : (old?.lastTime ?? 0), lastId: fresh ? "" : (old?.lastId ?? ""), texts: fresh ? [] : (old?.texts ?? []) };
        m = appendParts(db, s, m, file);
        const first = firstUserText(db, s.id);
        m.title = /^New session\b/i.test(s.title) && first ? cleanTitle(first) : s.title;
        meta[s.id] = m; dirty = true;
      }
      const size = statSync(file).size;
      out.push({
        id: `opencode:${s.id}`, source: "opencode", file, cwd, title: (m.title || "OpenCode chat").slice(0, 60),
        mtimeMs: s.time_updated, sizeBytes: size, model: sessionModel(s.model),
      });
    }
    if (dirty) {
      const alive = new Set(out.map((s) => s.id.slice("opencode:".length)));
      for (const id of Object.keys(meta)) if (!alive.has(id)) delete meta[id];
      saveJson("cache/opencode/index.json", { schemaVersion: CACHE_VERSION, sessions: meta });
    }
    return out;
  } finally { db.close(); }
}
