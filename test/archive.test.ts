import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Archive, ArchiveError } from "../server/archive";

beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });

describe("archive", () => {
  it("needs an explicit confirm, refuses live terminal sessions, restores, and persists", () => {
    const a = new Archive();
    expect(() => a.set("s1", true, undefined, false)).toThrow(ArchiveError);
    expect(() => a.set("s1", true, "yes", false)).toThrow(ArchiveError);
    expect(() => a.set("s1", true, true, true)).toThrow(/live in a terminal/);
    expect(() => a.set("s1", "true", true, false)).toThrow(ArchiveError);
    a.set("s1", true, true, false);
    expect(a.has("s1")).toBe(true);
    expect(new Archive().has("s1")).toBe(true);
    a.set("s1", false, undefined, false);
    expect(new Archive().has("s1")).toBe(false);
  });
});
