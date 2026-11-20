import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readLiveness } from "../server/adapters/claude-code/liveness";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "live-"));
  const w = (n: string, o: unknown) => writeFile(join(dir, n), typeof o === "string" ? o : JSON.stringify(o));
  await w("a.json", { pid: process.pid, sessionId: "alive", cwd: "/x", startedAt: 5, kind: "interactive" });
  await w("b.json", { pid: 999999, sessionId: "dead", kind: "interactive" });
  await w("c.json", "{not json");
  await w("d.json", { pid: process.pid, kind: "sdk" });
  await w("e.json", { pid: process.pid, sessionId: "sdk", kind: "sdk" });
  await w("f.json", { pid: process.pid, sessionId: "odd", kind: "weird" });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("readLiveness", () => {
  it("keeps live pids, drops dead/invalid", async () => {
    const m = await readLiveness(dir);
    expect([...m.keys()].sort()).toEqual(["alive", "odd", "sdk"]);
    expect(m.get("alive")).toEqual({ pid: process.pid, kind: "interactive", startedAt: 5 });
    expect(m.get("sdk")?.kind).toBe("headless");
    expect(m.get("odd")?.kind).toBe("unknown");
  });
  it("missing dir gives empty map", async () => {
    expect((await readLiveness(join(dir, "nope"))).size).toBe(0);
  });
});
