import { describe, it, expect } from "vitest";
import { StatsAggregator, type UsageEvent } from "../server/stats/aggregate";

const ev = (o: Partial<UsageEvent> = {}): UsageEvent => ({
  kind: "usage", session: "s1", model: "claude-sonnet-x", input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
  at: new Date(2026, 10, 20, 10, 0).getTime(), ...o,
});

describe("StatsAggregator", () => {
  it("sums totals by day/project/model and heatmap", () => {
    const a = new StatsAggregator();
    a.add(ev({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1 }), "p");
    a.add(ev({ input: 1, output: 1 }), "p");
    const s = a.snapshot();
    expect(s.byProject.p).toEqual({ input: 11, output: 6, cacheRead: 2, cacheWrite: 1 });
    expect(s.byModel["claude-sonnet-x"].input).toBe(11);
    expect(s.hourHeatmap[10]).toBe(2);
    expect(s.label).toBe("estimate");
  });
  it("buckets per local day", () => {
    const a = new StatsAggregator();
    a.add(ev({ input: 1, at: new Date(2026, 10, 20, 23, 59).getTime() }), "p");
    a.add(ev({ input: 2, at: new Date(2026, 10, 21, 0, 1).getTime() }), "p");
    const s = a.snapshot();
    expect(s.byDay["2026-11-20"].input).toBe(1);
    expect(s.byDay["2026-11-21"].input).toBe(2);
  });
  it("prices by model family", () => {
    const a = new StatsAggregator();
    a.add(ev({ model: "claude-haiku-4", input: 1_000_000 }), "p");
    expect(a.snapshot().estCostUsd).toBeCloseTo(1, 6);
    const b = new StatsAggregator();
    b.add(ev({ model: "claude-opus-4", input: 1_000_000 }), "p");
    expect(b.snapshot().estCostUsd).toBeCloseTo(15, 6);
    const c = new StatsAggregator();
    c.add(ev({ model: "mystery", input: 1_000_000 }), "p");
    expect(c.snapshot().estCostUsd).toBeCloseTo(3, 6);
  });
  it("top projects uses last 7 days, top 5", () => {
    const a = new StatsAggregator();
    const now = new Date(2026, 10, 20, 12, 0).getTime();
    a.add(ev({ input: 100, at: now - 1000 }), "recent");
    a.add(ev({ input: 9999, at: now - 30 * 86_400_000 }), "old");
    for (let i = 0; i < 6; i++) a.add(ev({ input: 1 + i, at: now - 1000 }), `x${i}`);
    const top = a.snapshot(now).topProjectsWeek;
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ project: "recent", tokens: 100 });
    expect(top.find((t) => t.project === "old")).toBeUndefined();
  });
  it("dedupes sessionStarted", () => {
    const a = new StatsAggregator();
    const at = new Date(2026, 10, 20, 9).getTime();
    a.sessionStarted("s1", "p", at);
    a.sessionStarted("s1", "p", at);
    a.sessionStarted("s2", "p", at);
    expect(a.snapshot().sessionsPerDay["2026-11-20"]).toBe(2);
  });
});

describe("StatsAggregator per service", () => {
  it("splits tokens by source and prices only Claude", () => {
    const a = new StatsAggregator();
    a.add(ev({ input: 1_000_000 }), "p", "claude");
    a.add(ev({ input: 1_000_000, model: "gpt-x" }), "p", "codex");
    const s = a.snapshot();
    expect(s.bySource.claude!.input).toBe(1_000_000);
    expect(s.bySourceDay.codex!["2026-11-20"]!.input).toBe(1_000_000);
    expect(s.costBySource.codex).toBeUndefined();
    expect(s.estCostUsd).toBeCloseTo(3);
  });
});

import { fmtShare } from "../src/util";
describe("fmtShare", () => {
  it("never shows 0% for a service that has tokens", () => {
    expect(fmtShare(0, 100)).toBe("0%");
    expect(fmtShare(2, 1000)).toBe("<1%");
    expect(fmtShare(50, 100)).toBe("50%");
    expect(fmtShare(1, 0)).toBe("0%");
  });
});
