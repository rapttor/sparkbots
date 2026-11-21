import { execFile, spawn } from "node:child_process";
import { readlink } from "node:fs/promises";

const SESSION = /^ses_[A-Za-z0-9]+$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,100}$/;

export class OpenCodeCommandError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const active = new Set<string>(); // one headless writer per OpenCode session at a time

export interface OpenCodeSendOpts { fork?: boolean; files?: string[]; model?: string }

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
