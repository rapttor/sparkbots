import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/world/layout";
import { makeFixtureSnapshot } from "../src/world/fixture";
import { CAR, newCar, speedOf, stepCar } from "../src/world/games/race/car";
import { RaceSim } from "../src/world/games/race/sim";
import { buildTrack, gridSlot, pointAt, project, trackClearance, trackInput, type Rect, type Track } from "../src/world/games/race/track";
import { mulberry32 } from "../src/world/games/types";

const rectsOf = (l: ReturnType<typeof computeLayout>) => { const i = trackInput(l); return { zones: i.zones, areas: i.areas, input: i }; };

describe("race track from the campus layout", () => {
  for (const n of [3, 20, 60, 120, 150]) {
    it(`${n} workers: closed loop that touches no room and no team area`, () => {
      const l = computeLayout(makeFixtureSnapshot(n));
      const { zones, areas, input } = rectsOf(l);
      const t = buildTrack(input)!;
      expect(t).not.toBeNull();
      expect(t.n).toBeGreaterThan(50);
      // closed: the gap between the last and the first point is one step, like every other gap
      const step = t.length / t.n;
      for (let i = 0; i < t.n; i++) {
        const j = (i + 1) % t.n;
        expect(Math.hypot(t.xs[j]! - t.xs[i]!, t.zs[j]! - t.zs[i]!)).toBeGreaterThan(step * 0.5);
        expect(Math.hypot(t.xs[j]! - t.xs[i]!, t.zs[j]! - t.zs[i]!)).toBeLessThan(step * 1.5);
      }
      expect(trackClearance(t, zones)).toBeGreaterThan(0);
      expect(trackClearance(t, areas)).toBeGreaterThan(0);
    });
  }
  it("is deterministic, and null without a campus", () => {
    const i = rectsOf(computeLayout(makeFixtureSnapshot(40))).input;
    expect(buildTrack(i)!.xs).toEqual(buildTrack(i)!.xs);
    expect(buildTrack({ zones: [], areas: [], bounds: { x0: -5, z0: -5, x1: 5, z1: 5 } })).toBeNull();
  });
  it("prefers the loop through the plaza when it is wide enough, else goes around the campus", () => {
    const zone: Rect = { x0: -10, z0: -10, x1: 10, z1: 10 };
    const far: Rect = { x0: -60, z0: -60, x1: 60, z1: 60 };
    const inner = buildTrack({ zones: [zone], areas: [{ x0: 40, z0: 40, x1: 60, z1: 60 }], bounds: far })!;
    expect(inner.kind).toBe("inner");
    const tight = buildTrack({ zones: [zone], areas: [{ x0: 11.5, z0: -60, x1: 40, z1: 60 }], bounds: far })!;
    expect(tight.kind).toBe("outer");
    expect(trackClearance(tight, [zone, { x0: 11.5, z0: -60, x1: 40, z1: 60 }])).toBeGreaterThan(0);
  });
  it("project and pointAt agree, on the centre line and beside it", () => {
    const t = buildTrack(rectsOf(computeLayout(makeFixtureSnapshot(40))).input)!;
    for (const s of [0, 17.3, t.length / 2, t.length - 0.5]) {
      const p = pointAt(t, s), q = project(t, p.x, p.z);
      expect(q.dist).toBeLessThan(1e-6);
      expect(Math.abs(q.lat)).toBeLessThan(1e-6);
      const r = project(t, p.x - p.tz * 1.5, p.z + p.tx * 1.5, q.i); // 1.5 to the right
      expect(r.lat).toBeCloseTo(1.5, 1);
    }
  });
});

const oval = (): Track => buildTrack({ zones: [{ x0: -60, z0: -40, x1: 60, z1: 40 }], areas: [], bounds: { x0: -120, z0: -120, x1: 120, z1: 120 } })!;

describe("car physics", () => {
  it("accelerates to a top speed, brakes, and never exceeds the limit", () => {
    const t = oval(), g = gridSlot(t, 0), c = newCar(g.x, g.z, g.h);
    for (let i = 0; i < 60 * 3; i++) stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t);
    expect(speedOf(c)).toBeGreaterThan(8);
    for (let i = 0; i < 60 * 30; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t); expect(speedOf(c)).toBeLessThanOrEqual(CAR.MAX + 0.01); }
    for (let i = 0; i < 60 * 8; i++) stepCar(c, { throttle: -1, steer: 0, drift: false }, 1 / 60, t);
    expect(speedOf(c)).toBeLessThan(8); // braked hard, may reverse slowly
  });
  it("steering turns right for positive input, and does not turn a standing car", () => {
    const t = oval(), g = gridSlot(t, 0), a = newCar(g.x, g.z, g.h), b = newCar(g.x, g.z, g.h);
    for (let i = 0; i < 60; i++) { stepCar(a, { throttle: 0, steer: 1, drift: false }, 1 / 60, t); stepCar(b, { throttle: 1, steer: 1, drift: false }, 1 / 60, t); }
    expect(a.h).toBeCloseTo(g.h, 5);
    expect(b.h).toBeGreaterThan(g.h + 0.2);
  });
  it("a drift keeps sideways speed that a normal turn loses", () => {
    const t = oval(), g = gridSlot(t, 0), mk = () => { const c = newCar(g.x, g.z, g.h); c.vx = Math.cos(g.h) * 14; c.vz = Math.sin(g.h) * 14; return c; };
    const slideOf = (drift: boolean) => {
      const c = mk();
      for (let i = 0; i < 20; i++) stepCar(c, { throttle: 1, steer: 1, drift }, 1 / 60, t);
      return Math.abs(c.vx * -Math.sin(c.h) + c.vz * Math.cos(c.h));
    };
    expect(slideOf(true)).toBeGreaterThan(slideOf(false) * 2);
  });
  it("the road edge is a wall: driving straight into it stays on the road and counts a bump", () => {
    const t = oval(), p = pointAt(t, 30), c = newCar(p.x, p.z, Math.atan2(p.tz, p.tx) + Math.PI / 2); // facing sideways, off the road
    for (let i = 0; i < 60 * 4; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t); expect(Math.abs(c.lat)).toBeLessThanOrEqual(t.halfWidth + 1e-6); }
    expect(c.hits).toBeGreaterThan(0);
  });
});

const adv = (s: RaceSim, secs: number) => { for (let t = 0; t < secs; t += 0.05) s.step(0.05); };

describe("race", () => {
  const mk = (cars = 6, seed = 3) => { const s = new RaceSim(oval(), mulberry32(seed), 2); for (let i = 0; i < cars; i++) s.add(`a${i}`, `Agent ${i}`, "#fff"); return s; };
  it("the grid sits on the road behind the line, and the lights count down first", () => {
    const s = mk();
    for (const r of s.racers) { const q = project(s.track, r.car.x, r.car.z); expect(Math.abs(q.lat)).toBeLessThan(s.track.halfWidth); expect(r.prog).toBeLessThan(0); }
    s.step(1); expect(s.phase).toBe("countdown");
    expect(s.racers.every((r) => speedOf(r.car) === 0)).toBe(true);
    adv(s, 2.5); expect(s.phase).toBe("racing");
  });
  it.each([1, 2, 3, 4])("AI cars finish all laps and stay on the road (seed %i)", (seed) => {
    const s = mk(6, seed);
    let guard = 0;
    while (!s.over && guard++ < 60 * 400) {
      s.step(1 / 60);
      for (const r of s.racers) { expect(Math.abs(r.car.lat)).toBeLessThanOrEqual(s.track.halfWidth + 1e-6); expect(Number.isFinite(r.car.x)).toBe(true); }
    }
    expect(s.over).toBe(true);
    const done = s.racers.filter((r) => r.finishedAt !== null);
    expect(done.length).toBe(6);
    expect(s.order[0]).toBe(done.sort((a, b) => a.finishedAt! - b.finishedAt!)[0]!.id);
    expect(s.time).toBeLessThan(200); // 2 laps on this loop
  });
  it("a retired car leaves the standings; a race with only retired cars ends", () => {
    const s = mk(3);
    adv(s, 3.1); s.retire("a1");
    expect(s.standings().map((r) => r.id)).not.toContain("a1");
    s.retire("a0"); s.retire("a2"); s.step(0.1);
    expect(s.over).toBe(true);
  });
  it("a user car follows its keyboard input, and cannot be added after the start", () => {
    const s = new RaceSim(oval(), mulberry32(1), 1);
    s.add("me", "You", "#fc0", true);
    adv(s, 3.1);
    s.setInput("me", { throttle: 1 });
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(speedOf(s.get("me")!.car)).toBeGreaterThan(8);
    expect(s.add("late", "Late", "#000")).toBeNull();
  });
  it("the cap is 8 cars", () => { const s = mk(12); expect(s.racers.length).toBe(8); });
});

import { OVER_SHOW, RaceHub, USER_ID, type RaceEnv } from "../src/world/games/race/hub";

describe("race hub", () => {
  const mkEnv = (idle: string[]): RaceEnv & { idleSet: Set<string> } => { const idleSet = new Set(idle); return { idleSet, rng: mulberry32(5), idle: () => [...idleSet], alive: (a) => idleSet.has(a), name: (a) => `N-${a}`, color: () => "#fff" }; };
  const run = (h: RaceHub, secs: number) => { for (let t = 0; t < secs; t += 0.05) h.tick(0.05); };
  it("needs a track and two idle agents; races start by themselves with three, and only when auto is on", () => {
    const env = mkEnv(["a", "b"]), h = new RaceHub(env);
    expect(h.start()).toBe(false);                 // no track yet
    h.setTrack(oval());
    expect(h.start()).toBe(true); h.stop();
    h.auto = true; run(h, 400);
    expect(h.running).toBe(false);                 // two agents are not enough for an automatic race
    env.idleSet.add("c"); run(h, 400);
    expect(h.running).toBe(true);
    h.stop(); h.auto = false; run(h, 400);
    expect(h.running).toBe(false);
  });
  it("a car whose agent goes back to work retires; the race ends and is cleaned up", () => {
    const env = mkEnv(["a", "b", "c", "d"]), h = new RaceHub(env);
    h.setTrack(oval()); h.auto = false; h.start();
    run(h, 4); env.idleSet.delete("b");
    run(h, 0.2);
    expect(h.sim!.get("b")!.out).toBe(true);
    run(h, 400);
    expect(h.sim).toBeNull();                      // finished, shown for OVER_SHOW seconds, then gone
    expect(h.last.map((r) => r.name)).not.toContain("N-b");
    expect(h.last.length).toBe(3);
    void OVER_SHOW;
  });
  it("you can join before the start, with pit bots filling the grid, and leave again", () => {
    const h = new RaceHub(mkEnv([])); h.setTrack(oval()); h.auto = false;
    expect(h.join()).toBe(true);
    expect(h.userRacing).toBe(true);
    expect(h.sim!.racers.length).toBe(3);
    h.leave(); expect(h.userRacing).toBe(false);
    expect(h.sim!.get(USER_ID)!.out).toBe(true);
  });
  it("a new track stops a running race", () => {
    const h = new RaceHub(mkEnv(["a", "b"])); h.setTrack(oval()); h.start();
    h.setTrack(oval()); expect(h.running).toBe(true);   // the same loop: nothing happens
    h.setTrack(buildTrack({ zones: [{ x0: -30, z0: -30, x1: 30, z1: 30 }], areas: [], bounds: { x0: -90, z0: -90, x1: 90, z1: 90 } }));
    expect(h.running).toBe(false);
  });
  it("you can take over an agent's car in a running race, and hand it back to the AI", () => {
    const h = new RaceHub(mkEnv(["a", "b", "c"])); h.setTrack(oval()); h.auto = false; h.start();
    run(h, 8);
    expect(h.sim!.phase).toBe("racing");
    expect(h.join("b")).toBe(true);
    expect(h.userId).toBe("b"); expect(h.userRacing).toBe(true);
    expect(h.join("a")).toBe(false);               // one car at a time
    h.sim!.setInput("b", { throttle: 0, steer: 0 }); run(h, 1);
    expect(speedOfCar(h, "b")).toBeLessThan(8);    // the keyboard (idle) drives it now, not the AI
    h.leave();
    expect(h.userRacing).toBe(false); expect(h.sim!.get("b")!.user).toBe(false); expect(h.sim!.get("b")!.out).toBe(false);
  });
});
const speedOfCar = (h: RaceHub, id: string) => speedOf(h.sim!.get(id)!.car);
