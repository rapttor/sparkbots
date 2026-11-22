import { spawn, type ChildProcess } from "node:child_process";
import { approvalResponse, parseApprovalRequest, unsupportedControlResponse, userMessageLine, type ApprovalRequest } from "../../../src/shared/claudeStream";

/** How long an idle live process is kept before it is closed (the next message resumes the session in a fresh one). */
export const IDLE_CLOSE_MS = 10 * 60_000;
/** A permission question nobody answers is denied after this long, so a chat can never hang forever. */
export const APPROVAL_TIMEOUT_MS = 30 * 60_000;

export interface LiveHandlers {
  /** Every parsed stdout line except permission questions (those go to onApproval). */
  onLine(line: unknown): void;
  onApproval(req: ApprovalRequest): void;
  /** The CLI withdrew a permission question (the tool was cancelled). */
  onCancel(requestId: string): void;
  /** A turn finished (`result` line). */
  onResult(line: Record<string, unknown>): void;
  onExit(code: number | null, err: boolean): void;
}

/**
 * One long-lived `claude -p --input-format stream-json --permission-prompt-tool stdio` process for one chat.
 * Messages go in as JSON lines; permission questions come out as `control_request` lines and are answered with `respond`.
 * The caller builds argv (never bypassPermissions) and guarantees one turn at a time. No shell is involved.
 */
export class LiveProcess {
  readonly child: ChildProcess;
  private buf = "";
  private pending = new Map<string, { input: Record<string, unknown>; timer: ReturnType<typeof setTimeout> }>();
  private idleTimer?: ReturnType<typeof setTimeout>;
  exited = false;

  constructor(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, private h: LiveHandlers, readonly key: string) {
    this.child = spawn(bin, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"], env });
    this.child.stdout!.on("data", (d: Buffer) => this.feed(d.toString("utf8")));
    this.child.stderr!.on("data", () => { /* drained; errors surface as result lines */ });
    this.child.stdin!.on("error", () => { /* process already gone */ });
    const end = (code: number | null, err = false) => { if (this.exited) return; this.exited = true; this.clear(); this.h.onExit(code, err); };
    this.child.on("error", () => end(null, true));
    this.child.on("close", (c) => end(c));
  }
  get pid() { return this.child.pid ?? -1; }

  private feed(chunk: string) {
    this.buf += chunk;
    const lines = this.buf.split("\n"); this.buf = lines.pop() ?? "";
    for (const l of lines) {
      let j: unknown; try { j = JSON.parse(l); } catch { continue; }
      this.handle(j);
    }
  }
  private handle(j: unknown) {
    const o = j as Record<string, unknown> | null;
    if (o && typeof o === "object" && o.type === "control_request") {
      const req = parseApprovalRequest(j);
      if (req) {
        const timer = setTimeout(() => { if (this.pending.has(req.requestId)) this.respond(req.requestId, false, "No answer in 30 minutes"); }, APPROVAL_TIMEOUT_MS);
        this.pending.set(req.requestId, { input: req.input, timer });
        this.h.onApproval(req);
      } else if (typeof o.request_id === "string") this.write(unsupportedControlResponse(o.request_id));
      return;
    }
    if (o && typeof o === "object" && o.type === "control_cancel_request" && typeof o.request_id === "string") {
      const p = this.pending.get(o.request_id); if (p) { clearTimeout(p.timer); this.pending.delete(o.request_id); this.h.onCancel(o.request_id); }
      return;
    }
    this.h.onLine(j);
    if (o && typeof o === "object" && o.type === "result") this.h.onResult(o); // after onLine, so the result line still belongs to its turn
  }
  private write(line: string) { if (!this.exited && this.child.stdin?.writable) this.child.stdin.write(line + "\n"); }

  /** Start a turn. */
  sendPrompt(prompt: string) { this.cancelIdle(); this.write(userMessageLine(prompt)); }

  /** Answer a permission question. Returns false when it is not (or no longer) pending. */
  respond(requestId: string, allow: boolean, message?: string): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer); this.pending.delete(requestId);
    this.write(approvalResponse(requestId, allow, p.input, message));
    return true;
  }
  hasPending(requestId: string) { return this.pending.has(requestId); }
  get pendingCount() { return this.pending.size; }

  /** Close after `ms` with nothing happening (cancelled by the next prompt). */
  closeWhenIdle(ms = IDLE_CLOSE_MS) { this.cancelIdle(); this.idleTimer = setTimeout(() => this.close(), ms); this.idleTimer.unref?.(); }
  private cancelIdle() { if (this.idleTimer) clearTimeout(this.idleTimer); this.idleTimer = undefined; }
  private clear() { this.cancelIdle(); for (const p of this.pending.values()) clearTimeout(p.timer); this.pending.clear(); }

  /** Graceful: closing stdin lets the CLI finish and exit. */
  close() { this.cancelIdle(); try { this.child.stdin?.end(); } catch { /* gone */ } }
  kill() { this.clear(); this.child.kill("SIGTERM"); }
}
