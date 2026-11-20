import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverSessions, teamColor, teamFor } from "../server/adapters/claude-code/discover";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "disc-"));
  await mkdir(join(dir, "-Users-me-app"));
  await mkdir(join(dir, "-Users-me-other"));
  await mkdir(join(dir, "-x-observer-sessions"));
  const user = (text: string, cwd?: string) =>
    JSON.stringify({ type: "user", cwd, message: { role: "user", content: text }, timestamp: "2026-01-01T00:00:00Z" });
  await writeFile(join(dir, "-Users-me-app", `${A}.jsonl`), [user("Build the thing", "/Users/me/app"), "garbage{"].join("\n") + "\n");
  await writeFile(join(dir, "-Users-me-other", `${B}.jsonl`), "not json\n" + user("Hello there") + "\n");
  await writeFile(join(dir, "-Users-me-other", "notes.txt"), "x");
  await writeFile(join(dir, "-x-observer-sessions", `${A}.jsonl`), user("hidden", "/h") + "\n");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("discoverSessions", () => {
  it("finds sessions, cwd, title, skips observer + junk", async () => {
    const s = await discoverSessions(dir);
    expect(s).toHaveLength(2);
    const a = s.find((x) => x.id === A)!;
    expect(a.cwd).toBe("/Users/me/app");
    expect(a.title).toContain("Build the thing");
    expect(a.sizeBytes).toBeGreaterThan(0);
    const b = s.find((x) => x.id === B)!;
    expect(b.cwd).toBe("/Users/me/other"); // folder fallback
  });
  it("missing dir gives empty list", async () => {
    expect(await discoverSessions(join(dir, "nope"))).toEqual([]);
  });
});

describe("teamFor / teamColor", () => {
  it("globs and fallback", () => {
    const m = { Vibe: ["/Volumes/m2/Vibe/dolazis*"] };
    expect(teamFor("/Volumes/m2/Vibe/dolazis-api", m)).toBe("Vibe");
    expect(teamFor("/a/b/proj", m)).toBe("proj");
  });
  it("colors", () => {
    expect(teamColor("x", { x: "#fff" })).toBe("#fff");
    expect(teamColor("y", {})).toMatch(/^#[0-9a-f]{6}$/);
    expect(teamColor("y", {})).toBe(teamColor("y", {}));
  });
});
