import fs from "node:fs";
import path from "node:path";
import { aoHome } from "./config";

/** `~/.agent-office/session.json`: the address of the SparkBots server that is running now, so other local tools (landing.sh) can offer "open the current session". Written with mode 0600 because the address holds the token. */
export interface SessionInfo { url: string; port: number; pid: number; startedAt: number }
const file = (): string => path.join(aoHome(), "session.json");

export function writeSession(url: string, port: number): void {
  try {
    fs.mkdirSync(aoHome(), { recursive: true });
    const info: SessionInfo = { url, port, pid: process.pid, startedAt: Date.now() };
    fs.writeFileSync(file(), JSON.stringify(info), { mode: 0o600 });
  } catch { /* read-only home: the landing page just shows "not running" */ }
}
/** Remove our own session file (never another server's). */
export function clearSession(): void {
  try { const s = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<SessionInfo>; if (s.pid === process.pid) fs.unlinkSync(file()); } catch { /* nothing to clear */ }
}
export const pidAlive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };
/** The running session, or null (no file, corrupt, or its process is gone). */
export function readSession(): SessionInfo | null {
  try {
    const s = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<SessionInfo>;
    if (typeof s.url !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+$/i.test(s.url) || typeof s.pid !== "number" || !pidAlive(s.pid)) return null;
    return { url: s.url, port: Number(s.port), pid: s.pid, startedAt: Number(s.startedAt) || 0 };
  } catch { return null; }
}
