import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { registerBoard } from "../server/board/routes";
import { RunManager } from "../server/adapters/claude-code/command";
import { setRunTracker } from "../server/adapters/opencode/command";

const SID = "ses_abc123";
let app: ReturnType<typeof Fastify>; let runs: RunManager;
const company = {
  sessions: new Map([[`opencode:${SID}`, { id: `opencode:${SID}`, source: "opencode", cwd: "/tmp", title: "t", mtimeMs: 0, sizeBytes: 0 }]]),
  cfg: { opencodeModel: "" }, teams: { merges: {}, overrides: {} },
} as never;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-"));
  process.env.OPENCODE_BIN = resolve("test/bin/fake-opencode.mjs");
  runs = new RunManager(() => false);
  setRunTracker(runs);
  app = Fastify(); registerBoard(app, company, runs); await app.ready();
});

describe("opencode runs", () => {
  it("card assignment tracks the run and moves to review, never done", async () => {
    process.env.FAKE_MS = "300";
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "Do it" } })).json();
    const a = (await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { session: `opencode:${SID}` } })).json();
    expect(a.column).toBe("in_progress"); expect(a.runId).toBeTruthy(); expect(a.session).toBe(`opencode:${SID}`);
    expect(runs.runs.find((r) => r.runId === a.runId)?.status).toBe("running");
    await wait(1200);
    const cards = (await app.inject({ method: "GET", url: "/api/board" })).json();
    expect(cards[0].column).toBe("review");
  });
  it("stop SIGTERMs the office-owned child only", async () => {
    process.env.FAKE_MS = "20000";
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "Long" } })).json();
    const a = (await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { session: `opencode:${SID}` } })).json();
    runs.stop(a.runId);
    await wait(500);
    expect(runs.runs.find((r) => r.runId === a.runId)?.status).toBe("stopped");
    expect(() => runs.stop("not-ours")).toThrow();
    await wait(50);
  });
  it("a restart shows a still-alive run as orphaned", async () => {
    process.env.FAKE_MS = "20000";
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "Orphan" } })).json();
    const a = (await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { session: `opencode:${SID}` } })).json();
    const again = new RunManager(() => false);
    expect(again.runs.find((r) => r.runId === a.runId)?.status).toBe("orphaned");
    runs.stop(a.runId);
    await wait(300);
  });
});
