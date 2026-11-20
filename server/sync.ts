import type { WebSocket, WebSocketServer } from "ws";
import type { Company } from "./model/company";
import { Differ, type ServerMsg, type Slice } from "../src/shared/sync";

/**
 * Pushes changes to every connected browser: small patches for agents/projects, and "changed" pings for slices the
 * browser fetches itself (board, runs, history, ...). Pings are coalesced so a burst becomes one message.
 */
export class Hub {
  rev = 0;
  private differ = new Differ();
  private pending = new Map<string, { kind: Slice; id?: string }>();
  private timer: NodeJS.Timeout | undefined;
  constructor(private wss: WebSocketServer, private company: Company) { this.differ.diff(company.snapshot()); }

  private send(msg: ServerMsg, only?: WebSocket) {
    const body = JSON.stringify(msg);
    if (only) { if (only.readyState === 1) only.send(body); return body.length; }
    for (const c of this.wss.clients) if (c.readyState === 1) c.send(body);
    return body.length;
  }

  /** New connection: full state at the current rev. */
  hello(ws: WebSocket) { this.send({ type: "hello", rev: this.rev, snapshot: this.company.snapshot() }, ws); }

  /** Diff the company against what clients have; push a patch if anything changed. Returns the ops sent. */
  flush(): number {
    const ops = this.differ.diff(this.company.snapshot());
    if (!ops.length) return 0;
    this.rev++;
    this.send({ type: "patch", rev: this.rev, at: Date.now(), ops });
    return ops.length;
  }

  /** Something outside the agent list changed (board, runs, ...). Clients that show it will refetch. */
  changed(kind: Slice, id?: string) {
    this.pending.set(`${kind}|${id ?? ""}`, { kind, id });
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      const batch = [...this.pending.values()]; this.pending.clear();
      for (const m of batch) this.send({ type: "changed", ...m });
    }, 120);
  }
}
