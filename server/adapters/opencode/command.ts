import { execFile, spawn } from "node:child_process";
import { readlink } from "node:fs/promises";
import type { OpenCodeModel } from "../../../src/shared/opencode";

const SESSION = /^ses_[A-Za-z0-9]+$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,100}$/;
const TITLE_MAX = 120;

export class OpenCodeCommandError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const active = new Set<string>(); // one headless writer per OpenCode session at a time

export interface OpenCodeSendOpts { fork?: boolean; files?: string[]; model?: string }
export interface OpenCodeSpawnOpts { model?: string; title?: string }

/**
 * Safe argv for `opencode run`. The session id and prompt are always separate argv entries; the prompt goes after
 * `--` so it can never be parsed as a flag. No `--auto` / permission bypass is ever added.
 * `[VERIFY]` these flags against the installed OpenCode version when upgrading.
 */
export function buildRunArgs(session: string, prompt: string, opts: OpenCodeSendOpts = {}): string[] {
  const raw = session.startsWith("opencode:") ? session.slice("opencode:".length) : session;
  if (!SESSION.test(raw)) throw new OpenCodeCommandError(400, "invalid OpenCode session id");
  if (!prompt.trim()) throw new OpenCodeCommandError(400, "message required");
  const args = ["run", "--session", raw, "--format", "json"];
  if (opts.fork) args.push("--fork");
  if (opts.model) {
    if (!MODEL.test(opts.model)) throw new OpenCodeCommandError(400, "invalid OpenCode model");
    args.push("--model", opts.model);
  }
  for (const file of opts.files ?? []) {
    if (!file || file.includes("\0")) throw new OpenCodeCommandError(400, "invalid attachment path");
    args.push("--file", file);
  }
  args.push("--", prompt);
  return args;
}

/** Safe argv for a brand-new `opencode run` (a hired OpenCode agent). Prompt is always the final argv entry. */
export function buildSpawnArgs(prompt: string, opts: OpenCodeSpawnOpts = {}): string[] {
  if (!prompt.trim()) throw new OpenCodeCommandError(400, "message required");
  const args = ["run", "--format", "json"];
  if (opts.model) {
    if (!MODEL.test(opts.model)) throw new OpenCodeCommandError(400, "invalid OpenCode model");
    args.push("--model", opts.model);
  }
  const title = opts.title?.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  if (title) args.push("--title", title);
  args.push("--", prompt);
  return args;
}

const run = (bin: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
  execFile(bin, args, { shell: false, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => err ? reject(err) : resolve(stdout));
});

async function cwdOf(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") return (await readlink(`/proc/${pid}/cwd`)).trim() || undefined;
    if (process.platform === "darwin") {
      const out = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
      const line = out.split("\n").find((l) => l.startsWith("n"));
      return line ? line.slice(1).trim() || undefined : undefined;
    }
  } catch { /* process vanished or lsof unavailable */ }
  return undefined;
}

/** Project directories where an interactive OpenCode TUI is running (headless `opencode run` processes are ignored). */
export async function opencodeTuiCwds(): Promise<Set<string>> {
  const out = new Set<string>();
  let ps: string;
  try { ps = await run("ps", ["-axo", "pid=,command="]); } catch { return out; }
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]), cmd = m[2]!;
    const base = cmd.split(/\s+/)[0] ?? "";
    if (!/(^|\/)opencode$/.test(base)) continue;
    if (/\s(run|serve|attach|web)(\s|$)/.test(cmd)) continue; // our own headless runs are not writers
    const cwd = await cwdOf(pid);
    if (cwd) out.add(cwd);
  }
  return out;
}

/** Fire-and-forget `opencode run`: the chat DB is watched by SparkBots, so the reply shows up there. */
export async function queueMessage(session: string, prompt: string, cwd: string, opts: OpenCodeSendOpts = {}): Promise<void> {
  const raw = session.startsWith("opencode:") ? session.slice("opencode:".length) : session;
  const args = buildRunArgs(session, prompt, opts);
  if (!opts.fork) {
    const busy = await opencodeTuiCwds();
    if (busy.has(cwd)) throw new OpenCodeCommandError(409, "An OpenCode terminal is open in this project. Use Send as fork so its chat is not written by two writers.");
    if (active.has(raw)) throw new OpenCodeCommandError(409, "This OpenCode chat is already running a message from SparkBots. Wait for it, or use Send as fork.");
  }
  const bin = process.env.OPENCODE_BIN ?? "opencode";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, shell: false, detached: true, stdio: "ignore" });
    if (!opts.fork) active.add(raw);
    child.once("exit", () => active.delete(raw));
    child.once("spawn", () => { child.unref(); resolve(); });
    child.once("error", (e) => { active.delete(raw); reject(new OpenCodeCommandError(502, `OpenCode run failed: ${e.message}`)); });
  });
}

/** Start a new OpenCode chat (a hire). The chat DB is watched, so the new agent appears without us knowing its id yet. */
export async function spawnSession(cwd: string, prompt: string, opts: OpenCodeSpawnOpts = {}): Promise<void> {
  const args = buildSpawnArgs(prompt, opts);
  const bin = process.env.OPENCODE_BIN ?? "opencode";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, shell: false, detached: true, stdio: "ignore" });
    child.once("spawn", () => { child.unref(); resolve(); });
    child.once("error", (e) => reject(new OpenCodeCommandError(502, `OpenCode run failed: ${e.message}`)));
  });
}

const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Read one balanced JSON object starting at `start` (brace counting ignores braces inside strings). */
function jsonBlock(lines: string[], start: number): { value: any; end: number } | undefined {
  let depth = 0, inStr = false, esc = false;
  const buf: string[] = [];
  for (let k = start; k < lines.length; k++) {
    const line = lines[k]!; buf.push(line);
    for (const ch of line) {
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth === 0) {
      try { return { value: JSON.parse(buf.join("\n")), end: k }; } catch { return undefined; }
    }
  }
  return undefined;
}

function modelFrom(id: string, o: Record<string, any>): OpenCodeModel {
  const slash = id.indexOf("/");
  const model = slash > 0 ? id.slice(slash + 1) : (str(o.id) ?? id);
  const limit = obj(o.limit), cost = obj(o.cost), cache = obj(cost.cache);
  const caps = obj(o.capabilities), input = obj(caps.input);
  const inputs = Object.entries(input).filter(([, v]) => v === true).map(([k]) => k);
  const hasCost = num(cost.input) !== undefined || num(cost.output) !== undefined;
  const variants = Object.keys(obj(o.variants));
  return {
    id,
    provider: str(o.providerID) ?? (slash > 0 ? id.slice(0, slash) : "opencode"),
    model,
    name: str(o.name) ?? model,
    family: str(o.family) || undefined,
    version: str(o.release_date) || undefined,
    status: str(o.status) || undefined,
    context: num(limit.context) || undefined,
    output: num(limit.output) || undefined,
    cost: hasCost ? { input: num(cost.input) ?? 0, output: num(cost.output) ?? 0, cacheRead: num(cache.read) ?? 0, cacheWrite: num(cache.write) ?? 0 } : undefined,
    reasoning: typeof caps.reasoning === "boolean" ? caps.reasoning : undefined,
    toolcall: typeof caps.toolcall === "boolean" ? caps.toolcall : undefined,
    attachment: typeof caps.attachment === "boolean" ? caps.attachment : undefined,
    inputs: inputs.length ? inputs : undefined,
    variants: variants.length ? variants : undefined,
  };
}

/** Parse `opencode models --verbose`: a `provider/model` line followed by a JSON metadata object. */
export function parseVerboseModels(out: string): OpenCodeModel[] {
  const lines = out.split(/\r?\n/), models: OpenCodeModel[] = [];
  for (let i = 0; i < lines.length; i++) {
    const id = lines[i]!.trim();
    if (!MODEL.test(id)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]!.trim()) j++;
    if (lines[j]?.trim() !== "{") continue;
    const block = jsonBlock(lines, j);
    if (!block || !block.value || typeof block.value !== "object") continue;
    models.push(modelFrom(id, block.value));
    i = block.end;
  }
  return dedupeModels(models);
}

/** Fallback for an older CLI without `--verbose`: just the `provider/model` lines. */
export function parseSimpleModels(out: string): OpenCodeModel[] {
  return dedupeModels(out.split(/\r?\n/).map((l) => l.trim()).filter((l) => MODEL.test(l)).map((id) => modelFrom(id, {})));
}

const dedupeModels = (list: OpenCodeModel[]): OpenCodeModel[] => [...new Map(list.map((m) => [m.id, m])).values()];

let modelsCache: { at: number; list: OpenCodeModel[] } | undefined;
/** Models the local OpenCode CLI can use, with metadata when `--verbose` is supported. Cached five minutes. */
export async function listModels(): Promise<OpenCodeModel[]> {
  if (modelsCache && Date.now() - modelsCache.at < 5 * 60_000) return modelsCache.list;
  const bin = process.env.OPENCODE_BIN ?? "opencode";
  let list: OpenCodeModel[] = [];
  try { list = parseVerboseModels(await run(bin, ["models", "--verbose"])); } catch { /* older CLI: try plain ids */ }
  if (!list.length) { try { list = parseSimpleModels(await run(bin, ["models"])); } catch { list = []; } }
  modelsCache = { at: Date.now(), list };
  return list;
}
