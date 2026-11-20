import { describe, expect, it } from "vitest";
import { ClientState, Differ } from "../src/shared/sync";
import type { Snapshot, Worker } from "../server/adapters/types";

const w = (id: string, team: string, over: Partial<Worker> = {}): Worker => ({
  id, team, cwd: `/p/${team}`, title: id, state: "idle", activity: "idle", lastEventAt: 1, liveInTerminal: false, helpers: 0, color: "#d97757", ...over,
});
const snap = (...teams: [string, Worker[]][]): Snapshot => ({
  at: 1, skippedLines: 0, labelDefs: [],
  teams: teams.map(([name, workers]) => ({ name, color: "#111111", workers, lastActivityAt: Math.max(0, ...workers.map((x) => x.lastEventAt)), labels: [], botColor: "#d97757" })),
});

describe("sync", () => {
  it("a patch only carries what changed, and applying it reproduces the new snapshot", () => {
    const a = snap(["A", [w("a1", "A"), w("a2", "A")]], ["B", [w("b1", "B")]]);
    const d = new Differ(); d.diff(a);
    const c = new ClientState(); c.reset(0, a);
    const b = snap(["A", [w("a1", "A", { state: "working", lastEventAt: 5 }), w("a2", "A")]], ["B", [w("b1", "B")]]);
    const ops = d.diff(b);
    expect(ops.map((o) => o.k).sort()).toEqual(["t", "w"]); // the worker, and its project's lastActivityAt
    const out = c.apply(1, 2, ops)!;
    expect(out.teams.flatMap((t) => t.workers).find((x) => x.id === "a1")!.state).toBe("working");
    expect(JSON.stringify(ops).length).toBeLessThan(JSON.stringify(b).length / 2);
  });
  it("no change -> no ops; unchanged teams keep their object identity", () => {
    const a = snap(["A", [w("a1", "A")]], ["B", [w("b1", "B", { lastEventAt: 0 })]]);
    const d = new Differ(); d.diff(a);
    expect(d.diff(a)).toEqual([]);
    const c = new ClientState(); const first = c.reset(0, a);
    const b = snap(["A", [w("a1", "A", { activity: "coding", state: "working" })]], ["B", [w("b1", "B", { lastEventAt: 0 })]]);
    const next = c.apply(1, 2, d.diff(b))!;
    const old = (n: string) => first.teams.find((t) => t.name === n)!, cur = (n: string) => next.teams.find((t) => t.name === n)!;
    expect(cur("B")).toBe(old("B"));
    expect(cur("A")).not.toBe(old("A"));
  });
  it("handles removal and an agent moving to another project", () => {
    const a = snap(["A", [w("a1", "A"), w("a2", "A")]], ["B", [w("b1", "B")]]);
    const d = new Differ(); d.diff(a);
    const c = new ClientState(); c.reset(0, a);
    const b = snap(["A", [w("a1", "A")]], ["C", [w("a2", "C")]]); // b1 and team B gone, a2 moved into new team C
    const out = c.apply(1, 2, d.diff(b))!;
    expect(out.teams.map((t) => t.name).sort()).toEqual(["A", "C"]);
    expect(out.teams.find((t) => t.name === "C")!.workers.map((x) => x.id)).toEqual(["a2"]);
    expect(out.teams.find((t) => t.name === "A")!.workers.map((x) => x.id)).toEqual(["a1"]);
  });
  it("refuses a patch that does not follow the current rev (caller resyncs)", () => {
    const a = snap(["A", [w("a1", "A")]]);
    const c = new ClientState(); c.reset(5, a);
    expect(c.apply(7, 2, [])).toBeNull();
    expect(c.apply(6, 2, [])).not.toBeNull();
  });
});
