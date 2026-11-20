import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RunManager, buildArgs, CommandError, type RunEvent } from "../server/adapters/claude-code/command";

const FAKE = resolve("test/bin/fake-claude.mjs");
beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("commands", () => {
  it("passes a shell-injection prompt as one literal argv entry", async () => {
    const m = new RunManager(() => false, FAKE);
    const seen: RunEvent[] = []; m.listeners.add((e) => seen.push(e));
    const evil = `"; rm -rf ~`;
    m.send("s1", process.cwd(), evil);
    await wait(500);
    const argv = (seen[0].line as { argv: string[] }).argv;
    expect(argv[argv.indexOf("-p") + 1]).toBe(evil);
  });
  it("rejects sends to a session live in a terminal (409)", () => {
    const m = new RunManager((s) => s === "live", FAKE);
    expect(() => m.send("live", process.cwd(), "hi")).toThrow(CommandError);
    expect(() => m.send("live", process.cwd(), "hi")).toThrow(/live in a terminal/);
  });
  it("allows forking a live session", () => {
    const m = new RunManager((s) => s === "live", FAKE);
    expect(() => m.send("live", process.cwd(), "hi", { fork: true })).not.toThrow();
  });
  it("never allows bypassPermissions or the skip flag", () => {
    expect(() => buildArgs("x", "s", { permissionMode: "bypassPermissions" })).toThrow();
    expect(buildArgs("x", "s", {}).join(" ")).not.toContain("dangerously");
  });
  it("queues a second message while a run is active", async () => {
    const m = new RunManager(() => false, FAKE);
    const a = m.send("s2", process.cwd(), "one"); const b = m.send("s2", process.cwd(), "two");
    expect(a.queued).toBe(false); expect(b.queued).toBe(true);
    await wait(1000);
    expect(m.runs.filter((r) => r.session === "s2" || r.session === "fake-session").length).toBeGreaterThanOrEqual(2);
  });
  it("marks previously-running runs as orphaned after restart", () => {
    const m1 = new RunManager(() => false, FAKE);
    m1.runs.push({ runId: "r", cwd: "/", prompt: "p", pid: process.pid, status: "running", startedAt: 1 });
    (m1 as unknown as { persist(): void }).persist();
    const m2 = new RunManager(() => false, FAKE);
    expect(m2.runs.find((r) => r.runId === "r")?.status).toBe("orphaned");
  });
});

describe("buildArgs model", () => {
  it("passes a model alias or id as --model, and rejects anything flag-like", async () => {
    const { buildArgs } = await import("../server/adapters/claude-code/command");
    expect(buildArgs("hi", "s1", { model: "sonnet" })).toEqual(expect.arrayContaining(["--model", "sonnet"]));
    expect(buildArgs("hi", undefined, { model: "claude-haiku-5-5" })).toContain("claude-haiku-5-5");
    expect(buildArgs("hi", undefined, {})).not.toContain("--model");
    expect(() => buildArgs("hi", undefined, { model: "--dangerously-skip-permissions" })).toThrow();
    expect(() => buildArgs("hi", undefined, { model: "a b" })).toThrow();
  });
});

describe("cleanEnv", () => {
  it("drops ANTHROPIC_* variables and keeps the rest", async () => {
    const { cleanEnv } = await import("../server/adapters/claude-code/command");
    const out = cleanEnv({ ANTHROPIC_BASE_URL: "x", ANTHROPIC_AUTH_TOKEN: "y", PATH: "/bin", HOME: "/h" });
    expect(out).toEqual({ PATH: "/bin", HOME: "/h" });
  });
});
