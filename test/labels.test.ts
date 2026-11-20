import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LabelStore, LabelError } from "../server/labels";

beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });

describe("labels", () => {
  it("has defaults and persists team labels", () => {
    const a = new LabelStore(); expect(a.defs.map((d) => d.id)).toContain("abandoned");
    a.setTeam("proj", ["finished", "current"]);
    expect(new LabelStore().forTeam("proj")).toEqual(["finished", "current"]);
  });
  it("drops unknown ids and clears empty", () => {
    const a = new LabelStore(); a.setTeam("p", ["nope"]); expect(a.forTeam("p")).toEqual([]); expect(a.teams.p).toBeUndefined();
    expect(() => a.setTeam("p", "x")).toThrow(LabelError);
  });
  it("create validates, rejects duplicates; remove cleans team assignments", () => {
    const a = new LabelStore(); const d = a.create("Idea", "#112233", true);
    expect(() => a.create("idea", "#fff", true)).toThrow(/exists/); expect(() => a.create("", "", true)).toThrow(LabelError);
    a.setTeam("p", [d.id, "current"]); a.remove(d.id); expect(a.forTeam("p")).toEqual(["current"]);
    expect(a.create("Bad", "red", false).color).toBe("#60a5fa");
  });
});
