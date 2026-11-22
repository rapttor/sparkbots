import { mkdir, readdir, readFile, rename, stat, writeFile, utimes } from "node:fs/promises";
import { basename, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { codexCacheDir, codexDir } from "./discover";

/**
 * Archived Codex sessions (`rollout-*.jsonl.zst`). They are never read at startup. The user asks for them,
 * and each one is decompressed into ~/.agent-office/cache/codex/. Nothing under ~/.codex is ever written.
 */
const ARCHIVED = /(?:^|\/)(rollout-.*-([0-9a-f]{8}-[0-9a-f-]{27}))\.jsonl\.zst$/i;
const MAX_COMPRESSED = 256 * 1024 * 1024, MAX_OUTPUT = 1024 * 1024 * 1024;

export interface ArchivedRef { id: string; file: string; sizeBytes: number; mtimeMs: number; loaded: boolean }

export async function listArchived(root = codexDir(), cacheDir = codexCacheDir()): Promise<ArchivedRef[]> {
  const out: ArchivedRef[] = [];
  let entries;
  try { entries = await readdir(join(root, "sessions"), { recursive: true, withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".jsonl.zst")) continue;
    const file = join(e.parentPath, e.name), m = ARCHIVED.exec(file); if (!m) continue;
    try {
      const st = await stat(file);
      const loaded = await stat(join(cacheDir, `${m[1]}.jsonl`)).then(() => true, () => false);
      out.push({ id: `codex:${m[2]}`, file, sizeBytes: st.size, mtimeMs: st.mtimeMs, loaded });
    } catch { /* vanished */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Decompress the given archived sessions (or all not-yet-loaded ones). Returns how many were loaded and how many failed. */
export async function loadArchived(opts: { ids?: string[]; root?: string; cacheDir?: string } = {}): Promise<{ loaded: number; failed: number; skipped: number }> {
  const root = opts.root ?? codexDir(), cacheDir = opts.cacheDir ?? codexCacheDir();
  const want = opts.ids ? new Set(opts.ids.map((i) => (i.startsWith("codex:") ? i : `codex:${i}`))) : undefined;
  const items = (await listArchived(root, cacheDir)).filter((a) => !a.loaded && (!want || want.has(a.id)));
  let loaded = 0, failed = 0;
  await mkdir(cacheDir, { recursive: true });
  for (const a of items) {
    try {
      if (a.sizeBytes > MAX_COMPRESSED) throw new Error("too large");
      const raw = zstdDecompressSync(await readFile(a.file), { maxOutputLength: MAX_OUTPUT });
      const name = `${basename(a.file).replace(/\.zst$/i, "")}`, dest = join(cacheDir, name);
      await writeFile(`${dest}.tmp`, raw);
      await rename(`${dest}.tmp`, dest);
      await utimes(dest, new Date(), new Date(a.mtimeMs)); // keep the archive's age so it sorts where it belongs
      loaded++;
    } catch { failed++; }
    await new Promise((r) => setImmediate(r));
  }
  return { loaded, failed, skipped: want ? Math.max(0, want.size - items.length) : 0 };
}
