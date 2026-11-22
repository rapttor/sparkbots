import type { LabelDef, Snapshot, Team, Worker } from "../../server/adapters/types";

/**
 * Incremental sync protocol (see docs/SYNC.md). Pure functions, shared by the server and the browser.
 *
 *  server -> client messages
 *    hello   { rev, snapshot }   full state, sent on connect (and so on every reconnect = resync)
 *    patch   { rev, ops }        only what changed since the previous rev; rev must be previous + 1
 *    changed { kind, id? }       "this slice changed, fetch it if you show it" (board, runs, tasks, history, ...)
 */
export type Slice = "board" | "runs" | "tasks" | "history" | "processes" | "stats" | "messages" | "archive" | "subagents" | "notes" | "services";
export type TeamMeta = Omit<Team, "workers">;
export interface Meta { skippedLines: number; labelDefs: LabelDef[]; rateLimitedUntil?: number }
const metaFrom = (s: Snapshot): Meta => ({ skippedLines: s.skippedLines, labelDefs: s.labelDefs ?? [], ...(s.rateLimitedUntil ? { rateLimitedUntil: s.rateLimitedUntil } : {}) });
export type Op =
  | { k: "w"; v: Worker }            // add or replace an agent
  | { k: "wd"; id: string }          // agent gone
  | { k: "t"; v: TeamMeta }          // add or replace project metadata
  | { k: "td"; name: string }        // project gone
  | { k: "m"; v: Meta };             // global bits (skipped lines, label definitions)

export type ServerMsg =
  | { type: "hello"; rev: number; snapshot: Snapshot }
  | { type: "patch"; rev: number; at: number; ops: Op[] }
  | { type: "changed"; kind: Slice; id?: string };

const metaOf = (t: Team): TeamMeta => { const { workers: _w, ...m } = t; return m; };

/** Server side: remembers what clients already have and turns a new snapshot into the minimal list of ops. */
export class Differ {
  private workers = new Map<string, string>();
  private teams = new Map<string, string>();
  private meta = "";

  /** Ops needed to go from the last diffed snapshot to `s` (empty = nothing changed). */
  diff(s: Snapshot): Op[] {
    const ops: Op[] = [];
    const seenW = new Set<string>(), seenT = new Set<string>();
    for (const t of s.teams) {
      const m = metaOf(t), mj = JSON.stringify(m);
      seenT.add(t.name);
      if (this.teams.get(t.name) !== mj) { this.teams.set(t.name, mj); ops.push({ k: "t", v: m }); }
      for (const w of t.workers) {
        const wj = JSON.stringify(w);
        seenW.add(w.id);
        if (this.workers.get(w.id) !== wj) { this.workers.set(w.id, wj); ops.push({ k: "w", v: w }); }
      }
    }
    for (const id of [...this.workers.keys()]) if (!seenW.has(id)) { this.workers.delete(id); ops.push({ k: "wd", id }); }
    for (const n of [...this.teams.keys()]) if (!seenT.has(n)) { this.teams.delete(n); ops.push({ k: "td", name: n }); }
    const meta = metaFrom(s);
    const j = JSON.stringify(meta);
    if (j !== this.meta) { this.meta = j; ops.push({ k: "m", v: meta }); }
    return ops;
  }
}

/** Client side: normalized copy of the state. Unchanged teams keep their object identity so React skips them. */
export class ClientState {
  rev = -1;
  private workers = new Map<string, Worker>();
  private teams = new Map<string, TeamMeta>();
  private built = new Map<string, Team>();
  private meta: Meta = { skippedLines: 0, labelDefs: [] };
  private dirty = new Set<string>();
  private all = true;

  reset(rev: number, s: Snapshot): Snapshot {
    this.rev = rev;
    this.workers.clear(); this.teams.clear(); this.built.clear();
    for (const t of s.teams) { this.teams.set(t.name, metaOf(t)); for (const w of t.workers) this.workers.set(w.id, w); }
    this.meta = metaFrom(s);
    this.all = true;
    return this.build(s.at);
  }

  /** Applies a patch. Returns the new snapshot, or null when the rev does not follow (caller must resync). */
  apply(rev: number, at: number, ops: Op[]): Snapshot | null {
    if (rev !== this.rev + 1) return null;
    this.rev = rev;
    for (const op of ops) {
      if (op.k === "w") {
        const old = this.workers.get(op.v.id);
        if (old) this.dirty.add(old.team);
        this.dirty.add(op.v.team); this.workers.set(op.v.id, op.v);
      } else if (op.k === "wd") {
        const old = this.workers.get(op.id);
        if (old) this.dirty.add(old.team);
        this.workers.delete(op.id);
      } else if (op.k === "t") { this.teams.set(op.v.name, op.v); this.dirty.add(op.v.name); }
      else if (op.k === "td") { this.teams.delete(op.name); this.built.delete(op.name); }
      else this.meta = op.v;
    }
    return this.build(at);
  }

  private build(at: number): Snapshot {
    const teams: Team[] = [];
    let byTeam: Map<string, Worker[]> | undefined;
    const workersOf = (name: string) => {
      if (!byTeam) { byTeam = new Map(); for (const w of this.workers.values()) (byTeam.get(w.team) ?? byTeam.set(w.team, []).get(w.team)!).push(w); }
      return (byTeam.get(name) ?? []).sort((a, b) => b.lastEventAt - a.lastEventAt);
    };
    for (const [name, m] of this.teams) {
      let t = this.built.get(name);
      if (!t || this.all || this.dirty.has(name)) { t = { ...m, workers: workersOf(name) }; this.built.set(name, t); }
      teams.push(t);
    }
    this.dirty.clear(); this.all = false;
    teams.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return { at, teams, skippedLines: this.meta.skippedLines, labelDefs: this.meta.labelDefs, ...(this.meta.rateLimitedUntil ? { rateLimitedUntil: this.meta.rateLimitedUntil } : {}) };
  }
}
