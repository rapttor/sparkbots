import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, UNLABELED, applyFilters, filterAndSort, statusCounts, isDefault } from "../src/panels/teamFilters";
import type { Team, WorkerState } from "../server/adapters/types";

const team = (name: string, states: WorkerState[], last: number, labels: string[] = [], titles: string[] = []): Team =>
  ({ name, color: "#fff", lastActivityAt: last, labels, workers: states.map((s, i) => ({ id: `${name}${i}`, state: s, title: titles[i] ?? "" })) }) as unknown as Team;

const teams = [
  team("alpha", ["asleep", "idle"], 1, ["current"], ["fix login"]),
  team("beta", ["waiting"], 3),
  team("gamma", ["working", "working", "error"], 2, ["finished"]),
];
const tasks = { alpha: { open: 2 }, gamma: { open: 5 }, beta: null };
const names = (f: Partial<typeof DEFAULT_FILTERS>) => filterAndSort(teams, { ...DEFAULT_FILTERS, ...f }, tasks).map((t) => t.name);

describe("teamFilters", () => {
  it("sorts by latest by default", () => expect(names({})).toEqual(["beta", "gamma", "alpha"]));
  it("searches team name and worker titles", () => {
    expect(names({ search: "LOGIN" })).toEqual(["alpha"]);
    expect(names({ search: "gam" })).toEqual(["gamma"]);
  });
  it("status filter matches any worker", () => {
    expect(names({ statuses: ["error", "idle"] })).toEqual(["gamma", "alpha"]);
  });
  it("filters workers by source with both enabled by default", () => {
    const mixed = team("mixed", ["idle", "working"], 4);
    mixed.workers[0].source = "claude"; mixed.workers[1].source = "codex";
    expect(applyFilters([mixed], DEFAULT_FILTERS, {}).at(0)?.workers).toHaveLength(2);
    expect(applyFilters([mixed], { ...DEFAULT_FILTERS, sources: ["codex"] }, {}).at(0)?.workers.map((w) => w.source)).toEqual(["codex"]);
    expect(applyFilters([mixed], { ...DEFAULT_FILTERS, sources: [] }, {})).toEqual([]);
  });
  it("label filter incl. unlabeled", () => {
    expect(names({ labels: ["current"] })).toEqual(["alpha"]);
    expect(names({ labels: [UNLABELED] })).toEqual(["beta"]);
    expect(names({ labels: [UNLABELED, "finished"] })).toEqual(["beta", "gamma"]);
  });
  it("open tasks toggle", () => expect(names({ openTasks: true })).toEqual(["gamma", "alpha"]));
  it("sorts", () => {
    expect(names({ sort: "status" })).toEqual(["beta", "gamma", "alpha"]);
    expect(names({ sort: "name" })).toEqual(["alpha", "beta", "gamma"]);
    expect(names({ sort: "tasks" })).toEqual(["gamma", "alpha", "beta"]);
    expect(names({ sort: "workers" })).toEqual(["gamma", "alpha", "beta"]);
  });
  it("counts teams per status and detects defaults", () => {
    expect(statusCounts(teams).working).toBe(1);
    expect(isDefault(DEFAULT_FILTERS)).toBe(true);
    expect(isDefault({ ...DEFAULT_FILTERS, openTasks: true })).toBe(false);
  });
});
