import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface TaskInfo { file: string; open: number; done: number; phase?: string }

const NAMES = /^(tasks?|tasklist|task-list|todo|todos)\.md$/i;

/** First task-list-looking markdown file in cwd, cwd/docs or cwd/.claude (relative path), else undefined. */
export function findTaskFile(cwd: string): string | undefined {
  for (const dir of ["docs", "", ".claude", "doc"]) {
    try {
      const names = readdirSync(join(cwd, dir)).filter((n) => NAMES.test(n)).sort((a, b) => a.localeCompare(b));
      if (names.length) return dir ? `${dir}/${names[0]}` : names[0];
    } catch { /* dir missing */ }
  }
}

/** Count markdown checkboxes; `phase` = heading of the first section that still has unchecked items. */
export function parseTasks(text: string): Omit<TaskInfo, "file"> {
  let open = 0, done = 0, heading = "", phase: string | undefined;
  for (const line of text.split("\n")) {
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) { heading = h[1].trim(); continue; }
    const c = /^\s*[-*]\s+\[( |x|X)\]/.exec(line);
    if (!c) continue;
    if (c[1] === " ") { open++; phase ??= heading || undefined; } else done++;
  }
  return { open, done, phase };
}

const cache = new Map<string, { mtimeMs: number; info: TaskInfo | null }>();

/** Cached per cwd by file mtime so polling stays cheap. */
export function taskInfo(cwd: string): TaskInfo | null {
  const file = findTaskFile(cwd); if (!file) return null;
  try {
    const full = join(cwd, file); const mtimeMs = statSync(full).mtimeMs;
    const hit = cache.get(full); if (hit && hit.mtimeMs === mtimeMs) return hit.info;
    const info = { file, ...parseTasks(readFileSync(full, "utf8")) };
    cache.set(full, { mtimeMs, info }); return info;
  } catch { return null; }
}

const BASE = "Review the task list{FILE} and break tasks down if possible, so we can utilize Haiku as much as possible.";
/** The prompts the Teams panel's Run/Continue buttons send. */
export function runPrompt(mode: "phase" | "all", file?: string): string {
  const base = BASE.replace("{FILE}", file ? ` (${file})` : " (create docs/TASKS.md first if the project has none)");
  return `${base} ${mode === "all" ? "Finish all phases." : "Finish this phase."}`;
}
