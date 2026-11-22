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
