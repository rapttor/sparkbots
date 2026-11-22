import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAll, validateThread, hasBanned, type SimThread } from "../src/simchat/schema";
import { pickThread, follow, shouldInitiate, chainTarget } from "../src/simchat/engine";

const dir = join(__dirname, "../src/simchat/threads");
const threads: SimThread[] = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as SimThread[]);

describe("bundled simulated-chat threads", () => {
  it("has 100+ threads covering all four topics", () => {
    expect(threads.length).toBeGreaterThanOrEqual(100);
    for (const t of ["games", "cars", "life", "work"]) expect(threads.filter((x) => x.topic === t).length).toBeGreaterThanOrEqual(20);
  });
  it("passes the schema validator (reachability, unique option ids, chains, PG-13 word list)", () => {
    expect(validateAll(threads)).toEqual([]);
  });
  it("option ids are unique across the whole set", () => {
    const ids = threads.flatMap((t) => Object.values(t.nodes).flatMap((n) => (n.options ?? []).map((o) => o.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every node is reachable from its start node", () => {
    for (const t of threads) {
      const seen = new Set<string>(); const stack = [t.start];
      while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); (t.nodes[id].options ?? []).forEach((o) => stack.push(o.next)); }
      expect(Object.keys(t.nodes).filter((n) => !seen.has(n)), t.id).toEqual([]);
    }
  });
});

describe("validator catches problems", () => {
  const base = (): SimThread => ({ id: "t", topic: "life", title: "T", rating: "G", start: "a", nodes: {
    a: { say: ["hi"], options: [{ id: "o1", label: "x", next: "b" }] }, b: { say: ["bye"], end: true } } });
  it("accepts a good thread", () => expect(validateThread(base())).toEqual([]));
  it("flags unreachable nodes", () => { const t = base(); t.nodes.c = { say: ["x"], end: true }; expect(validateThread(t).join()).toMatch(/unreachable/); });
  it("flags duplicate option ids", () => { const t = base(); t.nodes.a.options!.push({ id: "o1", label: "y", next: "b" }); expect(validateThread(t).join()).toMatch(/duplicate option/); });
  it("flags missing targets, banned words and bad schema", () => {
    const t = base(); t.nodes.a.options![0].next = "zz"; expect(validateThread(t).join()).toMatch(/missing node/);
    const u = base(); u.nodes.b.say = ["what the fuck"]; expect(validateThread(u).join()).toMatch(/banned/);
    expect(validateThread({ id: "x" }).length).toBeGreaterThan(0);
    expect(hasBanned("a classic assassin")).toBeNull();
  });
});

describe("engine", () => {
  it("prefers unseen threads and follows options", () => {
    const first = threads[0];
    expect(pickThread(threads, threads.filter((t) => t !== first).map((t) => t.id), () => 0)?.id).toBe(first.id);
    const o = first.nodes[first.start].options![0];
    expect(follow(first, first.start, o.id)?.id).toBe(o.next);
    expect(follow(first, first.start, "nope")).toBeNull();
  });
  it("chains to a same-topic thread", () => {
    const t = threads[0];
    expect(chainTarget({ say: [], end: true, chain: "random" }, t, threads, [])?.topic).toBe(t.topic);
  });
  it("initiates only when idle long enough, off cooldown, and the roll hits", () => {
    expect(shouldInitiate({ idleMs: 120_000, sinceLastMs: 700_000, roll: 0.1 })).toBe(true);
    expect(shouldInitiate({ idleMs: 10_000, sinceLastMs: 700_000, roll: 0.1 })).toBe(false);
    expect(shouldInitiate({ idleMs: 120_000, sinceLastMs: 1000, roll: 0.1 })).toBe(false);
    expect(shouldInitiate({ idleMs: 120_000, sinceLastMs: 700_000, roll: 0.9 })).toBe(false);
  });
});

describe("no network at runtime", () => {
  it("simchat sources never reference fetch, XHR, WebSocket or http URLs", () => {
    const src = join(__dirname, "../src/simchat");
    for (const f of readdirSync(src).filter((x) => /\.tsx?$/.test(x))) {
      const text = readFileSync(join(src, f), "utf8");
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|https?:\/\//);
    }
  });
});

import { step, typedChars, typingMs, AUTO_DELAY_MS, distanceStep, optionForKey, revealFrom, NEAR, FAR, ARM_TIMEOUT_MS } from "../src/simchat/pacing";

describe("pacing", () => {
  const base = { len: 30, speed: "normal" as const, auto: true, hasOptions: false };
  it("types at the configured speed (30 chars/s normal, instant shows all)", () => {
    expect(typedChars(1000, 100, "normal")).toBe(30);
    expect(typedChars(0, 100, "normal")).toBe(0);
    expect(typedChars(5, 100, "instant")).toBe(100);
    expect(typingMs(30, "normal")).toBe(1000);
  });
  it("auto-advances to the next agent line 3 s after typing finished, not before", () => {
    expect(step({ ...base, elapsedMs: 1000 + AUTO_DELAY_MS - 1, next: "bot" }).advance).toBe(false);
    expect(step({ ...base, elapsedMs: 1000 + AUTO_DELAY_MS, next: "bot" }).advance).toBe(true);
  });
  it("manual mode never auto-advances but offers continue", () => {
    const o = step({ ...base, auto: false, elapsedMs: 60_000, next: "bot" });
    expect(o.advance).toBe(false); expect(o.canContinue).toBe(true);
  });
  it("my own line follows as soon as the previous one is done; no continue while typing", () => {
    expect(step({ ...base, elapsedMs: 1000, next: "me" }).advance).toBe(true);
    expect(step({ ...base, elapsedMs: 200, next: "bot" }).canContinue).toBe(false);
  });
  it("shows options only on the last, finished line", () => {
    expect(step({ ...base, hasOptions: true, elapsedMs: 5000, next: null }).showOptions).toBe(true);
    expect(step({ ...base, hasOptions: true, elapsedMs: 100, next: null }).showOptions).toBe(false);
    expect(step({ ...base, hasOptions: true, elapsedMs: 5000, next: "bot" }).showOptions).toBe(false);
  });
  it("distance rule has hysteresis and a grace period", () => {
    expect(distanceStep(FAR + 1, false, 1000)).toEqual({ armed: false, end: false });   // opened from afar, still flying in
    expect(distanceStep(NEAR - 1, false, 1000)).toEqual({ armed: true, end: false });
    expect(distanceStep((NEAR + FAR) / 2, true, 1000).end).toBe(false);                   // between: no flicker
    expect(distanceStep(FAR + 0.1, true, 1000).end).toBe(true);
    expect(distanceStep(FAR + 1, false, ARM_TIMEOUT_MS + 1).end).toBe(true);
  });
  it("keys 1-9 pick options; others do not", () => {
    expect(optionForKey("2", 3)).toBe(1); expect(optionForKey("4", 3)).toBe(-1); expect(optionForKey("0", 3)).toBe(-1); expect(optionForKey("a", 3)).toBe(-1);
  });
  it("reveals unread lines one by one, else repeats the last line", () => {
    expect(revealFrom(10, 3)).toBe(7); expect(revealFrom(10, 0)).toBe(9); expect(revealFrom(0, 0)).toBe(0);
  });
});
