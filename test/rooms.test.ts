import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { COOK_S, MENU, SERVE_S, CHEF_LOOKS, chefLook, newOrder, place, tick } from "../src/world/rooms/menu";
import { FIRE_MAX_GAP_S, FIRE_MIN_GAP_S, initFire, tickFire } from "../src/world/rooms/fire";
import { WEAPONS, ITEMS, SESSION_S, MAX_ALIVE, WAVE_GAP_MIN_MS, WAVE_MAX, WAVE_MIN, COLS, ROWS, DEBRIS_CAP, DebrisPool, HIT_AT, COMBO_MS, REST_PITCH, WAVE_GAP_MAX_MS, clampToRoom, comboMult, comboOf, fxScale, hitRadius, overReception, playerPitch, smashMany, swingTargets, isOver, smash, slotPos, startRun, startSession, stopRun, swingPose, tickWaves, timeLeft, hitShake } from "../src/world/rooms/anger";
import { BLOW_S, PUMP_LIMIT_S, pumpPhase, pumpScale, boredLine, BORED_LINES } from "../src/world/rooms/gymLogic";
import { FLIGHT_S, flight } from "../src/world/rooms/drones";
import { SPONSOR_LINKS, filledLinks, isAddress, isFilled, isUsable } from "../src/shared/sponsor";
import { MAX_PER_SESSION, MIN_GAP_MS, mayShow } from "../src/world/rooms/sponsorBubbles";
import { ZONES } from "../src/world/zones";

describe("restaurant orders", () => {
  it("menu dishes use known chef looks", () => { for (const d of MENU) expect(CHEF_LOOKS[d.cuisine]).toBeDefined(); });
  it("idle -> preparing -> ready -> served -> idle", () => {
    let o = place(newOrder(), "pizza", 0);
    expect(o.state).toBe("preparing");
    expect(chefLook(o).id).toBe("italian");
    expect(tick(o, COOK_S * 1000 - 1).state).toBe("preparing");
    o = tick(o, COOK_S * 1000); expect(o.state).toBe("ready");
    o = tick(o, COOK_S * 1000 + SERVE_S * 1000); expect(o.state).toBe("served");
    o = tick(o, 1e9); expect(o).toEqual(newOrder());
    expect(chefLook(o).id).toBe("plain");
  });
  it("one meal at a time, unknown dishes refused", () => {
    const o = place(newOrder(), "burger", 0);
    expect(place(o, "sushi", 1)).toBe(o);
    expect(place(newOrder(), "nope", 0).state).toBe("idle");
  });
});

describe("fire", () => {
  it("never ignites when disabled, even long after nextAt", () => {
    const s = initFire(0, 0);
    expect(tickFire(s, FIRE_MAX_GAP_S * 2000, false).burning).toBe(false);
  });
  it("ignites after the cooldown, drones respond, then it is out and cools down again", () => {
    let s = initFire(0, 0);
    expect(tickFire(s, FIRE_MIN_GAP_S * 1000 - 1, true).burning).toBe(false);
    const t0 = FIRE_MIN_GAP_S * 1000;
    s = tickFire(s, t0, true); expect(s.burning).toBe(true);
    s = tickFire(s, t0 + 3500, true); expect(s.responders).toBe(true);
    s = tickFire(s, t0 + 9000, true); expect(s.burning).toBe(false);
    expect(s.nextAt).toBeGreaterThan(t0 + FIRE_MIN_GAP_S * 900);
  });
  it("disabling mid-fire puts it out", () => {
    let s = tickFire(initFire(0, 0), FIRE_MIN_GAP_S * 1000, true);
    s = tickFire(s, FIRE_MIN_GAP_S * 1000 + 100, false); expect(s.burning).toBe(false);
  });
});

describe("anger room", () => {
  const rnd = () => 0.3;
  it("weapon list is valid: no frying pan, unique ids, sane numbers", () => {
    expect(WEAPONS.map((w) => w.id)).toEqual(["bat", "hammer", "wrench", "pry-bar", "crowbar"]);
    for (const w of WEAPONS) { expect(w.power).toBeGreaterThan(0); expect(w.mult).toBeGreaterThan(0); expect(w.length).toBeGreaterThan(0.3); expect(w.swingS).toBeGreaterThan(0.3); expect(w.name && w.icon && w.shaft && w.head).toBeTruthy(); }
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(WEAPONS.length);
  });
  it("items: the five kinds, each with a palette", () => {
    expect(ITEMS.map((i) => i.kind).sort()).toEqual(["computer", "fax", "floppy", "mail", "phone"]);
    for (const i of ITEMS) { expect(i.hp).toBeGreaterThan(0); expect(i.palette.length).toBeGreaterThanOrEqual(3); }
  });
  it("slots lie inside the room", () => {
    for (let i = 0; i < COLS * ROWS; i++) { const p = slotPos(i, 9, 6); expect(Math.abs(p.x)).toBeLessThan(4.5); expect(Math.abs(p.z)).toBeLessThan(3); }
  });
  it("smashing needs a weapon; points follow weapon multiplier; no double points", () => {
    const none = startSession(null, 0, rnd);
    expect(smash(none, none.targets[0]!.id, 1000).s).toBe(none);
    let s = startSession("wrench", 0, rnd);
    const t = s.targets[0]!;
    for (let i = 0; i < t.hp; i++) s = smash(s, t.id, 1000).s;
    expect(s.targets.find((x) => x.id === t.id)).toBeUndefined();
    expect(s.points).toBe(Math.round(ITEMS.find((i) => i.kind === t.kind)!.pts * 1.5));
    const again = smash(s, t.id, 1000);
    expect(again.s).toBe(s); expect(again.broke).toBeNull();
  });
  it("hits that do not break only damage and mark the hit time", () => {
    const s = startSession("bat", 0, () => 0); // computer (hp 3)
    const t = s.targets[0]!; expect(t.hp).toBe(3);
    const r = smash(s, t.id, 500);
    expect(r.broke).toBeNull(); expect(r.s.targets.find((x) => x.id === t.id)).toMatchObject({ hp: 2, hitAt: 500 });
  });
  it("without a run the 60 s clock resets the room", () => {
    const s = startSession("bat", 0, rnd);
    expect(isOver(s, (SESSION_S - 1) * 1000)).toBe(false);
    expect(timeLeft(s, SESSION_S * 1000)).toBe(0);
    expect(isOver(s, SESSION_S * 1000)).toBe(true);
    expect(smash(s, s.targets[0]!.id, SESSION_S * 1000).s).toBe(s);
  });
  it("wrecking run: waves of 3-6 about every second, capped, stop gives a fresh clock", () => {
    let s = startSession("bat", 0, rnd);
    s = startRun(s, 0, rnd);
    expect(s.running).toBe(true);
    expect(s.targets.length).toBeLessThanOrEqual(MAX_ALIVE);
    expect(isOver(s, 1e9)).toBe(false);                       // no clock while running
    // smash everything, then wait for a wave
    s = { ...s, targets: [] };
    expect(tickWaves(s, s.nextWaveAt - 1, rnd)).toBe(s);      // not due yet
    const w = tickWaves(s, s.nextWaveAt, rnd);
    expect(w.targets.length).toBeGreaterThanOrEqual(WAVE_MIN); expect(w.targets.length).toBeLessThanOrEqual(WAVE_MAX);
    expect(w.nextWaveAt).toBeGreaterThanOrEqual(s.nextWaveAt + WAVE_GAP_MIN_MS);
    expect(new Set(w.targets.map((t) => t.slot)).size).toBe(w.targets.length); // distinct slots
    // never above the cap, however many waves come
    let c = w; for (let i = 0; i < 20; i++) c = tickWaves(c, c.nextWaveAt, () => 0.99);
    expect(c.targets.length).toBeLessThanOrEqual(MAX_ALIVE);
    // stopping: no more waves, leftovers stay, a 60 s clock starts
    const st = stopRun(c, 5000);
    expect(st.running).toBe(false); expect(st.targets).toEqual(c.targets);
    expect(tickWaves(st, st.nextWaveAt + 1e6, rnd)).toBe(st);
    expect(timeLeft(st, 5000)).toBe(SESSION_S);
    expect(isOver(st, 5000 + SESSION_S * 1000)).toBe(true);
    expect(startRun(startRun(st, 6000, rnd), 7000, rnd).running).toBe(true); // idempotent restart
  });
  it("swing: wind-up, hit at the impact moment, recover, done", () => {
    expect(swingPose(0, 1).pitch).toBeCloseTo(0);
    expect(swingPose(0.25 * 1, 1).pitch).toBeLessThan(-0.5);          // wound back
    expect(swingPose(HIT_AT + 0.01, 1).hit).toBe(true);
    expect(swingPose(HIT_AT + 0.01, 1).pitch).toBeGreaterThan(0.5);   // forward
    expect(swingPose(1, 1).done).toBe(true);
    expect(hitShake(2000, 1000)).toBe(0); expect(Math.abs(hitShake(1010, 1000))).toBeGreaterThan(0);
  });
  it("respawn is fast and the floor stays busy but capped", () => {
    expect(WAVE_GAP_MAX_MS).toBeLessThanOrEqual(1200); expect(WAVE_MIN).toBeGreaterThanOrEqual(3); expect(WAVE_MAX).toBeLessThanOrEqual(6);
    expect(MAX_ALIVE).toBeLessThan(COLS * ROWS);
  });
  it("a swing hits everything within reach of the pointer, and only that", () => {
    const s = startRun(startSession("hammer", 0, rnd), 0, rnd);
    const t = s.targets[0]!, p = slotPos(t.slot, 9, 6);
    const near = swingTargets(s, p.x, p.z, 9, 6);
    expect(near).toContain(t.id);
    expect(swingTargets(s, p.x + 20, p.z, 9, 6)).toEqual([]);
    const wide = swingTargets(s, 0, 0, 9, 6);                 // middle of the room: several in reach? never more than alive
    expect(wide.every((id) => s.targets.some((x) => x.id === id))).toBe(true);
    expect(swingTargets(startSession(null, 0, rnd), p.x, p.z, 9, 6)).toEqual([]);
    expect(hitRadius(WEAPONS.find((w) => w.id === "crowbar")!)).toBeGreaterThan(hitRadius(WEAPONS.find((w) => w.id === "wrench")!));
  });
  it("smashMany: one blow can hit several; combo builds, multiplies points, and times out", () => {
    let s = startRun(startSession("crowbar", 0, () => 0.99), 0, () => 0.99); // power 3 breaks all but computers
    const ids = s.targets.map((t) => t.id);
    expect(ids.length).toBeGreaterThan(3);
    const r = smashMany(s, ids, 1000);
    expect(r.hit.length).toBe(ids.length);
    expect(r.s.combo).toBe(ids.length); expect(r.s.best).toBe(ids.length);
    expect(comboOf(r.s, 1000 + COMBO_MS)).toBe(ids.length); expect(comboOf(r.s, 1000 + COMBO_MS + 1)).toBe(0);
    // multiplier kicks in from 5 hits and is capped
    expect(comboMult(1)).toBe(1); expect(comboMult(5)).toBe(1.5); expect(comboMult(10)).toBe(2); expect(comboMult(999)).toBe(4);
    // missing ids / empty blow change nothing
    expect(smashMany(s, [], 1000).s).toBe(s); expect(smashMany(s, [9999], 1000).s).toBe(s);
    // combo resets after the window: points back to base
    s = { ...s, combo: 50, comboAt: 0 };
    const late = smashMany(s, [s.targets[0]!.id], 100000);
    expect(late.s.combo).toBe(1);
  });
  it("heavier weapons make a bigger mess", () => {
    const f = (id: string) => fxScale(WEAPONS.find((w) => w.id === id)!);
    expect(f("crowbar")).toBeGreaterThan(f("hammer")); expect(f("hammer")).toBeGreaterThan(f("bat"));
    const a = new DebrisPool(), b = new DebrisPool();
    a.spawnBurst(0, 0.4, 0, ["#fff"], "computer", f("bat"), rnd); b.spawnBurst(0, 0.4, 0, ["#fff"], "computer", f("crowbar"), rnd);
    expect(b.step(0.001)).toBeGreaterThan(a.step(0.001));
  });
  it("items throw their own kind of debris: glass from monitors, confetti from paper", () => {
    const kinds = (item: "computer" | "mail") => { const p = new DebrisPool(); p.spawnBurst(0, 0.4, 0, ["#fff"], item, 1, rnd); p.step(0.001); return new Set(Array.from(p.kind).filter((_, i) => p.life[i]! > 0)); };
    expect(kinds("computer").has(4)).toBe(true); expect(kinds("computer").has(3)).toBe(false);
    expect(kinds("mail").has(3)).toBe(true); expect(kinds("mail").has(4)).toBe(false);
  });
  it("the player's swing pitch is continuous with the rest pose and reaches the impact angle", () => {
    expect(playerPitch(-1, 0.5)).toBe(REST_PITCH); expect(playerPitch(0, 0.5)).toBeCloseTo(REST_PITCH); expect(playerPitch(0.5, 0.5)).toBe(REST_PITCH);
    expect(playerPitch(HIT_AT * 0.5, 0.5)).toBeGreaterThan(1.1);
    expect(playerPitch(0.5 * 0.2, 0.5)).toBeLessThan(REST_PITCH - 1); // winds up (head goes high, behind)
  });
  it("the weapon is kept in the room; reception clicks are not swings", () => {
    expect(clampToRoom(99, -99, 9, 6)).toEqual({ x: 4.1, z: -2.6 });
    expect(clampToRoom(0, 0, 9, 6)).toEqual({ x: 0, z: 0 });
    expect(overReception(3, 2.3)).toBe(true); expect(overReception(-2, -1)).toBe(false);
  });
  it("debris pool is capped, allocation-free and goes quiet", () => {
    const p = new DebrisPool();
    expect(p.step(0.016)).toBe(0);
    for (let i = 0; i < 50; i++) p.spawnBurst(0, 0.4, 0, ["#fff", "#000", "#f00"], "computer", 2, () => 0.5);
    expect(p.step(0.016)).toBeLessThanOrEqual(DEBRIS_CAP);
    let alive = 1; for (let i = 0; i < 400 && alive; i++) alive = p.step(0.05);
    expect(alive).toBe(0);
    for (let i = 0; i < DEBRIS_CAP; i++) expect(p.py[i]).toBeGreaterThanOrEqual(0);
  });
});

describe("gym fun", () => {
  it("over-pump swells, blows for a few seconds, then is normal again", () => {
    expect(pumpPhase(1)).toBe("normal");
    expect(pumpPhase(PUMP_LIMIT_S - 1)).toBe("swelling");
    expect(pumpScale(PUMP_LIMIT_S - 0.5)).toBeGreaterThan(1);
    expect(pumpPhase(PUMP_LIMIT_S + 1)).toBe("blown");
    expect(pumpPhase(PUMP_LIMIT_S + BLOW_S + 0.1)).toBe("normal");
  });
  it("boredom lines are picked in range", () => { expect(BORED_LINES).toContain(boredLine(0)); expect(BORED_LINES).toContain(boredLine(0.999)); });
});

describe("drone flights", () => {
  it("goes straight out, hovers, returns home", () => {
    const home = { x: 0, z: 0 }, to = { x: 10, z: 10 };
    expect(flight(home, to, 0).leg).toBe("out");
    const mid = flight(home, to, 1.1); expect(mid.x).toBeCloseTo(mid.z); // straight line
    expect(flight(home, to, FLIGHT_S + 1).leg).toBe("done");
    expect(flight(home, to, 2.5).leg).toBe("hover");
  });
});

describe("sponsor room", () => {
  it("only the owner's own pages are filled in; every other card is a '#' placeholder; no invented addresses", () => {
    expect(SPONSOR_LINKS.length).toBeGreaterThan(0);
    const REAL: Record<string, string> = { patreon: "https://www.patreon.com/c/rapttor", coffee: "https://buymeacoffee.com/rapttor" };
    for (const l of SPONSOR_LINKS) { expect(l.href).toBe(REAL[l.id] ?? "#"); expect(isFilled(l.href)).toBe(l.id in REAL); }
    expect(filledLinks().map((l) => l.id)).toEqual(["patreon", "coffee"]);
    const eth = SPONSOR_LINKS.find((l) => l.id === "eth")!;
    expect(eth.address).toBe("0xeF4590e1c22Cabade5300aFa469f9dDEBA1275D2"); // the owner's own receive address, exactly as given
    expect(isAddress(eth.address)).toBe(true); expect(isUsable(eth)).toBe(true);
    expect(isAddress("0x123")).toBe(false); expect(isAddress("0xZZ4590e1c22Cabade5300aFa469f9dDEBA1275D2")).toBe(false);
    expect(isFilled("javascript:alert(1)")).toBe(false);
    expect(isFilled("http://insecure.example.com")).toBe(false);
    expect(isFilled("https://example.com/x")).toBe(true);
    const src = readFileSync("src/shared/sponsor.ts", "utf8");
    expect((src.match(/\b0x[0-9a-fA-F]{20,}\b/g) ?? [])).toEqual(["0xeF4590e1c22Cabade5300aFa469f9dDEBA1275D2"]); // only the owner's address
    expect(src).not.toMatch(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/); // no other wallet-like strings
    expect((src.match(/https?:\/\/[\w.-]+\.\w{2,}[^\s"]*/g) ?? []).sort()).toEqual(["https://buymeacoffee.com/rapttor", "https://www.patreon.com/c/rapttor"]); // only the owner's two pages
  });
  it("idle bubbles are off by default and capped", () => {
    const s = { lastAt: 0, shown: 0 };
    expect(mayShow(s, 1e9, false, true)).toBe(false);
    expect(mayShow(s, 1e9, true, false)).toBe(false); // nothing to point to
    expect(mayShow(s, 1e9, true, true)).toBe(true);
    expect(mayShow({ lastAt: 1000, shown: 1 }, 1000 + MIN_GAP_MS - 1, true, true)).toBe(false);
    expect(mayShow({ lastAt: 1000, shown: MAX_PER_SESSION }, 1e12, true, true)).toBe(false);
  });
  it("rooms code makes no background requests", () => {
    for (const f of readdirSync("src/world/rooms")) {
      const src = readFileSync(`src/world/rooms/${f}`, "utf8");
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|new Image\(/);
    }
    expect(readFileSync("src/shared/sponsor.ts", "utf8")).not.toMatch(/\bfetch\(/);
  });
  it("window.open only happens in the click helper", () => {
    const src = readFileSync("src/world/rooms/SponsorRoom.tsx", "utf8");
    expect(src.match(/window\.open/g)).toHaveLength(1);
  });
});

describe("zones", () => {
  it("restaurant replaced the veranda; grill and picnic live in the yard", () => {
    const ids = ZONES.map((z) => z.id);
    expect(ids).toContain("restaurant"); expect(ids).not.toContain("veranda");
    const yard = ZONES.find((z) => z.id === "yard")!;
    expect(yard.pois.map((p) => p.id)).toEqual(expect.arrayContaining(["grill", "picnic"]));
    expect(ids).toEqual(expect.arrayContaining(["anger-room", "sponsor-room"]));
  });
});

describe("restaurant kitchen floor", () => {
  it("has a raised, walkable floor behind the counter so the chef clears the counter top", () => {
    const z = ZONES.find((x) => x.id === "restaurant")!;
    const floor = z.props.find((p) => p.size[1] === 0.3 && p.solid === false);
    expect(floor, "raised kitchen floor").toBeDefined();
    const counter = z.props.find((p) => p.size[1] === 0.95 && p.size[0] === 6.0)!;
    expect(floor!.at[1]).toBeLessThan(counter.at[1]);
  });
});

describe("ethereum QR code", () => {
  it("is a 29x29 QR with the three finder patterns, and the SVG path draws exactly the rows", async () => {
    const { ETH_QR, ETH_QR_ROWS } = await import("../src/shared/sponsorQr");
    expect(ETH_QR.size).toBe(29);
    expect(ETH_QR_ROWS).toHaveLength(29);
    for (const r of ETH_QR_ROWS) expect(r).toMatch(/^[01]{29}$/);
    const finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
    const at = (x0: number, y0: number) => finder.every((row, dy) => ETH_QR_ROWS[y0 + dy]!.slice(x0, x0 + 7) === row);
    expect(at(0, 0) && at(22, 0) && at(0, 22)).toBe(true); // top left, top right, bottom left
    const m = ETH_QR_ROWS.map((r) => r.split("").map(() => "0"));
    for (const [, x, y, w] of ETH_QR.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) m[Number(y)]![Number(x) + i] = "1";
    expect(m.map((r) => r.join(""))).toEqual([...ETH_QR_ROWS]);
  });
});
