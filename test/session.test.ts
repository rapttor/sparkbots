import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearSession, readSession, writeSession } from "../server/session";

describe("session.json (the running server, for landing.sh)", () => {
  let dir = "";
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ao-session-")); process.env.AO_HOME = dir; });
  afterEach(() => { delete process.env.AO_HOME; rmSync(dir, { recursive: true, force: true }); });
  const URL = "http://127.0.0.1:4317/?t=" + "ab12".repeat(12);

  it("is written for this process, readable only by you, found alive, and removed again", () => {
    writeSession(URL, 4317);
    expect((statSync(join(dir, "session.json")).mode & 0o777).toString(8)).toBe("600");
    expect(readSession()).toMatchObject({ url: URL, port: 4317, pid: process.pid });
    clearSession();
    expect(existsSync(join(dir, "session.json"))).toBe(false);
    expect(readSession()).toBeNull();
  });
  it("is ignored when the process is gone, the address is not our loopback address, or the file is corrupt", () => {
    writeFileSync(join(dir, "session.json"), JSON.stringify({ url: URL, port: 4317, pid: 2 ** 22 + 12345, startedAt: 1 }));
    expect(readSession()).toBeNull();                                                  // no such process
    writeFileSync(join(dir, "session.json"), JSON.stringify({ url: "https://evil.example/?t=ab", port: 1, pid: process.pid, startedAt: 1 }));
    expect(readSession()).toBeNull();                                                  // not 127.0.0.1
    writeFileSync(join(dir, "session.json"), "{nope");
    expect(readSession()).toBeNull();
  });
  it("never removes another server's file", () => {
    writeFileSync(join(dir, "session.json"), JSON.stringify({ url: URL, port: 4317, pid: process.pid + 1, startedAt: 1 }));
    clearSession();
    expect(existsSync(join(dir, "session.json"))).toBe(true);
  });
});
