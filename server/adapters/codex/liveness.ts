import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import type { LiveInfo, SessionId, SessionRef } from "../types";

/**
 * Codex has no sessions directory like Claude's, so liveness comes from the process list. A `codex` CLI process
 * counts when its working directory matches a session's cwd (or its command line names the thread id, as in
 * `codex resume <id>`). The desktop app's `codex app-server` and our own `codex queue` calls are not interactive
 * writers and are ignored. Everything degrades to "nobody is live" when ps/lsof are unavailable.
 */
export interface CodexProc { pid: number; command: string }
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IGNORED = new Set(["app-server", "queue", "mcp-server", "mcp", "login", "logout", "completion", "proto", "debug"]);

const run = (cmd: string, args: string[]) => new Promise<string>((resolve, reject) =>
  execFile(cmd, args, { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(out))));

/** Classify one `ps` command line. Undefined means "not a Codex agent process". */
export function classify(command: string): { kind: LiveInfo["kind"]; thread?: string } | undefined {
  const parts = command.trim().split(/\s+/), exe = parts[0] ?? "";
  if (!/(^|\/)codex$/.test(exe) && !/\/codex-cli\/.*\/MacOS\/codex$/.test(exe)) return undefined;
  const args = parts.slice(1).filter((a) => !a.startsWith("-") && !a.includes("="));
  const sub = args.find((a) => /^[a-z][a-z-]*$/.test(a));
  if (sub && IGNORED.has(sub)) return undefined;
  const thread = UUID.exec(command)?.[0]?.toLowerCase();
  if (sub === "exec" || sub === "e") return { kind: "headless", thread };
  return { kind: "interactive", thread };
}

async function cwdOf(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "linux") return (await readlink(`/proc/${pid}/cwd`)).trim() || undefined;
    if (process.platform === "darwin") {
      const line = (await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])).split("\n").find((l) => l.startsWith("n"));
      return line ? line.slice(1).trim() || undefined : undefined;
    }
  } catch { /* process vanished or lsof unavailable */ }
  return undefined;
}

export async function codexProcesses(): Promise<(CodexProc & { cwd?: string; kind: LiveInfo["kind"]; thread?: string })[]> {
  let ps: string;
  try { ps = await run("ps", ["-axo", "pid=,command="]); } catch { return []; }
  const out = [];
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line); if (!m) continue;
    const c = classify(m[2]!); if (!c) continue;
    out.push({ pid: Number(m[1]), command: m[2]!, cwd: await cwdOf(Number(m[1])), ...c });
  }
  return out;
}

/**
 * Match processes to sessions. A process naming a thread id belongs to that session; otherwise it belongs to the most
 * recently written Codex session in its cwd (an interactive TUI writes exactly one rollout at a time).
 */
export function matchLive(procs: Awaited<ReturnType<typeof codexProcesses>>, sessions: Iterable<SessionRef>): Map<SessionId, LiveInfo> {
  const out = new Map<SessionId, LiveInfo>(), list = [...sessions].filter((s) => s.source === "codex");
  for (const p of procs) {
    let target = p.thread ? list.find((s) => s.id === `codex:${p.thread}`) : undefined;
    if (!target && p.cwd) target = list.filter((s) => s.cwd === p.cwd && !out.has(s.id)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (target && !out.has(target.id)) out.set(target.id, { pid: p.pid, kind: p.kind });
  }
  return out;
}

export async function codexLiveness(sessions: Iterable<SessionRef>): Promise<Map<SessionId, LiveInfo>> {
  return matchLive(await codexProcesses(), sessions);
}
