import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/world/layout";
import { makeFixtureSnapshot } from "../src/world/fixture";
import { NITRO_CHARGE, NITRO_MULT, NITRO_TIME, hitPoints, newCar, offroadLimit, slideOf, speedOf, stepCar } from "../src/world/games/race/car";
import { AGENT_SPEED, CAR_TYPES } from "../src/world/games/race/carTypes";
import { RaceSim } from "../src/world/games/race/sim";
import { HALF_WIDTH, MAX_TURN, buildTrack, gridSlot, pointAt, project, trackClearance, trackInput, type Rect, type Track } from "../src/world/games/race/track";
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
  it("hugs the shape of the map: more corners than a rectangle, none too sharp, closed", () => {
    for (const n of [20, 40, 150]) {
      const t = buildTrack(rectsOf(computeLayout(makeFixtureSnapshot(n))).input)!;
      expect(t.kind).toBe("contour");
      let abs = 0, signed = 0, worst = 0;
      for (let i = 0; i < t.n; i++) {
        const a = (i + t.n - 1) % t.n, c = (i + 1) % t.n;
        const h1 = Math.atan2(t.zs[i]! - t.zs[a]!, t.xs[i]! - t.xs[a]!), h2 = Math.atan2(t.zs[c]! - t.zs[i]!, t.xs[c]! - t.xs[i]!);
        const d = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
        abs += Math.abs(d); signed += d; worst = Math.max(worst, Math.abs(d));
      }
      expect(Math.abs(Math.abs(signed) - 2 * Math.PI)).toBeLessThan(0.3); // one closed loop, no figure-of-eight
      expect(worst).toBeLessThan(MAX_TURN * 1.6);
      expect(abs).toBeGreaterThan(2 * Math.PI * 1.1);                      // concave bends: the outline follows the cut-out corners
    }
  });
  it("is deterministic, and null without a campus", () => {
    const i = rectsOf(computeLayout(makeFixtureSnapshot(40))).input;
    expect(buildTrack(i)!.xs).toEqual(buildTrack(i)!.xs);
    expect(buildTrack({ zones: [], areas: [], bounds: { x0: -5, z0: -5, x1: 5, z1: 5 } })).toBeNull();
  });
  it("prefers the loop through the plaza when it is wide enough, else hugs the campus", () => {
    const zone: Rect = { x0: -10, z0: -10, x1: 10, z1: 10 };
    const far: Rect = { x0: -60, z0: -60, x1: 60, z1: 60 };
    const inner = buildTrack({ zones: [zone], areas: [{ x0: 40, z0: 40, x1: 60, z1: 60 }], bounds: far })!;
    expect(inner.kind).toBe("inner");
    const tight = buildTrack({ zones: [zone], areas: [{ x0: 11.5, z0: -60, x1: 40, z1: 60 }], bounds: far })!;
    expect(tight.kind).not.toBe("inner");
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
    for (let i = 0; i < 60 * 30; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t); expect(speedOf(c)).toBeLessThanOrEqual(CAR_TYPES.race.maxSpeed + 0.01); }
    for (let i = 0; i < 60 * 8; i++) stepCar(c, { throttle: -1, steer: 0, drift: false }, 1 / 60, t);
    expect(speedOf(c)).toBeLessThan(8); // braked hard, may reverse slowly
  });
  it("steering turns right for positive input, and does not turn a standing car", () => {
    const t = oval(), g = gridSlot(t, 0), a = newCar(g.x, g.z, g.h), b = newCar(g.x, g.z, g.h);
    for (let i = 0; i < 60; i++) { stepCar(a, { throttle: 0, steer: 1, drift: false }, 1 / 60, t); stepCar(b, { throttle: 1, steer: 1, drift: false }, 1 / 60, t); }
    expect(a.h).toBeCloseTo(g.h, 5);
    expect(b.h).toBeGreaterThan(g.h + 0.2);
  });
  const slideAt = (frac: number, drift: boolean, kind: "race" | "kart" | "monster" = "race") => {
    const t = oval(), g = gridSlot(t, 0), spec = CAR_TYPES[kind], c = newCar(g.x, g.z, g.h);
    c.vx = Math.cos(g.h) * spec.maxSpeed * frac; c.vz = Math.sin(g.h) * spec.maxSpeed * frac;
    let worst = 0;
    for (let i = 0; i < 25; i++) { stepCar(c, { throttle: 0.2, steer: 1, drift }, 1 / 60, t, spec, true); worst = Math.max(worst, Math.abs(slideOf(c))); }
    return worst;
  };
  it("a drift keeps sideways speed that a normal turn at the same speed loses", () => {
    expect(slideAt(0.6, true)).toBeGreaterThan(slideAt(0.6, false) * 1.5);
  });
  it("too much speed into a bend and the car slides wide instead of turning; slower it grips", () => {
    expect(slideAt(1, false, "race")).toBeGreaterThan(slideAt(0.35, false, "race") * 2);
  });
  it("top speeds: monster truck 2x an agent and slowest; rocket kart at least 3x its old 10.5 m/s; race car fastest", () => {
    expect(CAR_TYPES.monster.maxSpeed).toBeCloseTo(AGENT_SPEED * 2);
    expect(CAR_TYPES.kart.maxSpeed).toBeGreaterThanOrEqual(3 * 10.5);
    expect(CAR_TYPES.monster.maxSpeed).toBeLessThan(CAR_TYPES.kart.maxSpeed);
    expect(CAR_TYPES.kart.maxSpeed).toBeLessThan(CAR_TYPES.race.maxSpeed);
    expect(CAR_TYPES.kart.accel).toBeGreaterThan(20);
    for (const kind of ["monster", "kart", "race"] as const) {
      const t = oval(), g = gridSlot(t, 0), c = newCar(g.x, g.z, g.h);
      for (let i = 0; i < 60 * 60; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t, CAR_TYPES[kind], true); }
      expect(speedOf(c)).toBeLessThanOrEqual(CAR_TYPES[kind].maxSpeed + 0.01);
      expect(speedOf(c)).toBeGreaterThan(CAR_TYPES[kind].maxSpeed * 0.8);
    }
  });
  it("two car widths beyond the road edge there is a wall: you stay inside it and it counts a bump", () => {
    const t = oval(), p = pointAt(t, 30), c = newCar(p.x, p.z, Math.atan2(p.tz, p.tx) + Math.PI / 2); // facing sideways, off the road
    for (let i = 0; i < 60 * 4; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t); expect(Math.abs(c.lat)).toBeLessThanOrEqual(offroadLimit(t, CAR_TYPES.race) + 1e-6); }
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
      for (const r of s.racers) { expect(Math.abs(r.car.lat)).toBeLessThanOrEqual(offroadLimit(s.track, s.spec) + 1e-6); expect(Number.isFinite(r.car.x)).toBe(true); }
    }
    expect(s.over).toBe(true);
    const done = s.racers.filter((r) => r.finishedAt !== null);
    expect(done.length).toBe(6);
    expect(s.order[0]).toBe(done.sort((a, b) => a.finishedAt! - b.finishedAt!)[0]!.id);
    expect(s.time).toBeLessThan(200); // 2 laps on this loop
  });
  it("AI cars finish a race on the campus-hugging loop too", () => {
    const t = buildTrack(rectsOf(computeLayout(makeFixtureSnapshot(40))).input)!;
    const s = new RaceSim(t, mulberry32(9), 1);
    for (let i = 0; i < 6; i++) s.add(`a${i}`, `A${i}`, "#fff");
    let guard = 0;
    while (!s.over && guard++ < 60 * 600) { s.step(1 / 60); for (const r of s.racers) expect(Math.abs(r.car.lat)).toBeLessThanOrEqual(offroadLimit(t, s.spec) + 1e-6); }
    expect(s.racers.filter((r) => r.finishedAt !== null).length).toBeGreaterThanOrEqual(5);
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

import { pitSpot } from "../src/world/games/race/trackside";
import { OVER_SHOW, RaceHub, USER_ID, raceResults, type RaceEnv } from "../src/world/games/race/hub";

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
    env.idleSet.add("c");
    for (let t = 0; t < 400 && !h.running; t += 0.05) h.tick(0.05);
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
    const before = speedOfCar(h, "b");
    h.sim!.setInput("b", { throttle: 0, steer: 0 }); run(h, 1);
    expect(speedOfCar(h, "b")).toBeLessThan(before);    // the keyboard (idle) drives it now, not the AI
    h.leave();
    expect(h.userRacing).toBe(false); expect(h.sim!.get("b")!.user).toBe(false); expect(h.sim!.get("b")!.out).toBe(false);
  });
});
const speedOfCar = (h: RaceHub, id: string) => speedOf(h.sim!.get(id)!.car);

import { genDecor, makeCrossers, stepCrossers } from "../src/world/games/race/hazards";
import { CAR_KINDS } from "../src/world/games/race/carTypes";

describe("car types, hazards, carmageddon", () => {
  it.each(CAR_KINDS)("%s: AI cars finish the laps, mostly clean", (kind) => {
    const s = new RaceSim(oval(), mulberry32(11), 2, kind);
    for (let i = 0; i < 5; i++) s.add(`a${i}`, `A${i}`, "#fff");
    let guard = 0;
    while (!s.over && guard++ < 60 * 900) s.step(1 / 60);
    expect(s.racers.filter((r) => r.finishedAt !== null).length).toBeGreaterThanOrEqual(4);
    const hits = s.racers.reduce((n, r) => n + r.car.hits, 0);
    expect(hits).toBeLessThan(40);
  });
  it("faster cars lap faster: race car beats kart beats monster truck", () => {
    const t = (kind: "race" | "kart" | "monster") => { const s = new RaceSim(oval(), mulberry32(2), 1, kind); s.add("a", "A", "#fff"); s.add("b", "B", "#fff"); let g = 0; while (!s.over && g++ < 60 * 900) s.step(1 / 60); return s.time; };
    const [r, k, m] = [t("race"), t("kart"), t("monster")];
    expect(r).toBeLessThan(k); expect(k).toBeLessThan(m);
  });
  it("decor is deterministic, sits clear of the walls, and potholes slow a car that drives into them", () => {
    const track = oval();
    expect(genDecor(track, mulberry32(4))).toEqual(genDecor(track, mulberry32(4)));
    const d = genDecor(track, mulberry32(4));
    expect(d.hazards.length).toBeGreaterThan(2);
    for (const h of d.hazards) expect(Math.abs(project(track, h.x, h.z).lat)).toBeLessThan(track.halfWidth);
    const s = new RaceSim(track, mulberry32(4), 1);
    const pot = s.decor.hazards.find((h) => h.kind === "pothole")!, r = s.add("a", "A", "#fff")!;
    adv(s, 3.1);
    Object.assign(r.car, { seg: -1, x: pot.x, z: pot.z, vx: Math.cos(r.car.h) * 10, vz: Math.sin(r.car.h) * 10, cool: 0 });
    r.input.throttle = 0; s.step(0.02);
    expect(speedOf(r.car)).toBeLessThan(7);
  });
  it("oil takes the grip away", () => {
    const s = new RaceSim(oval(), mulberry32(4), 1), oil = s.decor.hazards.find((h) => h.kind === "oil")!, r = s.add("a", "A", "#fff")!;
    adv(s, 3.1);
    Object.assign(r.car, { seg: -1, x: oil.x, z: oil.z });
    s.step(0.02);
    expect(r.car.slick).toBeGreaterThan(0);
  });
  it("mini robots cross the road and are knocked flat by a car, then come back", () => {
    const track = oval(), rng = mulberry32(1), list = makeCrossers(track, [40], rng), k = list[0]!;
    for (let t = 0; t < 30 && k.phase !== "run"; t += 0.1) stepCrossers(track, list, 0.1, rng);
    expect(k.phase).toBe("run");
    const s = new RaceSim(track, mulberry32(3), 1); s.crossers = list; const r = s.add("a", "A", "#fff")!;
    adv(s, 3.1);
    k.phase = "run"; k.lat = 0.2; stepCrossers(track, list, 0, rng); // a robot mid-road
    Object.assign(r.car, { seg: -1, x: k.x, z: k.z, vx: 8, vz: 0 });
    s.step(0.02);
    expect(k.phase).toBe("flat");
    for (let t = 0; t < 8; t += 0.1) stepCrossers(track, list, 0.1, rng);
    expect(k.phase).not.toBe("flat");
  });
  it("carmageddon: off by default; your car may leave the road, the lap count does not apply, and the race has a time limit", () => {
    const h = new RaceHub(mkEnvX(["a", "b", "c"])); h.setTrack(oval());
    expect(h.carmageddon).toBe(false);
    h.carmageddon = true; h.kind = "monster";
    expect(h.join()).toBe(true);
    expect(h.sim!.carmageddon).toBe(true); expect(h.sim!.spec.kind).toBe("monster");
    adv(h.sim!, 3.1);
    const me = h.sim!.get("user")!;
    me.car.h += Math.PI / 2; me.input.throttle = 1; // drive off the road
    for (let t = 0; t < 6; t += 0.05) h.sim!.step(0.05);
    expect(Math.abs(me.car.lat)).toBeGreaterThan(offroadLimit(h.sim!.track, h.sim!.spec) + 3);
    expect(me.finishedAt).toBeNull();
    adv(h.sim!, 250);
    expect(h.sim!.over).toBe(true);
  });
  it("without you behind the wheel there is no carmageddon", () => {
    const h = new RaceHub(mkEnvX(["a", "b", "c"])); h.setTrack(oval()); h.carmageddon = true;
    expect(h.start(false)).toBe(true); expect(h.sim!.carmageddon).toBe(false);
  });
});
const mkEnvX = (idle: string[]): RaceEnv => ({ rng: mulberry32(5), idle: () => idle, alive: () => true, name: (a) => a, color: () => "#fff" });

describe("car-to-car knocks and lap times", () => {
  it("a head-on-ish knock pushes the cars apart, slows both and counts a bump", () => {
    const s = new RaceSim(oval(), mulberry32(6), 1);
    const a = s.add("a", "A", "#fff")!, b = s.add("b", "B", "#fff")!;
    adv(s, 3.1);
    const h = a.car.h;
    Object.assign(a.car, { x: 0, z: 0, vx: Math.cos(h) * 10, vz: Math.sin(h) * 10, seg: -1 });
    Object.assign(b.car, { x: Math.cos(h) * 1.0, z: Math.sin(h) * 1.0, vx: 0, vz: 0, seg: -1 }); // right in front, standing
    a.input.throttle = 0; b.input.throttle = 0;
    const before = speedOf(a.car);
    s.step(0.02);
    expect(speedOf(a.car)).toBeLessThan(before * 0.6);
    expect(speedOf(b.car)).toBeGreaterThan(1);
    expect(a.bumps).toBe(1); expect(b.bumps).toBe(1);
    expect(Math.hypot(a.car.x - b.car.x, a.car.z - b.car.z)).toBeGreaterThanOrEqual(s.spec.radius * 1.7 - 0.2);
  });
  it("lap times are recorded", () => {
    const s = new RaceSim(oval(), mulberry32(2), 2);
    s.add("a", "A", "#fff");
    let g = 0; while (!s.over && g++ < 60 * 900) s.step(1 / 60);
    const r = s.get("a")!;
    expect(r.lastLap).not.toBeNull(); expect(r.bestLap!).toBeLessThanOrEqual(r.lastLap!);
    expect(r.bestLap!).toBeGreaterThan(5);
  });
});

describe("leaving the road and items", () => {
  it("you may leave the tarmac by two car widths (slower there), but not further", () => {
    const t = oval(), spec = CAR_TYPES.race, p = pointAt(t, 30), c = newCar(p.x, p.z, Math.atan2(p.tz, p.tx) + Math.PI / 2);
    let maxLat = 0, sawGrass = false;
    for (let i = 0; i < 60 * 6; i++) { stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t, spec); maxLat = Math.max(maxLat, Math.abs(c.lat)); if (Math.abs(c.lat) > t.halfWidth) { sawGrass = true; expect(speedOf(c)).toBeLessThan(spec.maxSpeed * 0.66 + 1.5); } }
    expect(sawGrass).toBe(true);
    expect(maxLat).toBeGreaterThan(t.halfWidth + spec.radius * 2);
    expect(maxLat).toBeLessThanOrEqual(offroadLimit(t, spec) + 1e-6);
  });
  it("the loop leaves room beside the road for that", () => {
    const l = computeLayout(makeFixtureSnapshot(40)), { zones, areas, input } = rectsOf(l), t = buildTrack(input)!;
    for (const kind of ["race", "kart", "monster"] as const) {
      expect(trackClearance(t, zones)).toBeGreaterThan(offroadLimit(t, CAR_TYPES[kind]) - t.halfWidth);
      expect(trackClearance(t, areas)).toBeGreaterThan(offroadLimit(t, CAR_TYPES[kind]) - t.halfWidth);
    }
  });
  const mk = (n = 3) => { const s = new RaceSim(oval(), mulberry32(8), 3); for (let i = 0; i < n; i++) s.add(`a${i}`, `A${i}`, "#fff", i === 0); adv(s, 3.1); return s; };
  it("item boxes give one item to a car that drives through them, then come back", () => {
    const s = mk(1), r = s.get("a0")!, pk = s.decor.pickups[0]!;
    Object.assign(r.car, { seg: -1, x: pk.x, z: pk.z });
    s.step(0.02);
    expect(r.item).not.toBeNull();
    expect(s.pickupCd[0]).toBeGreaterThan(0);
    const first = r.item; Object.assign(r.car, { seg: -1, x: pk.x, z: pk.z }); s.step(0.02);
    expect(r.item).toBe(first);                       // hands full: nothing new
  });
  it("boost speeds you past the normal top speed for a while", () => {
    const s = mk(1), r = s.get("a0")!;
    r.item = "boost"; r.input.throttle = 1;
    for (let i = 0; i < 60 * 2; i++) { r.input.throttle = 1; s.step(1 / 60); }
    r.item = "boost";
    expect(s.useItem("a0")).toBe(true);
    expect(r.item).toBeNull();
    let top = 0;
    for (let i = 0; i < 60 * 2; i++) { r.input.throttle = 1; s.step(1 / 60); top = Math.max(top, speedOf(r.car)); }
    expect(top).toBeGreaterThan(s.spec.maxSpeed * 1.05);
  });
  it("a missile flies straight along the firing heading and hits a car in its way: it slows that car and explodes", () => {
    const s = mk(2), a = s.get("a0")!, b = s.get("a1")!, p = pointAt(s.track, 40);
    const h = Math.atan2(p.tz, p.tx);
    Object.assign(a.car, { seg: -1, s: 40, x: p.x, z: p.z, h, vx: 0, vz: 0 }); a.item = "missile";
    Object.assign(b.car, { seg: -1, s: 60, x: p.x + p.tx * 20, z: p.z + p.tz * 20, h, vx: 0, vz: 0 }); b.input = { throttle: 0, steer: 0, drift: false };
    expect(s.useItem("a0")).toBe(true);
    const m = s.missiles[0]!;
    expect(Math.atan2(m.vz, m.vx)).toBeCloseTo(h, 5);
    for (let i = 0; i < 80 && s.missiles.length; i++) { s.step(0.01); }
    expect(s.missiles.length).toBe(0);
    expect(s.events.length).toBe(1);
    expect(s.events[0]!.color).toBe("#ff9a2e");
  });
  it("a trap drops an oil slick behind you that takes the grip from a car driving over it", () => {
    const s = mk(2), a = s.get("a0")!, b = s.get("a1")!;
    a.item = "trap"; expect(s.useItem("a0")).toBe(true);
    const tr = s.traps[0]!;
    Object.assign(b.car, { seg: -1, x: tr.x, z: tr.z, slick: 0 });
    s.step(0.02);
    expect(b.car.slick).toBeGreaterThan(0);
  });
  it("AI cars use their items", () => {
    const s = new RaceSim(oval(), mulberry32(3), 2);
    for (let i = 0; i < 6; i++) s.add(`a${i}`, `A${i}`, "#fff");
    let used = 0; const orig = s.useItem.bind(s); s.useItem = (id: string) => { const ok = orig(id); if (ok) used++; return ok; };
    let g = 0; while (!s.over && g++ < 60 * 900) s.step(1 / 60);
    expect(used).toBeGreaterThan(2);
  });
});

import { shortName } from "../src/world/games/race/names";
describe("driver names", () => {
  it("short, never empty, 'Untitled' replaced; duplicates in a race get numbers", () => {
    expect(shortName("Untitled", "Radio")).toBe("Radio bot");
    expect(shortName("   ")).toBe("Agent bot");
    expect(shortName("forum: how about a forum on main page, easy login/magiclin").length).toBeLessThanOrEqual(20);
    const h = new RaceHub({ rng: mulberry32(1), idle: () => ["a", "b", "c"], alive: () => true, name: () => "Untitled bot", color: () => "#fff" });
    h.setTrack(oval()); h.start();
    const names = h.sim!.racers.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

import { MAX_MISSILES, MISSILE_LIFE, MISSILE_SPEED, fireMissile, missileStep } from "../src/world/games/race/missiles";
describe("missileStep (pure)", () => {
  it("flies a straight line at constant velocity, whatever is around", () => {
    const m = fireMissile("a", 0, 0, 0.7), vx = m.vx, vz = m.vz;
    for (let i = 0; i < 20; i++) { const r = missileStep(m, 0.02, [{ id: "b", x: 100, z: -50, r: 1 }]); expect(r.state).toBe("alive"); expect(m.vx).toBe(vx); expect(m.vz).toBe(vz); }
    const ang = Math.atan2(m.z, m.x); expect(ang).toBeCloseTo(0.7, 5);
  });
  it("hits a car it touches (even one it would skip over in a single step), but never its owner", () => {
    const m = fireMissile("a", 0, 0, 0);
    expect(missileStep(m, 0.5, [{ id: "a", x: 10, z: 0, r: 1 }]).state).toBe("alive"); // 30 m step, own car in the way: ignored
    const m2 = fireMissile("a", 0, 0, 0);
    expect(missileStep(m2, 0.5, [{ id: "b", x: 10, z: 0.3, r: 1 }])).toEqual({ state: "hit", hit: "b" });
    const m3 = fireMissile("a", 0, 0, 0);
    expect(missileStep(m3, 0.02, [{ id: "b", x: 10, z: 5, r: 1 }]).state).toBe("alive"); // passes beside it
  });
  it("expires after its lifetime or range, and ends where the track area ends", () => {
    const m = fireMissile("a", 0, 0, 0);
    let state = "alive", t = 0;
    while (state === "alive" && t < 10) { state = missileStep(m, 0.05, []).state; t += 0.05; }
    expect(state).toBe("expired"); expect(t).toBeLessThanOrEqual(MISSILE_LIFE + 0.1);
    const w = fireMissile("a", 0, 0, 0);
    expect(missileStep(w, 0.5, [], (x) => x < 5).state).toBe("wall");
    expect(MISSILE_SPEED).toBeGreaterThan(CAR_TYPES.race.maxSpeed);
  });
  it("never more than MAX_MISSILES in the air; the item is kept when the sky is full", () => {
    const s = new RaceSim(oval(), mulberry32(8), 3); const a = s.add("a", "A", "#fff")!; s.add("b", "B", "#fff");
    adv(s, 3.1);
    for (let i = 0; i < MAX_MISSILES + 3; i++) { a.item = "missile"; const ok = s.useItem("a"); if (i >= MAX_MISSILES) { expect(ok).toBe(false); expect(a.item).toBe("missile"); } }
    expect(s.missiles.length).toBeLessThanOrEqual(MAX_MISSILES);
  });
});

describe("race setup options and the Stop mode", () => {
  it("number of cars and items on/off come from the setup", () => {
    const h = new RaceHub(mkEnvX(["a", "b", "c", "d", "e", "f", "g"])); h.setTrack(oval());
    h.cars = 4; h.items = false;
    expect(h.start(false)).toBe(true);
    expect(h.sim!.racers.length).toBe(4);
    expect(h.sim!.itemsOn).toBe(false);
    const r = h.sim!.racers[0]!; adv(h.sim!, 3.1);
    const pk = h.sim!.decor.pickups[0]!; Object.assign(r.car, { seg: -1, x: pk.x, z: pk.z }); h.sim!.step(0.02);
    expect(r.item).toBeNull();                       // no item boxes without the option
    h.stop(); h.cars = 2; h.items = true;
    expect(h.join()).toBe(true); expect(h.sim!.racers.length).toBe(2); // you + one pit bot
  });
});

describe("marshal", () => {
  it("a car pinned against the wall with the throttle down is put back on the road facing the way", () => {
    const s = new RaceSim(oval(), mulberry32(5), 3), r = s.add("u", "You", "#fc0", true)!;
    s.add("a", "A", "#fff"); adv(s, 3.1);
    const p = pointAt(s.track, 30), lim = s.track.halfWidth + 4 * s.spec.radius;
    Object.assign(r.car, { seg: -1, s: 30, x: p.x - p.tz * lim, z: p.z + p.tx * lim, h: Math.atan2(p.tz, p.tx) + Math.PI / 2, vx: 0, vz: 0 }); // nose into the wall
    for (let t = 0; t < 6; t += 0.05) { r.input.throttle = 1; s.step(0.05); if (Math.abs(r.car.lat) < 0.5) break; }
    expect(Math.abs(r.car.lat)).toBeLessThan(0.5);
    const fwd = r.car.vx * p.tx + r.car.vz * p.tz; expect(fwd).toBeGreaterThanOrEqual(0);
  });
});

describe("race results for the rankings", () => {
  it("makes a winner-vs-lower-finisher pair per two agents and skips you and the pit bots", () => {
    const rows = raceResults([{ id: "a", name: "A" }, { id: USER_ID, name: "You" }, { id: "b", name: "B" }, { id: "pit0", name: "Pit" }, { id: "c", name: "C" }], "u", 5);
    expect(rows.map((r) => `${r.a}>${r.b}`)).toEqual(["a>b", "a>c", "b>c"]);
    expect(rows.every((r) => r.game === "race" && r.winner === r.a && r.scoreA > r.scoreB)).toBe(true);
    expect(new Set(rows.map((r) => r.uuid)).size).toBe(3);
  });
  it("a finished race records its results once; a stopped race records nothing", () => {
    const got: string[] = [];
    const idle = ["a", "b", "c"];
    const mk = () => new RaceHub({ rng: mulberry32(5), idle: () => idle, alive: () => true, name: (a) => a, color: () => "#fff", record: (r) => got.push(`${r.a}>${r.b}`) });
    const h = mk(); h.setTrack(oval()); h.auto = false; h.start();
    for (let t = 0; t < 8; t += 0.05) h.tick(0.05);
    h.stop();
    expect(got).toEqual([]);
    const h2 = mk(); h2.setTrack(oval()); h2.auto = false; h2.start();
    for (let t = 0; t < 400; t += 0.05) h2.tick(0.05);
    expect(got).toHaveLength(3);
  });
});

describe("track-side drivers", () => {
  it("stands beside the road (off the asphalt, inside the free ground), spaced apart, looking at the road", () => {
    const t = oval();
    const a = pitSpot(t, 0), b = pitSpot(t, 1);
    for (const p of [a, b]) {
      const pr = project(t, p.x, p.z);
      expect(Math.abs(pr.lat)).toBeGreaterThan(HALF_WIDTH + 1);
      expect(Math.abs(pr.lat)).toBeLessThan(HALF_WIDTH + 5);
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.5);
  });
});

describe("driver view camera", () => {
  it("sits on the very front of every vehicle, above anything near the nose", () => {
    for (const kind of Object.keys(CAR_TYPES) as (keyof typeof CAR_TYPES)[]) {
      const sp = CAR_TYPES[kind];
      for (const p of sp.parts) {
        const front = p.shape === "box" ? p.at[0] + p.size[0] / 2 : p.shape === "cone" && p.axis === "x" ? p.at[0] + p.size[1] / 2 : p.shape === "cyl" && p.axis === "z" ? p.at[0] + p.size[0] : p.at[0] + p.size[0];
        const top = p.shape === "box" ? p.at[1] + p.size[1] / 2 : p.at[1] + p.size[0];
        if (p.at[0] > -0.5 || kind === "monster") expect(front, `${kind} ${p.shape}`).toBeLessThanOrEqual(sp.fpvAhead + 0.01); // nothing sticks out in front of the camera
        if (front > sp.fpvAhead - 1.2) expect(top, `${kind} ${p.shape} near the nose`).toBeLessThanOrEqual(sp.fpvUp + 0.01); // and nothing near the nose is above it
      }
    }
  });
});

describe("monster truck stunts", () => {
  const spec = CAR_TYPES.monster;
  const drive = (c: ReturnType<typeof newCar>, input: { throttle: number; steer: number; drift: boolean }, secs: number, t: Track) => { for (let i = 0; i < secs * 60; i++) stepCar(c, input, 1 / 60, t, spec, true); };
  it("a hard start rears it up on the back wheels", () => {
    const t = oval(), c = newCar(0, 0, 0);
    drive(c, { throttle: 1, steer: 0, drift: false }, 1.0, t);
    expect(c.pitch).toBeGreaterThan(0.3);
    expect(c.rollT).toBe(0);
    drive(c, { throttle: 0, steer: 0, drift: false }, 2, t);
    expect(c.pitch).toBeLessThan(0.05);              // it comes back down when you let go
  });
  it("braking on the back wheels rolls it over 2-3 times, then it drives on", () => {
    const t = oval(), c = newCar(0, 0, 0);
    drive(c, { throttle: 1, steer: 0, drift: false }, 1.0, t);
    const pre = Math.hypot(c.vx, c.vz);
    drive(c, { throttle: -1, steer: 0, drift: false }, 0.1, t);
    expect(c.rollT).toBeGreaterThan(0);
    expect(c.rollTotal / (Math.PI * 2)).toBeGreaterThanOrEqual(2);
    expect(c.rollTotal / (Math.PI * 2)).toBeLessThanOrEqual(3);
    const before = pre;
    const x0 = c.x, h0 = c.h;
    drive(c, { throttle: 1, steer: 1, drift: false }, 1, t);   // no control while it tumbles
    expect(c.roll).toBeGreaterThan(Math.PI);
    expect(c.h).toBeCloseTo(h0, 5);                            // it does not steer
    expect(Math.hypot(c.vx, c.vz)).toBeGreaterThan(before * 1.8); // the trick: the somersault carries it forward at double speed
    expect(c.x - x0).toBeGreaterThan(before * 1.3);
    drive(c, { throttle: 0, steer: 0, drift: false }, 2, t);
    expect(c.rollT).toBe(0); expect(c.roll).toBe(0);
    drive(c, { throttle: 1, steer: 0, drift: false }, 3, t);
    expect(Math.hypot(c.vx, c.vz)).toBeGreaterThan(2);         // and it drives on
  });
  it("other cars never rear up or roll", () => {
    const t = oval(), c = newCar(0, 0, 0);
    for (let i = 0; i < 180; i++) stepCar(c, { throttle: 1, steer: 0, drift: false }, 1 / 60, t, CAR_TYPES.race, true);
    expect(c.pitch).toBe(0); expect(c.rollT).toBe(0);
  });
  it("runs agents over with its wheels: the hit points are the four wheels and the body", () => {
    const pts = hitPoints(spec, { x: 10, z: 5, h: 0 });
    expect(pts).toHaveLength(5);
    const front = pts.find((p) => Math.abs(p.x - 11.2) < 0.01 && Math.abs(p.z - 6.55) < 0.01);
    expect(front).toBeTruthy();
    expect(front!.r).toBeGreaterThan(1);
    expect(hitPoints(spec, { x: 0, z: 0, h: Math.PI / 2 }).some((p) => Math.abs(p.x + 1.55) < 0.01 && Math.abs(p.z - 1.2) < 0.01)).toBe(true); // turns with the truck
  });
});

describe("nitro powerup", () => {
  const go = (c: ReturnType<typeof newCar>, input: { throttle: number; steer: number; drift: boolean }, secs: number, t: Track, spec = CAR_TYPES.race) => { for (let i = 0; i < secs * 60; i++) stepCar(c, input, 1 / 60, t, spec, true); };
  it("charges by itself and is full after NITRO_CHARGE seconds", () => {
    const t = oval(), c = newCar(0, 0, 0);
    go(c, { throttle: 0, steer: 0, drift: false }, NITRO_CHARGE / 2, t);
    expect(c.nitro).toBeGreaterThan(0.4); expect(c.nitro).toBeLessThan(0.6);
    go(c, { throttle: 0, steer: 0, drift: false }, NITRO_CHARGE, t);
    expect(c.nitro).toBe(1);
  });
  it("fired, it lifts the top speed to 3x for a moment, then the car settles back", () => {
    const t = oval(), c = newCar(0, 0, 0), spec = CAR_TYPES.race;
    go(c, { throttle: 1, steer: 0, drift: false }, 6, t);
    const normal = speedOf(c);
    c.nitroT = NITRO_TIME; c.nitro = 0;
    go(c, { throttle: 1, steer: 0, drift: false }, NITRO_TIME, t);
    expect(speedOf(c)).toBeGreaterThan(normal * 1.6);
    expect(speedOf(c)).toBeLessThanOrEqual(spec.maxSpeed * NITRO_MULT + 0.5);
    go(c, { throttle: 1, steer: 0, drift: false }, 6, t);
    expect(speedOf(c)).toBeLessThan(normal * 1.1);        // back to the normal top speed
  });
  it("the monster truck goes up on its back wheels with the nitro, and braking then rolls it over", () => {
    const t = oval(), c = newCar(0, 0, 0), spec = CAR_TYPES.monster;
    go(c, { throttle: 1, steer: 0, drift: false }, 6, t, spec);   // top speed: no wheelie any more
    expect(c.pitch).toBeLessThan(0.1);
    c.nitroT = NITRO_TIME; c.nitro = 0;
    go(c, { throttle: 1, steer: 0, drift: false }, 0.9, t, spec);
    expect(c.pitch).toBeGreaterThan(0.3);
    go(c, { throttle: -1, steer: 0, drift: false }, 0.1, t, spec);
    expect(c.rollT).toBeGreaterThan(0);
    expect(c.nitroT).toBe(0);
  });
});

describe("who started the race", () => {
  it("a race the agents start by themselves is not 'by you' (so it never moves your camera); one you start is", () => {
    const idle = ["a", "b", "c"];
    const env: RaceEnv = { rng: mulberry32(5), idle: () => idle, alive: () => true, name: (a) => a, color: () => "#fff" };
    const auto = new RaceHub(env); auto.setTrack(oval()); auto.auto = true;
    for (let t = 0; t < 400 && !auto.running; t += 0.05) auto.tick(0.05);
    expect(auto.running).toBe(true);
    expect(auto.byUser).toBe(false);
    const mine = new RaceHub(env); mine.setTrack(oval()); mine.auto = false;
    expect(mine.start()).toBe(true);
    expect(mine.byUser).toBe(true);
    mine.stop(); expect(mine.start(true)).toBe(true); expect(mine.byUser).toBe(true);
  });
});
