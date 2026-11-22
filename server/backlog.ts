import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type BacklogStatus = "idea" | "todo" | "planned" | "in-progress" | "blocked" | "done" | "question";
export interface BacklogItem { heading: string; text: string; status: BacklogStatus; link?: string; model?: string; depends?: string }
export interface BacklogInfo { file: string; items: BacklogItem[] }

const FILES = ["backlog.md", "docs/backlog.md", "BACKLOG.md"];
const MAX_ITEMS = 400;

/** The backlog file of a project directory (relative path), if it has one. */
export function findBacklogFile(cwd: string): string | undefined {
  return FILES.find((f) => existsSync(join(cwd, f)));
}

/** Map the words of a `[label]` to a status. Both the template (`todo`, `in-progress`) and free style (`13.2 planned`, `DONE`) work. */
function statusOf(label: string): BacklogStatus | undefined {
  const l = label.toLowerCase();
  if (l.includes("?") || l.startsWith("question")) return "question";
  if (/\bdone\b/.test(l)) return "done";
  if (/in[ -]progress/.test(l)) return "in-progress";
  if (/\bblocked\b/.test(l)) return "blocked";
  if (/\bplanned\b/.test(l)) return "planned";
  if (/\btodo\b/.test(l)) return "todo";
}

/** Read headings, list items and loose lines that start with a `[status](link)`. Unknown lines are ignored. */
export function parseBacklog(text: string, max = MAX_ITEMS): BacklogItem[] {
  const out: BacklogItem[] = [];
  let heading = "";
  for (const raw of text.split("\n")) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) { heading = h[1]!.trim(); continue; }
    const m = /^\s*(?:[-*]\s+)?(\[[ xX]\]\s*)?(.*)$/.exec(raw);
    const checkbox = m?.[1]?.trim(), rest = (m?.[2] ?? "").trim();
    const isList = /^\s*[-*]\s/.test(raw);
    if (!rest || (!isList && !rest.startsWith("["))) continue;
    let status: BacklogStatus | undefined, link: string | undefined, body = rest;
    const b = /^\[([^\]]+)\](?:\(([^)]*)\))?\s*(.*)$/.exec(rest);
    if (b) {
      const s = statusOf(b[1]!);
      if (s) { status = s; link = b[2] || undefined; body = b[3]!; }
    }
    if (checkbox && /x/i.test(checkbox)) status = "done";
    status ??= checkbox ? "todo" : "idea";
    const tag = (name: string) => new RegExp(`\\[${name}:\\s*([^\\]]*)\\]`, "i").exec(body)?.[1]?.trim();
    const model = tag("model"), depends = tag("depends");
    body = body.replace(/\[(?:model|depends):[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
    if (!body && status !== "question") continue;
    out.push({ heading, text: body || rest, status, link, model, depends });
    if (out.length >= max) break;
  }
  return out;
}

export function readBacklog(cwd: string): BacklogInfo | null {
  const file = findBacklogFile(cwd); if (!file) return null;
  try { return { file, items: parseBacklog(readFileSync(join(cwd, file), "utf8")) }; } catch { return null; }
}

/** Write the bundled backlog template into a project. Never overwrites an existing file. */
export function createBacklog(cwd: string): string {
  const existing = findBacklogFile(cwd);
  if (existing) throw Object.assign(new Error(`${existing} already exists; it was not changed`), { statusCode: 400 });
  const tpl = readFileSync(fileURLToPath(new URL("./templates/backlog.md", import.meta.url)), "utf8");
  writeFileSync(join(cwd, "backlog.md"), `# Ideas\n\nWrite ideas as list items. Planned work uses the format below.\n\n${tpl}`, { flag: "wx" });
  return "backlog.md";
}
