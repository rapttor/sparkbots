import { describe, expect, it } from "vitest";
import { AppDb } from "../server/db";
import { parseGameResult } from "../server/games";
import { GameHub, GATHER_TIMEOUT, OVER_SHOW, USER_SEAT, PLAYABLE, isGuest, type HubEnv } from "../src/world/games/hub";
import { RallySim, TABLE } from "../src/world/games/rally";
import { GAMES, GAME_IDS, pickGame } from "../src/world/games/registry";
import { RoundSim, diceWinner, rpsWinner } from "../src/world/games/rounds";
import { BilliardsSim } from "../src/world/games/billiards";
import { HoopsSim } from "../src/world/games/hoops";
import { SLOTS, placeSlots, seatSpots } from "../src/world/games/tables";
import { mulberry32, type GameResult } from "../src/world/games/types";

const run = (sim: { over: boolean; step(dt: number): void }, secs = 600) => { for (let t = 0; t < secs * 60 && !sim.over; t++) sim.step(1 / 60); };

describe("rock paper scissors and dice rules", () => {
  it("paper beats rock, scissors beat paper, rock beats scissors", () => {
    expect(rpsWinner(1, 0)).toBe(0); expect(rpsWinner(0, 1)).toBe(1);
    expect(rpsWinner(2, 1)).toBe(0); expect(rpsWinner(0, 2)).toBe(0); expect(rpsWinner(1, 1)).toBeNull();
  });
  it("higher dice sum wins", () => { expect(diceWinner(9, 4)).toBe(0); expect(diceWinner(3, 8)).toBe(1); expect(diceWinner(7, 7)).toBeNull(); });
  it.each(["rps", "dice"] as const)("%s ends with a winner at the target", (kind) => {
    const s = new RoundSim(kind, mulberry32(7), 3);
    run(s);
    expect(s.over).toBe(true);
    expect(s.winner === 0 || s.winner === 1).toBe(true);
    expect(s.score[s.winner!]).toBe(3);
    expect(s.score[s.winner === 0 ? 1 : 0]).toBeLessThan(3);
  });
});

describe("pong and air hockey", () => {
  it.each(["pong", "hockey"] as const)("%s finishes, the ball stays on the table, scores add up", (mode) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = new RallySim(mode, mulberry32(seed), 5);
      let guard = 0;
      while (!s.over && guard++ < 60 * 900) {
        s.step(1 / 60);
        expect(Math.abs(s.ball.z)).toBeLessThanOrEqual(TABLE.W / 2 + 1e-6);
        expect(Number.isFinite(s.ball.x)).toBe(true);
      }
      expect(s.over).toBe(true);
      expect(s.score[s.winner!]).toBe(5);
      expect(s.hits).toBeGreaterThan(0);
    }
  });
  it("pong: standing further back hits harder but reaches less far", () => {
    const s = new RallySim("pong", mulberry32(1));
    expect(s.reach(1.2)).toBeLessThan(s.reach(0));
    const speed = (depth: number) => {
      const g = new RallySim("pong", mulberry32(2)); g.pause = 0;
      g.paddles[1].depth = depth; g.paddles[1].z = 0;
      g.ball = { x: TABLE.L / 2 + 0.01, z: 0.05, vx: 2, vz: 0 }; g.step(0.001);
      return Math.abs(g.ball.vx);
    };
    expect(speed(1.2)).toBeGreaterThan(speed(0));
  });
  it("pong: a ball out of reach is a point for the other side", () => {
    const g = new RallySim("pong", mulberry32(3)); g.pause = 0; g.paddles[1].z = -0.7; g.paddles[1].skill = 0;
    g.ball = { x: TABLE.L / 2 + 0.01, z: 0.7, vx: 2, vz: 0 };
    for (let i = 0; i < 120 && g.score[0] === 0; i++) g.step(1 / 60);
    expect(g.score[0]).toBe(1);
  });
  it("hockey: the puck through the centre of the end is a goal, off-centre it bounces", () => {
    const goal = new RallySim("hockey", mulberry32(4)); goal.pause = 0; goal.paddles[1].x = 0.1; goal.paddles[0].x = -0.1;
    goal.ball = { x: TABLE.L / 2 - 0.02, z: 0, vx: 3, vz: 0 }; goal.step(0.05);
    expect(goal.score[0]).toBe(1);
    const miss = new RallySim("hockey", mulberry32(4)); miss.pause = 0;
    miss.ball = { x: TABLE.L / 2 - 0.02, z: 0.6, vx: 3, vz: 0 }; miss.step(0.05);
    expect(miss.score).toEqual([0, 0]); expect(miss.ball.vx).toBeLessThan(0);
  });
});

describe("registry and tables", () => {
  it("picks only allowed games, by weight", () => {
    expect(pickGame(0.5, ["dice"])).toBe("dice");
    expect(pickGame(0.5, [])).toBeNull();
    expect(Object.keys(GAMES).sort()).toEqual(["billiards", "dice", "hockey", "hoops", "pong", "rps"]);
  });
  it("seats face each other across the table", () => {
    const [a, b] = seatSpots("large", 10, 5);
    expect(a.x).toBeLessThan(10); expect(b.x).toBeGreaterThan(10);
    expect(placeSlots(100, 50)[0]!.x).toBe(100 + SLOTS[0]!.rel[0]);
  });
});

/** A fake world: agents are idle until `busy`; walking takes `walk` seconds. */
function world(ids: string[], walk = 1) {
  const busy = new Set<string>(), at = new Map<string, { inst: string; since: number }>(), recs: GameResult[] = [];
  let clock = 0;
  const env: HubEnv = {
    rng: mulberry32(11),
    idle: () => ids.filter((a) => !busy.has(a) && !at.has(a)),
    free: (a) => !busy.has(a) && !at.has(a),
    alive: (a, i) => a === USER_SEAT || (!busy.has(a) && at.get(a)?.inst === i),
    send: (a, spot, i) => { if (spot) { if (!at.has(a)) at.set(a, { inst: i, since: clock }); } else at.delete(a); },
    arrived: (a) => a === USER_SEAT || clock - (at.get(a)?.since ?? Infinity) >= walk,
    name: (a) => `Bot ${a}`,
    record: (r) => recs.push(r),
  };
  const hub = new GameHub(env);
  hub.setSlots(placeSlots(0, 0));
  hub.auto = false;
  const tick = (secs: number) => { for (let i = 0; i < secs * 20; i++) { clock += 0.05; hub.tick(0.05); } };
  return { hub, busy, at, recs, tick };
}

describe("game hub: instances, seats, state machine", () => {
  it("seats two agents, plays, records the result, then removes the table", () => {
    const w = world(["a", "b"]);
    const inst = w.hub.open("pong", ["a", "b"])!;
    expect(inst.phase).toBe("gathering");
    expect(inst.slot.id).toBe("pp"); // the real ping-pong table first
    w.tick(2);
    expect(inst.phase).toBe("playing");
    w.tick(300);
    expect(w.recs).toHaveLength(1);
    const r = w.recs[0]!;
    expect(r.game).toBe("pong"); expect([r.a, r.b]).toContain(r.winner);
    expect(Math.max(r.scoreA, r.scoreB)).toBe(5);
    w.tick(OVER_SHOW * 5 + 5);
    expect(w.hub.instances.length === 0 || w.recs.length > 1).toBe(true); // closed, or continued with a rematch
    w.hub.stopAll();
    expect(w.hub.instances).toHaveLength(0);
    expect(w.at.size).toBe(0); // everyone released
  });
  it("makes a new table when the first is taken, and refuses when none is left", () => {
    const w = world(["a", "b", "c", "d", "e", "f", "g", "h"]);
    const t1 = w.hub.open("pong", ["a", "b"])!, t2 = w.hub.open("pong", ["c", "d"])!, t3 = w.hub.open("pong", ["e", "f"])!, t4 = w.hub.open("pong", ["g", "h"]);
    expect([t1.slot.id, t2.slot.id, t3.slot.id]).toEqual(["pp", "L1", "L2"]);
    expect(t4?.slot.id).toBe("L3");
    expect(w.hub.open("pong", ["x"])).toBeNull(); // no free large table (and x is not even in the world)
  });
  it("reserves seats: an agent cannot be at two tables; invite fills the empty seat", () => {
    const w = world(["a", "b", "c"]);
    const inst = w.hub.open("rps", ["a"])!;
    expect(inst.slot.size).toBe("small");
    expect(w.hub.open("dice", ["a", "b"])).toBeNull();
    expect(w.hub.invite(inst.id, "a")).toBe(false);
    expect(w.hub.invite(inst.id, "b")).toBe(true);
    expect(w.hub.invite(inst.id, "c")).toBe(false); // table is full
    w.tick(2);
    expect(inst.phase).toBe("playing");
  });
  it("cancels without a result when an agent goes back to work", () => {
    const w = world(["a", "b"]);
    const inst = w.hub.open("hockey", ["a", "b"])!;
    w.tick(3);
    expect(inst.phase).toBe("playing");
    w.busy.add("b");
    w.tick(0.2);
    expect(w.hub.instances).toHaveLength(0);
    expect(w.recs).toHaveLength(0);
    expect(w.at.size).toBe(0);
  });
  it("removes a table nobody reached or joined, and a stopped game records nothing", () => {
    const slow = world(["a", "b"], 1e9);
    slow.hub.open("dice", ["a", "b"]);
    slow.tick(GATHER_TIMEOUT + 2);
    expect(slow.hub.instances).toHaveLength(0);
    const w = world(["a", "b"]);
    const inst = w.hub.open("pong", ["a", "b"])!;
    w.tick(3);
    w.hub.stop(inst.id);
    expect(w.hub.instances).toHaveLength(0);
    expect(w.recs).toHaveLength(0);
  });
  it("idle agents pair up by themselves, but never take busy agents, and respect the switch", () => {
    const w = world(["a", "b", "c"]);
    w.busy.add("c");
    w.tick(20);
    expect(w.hub.instances).toHaveLength(0); // auto is off
    w.hub.auto = true;
    w.tick(15);
    expect(w.hub.instances.length).toBeGreaterThan(0);
    for (const i of w.hub.instances) expect(i.seats.map((s) => s.agent)).not.toContain("c");
  });
});

describe("game rankings in SQLite", () => {
  const res = (o: Partial<GameResult>): GameResult => ({ uuid: Math.random().toString(36), at: 1, game: "pong", a: "a", b: "b", aName: "Ann", bName: "Bob", scoreA: 5, scoreB: 2, winner: "a", ...o });
  it("counts wins, losses and matches per agent and game, and ignores a repeated uuid", () => {
    const db = new AppDb(":memory:");
    expect(db.recordGame(res({ uuid: "1" }))).toBe(true);
    expect(db.recordGame(res({ uuid: "1" }))).toBe(false);
    db.recordGame(res({ uuid: "2", winner: "b", scoreA: 1, scoreB: 5 }));
    db.recordGame(res({ uuid: "3", game: "dice", scoreA: 3, scoreB: 0, at: 5, aName: "Ann (renamed)" }));
    const pong = db.gameRankings("pong");
    expect(pong).toHaveLength(2);
    expect(pong.find((r) => r.agent === "a")).toMatchObject({ wins: 1, losses: 1, plays: 2, game: "pong" });
    const all = db.gameRankings();
    expect(all.find((r) => r.agent === "a")).toMatchObject({ wins: 2, losses: 1, plays: 3, game: "all", name: "Ann (renamed)" });
    expect(all[0]!.agent).toBe("a");
  });
  it("keeps data across reopening the same file (migration is idempotent)", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "games-"));
    try {
      process.env.AGENT_OFFICE_HOME = dir;
      const f = join(dir, "x.db");
      const a = new AppDb(f); a.recordGame(res({ uuid: "p" })); a.close();
      const b = new AppDb(f);
      expect(b.gameRankings("pong")[0]).toMatchObject({ plays: 1 });
      b.close();
    } finally { delete process.env.AGENT_OFFICE_HOME; rmSync(dir, { recursive: true, force: true }); }
  });
  it("validates posted results", () => {
    const ok = { uuid: "u", game: "pong", a: "a", b: "b", aName: "A", bName: "B", scoreA: 5, scoreB: 1, winner: "a" };
    expect(parseGameResult(ok)).toMatchObject({ winner: "a", game: "pong" });
    expect(parseGameResult({ ...ok, game: "race" })).toMatchObject({ game: "race" });
    expect(parseGameResult({ ...ok, game: "chess" })).toBeNull();
    expect(parseGameResult({ ...ok, winner: "zzz" })).toBeNull();
    expect(parseGameResult({ ...ok, b: "a" })).toBeNull();
    expect(parseGameResult({ ...ok, scoreA: -1 })).toBeNull();
    expect(parseGameResult({ ...ok, winner: null })?.winner).toBeNull();
    expect(parseGameResult(undefined)).toBeNull();
  });
});

describe("game hub: the two start buttons", () => {
  const mk = (idle: string[], sleeping: string[]) => {
    const env: HubEnv = { rng: mulberry32(3), idle: () => idle, sleeping: () => sleeping, free: () => true, alive: () => true, send: () => {}, arrived: () => false, name: (a) => a, record: () => {} };
    const hub = new GameHub(env); hub.setSlots(placeSlots(0, 0)); return hub;
  };
  it("says nobody is available when everyone is busy, and starts nothing", () => {
    const h = mk([], []);
    const r = h.quick("pong", "auto");
    expect(r.inst).toBeNull(); expect(r.msg).toMatch(/busy working/);
  });
  it("autoplay calls two agents, idle ones first, then sleepers", () => {
    const r = mk(["i1"], ["s1", "s2"]).quick("pong", "auto");
    expect(r.inst!.seats.map((s) => s.agent)).toContain("i1");
    expect(r.inst!.seats.every((s) => s.agent && !isGuest(s.agent))).toBe(true);
  });
  it("play vs agent calls one agent and a guest bot takes the other seat", () => {
    const r = mk(["i1", "i2"], []).quick("pong", "vs");
    const ids = r.inst!.seats.map((s) => s.agent!);
    expect(ids.filter(isGuest)).toHaveLength(1);
    expect(r.msg).toMatch(/guest/i);
  });
  it("autoplay with a single free agent gets a guest opponent", () => {
    const r = mk([], ["s1"]).quick("pong", "auto");
    expect(r.inst!.seats.map((s) => s.agent!).filter(isGuest)).toHaveLength(1);
  });
});

describe("playable games: you take seat 0", () => {
  const mk = (idle: string[]) => {
    const w = world(idle);
    return w;
  };
  it("playVs seats you against an agent, or a guest bot when nobody is free", () => {
    const w = mk(["a", "b"]);
    const r = w.hub.playVs("pong");
    expect(r.inst!.seats[0].agent).toBe(USER_SEAT);
    expect(isGuest(r.inst!.seats[1].agent)).toBe(false);
    const w2 = mk([]);
    expect(isGuest(w2.hub.playVs("rps").inst!.seats[1].agent)).toBe(true);
    expect(PLAYABLE.slice().sort()).toEqual(GAME_IDS.slice().sort()); // every game can be played by you now
  });
  it("rock-paper-scissors waits for your move and uses it; the score and result record you as 'user'", () => {
    const w = mk(["a"]);
    const inst = w.hub.playVs("rps").inst!;
    w.tick(5);                                   // the agent arrives, the match starts
    expect(inst.phase).toBe("playing");
    const sim = inst.sim as RoundSim;
    w.tick(10);
    expect(sim.rounds).toBe(0);                  // nothing is thrown without you
    for (let i = 0; i < 60 && !sim.over; i++) w.hub.throwMove(1);
    expect(sim.over).toBe(true);
    w.tick(0.1);
    expect(w.recs.length).toBe(1);
    expect(w.recs[0]!.a).toBe(USER_SEAT);
  });
  it("your keys steer your paddle in pong and in hockey; the agent's side stays automatic", () => {
    for (const game of ["pong", "hockey"] as const) {
      const w = mk(["a"]);
      const inst = w.hub.playVs(game).inst!;
      w.tick(5);
      const sim = inst.sim as RallySim;
      expect(sim.user).toBe(0);
      const z0 = sim.paddles[0].z;
      w.hub.setControl(0, 1);
      for (let i = 0; i < 20; i++) sim.step(0.05);
      expect(sim.paddles[0].z).toBeGreaterThan(z0 + 0.3);
      w.hub.setControl(0, 0);
      const z1 = sim.paddles[0].z;
      for (let i = 0; i < 10; i++) sim.step(0.05);
      expect(sim.paddles[0].z).toBeCloseTo(z1, 5); // it does not chase the ball by itself
    }
  });
});

describe("playable billiards and basketball", () => {
  it("billiards: the cue waits for you, turns with your keys, and the shot is yours", () => {
    const sim = new BilliardsSim("quick", mulberry32(4));
    sim.turn = 0; sim.setUser(0);
    expect(sim.yourTurn).toBe(true);
    const a0 = sim.aim.angle;
    for (let i = 0; i < 40; i++) sim.step(0.05);
    expect(sim.phase).toBe("aim");                       // two seconds later it still waits
    sim.ctl.dx = 1; for (let i = 0; i < 20; i++) sim.step(0.05); sim.ctl.dx = 0;
    expect(sim.aim.angle).toBeGreaterThan(a0 + 0.5);
    sim.ctl.dz = -1; for (let i = 0; i < 40; i++) sim.step(0.05); sim.ctl.dz = 0;
    expect(sim.power).toBe(9);                           // up = more power, capped
    sim.shoot();
    expect(sim.phase).toBe("roll");
    expect(sim.balls[0]!.vx !== 0 || sim.balls[0]!.vz !== 0).toBe(true);
    expect(sim.shots[0]).toBe(1);
  });
  it("billiards: the agent's turn is still automatic", () => {
    const sim = new BilliardsSim("quick", mulberry32(4));
    sim.turn = 1; sim.setUser(0);
    expect(sim.yourTurn).toBe(false);
    for (let i = 0; i < 80; i++) sim.step(0.05);
    expect(sim.shots[1]).toBeGreaterThan(0);
  });
  it("basketball: your meter runs until you press; two presses shoot", () => {
    const sim = new HoopsSim(mulberry32(9));
    sim.shooter = 0; sim.setUser(0);
    expect(sim.yourTurn).toBe(true);
    for (let i = 0; i < 100; i++) sim.step(0.05);
    expect(sim.phase).toBe("angle");                     // it does not stop by itself
    sim.press();
    expect(sim.phase).toBe("power");
    for (let i = 0; i < 30; i++) sim.step(0.05);
    expect(sim.phase).toBe("power");
    sim.press();
    expect(sim.phase).toBe("flight");
    expect(sim.shot).not.toBeNull();
  });
  it("playVs now seats you for every game", () => {
    for (const g of ["billiards", "hoops"] as const) {
      const w = world(["a", "b"]);
      const r = w.hub.playVs(g);
      expect(r.inst!.seats[0].agent).toBe(USER_SEAT);
      expect(r.msg).not.toMatch(/only be watched/);
    }
  });
});
