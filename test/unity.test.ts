import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RELAY, UNITY_BUBBLE_MS, UNITY_MAX_GHOSTS, ago, cleanText, clampToFloor, emptyRoom, parseMsg, pruneBubbles, reduceRoom, relayUrl, validRelay,
  type UGhost, type UPeer,
} from "../src/shared/unity";
import { defaultConfig, aoHome, type Config } from "../server/config";
import { registerUnity, unityKey } from "../server/unity";

const id = (n: number) => n.toString(16).padStart(16, "0");
const peer = (n: number, over: Partial<UPeer> = {}): UPeer => ({ id: id(n), name: `P${n}`, color: "#112233", x: 0, y: 0, z: 0, r: 0, ...over });
const ghost = (n: number, leftAt: number, text = ""): UGhost => ({ ...peer(n), text, leftAt });

describe("unity: parsing relay frames (the relay is not trusted)", () => {
  it("accepts a welcome and cleans every field", () => {
    const m = parseMsg(JSON.stringify({ t: "welcome", id: id(1), peers: [{ id: id(2), name: "  Al​ice‮ ", color: "#ff0000", x: 1, y: 2, z: 3, r: 4 }], ghosts: [{ id: id(3), name: "G", color: "nope", x: 0, y: 0, z: 0, r: 0, text: "hi​ there", leftAt: 5 }] }));
    expect(m?.t).toBe("welcome");
    if (m?.t !== "welcome") return;
    expect(m.peers[0]!.name).toBe("Alice");
    expect(m.ghosts[0]!.color).toBe("#4fc3f7"); // bad colour replaced
    expect(m.ghosts[0]!.text).toBe("hi there");
  });
  it("drops malformed frames", () => {
    for (const raw of ["", "nope", "[]", "null", JSON.stringify({ t: "wat" }), JSON.stringify({ t: "pos", id: "short", x: 1 }), JSON.stringify({ t: "say", id: id(1), text: "   " }), JSON.stringify({ t: "welcome", id: "x" })]) expect(parseMsg(raw)).toBeNull();
    expect(parseMsg("x".repeat(70_000))).toBeNull();
  });
  it("clamps numbers and ignores non-numbers", () => {
    const m = parseMsg(JSON.stringify({ t: "pos", id: id(1), x: 1e9, y: "a", z: -1e9, r: NaN }));
    expect(m).toEqual({ t: "pos", id: id(1), x: 1e4, y: 0, z: -1e4, r: 0 });
  });
  it("bubble text is plain, capped at 80, without invisible characters", () => {
    expect(cleanText("a‮​  b\n\nc", 80)).toBe("a b c");
    expect(cleanText("x".repeat(200), 80)).toHaveLength(80);
    expect(cleanText(42, 80)).toBe("");
    const m = parseMsg(JSON.stringify({ t: "say", id: id(1), text: "<img src=x onerror=alert(1)>" }));
    expect(m).toEqual({ t: "say", id: id(1), text: "<img src=x onerror=alert(1)>" }); // kept as text; React renders it escaped
  });
});

describe("unity: room state", () => {
  const welcome = (peers: UPeer[] = [], ghosts: UGhost[] = []) => reduceRoom(emptyRoom(), { t: "welcome", id: id(1), peers, ghosts }, 0);

  it("welcome lists others, never me, and newest ghosts first", () => {
    const s = welcome([peer(1), peer(2)], [ghost(5, 10), ghost(6, 30), ghost(1, 99)]);
    expect(Object.keys(s.peers)).toEqual([id(2)]);
    expect(s.ghosts.map((g) => g.id)).toEqual([id(6), id(5)]);
  });
  it("a join removes that person's ghost", () => {
    const s = reduceRoom(welcome([], [ghost(5, 10)]), { t: "join", peer: peer(5) }, 0);
    expect(s.peers[id(5)]).toBeDefined();
    expect(s.ghosts).toHaveLength(0);
  });
  it("a leave with a ghost turns the person into a ghost; without one they just go", () => {
    let s = reduceRoom(welcome(), { t: "join", peer: peer(2) }, 0);
    s = reduceRoom(s, { t: "leave", id: id(2), ghost: ghost(2, 50, "bye") }, 0);
    expect(s.peers[id(2)]).toBeUndefined();
    expect(s.ghosts[0]).toMatchObject({ id: id(2), text: "bye" });
    s = reduceRoom(s, { t: "leave", id: id(2) }, 0);
    expect(s.ghosts).toHaveLength(0);
  });
  it("ghosts are capped", () => {
    let s = welcome();
    for (let i = 10; i < 10 + UNITY_MAX_GHOSTS + 5; i++) s = reduceRoom(s, { t: "leave", id: id(i), ghost: ghost(i, i) }, 0);
    expect(s.ghosts).toHaveLength(UNITY_MAX_GHOSTS);
  });
  it("bubbles expire, and say from a stranger is ignored", () => {
    let s = reduceRoom(welcome([peer(2)]), { t: "say", id: id(2), text: "hello" }, 1000);
    expect(s.bubbles[id(2)]).toEqual({ text: "hello", until: 1000 + UNITY_BUBBLE_MS });
    expect(pruneBubbles(s, 1000 + UNITY_BUBBLE_MS - 1)).toBe(s); // same object: nothing to re-render
    expect(pruneBubbles(s, 1000 + UNITY_BUBBLE_MS).bubbles).toEqual({});
    s = reduceRoom(s, { t: "say", id: id(9), text: "ghost talking" }, 1000);
    expect(s.bubbles[id(9)]).toBeUndefined();
  });
});

describe("unity: helpers", () => {
  it("relay addresses", () => {
    expect(validRelay(DEFAULT_RELAY)).toBe(true);
    expect(validRelay("wss://example.com:8443")).toBe(true);
    expect(validRelay("ws://127.0.0.1:8787")).toBe(true);
    expect(validRelay("ws://example.com")).toBe(false);    // plain ws only for this machine
    expect(validRelay("https://example.com")).toBe(false);
    expect(validRelay("wss://exa mple.com")).toBe(false);
    expect(validRelay("wss://example.com/room/x")).toBe(false);
    expect(validRelay(42)).toBe(false);
    expect(relayUrl("wss://x.dev/")).toBe("wss://x.dev/room/unity");
  });
  it("ago", () => {
    expect(ago(0, 30_000)).toBe("just now");
    expect(ago(0, 5 * 60_000)).toBe("5 min ago");
    expect(ago(0, 3 * 3600_000)).toBe("3 h ago");
    expect(ago(0, 86400_000)).toBe("1 day ago");
    expect(ago(0, 2 * 86400_000)).toBe("2 days ago");
  });
  it("ghosts stay on the floor", () => {
    const c = clampToFloor(100, 0);
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(13);
    expect(clampToFloor(1, 1)).toEqual({ x: 1, z: 1 });
  });
});

describe("unity: server settings and identity", () => {
  beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });

  it("creates the secret once, as 32 url-safe characters, readable only by the owner", () => {
    const a = unityKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(unityKey()).toBe(a);
    if (process.platform !== "win32") expect(statSync(join(aoHome(), "unity.json")).mode & 0o077).toBe(0);
  });

  const build = () => {
    const cfg: Config = { ...defaultConfig };
    const app = Fastify();
    registerUnity(app, () => cfg);
    return { app, cfg };
  };

  it("is off by default and does not hand out the secret", async () => {
    const { app } = build();
    const r = await app.inject({ method: "GET", url: "/api/unity" });
    expect(r.json()).toEqual({ enabled: false, name: "", ghost: true, relay: DEFAULT_RELAY });
  });
  it("switching on returns the secret; switching off stops returning it", async () => {
    const { app } = build();
    const on = (await app.inject({ method: "PUT", url: "/api/unity", payload: { enabled: true, name: "Em​ir" } })).json();
    expect(on).toMatchObject({ enabled: true, name: "Emir", key: unityKey() });
    const off = (await app.inject({ method: "PUT", url: "/api/unity", payload: { enabled: false } })).json();
    expect(off.key).toBeUndefined();
  });
  it("rejects bad input", async () => {
    const { app } = build();
    for (const payload of [{ enabled: "yes" }, { ghost: 1 }, { name: 5 }, { relay: "http://evil.example" }, { relay: "ws://evil.example" }]) {
      expect((await app.inject({ method: "PUT", url: "/api/unity", payload })).statusCode).toBe(400);
    }
  });
});
