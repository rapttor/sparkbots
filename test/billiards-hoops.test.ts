import { describe, expect, it } from "vitest";
import { BALL_R, BilliardsSim, CUE, POCKETS, POCKET_R, clothColor, judgeShot, rack, shotSpeed, stepBalls, strengthFromHold, strike, moving, type BBall, type RulesState } from "../src/world/games/billiards";
import { HOOP_Y, HoopsSim, RIM_R, SWEET_ANGLE_METER, SWEET_POWER_METER, judgeShotMeters, meterAt, points } from "../src/world/games/hoops";
import { TABLE } from "../src/world/games/rally";
import { GAMES } from "../src/world/games/registry";
import { mulberry32 } from "../src/world/games/types";

const ball = (id: number, x: number, z: number, vx = 0, vz = 0): BBall => ({ id, x, z, vx, vz, out: false });
const settle = (balls: BBall[], report = { potted: [] as number[], firstHit: null as number | null }) => { for (let i = 0; i < 60 * 30 && moving(balls); i++) stepBalls(balls, 1 / 60, report); return report; };

describe("billiards physics", () => {
  it("racks 15 + cue for eight, 7 + cue for quick, nothing overlapping", () => {
    for (const [v, n] of [["eight", 16], ["quick", 8]] as const) {
      const b = rack(v, mulberry32(1));
      expect(b).toHaveLength(n);
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) expect(Math.hypot(b[i]!.x - b[j]!.x, b[i]!.z - b[j]!.z)).toBeGreaterThanOrEqual(BALL_R * 2);
    }
    expect(rack("eight", mulberry32(5)).find((x) => x.id === 8)).toBeTruthy();
  });
  it("table colour follows the variant", () => { expect(clothColor("eight")).not.toBe(clothColor("quick")); });
  it("strength 1-9 maps to speed, hold E climbs and caps", () => {
    expect(shotSpeed(9)).toBeGreaterThan(shotSpeed(1)); expect(shotSpeed(99)).toBe(shotSpeed(9)); expect(shotSpeed(0)).toBe(shotSpeed(1));
    expect(strengthFromHold(0)).toBe(1); expect(strengthFromHold(1)).toBe(4); expect(strengthFromHold(60)).toBe(9);
  });
  it("an equal-mass head-on hit passes the momentum on", () => {
    const b = [ball(0, -0.5, 0), ball(1, 0, 0)];
    strike(b, 0, 5);
    settle(b);
    expect(b[1]!.x).toBeGreaterThan(0.2);   // the object ball took the energy
    expect(b[0]!.x).toBeLessThan(b[1]!.x);  // the cue ball stopped behind it
  });
  it("friction stops a ball; walls keep it on the table", () => {
    const b = [ball(0, 0, 0.2), ball(1, 0.8, -0.3)];
    strike(b, 0.4, 9);
    for (let i = 0; i < 60 * 20; i++) { stepBalls(b, 1 / 60); for (const x of b) if (!x.out) { expect(Math.abs(x.x)).toBeLessThanOrEqual(TABLE.L / 2); expect(Math.abs(x.z)).toBeLessThanOrEqual(TABLE.W / 2); } }
    expect(moving(b)).toBe(false);
  });
  it("a ball rolling into a pocket is potted and reported", () => {
    const [px, pz] = POCKETS[5]!;
    const b = [ball(0, -1, -0.5), ball(1, px - 0.5, pz - 0.2 * 0)];
    b[1]!.vx = 1.2; b[1]!.z = pz - 0.04;
    const rep = settle(b);
    expect(rep.potted).toContain(1); expect(b[1]!.out).toBe(true);
    expect(POCKET_R).toBeGreaterThan(BALL_R);
  });
  it("reports the first object ball the cue ball touches", () => {
    const b = [ball(0, -0.6, 0), ball(7, -0.2, 0), ball(9, 0.5, 0.4)];
    strike(b, 0, 4);
    expect(settle(b).firstHit).toBe(7);
  });
});

const st = (over: Partial<RulesState> = {}): RulesState => ({ variant: "eight", turn: 0, groups: [null, null], down: new Set(), ...over });
describe("billiards rules", () => {
  it("first legal pot on an open table picks the group and keeps the turn", () => {
    const v = judgeShot(st({ down: new Set([3]) }), { potted: [3], firstHit: 3 });
    expect(v.groups).toEqual(["solid", "stripe"]); expect(v.next).toBe(0); expect(v.foul).toBe(false);
  });
  it("a miss passes the turn; potting an opponent ball does too", () => {
    expect(judgeShot(st(), { potted: [], firstHit: 2 }).next).toBe(1);
    expect(judgeShot(st({ groups: ["solid", "stripe"], down: new Set([10]) }), { potted: [10], firstHit: 2 }).next).toBe(1);
  });
  it("scratch and no contact are fouls (turn passes)", () => {
    const s = judgeShot(st({ groups: ["solid", "stripe"], down: new Set([CUE, 2]) }), { potted: [CUE, 2], firstHit: 2 });
    expect(s.foul).toBe(true); expect(s.next).toBe(1);
    expect(judgeShot(st(), { potted: [], firstHit: null }).foul).toBe(true);
  });
  it("hitting the wrong group first is a foul", () => {
    expect(judgeShot(st({ groups: ["solid", "stripe"] }), { potted: [], firstHit: 12 }).foul).toBe(true);
  });
  it("the 8: early loses, legal after clearing the group wins, with a scratch loses", () => {
    expect(judgeShot(st({ groups: ["solid", "stripe"], down: new Set([8]) }), { potted: [8], firstHit: 8 }).winner).toBe(1);
    const cleared = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(judgeShot(st({ groups: ["solid", "stripe"], down: cleared }), { potted: [8], firstHit: 8 }).winner).toBe(0);
    expect(judgeShot(st({ groups: ["solid", "stripe"], down: new Set([...cleared, CUE]) }), { potted: [8, CUE], firstHit: 8 }).winner).toBe(1);
  });
  it("quick: any pot keeps the turn, a scratch ends it", () => {
    expect(judgeShot(st({ variant: "quick" }), { potted: [3], firstHit: 3 }).next).toBe(0);
    expect(judgeShot(st({ variant: "quick" }), { potted: [CUE, 3], firstHit: 3 }).next).toBe(1);
  });
});

describe("billiards matches (AI vs AI)", () => {
  it.each(["eight", "quick"] as const)("%s always finishes with a winner and sane scores", (variant) => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = new BilliardsSim(variant, mulberry32(seed));
      s.playOut();
      expect(s.over).toBe(true);
      expect(s.winner === 0 || s.winner === 1).toBe(true);
      for (const b of s.balls) if (!b.out) { expect(Number.isFinite(b.x) && Number.isFinite(b.z)).toBe(true); expect(Math.abs(b.x)).toBeLessThanOrEqual(TABLE.L / 2); }
      expect(Math.max(...s.score)).toBeLessThanOrEqual(7);
    }
  });
  it("is cheap: a whole match runs in well under a second", () => {
    const t = Date.now(); for (let i = 0; i < 5; i++) new BilliardsSim("eight", mulberry32(20 + i)).playOut();
    expect(Date.now() - t).toBeLessThan(3000);
  });
  it("the AI pots balls (not just wanders)", () => {
    let potted = 0;
    for (let i = 0; i < 6; i++) { const s = new BilliardsSim("quick", mulberry32(40 + i)); s.playOut(); potted += s.balls.filter((b) => b.out && b.id !== 0).length; }
    expect(potted).toBeGreaterThan(8);
  });
});

describe("basketball", () => {
  it("meter sweeps 0..1..0", () => { expect(meterAt(0, 1)).toBe(0); expect(meterAt(0.5, 1)).toBe(0.5); expect(meterAt(1, 1)).toBe(1); expect(meterAt(1.5, 1)).toBeCloseTo(0.5); expect(meterAt(2, 1)).toBeCloseTo(0); });
  it("the sweet spot is a swish, tiny errors still score, big ones miss", () => {
    expect(judgeShotMeters(SWEET_ANGLE_METER, SWEET_POWER_METER, 0).result).toBe("swish");
    expect(judgeShotMeters(SWEET_ANGLE_METER, SWEET_POWER_METER + 0.4, 0).result).toBe("miss");
    expect(judgeShotMeters(0, 0, 0).result).toBe("miss");
    const r = judgeShotMeters(SWEET_ANGLE_METER, SWEET_POWER_METER + 0.03, 0);
    expect(["swish", "in", "rim"]).toContain(r.result);
    expect(RIM_R).toBeGreaterThan(0.1); expect(HOOP_Y).toBeGreaterThan(1);
  });
  it("points: swish 3, in 2, others 0; rim rattle depends on luck", () => {
    expect([points("swish"), points("in"), points("rim"), points("miss")]).toEqual([3, 2, 0, 0]);
    let a = 0.0, found: ReturnType<typeof judgeShotMeters> | null = null;
    for (let d = 0; d < 0.3 && !found; d += 0.002) { const r = judgeShotMeters(SWEET_ANGLE_METER, SWEET_POWER_METER + d, 0.9); if (r.result === "rim") found = r; a = d; }
    expect(found).not.toBeNull(); void a;
    expect(judgeShotMeters(found!.angleMeter, found!.powerMeter, 0.1).result).toBe("in");
  });
  it("matches end with a winner; the lead is real; meters speed up", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = new HoopsSim(mulberry32(seed), 11);
      const v0 = s.speed;
      s.playOut();
      expect(s.over).toBe(true);
      expect(s.speed).toBeGreaterThan(v0);
      expect(s.score[s.winner!]).toBeGreaterThanOrEqual(s.score[s.winner === 0 ? 1 : 0]);
    }
  });
  it("turn order alternates and the ball is held by the shooter or flying", () => {
    const s = new HoopsSim(mulberry32(3));
    const first = s.shooter; let guard = 0;
    while (s.phase !== "fetch" && guard++ < 5000) s.step(1 / 30);
    expect(s.phase).toBe("fetch");
    while (s.phase === "fetch" && guard++ < 9000) s.step(1 / 30);
    expect(s.shooter).not.toBe(first);
  });
  it("the registry builds both", () => {
    expect(GAMES.billiards.create(mulberry32(1))).toBeInstanceOf(BilliardsSim);
    expect(GAMES.hoops.create(mulberry32(1))).toBeInstanceOf(HoopsSim);
  });
});
