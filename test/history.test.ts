import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History } from "../server/history";

beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });
const w = (state: string, activity = "idle") => ({ session: "s1", team: "t", title: "job", state, activity });

describe("history", () => {
  it("records a working span and persists it", () => {
    const h = new History();
    h.observe(w("idle"), 0);
    h.observe(w("working", "coding"), 1000);
    h.observe(w("working", "testing"), 20_000);
    expect(h.list()[0]).toMatchObject({ end: null, activities: ["coding", "testing"] });
    h.observe(w("done"), 61_000);
    const [s] = h.list();
    expect(s).toMatchObject({ start: 1000, end: 61_000, waited: false });
    expect(new History().list()).toHaveLength(1); // survives a restart
  });
  it("marks waits and drops blips under 5 s", () => {
    const h = new History();
    h.observe(w("working"), 0); h.observe(w("idle"), 2000);
    expect(h.list()).toHaveLength(0);
    h.observe(w("working"), 10_000); h.observe(w("waiting"), 20_000); h.observe(w("idle"), 40_000);
    expect(h.list()[0]!.waited).toBe(true);
  });
});
