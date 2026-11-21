import { execFile } from "node:child_process";

const THREAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CodexCommandError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Safe argv for the Codex daemon queue. The thread and message are always separate argv entries. */
export function buildQueueArgs(session: string, prompt: string): string[] {
  const thread = session.startsWith("codex:") ? session.slice(6) : session;
  if (!THREAD.test(thread)) throw new CodexCommandError(400, "invalid Codex thread id");
  if (!prompt.trim()) throw new CodexCommandError(400, "message required");
  return ["queue", "--thread", thread, "--message", prompt, "--resume"];
}

export function queueMessage(session: string, prompt: string, cwd: string, bin = process.env.CODEX_BIN ?? "codex"): Promise<void> {
  const args = buildQueueArgs(session, prompt);
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, shell: false, timeout: 30_000, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      const detail = stderr.trim().split("\n").filter(Boolean).at(-1);
      reject(new CodexCommandError(502, detail ? `Codex queue failed: ${detail}` : `Codex queue failed: ${error.message}`));
    });
  });
}
