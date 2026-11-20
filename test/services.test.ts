import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeService, type ProbeFn } from "../server/services/probe";
import { parseProcesses, scanProcesses, scanRange, scanLocal } from "../server/services/scan";
import { ServiceRegistry, publicView, MAX_SERVICES } from "../server/services/registry";
import { registerServices } from "../server/services/routes";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fakeFetch = (routes: Record<string, () => Response>, seen: { url: string; init?: RequestInit }[] = []): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    seen.push({ url: String(url), init });
    const r = routes[u.pathname];
    return r ? r() : new Response("nope", { status: 404 });
  }) as typeof fetch;
const ollama = { "/api/version": () => json({ version: "0.5.1" }), "/api/tags": () => json({ models: [{ name: "llama3" }, { name: "qwen" }, { bad: 1 }] }), "/api/ps": () => json({ models: [{ name: "llama3" }] }) };

describe("probeService", () => {
  it("ollama happy path", async () => {
    const r = await probeService({ kind: "ollama", url: "http://127.0.0.1:11434/" }, fakeFetch(ollama));
    expect(r).toMatchObject({ up: true, version: "0.5.1", models: ["llama3", "qwen"], loaded: ["llama3"] });
  });
  it("times out", async () => {
    const hang = ((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as typeof fetch;
    const r = await probeService({ kind: "ollama", url: "http://127.0.0.1:1" }, hang, 20);
    expect(r).toMatchObject({ up: false, error: "timeout" });
  });
  it("ignores malformed JSON and unknown shapes", async () => {
    const f = fakeFetch({ "/api/version": () => new Response("{oops", { status: 200 }), "/api/tags": () => json([1, 2]), "/api/ps": () => json({ models: "x" }) });
    const r = await probeService({ kind: "ollama", url: "http://h:1" }, f);
    expect(r.up).toBe(true);
    expect(r.version).toBeUndefined();
    expect(r.models).toBeUndefined();
    expect(r.loaded).toBeUndefined();
  });
  it("reports 404 as down", async () => {
    const r = await probeService({ kind: "ollama", url: "http://h:1" }, fakeFetch({}));
    expect(r).toMatchObject({ up: false, error: "http 404" });
  });
  it("lmstudio reads /v1/models; llamacpp uses /health", async () => {
    const f = fakeFetch({ "/v1/models": () => json({ data: [{ id: "m1" }] }), "/health": () => json({ status: "ok" }) });
    expect((await probeService({ kind: "lmstudio", url: "http://h:1" }, f)).models).toEqual(["m1"]);
    expect(await probeService({ kind: "llamacpp", url: "http://h:1" }, f)).toMatchObject({ up: true, models: ["m1"] });
  });
  it("opencode is a plain reachability check", async () => {
    expect((await probeService({ kind: "opencode", url: "http://h:1" }, fakeFetch({ "/": () => new Response("hi") }))).up).toBe(true);
  });
  it("sends the token as Bearer but never returns it", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const ok = await probeService({ kind: "ollama", url: "http://h:1", token: "SECRET123" }, fakeFetch(ollama, seen));
    expect((seen[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer SECRET123");
    const leaky = (async (_u: unknown, init?: RequestInit) => { throw new Error(`boom ${(init!.headers as Record<string, string>).Authorization}`); }) as typeof fetch;
    const bad = await probeService({ kind: "ollama", url: "http://h:1", token: "SECRET123" }, leaky);
    expect(JSON.stringify([ok, bad])).not.toContain("SECRET123");
    expect(bad.up).toBe(false);
  });
  it("rejects metadata IP and non-http schemes without fetching", async () => {
    const seen: { url: string }[] = [];
    const f = fakeFetch({}, seen);
    for (const url of ["http://169.254.169.254/latest", "ftp://127.0.0.1/x", "file:///etc/passwd", "nonsense"]) {
      const r = await probeService({ kind: "other", url }, f);
      expect(r.up).toBe(false);
      expect(r.error).toBeTruthy();
    }
    expect(seen).toHaveLength(0);
  });
});

describe("scan", () => {
  it("parses ps output", () => {
    const out = [" 1 /sbin/launchd", " 412 /usr/local/bin/ollama", "5521 /Applications/LM Studio.app/Contents/MacOS/LM Studio", " 77 llama-server", " 80 /bin/ollama-helper-x", "90 bash"].join("\n");
    const names = parseProcesses(out);
    expect(names).toEqual([{ name: "ollama", pid: 412 }, { name: "lm studio", pid: 5521 }, { name: "llama-server", pid: 77 }]);
    expect(names.some((n) => n.pid === 80)).toBe(false);
  });
  it("scanProcesses uses the injected runner and survives failure", async () => {
    expect(await scanProcesses(async () => "9 opencode\n")).toEqual([{ name: "opencode", pid: 9 }]);
    expect(await scanProcesses(async () => { throw new Error("x"); })).toEqual([]);
  });
  it("scanLocal returns the ports that answer", async () => {
    const probe: ProbeFn = async (s) => ({ up: s.url.endsWith(":11434"), checkedAt: 1 });
    const r = await scanLocal(probe);
    expect(r.map((c) => c.id)).toEqual(["ollama-11434"]);
    expect(r[0]).toMatchObject({ source: "scan", url: "http://127.0.0.1:11434" });
  });
  it("scanRange rejects bad input", async () => {
    const probe: ProbeFn = async () => ({ up: false, checkedAt: 1 });
    for (const bad of ["8.8.8.0/24", "192.168.0.0/16", "10.0.0.0/8", "192.168.1.0", "garbage", "192.168.1.300/24", "172.32.0.0/24", "192.168.1.0/31"]) {
      await expect(scanRange(bad, 80, probe)).rejects.toThrow();
    }
    await expect(scanRange("192.168.1.0/24", 0, probe)).rejects.toThrow(/port/);
  });
  it("scanRange accepts a /24, probes 254 hosts with limited concurrency", async () => {
    let running = 0, peak = 0; const hosts: string[] = [];
    const probe: ProbeFn = async (s) => {
      running++; peak = Math.max(peak, running); hosts.push(s.url);
      await new Promise((r) => setTimeout(r, 1)); running--;
      return { up: s.url.includes("192.168.1.7:"), checkedAt: 1 };
    };
    const r = await scanRange("192.168.1.0/24", 11434, probe);
    expect(hosts).toHaveLength(254);
    expect(peak).toBeLessThanOrEqual(32);
    expect(r.map((c) => c.url)).toEqual(["http://192.168.1.7:11434"]);
  });
});

describe("registry", () => {
  beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });
  const input = (n: number) => ({ name: `s${n}`, url: `http://127.0.0.1:${2000 + n}`, kind: "other" });
  it("adds, gets, removes", () => {
    const r = new ServiceRegistry();
    const s = r.add({ name: "Ollama", url: "http://127.0.0.1:11434/", kind: "ollama" });
    expect(s.url).toBe("http://127.0.0.1:11434");
    expect(r.get(s.id)?.name).toBe("Ollama");
    expect(new ServiceRegistry().list()).toHaveLength(1);
    expect(r.remove(s.id)).toBe(true);
    expect(r.remove(s.id)).toBe(false);
  });
  it("validates input and rejects duplicates and overflow", () => {
    const r = new ServiceRegistry();
    expect(() => r.add({ ...input(1), name: "x".repeat(61) })).toThrow();
    expect(() => r.add({ ...input(1), url: "ftp://x" })).toThrow();
    expect(() => r.add({ ...input(1), kind: "nope" })).toThrow();
    r.add(input(1));
    expect(() => r.add({ ...input(1), name: "again" })).toThrow(/already/);
    for (let i = 2; i <= MAX_SERVICES; i++) r.add(input(i));
    expect(() => r.add(input(99))).toThrow(/at most/);
  });
  it("publicView strips the token", () => {
    const s = new ServiceRegistry().add({ ...input(1), token: "SECRET123" });
    const v = publicView(s);
    expect(JSON.stringify(v)).not.toContain("SECRET123");
    expect(v.hasToken).toBe(true);
  });
});

describe("routes", () => {
  let app: ReturnType<typeof Fastify>; let changes = 0;
  beforeEach(async () => {
    process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); changes = 0;
    app = Fastify(); registerServices(app, () => { changes++; }, { fetchImpl: fakeFetch(ollama) }); await app.ready();
  });
  it("adds, lists without token, tests, removes", async () => {
    const added = await app.inject({ method: "POST", url: "/api/services", payload: { name: "Ollama", url: "http://127.0.0.1:11434", kind: "ollama", token: "SECRET123" } });
    expect(added.statusCode).toBe(200);
    const id = added.json().id;
    const list = await app.inject({ method: "GET", url: "/api/services" });
    expect(list.body).not.toContain("SECRET123");
    expect(list.json()[0].hasToken).toBe(true);
    const t = await app.inject({ method: "POST", url: `/api/services/${id}/test` });
    expect(t.json()).toMatchObject({ id, up: true, models: ["llama3", "qwen"] });
    expect(t.body).not.toContain("SECRET123");
    expect((await app.inject({ method: "GET", url: "/api/services" })).json()[0].status.up).toBe(true);
    expect((await app.inject({ method: "DELETE", url: `/api/services/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/services/${id}` })).statusCode).toBe(404);
    expect(changes).toBeGreaterThan(0);
  });
  it("returns 400/409 for bad input and duplicates", async () => {
    const p = { name: "a", url: "http://127.0.0.1:1", kind: "other" };
    expect((await app.inject({ method: "POST", url: "/api/services", payload: { ...p, url: "ftp://x" } })).statusCode).toBe(400);
    await app.inject({ method: "POST", url: "/api/services", payload: p });
    expect((await app.inject({ method: "POST", url: "/api/services", payload: p })).statusCode).toBe(409);
  });
  it("scan does not save; adopt saves chosen candidates", async () => {
    const scan = await app.inject({ method: "POST", url: "/api/services/scan", payload: {} });
    const found = scan.json().candidates;
    expect(found.map((c: { id: string }) => c.id)).toContain("ollama-11434");
    expect((await app.inject({ method: "GET", url: "/api/services" })).json()).toHaveLength(0);
    const adopted = await app.inject({ method: "POST", url: "/api/services/adopt", payload: { ids: ["ollama-11434", "bogus"] } });
    expect(adopted.json()).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/services" })).json()).toHaveLength(1);
  });
  it("range scan rejects public ranges", async () => {
    const r = await app.inject({ method: "POST", url: "/api/services/scan", payload: { range: "8.8.8.0/24", port: 80 } });
    expect(r.statusCode).toBe(400);
  });
});
