import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { BUILTIN_COMMANDS, type SlashItem } from "../src/shared/slash";

/** Frontmatter `key: value` pairs of a markdown file (between the first two `---` lines). Plain values only; defensive. */
export function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["'](.*)["']$/, "$1");
  }
  return out;
}

/** `git/commit.md` -> `git:commit` (Claude Code's naming for commands in sub-folders). */
export function commandName(relPath: string): string {
  return relPath.replace(/\.md$/i, "").split(/[\\/]/).join(":");
}

const MAX_FILES = 300, MAX_DEPTH = 4, MAX_READ = 4096;

function walkMd(dir: string, base = dir, depth = 0, acc: string[] = []): string[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return acc; }
  for (const n of names.sort()) {
    if (acc.length >= MAX_FILES) break;
    if (n.startsWith(".")) continue;
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (depth < MAX_DEPTH) walkMd(p, base, depth + 1, acc); }
    else if (/\.md$/i.test(n)) acc.push(relative(base, p));
  }
  return acc;
}

function readHead(p: string): string { try { return readFileSync(p, "utf8").slice(0, MAX_READ); } catch { return ""; } }

function fromCommandsDir(dir: string, source: "project" | "user"): SlashItem[] {
  if (!existsSync(dir)) return [];
  return walkMd(dir).map((rel) => {
    const fm = parseFrontmatter(readHead(join(dir, rel)));
    return { name: commandName(rel.split(sep).join("/")), source, ...(fm.description ? { description: fm.description } : {}), ...(fm["argument-hint"] ? { argumentHint: fm["argument-hint"] } : {}) };
  });
}

function fromSkillsDir(dir: string): SlashItem[] {
  const out: SlashItem[] = [];
  let names: string[];
  try { names = readdirSync(dir).sort(); } catch { return out; }
  for (const n of names.slice(0, MAX_FILES)) {
    if (n.startsWith(".")) continue;
    const f = join(dir, n, "SKILL.md");
    if (!existsSync(f)) continue;
    const fm = parseFrontmatter(readHead(f));
    out.push({ name: fm.name || n, source: "skill", ...(fm.description ? { description: fm.description.slice(0, 200) } : {}) });
  }
  return out;
}

/**
 * Slash commands for a chat in `cwd`: the project's `.claude/commands` and skills, then `~/.claude/commands` and skills,
 * then the headless built-ins. Read-only; a project entry hides a user entry of the same name.
 */
export function listSlashCommands(cwd: string, home = homedir()): SlashItem[] {
  const all = [
    ...fromCommandsDir(join(cwd, ".claude", "commands"), "project"),
    ...fromSkillsDir(join(cwd, ".claude", "skills")),
    ...fromCommandsDir(join(home, ".claude", "commands"), "user"),
    ...fromSkillsDir(join(home, ".claude", "skills")),
    ...BUILTIN_COMMANDS,
  ];
  const seen = new Set<string>();
  return all.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)));
}
