import { describe, expect, it } from "vitest";
import { ClawSim, CLAW, ITEMS, USER, addReward, byOwner, giveReward, grabChance, itemDef, pickPrize, shelfSplit, sweep, trophyFor, type Reward } from "../src/shared/rewards";
import { mulberry32 } from "../src/world/games/types";

const R = (id: string, owner: string, at: number): Reward => ({ id, owner, item: "plush-bear", at, from: "", note: "" });

describe("grab rule", () => {
  it("grabs whenever the claw lands within the reach, never beyond it", () => {
    expect(grabChance(0)).toBe(1);
    expect(grabChance(CLAW.reach * 0.99)).toBe(1);
    expect(grabChance(CLAW.reach)).toBe(0);
    expect(grabChance(5)).toBe(0);
    expect(grabChance(NaN)).toBe(0);
  });
  it("sweep bounces between 0 and 1", () => {
    expect(sweep(0)).toBe(0);
    expect(sweep(1 / CLAW.speed)).toBeCloseTo(1);
    expect(sweep(2 / CLAW.speed)).toBeCloseTo(0);
    for (let t = 0; t < 20; t += 0.37) { const v = sweep(t); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it("picks only weighted prizes", () => {
    for (let i = 0; i < 50; i++) expect(ITEMS.find((x) => x.id === pickPrize(i / 50.5)!.id)!.weight).toBeGreaterThan(0);
  });
});

describe("claw round", () => {
  const plush = [{ item: "rubber-duck", x: 0.5, z: 0.5 }];
  const run = (sim: ClawSim, xAt: number, zAt: number) => {
    // stop x when the sweep passes xAt, z likewise (step finely)
    while (sim.phase === "x" && Math.abs(sim.x - xAt) > 0.01) sim.step(0.005);
    sim.press();
    while (sim.phase === "z" && Math.abs(sim.z - zAt) > 0.01) sim.step(0.005);
    sim.press();
    for (let i = 0; i < 1000 && sim.phase !== "done"; i++) sim.step(0.05);
    return sim;
  };
  it("landing on a prize always wins it (no dice, no slipping)", () => {
    for (let seed = 1; seed < 20; seed++) expect(run(new ClawSim(mulberry32(seed), plush), 0.5, 0.5).won).toBe("rubber-duck");
  });
  it("a far miss never wins", () => {
    for (let s = 1; s < 20; s++) expect(run(new ClawSim(mulberry32(s), plush), 0.05, 0.95).won).toBeNull();
  });
  it("only wins with prizes from the catalog", () => {
    let won = 0;
    for (let s = 1; s < 60; s++) {
      const sim = new ClawSim(mulberry32(s));
      const t = sim.plushes[0]!;
      run(sim, t.x, t.z);
      if (sim.won) { won++; expect(itemDef(sim.won)).not.toBeNull(); }
    }
    expect(won).toBeGreaterThan(10);
  });
  it("layout keeps prizes apart and in the box", () => {
    const l = ClawSim.layout(mulberry32(3));
    expect(l.length).toBeGreaterThan(4);
    for (const a of l) { expect(a.x).toBeGreaterThan(0); expect(a.x).toBeLessThan(1); for (const b of l) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.2); }
  });
});

describe("inventory", () => {
  it("adds once per id", () => {
    const a = addReward([], R("1", USER, 1));
    expect(addReward(a, R("1", USER, 2))).toHaveLength(1);
    expect(addReward(a, R("2", USER, 2))).toHaveLength(2);
  });
  it("gives only what the giver owns, never to itself", () => {
    const l = [R("1", USER, 1)];
    const g = giveReward(l, "1", USER, "agent-a")!;
    expect(g[0]).toMatchObject({ owner: "agent-a", from: USER });
    expect(giveReward(l, "1", "other", "agent-a")).toBeNull();
    expect(giveReward(l, "1", USER, USER)).toBeNull();
    expect(giveReward(l, "nope", USER, "a")).toBeNull();
  });
  it("shelf holds the newest, the rest overflows into the archive", () => {
    const l = [R("a", "x", 1), R("b", "x", 5), R("c", "x", 3), R("d", "x", 4), R("e", "x", 2)];
    const { shelf, archive } = shelfSplit(l);
    expect(shelf.map((r) => r.id)).toEqual(["b", "d", "c"]);
    expect(archive.map((r) => r.id)).toEqual(["e", "a"]);
    expect(shelfSplit([], 3)).toEqual({ shelf: [], archive: [] });
  });
  it("groups by owner and knows trophies", () => {
    const m = byOwner([R("1", "a", 1), R("2", "b", 1), R("3", "a", 1)]);
    expect(m.get("a")).toHaveLength(2);
    expect(itemDef(trophyFor("pong"))!.kind).toBe("trophy");
    expect(itemDef("trophy-../x")).toBeNull();
    expect(itemDef("bogus")).toBeNull();
  });
});

import { AppDb } from "../server/db";
import { awardTrophy } from "../server/rewards";
describe("rewards in SQLite", () => {
  it("adds idempotently, gives, and awards one trophy per match", () => {
    const db = new AppDb(":memory:");
    expect(db.rewardAdd({ id: "p1", owner: USER, item: "rubber-duck", at: 1, from: "claw", note: "" })).toBe(true);
    expect(db.rewardAdd({ id: "p1", owner: USER, item: "rubber-duck", at: 2, from: "claw", note: "" })).toBe(false);
    expect(db.rewardGive("p1", "someone", "agent-a", 5)).toBe(false);
    expect(db.rewardGive("p1", USER, "agent-a", 5)).toBe(true);
    expect(db.rewardsAll()[0]).toMatchObject({ id: "p1", owner: "agent-a", from: USER, at: 5 });
    awardTrophy(db, "m1", "pong", "agent-b"); awardTrophy(db, "m1", "pong", "agent-b"); awardTrophy(db, "m2", "pong", null);
    expect(db.rewardsAll().filter((r) => r.item === "trophy-pong")).toHaveLength(1);
  });
});
