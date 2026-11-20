import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerNotes, validateNoteInput, NOTE_COLORS, MAX_NOTES } from "../server/notes";

let app: ReturnType<typeof Fastify>; let changes = 0;
beforeEach(async () => {
  process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-"));
  changes = 0;
  app = Fastify(); registerNotes(app, () => { changes++; }); await app.ready();
});

describe("validateNoteInput", () => {
  it("keeps only valid known fields", () => {
    expect(validateNoteInput({ text: " hi ", color: NOTE_COLORS[2], x: 0.5, y: 0, junk: 1 })).toEqual({ text: "hi", color: NOTE_COLORS[2], x: 0.5, y: 0 });
  });
  it("rejects bad input", () => {
    for (const b of [null, [], { text: "" }, { text: "  " }, { text: 5 }, { text: "x".repeat(501) }, { color: "#000000" }, { x: 2 }, { y: -0.1 }, { x: "a" }, { x: NaN }])
      expect(() => validateNoteInput(b)).toThrow();
  });
});

describe("notes routes", () => {
  it("create, list, patch, delete", async () => {
    const n = (await app.inject({ method: "POST", url: "/api/notes", payload: { text: "Buy milk" } })).json();
    expect(n.color).toBe(NOTE_COLORS[0]);
    const p = (await app.inject({ method: "PATCH", url: `/api/notes/${n.id}`, payload: { text: "Buy oat milk", x: 0.9 } })).json();
    expect(p.text).toBe("Buy oat milk"); expect(p.x).toBe(0.9);
    expect((await app.inject({ method: "GET", url: "/api/notes" })).json().notes).toHaveLength(1);
    await app.inject({ method: "DELETE", url: `/api/notes/${n.id}` });
    expect((await app.inject({ method: "GET", url: "/api/notes" })).json().notes).toHaveLength(0);
    expect(changes).toBe(3);
  });
  it("returns 400 for bad input, unknown id and over the limit", async () => {
    expect((await app.inject({ method: "POST", url: "/api/notes", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/notes", payload: { text: "a", color: "red" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/api/notes/nope", payload: { text: "a" } })).statusCode).toBe(400);
    for (let i = 0; i < MAX_NOTES; i++) await app.inject({ method: "POST", url: "/api/notes", payload: { text: `n${i}` } });
    expect((await app.inject({ method: "POST", url: "/api/notes", payload: { text: "one more" } })).statusCode).toBe(400);
  });
});
