import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, loadJson, loadTeams, saveJson } from "../server/config";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ao-"));
  process.env.AO_HOME = dir;
});
afterEach(() => {
  delete process.env.AO_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("returns defaults when file is missing", () => {
    expect(loadConfig().port).toBe(4317);
    expect(loadConfig().opencodeModel).toBe("");
    expect(loadTeams().merges).toEqual({});
  });
  it("returns defaults when file is corrupt", () => {
    fs.writeFileSync(path.join(dir, "config.json"), "{not json");
    expect(loadConfig().idleThresholdSec).toBe(15);
  });
  it("round trips and stamps schemaVersion", () => {
    saveJson("config.json", { port: 9999 });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
    expect(raw.schemaVersion).toBe(1);
    expect(loadConfig().port).toBe(9999);
    expect(loadConfig().historyDays).toBe(14);
  });
  it("creates nested dir and leaves no tmp files", () => {
    process.env.AO_HOME = path.join(dir, "a", "b");
    saveJson("x.json", { k: 1 });
    expect(loadJson("x.json", { k: 0 }).k).toBe(1);
    expect(fs.readdirSync(process.env.AO_HOME).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
