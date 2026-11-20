import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { registerBoard } from "../server/board/routes";
import { RunManager } from "../server/adapters/claude-code/command";

let app: ReturnType<typeof Fastify>; let runs: RunManager;
const company = { sessions: new Map([["s1", { id: "s1", cwd: "/p", file: "", title: "t", mtimeMs: 0, sizeBytes: 0 }]]) } as never;
beforeEach(async () => {
  process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-"));
  runs = new RunManager(() => false, resolve("test/bin/fake-claude.mjs"));
  app = Fastify(); registerBoard(app, company, runs); await app.ready();
});

describe("board", () => {
  it("assign starts a run, moves to in_progress, then review — never done", async () => {
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "Do it" } })).json();
    expect(card.column).toBe("backlog");
    const a = (await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { cwd: "/p" } })).json();
    expect(a.column).toBe("in_progress"); expect(a.runId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1200));
    const cards = (await app.inject({ method: "GET", url: "/api/board" })).json();
    expect(cards[0].column).toBe("review");
  });
  it("rejects unknown cwd", async () => {
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "x" } })).json();
    const r = await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { cwd: "/nope" } });
    expect(r.statusCode).toBe(400);
  });

  it("assign with fork starts a new worker from the session and never writes into it", async () => {
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "x" } })).json();
    const a = (await app.inject({ method: "POST", url: `/api/board/${card.id}/assign`, payload: { session: "s1", fork: true } })).json();
    expect(a.column).toBe("in_progress");
    expect(a.runId).toBeTruthy();
    expect(a.session).toBeUndefined();
  });

  it("archives and restores a card without deleting it", async () => {
    const card = (await app.inject({ method: "POST", url: "/api/board", payload: { title: "keep me" } })).json();
    const a = (await app.inject({ method: "PATCH", url: `/api/board/${card.id}`, payload: { archived: true } })).json();
    expect(a.archived).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/board" })).json()).toHaveLength(1);
    const r = (await app.inject({ method: "PATCH", url: `/api/board/${card.id}`, payload: { archived: false } })).json();
    expect(r.archived).toBeUndefined();
    expect((await app.inject({ method: "PATCH", url: `/api/board/${card.id}`, payload: { archived: "yes" } })).statusCode).toBe(400);
  });
});
