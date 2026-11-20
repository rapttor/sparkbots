import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LiveInfo, SessionId } from "../types";
import { claudeDir } from "./discover";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function kindOf(k: unknown): LiveInfo["kind"] {
  if (k === "interactive") return "interactive";
  if (k === "headless" || k === "sdk") return "headless";
  return "unknown";
}

export async function readLiveness(sessionsDir: string = join(claudeDir(), "sessions")): Promise<Map<SessionId, LiveInfo>> {
  const map = new Map<SessionId, LiveInfo>();
  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return map;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const o = JSON.parse(await readFile(join(sessionsDir, f), "utf8"));
      if (!o || typeof o.sessionId !== "string" || !o.sessionId) continue;
      if (typeof o.pid !== "number" || !Number.isInteger(o.pid) || o.pid <= 0) continue;
      if (!pidAlive(o.pid)) continue;
      map.set(o.sessionId, {
        pid: o.pid,
        kind: kindOf(o.kind),
        startedAt: typeof o.startedAt === "number" ? o.startedAt : undefined,
      });
    } catch {
      /* skip bad file */
    }
  }
  return map;
}
