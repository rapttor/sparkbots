import { open, readdir, stat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionRef } from "../types";
import { aoHome } from "../../config";
import { parseLine } from "./parse";

const HEAD_BYTES = 64 * 1024;
const ROLLOUT = /(?:^|\/)rollout-.*-([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i;

export function codexDir(): string { return process.env.CODEX_HOME ?? join(homedir(), ".codex"); }

async function titles(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    for (const line of (await readFile(join(root, "session_index.jsonl"), "utf8")).split("\n")) {
      try { const o = JSON.parse(line); if (typeof o.id === "string" && typeof o.thread_name === "string") out.set(o.id, o.thread_name); } catch { /* partial line */ }
    }
  } catch { /* optional index */ }
  return out;
}

async function inspect(file: string, fallbackId: string, names: Map<string, string>): Promise<SessionRef | undefined> {
  const st = await stat(file); const fh = await open(file, "r"); let raw = "";
  try { const b = Buffer.alloc(Math.min(HEAD_BYTES, st.size)); await fh.read(b, 0, b.length, 0); raw = b.toString("utf8"); } finally { await fh.close(); }
  let id = fallbackId, cwd = "", first = "";
  for (const line of raw.split("\n")) {
    const parsed = parseLine(line);
    if (parsed.sessionId) id = parsed.sessionId;
    if (parsed.cwd) cwd = parsed.cwd;
    if (!first) {
      const message = parsed.events.find((e) => e.kind === "message" && e.role === "user");
      if (message?.kind === "message") first = message.preview;
    }
    if (cwd && names.has(id)) break;
  }
  if (!cwd) return undefined;
  return { id: `codex:${id}`, source: "codex", file, cwd, title: (names.get(id) ?? first ?? "Untitled Codex chat").slice(0, 60), mtimeMs: st.mtimeMs, sizeBytes: st.size };
}

/** Decompressed archived sessions live here (written only by an explicit "load archived", never inside ~/.codex). */
export function codexCacheDir(): string { return join(aoHome(), "cache", "codex"); }

async function scan(base: string, names: Map<string, string>, byId: Map<string, SessionRef>): Promise<void> {
  let files: string[] = [];
  try {
    const entries = await readdir(base, { recursive: true, withFileTypes: true });
    files = entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl")).map((e) => join(e.parentPath, e.name));
  } catch { return; }
  for (const file of files) {
    const m = ROLLOUT.exec(file); if (!m) continue;
    try {
      const s = await inspect(file, m[1], names), old = s ? byId.get(s.id) : undefined;
      if (s && (!old || s.mtimeMs > old.mtimeMs)) byId.set(s.id, s);
    } catch { /* one bad transcript must not hide the rest */ }
  }
}

/** Live sessions under `<root>/sessions`, plus archived ones the user already loaded into `cacheDir` (a plain read, no decompression). */
export async function discoverSessions(root?: string, cacheDir?: string): Promise<SessionRef[]> {
  const byId = new Map<string, SessionRef>(), r = root ?? codexDir(), names = await titles(r);
  await scan(join(r, "sessions"), names, byId);
  const cache = cacheDir ?? (root === undefined ? codexCacheDir() : undefined);
  if (cache) { const loaded = new Map<string, SessionRef>(); await scan(cache, names, loaded); for (const [id, s] of loaded) if (!byId.has(id)) byId.set(id, s); }
  return [...byId.values()];
}
