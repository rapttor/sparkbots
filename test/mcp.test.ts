import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listMcp } from "../server/mcp";

const fx = path.join(__dirname, "fixtures/mcp");
function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-"));
  const proj = path.join(dir, "proj"); cpSync(path.join(fx, "proj"), proj, { recursive: true });
  writeFileSync(path.join(dir, ".claude.json"), readFileSync(path.join(fx, "home/claude.json"), "utf8").replace("PROJ", proj));
  return { dir, proj };
}

describe("listMcp", () => {
  it("groups by project, hides secrets, honours disabled, skips bad entries", () => {
    const { dir, proj } = setup();
    const r = listMcp([proj], dir);
    expect(r.map((p) => p.project)).toEqual(["", proj]);
    const servers = r[1].servers;
    expect(servers.map((s) => s.name).sort()).toEqual(["db", "loc", "web"]);
    const db = servers.find((s) => s.name === "db")!;
    expect(db.envKeys).toEqual(["DB_PASSWORD"]);
    expect(db.args).toEqual(["-y", "db-mcp", "--api-key=***", "--token", "***"]);
    const web = servers.find((s) => s.name === "web")!;
    expect(web.disabled).toBe(true);
    expect(web.url).toBe("https://example.com/mcp");
    expect(web.headerKeys).toEqual(["Authorization"]);
    expect(servers.find((s) => s.name === "loc")!.type).toBe("sse");
    expect(JSON.stringify(r)).not.toMatch(/SECRET/);
  });
  it("survives missing and corrupt files", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-"));
    writeFileSync(path.join(dir, ".claude.json"), "{not json");
    expect(listMcp(["/nonexistent"], dir)).toEqual([]);
  });
});
