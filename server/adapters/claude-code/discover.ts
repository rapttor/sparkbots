import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionRef } from "../types";
import { parseLine, titleFromRecord } from "./parse";

const HEAD_BYTES = 64 * 1024;
const UUID_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export function claudeDir(): string {
  return process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
}

async function readHead(file: string): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

async function inspectFile(file: string, id: string, folder: string): Promise<SessionRef> {
  const st = await stat(file);
  const text = await readHead(file);
  const lines = text.split("\n");
  // Last line may be cut by the 64KB boundary; JSON parse failures are simply skipped.
  let cwd: string | undefined;
  let custom: string | undefined;
  let first: string | undefined;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (!obj || typeof obj !== "object") continue;
      if (!cwd) cwd = parseLine(line).cwd;
      const t = titleFromRecord(obj);
      if (t) {
        if (obj.type === "custom-title") {
          custom = t;
          break;
        }
        first ??= t;
      }
    } catch {
      /* skip */
    }
  }
  return {
    id,
    file,
    cwd: cwd ?? folder.replace(/-/g, "/"),
    title: (custom ?? first ?? "Untitled").slice(0, 60),
    mtimeMs: st.mtimeMs,
    sizeBytes: st.size,
  };
}

export async function discoverSessions(projectsDir: string = join(claudeDir(), "projects")): Promise<SessionRef[]> {
  const out: SessionRef[] = [];
  let folders: string[];
  try {
    folders = await readdir(projectsDir);
  } catch {
    return out;
  }
  for (const folder of folders) {
    if (folder.includes("observer-sessions")) continue;
    let files: string[];
    try {
      files = await readdir(join(projectsDir, folder));
    } catch {
      continue;
    }
    for (const name of files) {
      const m = UUID_FILE.exec(name);
      if (!m) continue;
      try {
        out.push(await inspectFile(join(projectsDir, folder, name), m[1], folder));
      } catch {
        /* never throw on one bad file */
      }
    }
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const src = glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${src}$`);
}

export function teamFor(cwd: string, merges: Record<string, string[]>): string {
  for (const [team, globs] of Object.entries(merges)) {
    if (globs.some((g) => globToRegExp(g).test(cwd))) return team;
  }
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? (cwd || "unknown");
}

export function teamColor(name: string, colors: Record<string, string>): string {
  if (colors[name]) return colors[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  return hslToHex(h % 360, 65, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}
