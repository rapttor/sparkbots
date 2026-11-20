import { loadJson, saveJson } from "./config";

/** One stretch of a worker being busy (working or waiting). `end` is null while it is still going. */
export interface WorkSpan { session: string; team: string; title: string; start: number; end: number | null; activities: string[]; waited: boolean; tokens: number; tools: number }

const MAX_SPANS = 500;

/** Control-room history: when each worker was working. Persisted to ~/.agent-office/history.json (closed spans only). */
export class History {
  private done: WorkSpan[];
  private open = new Map<string, WorkSpan>();
  private pending = new Map<string, { tokens: number; tools: number }>(); // events seen before the span opened (events arrive just before the state tick)
  constructor() {
    const f = loadJson<{ schemaVersion: 1; spans: WorkSpan[] }>("history.json", { schemaVersion: 1, spans: [] });
    this.done = Array.isArray(f.spans) ? f.spans.filter((s) => s && typeof s.session === "string" && typeof s.start === "number").map((s) => ({ ...s, tokens: s.tokens ?? 0, tools: s.tools ?? 0 })) : [];
  }

  /** Count live usage / tool events towards the session's current span. Tokens = input + output (no cache). */
  record(e: { kind: string; session: string; input?: number; output?: number }): void {
    if (e.kind !== "usage" && e.kind !== "tool") return;
    const tgt = this.open.get(e.session) ?? (this.pending.get(e.session) ?? (this.pending.set(e.session, { tokens: 0, tools: 0 }), this.pending.get(e.session)!));
    if (e.kind === "usage") tgt.tokens += (e.input ?? 0) + (e.output ?? 0); else tgt.tools++;
  }

  /** Feed the current state of one worker; opens/closes spans on busy <-> not busy transitions. */
  observe(w: { session: string; team: string; title: string; state: string; activity: string }, now: number): void {
    const busy = w.state === "working" || w.state === "waiting";
    const cur = this.open.get(w.session);
    if (busy && !cur) {
      const p = this.pending.get(w.session); this.pending.delete(w.session);
      this.open.set(w.session, { session: w.session, team: w.team, title: w.title, start: now, end: null,
        activities: w.activity !== "idle" ? [w.activity] : [], waited: w.state === "waiting", tokens: p?.tokens ?? 0, tools: p?.tools ?? 0 });
    } else if (busy && cur) {
      if (w.state === "waiting") cur.waited = true;
      if (w.activity !== "idle" && !cur.activities.includes(w.activity)) cur.activities.push(w.activity);
    } else if (!busy && cur) {
      this.open.delete(w.session); this.pending.delete(w.session);
      cur.end = now;
      this.done.push(cur);
      if (this.done.length > MAX_SPANS) this.done.splice(0, this.done.length - MAX_SPANS);
      saveJson("history.json", { spans: this.done });
    }
  }

  /** Newest first, running spans on top. Spans shorter than 5 s are noise and left out. */
  list(): WorkSpan[] {
    const all = [...this.open.values(), ...this.done].filter((s) => s.end === null || s.end - s.start >= 5000);
    return all.sort((a, b) => b.start - a.start);
  }
}
