import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSessions, opencodeDbPath } from "../server/adapters/opencode/discover";
import { parseLine } from "../server/adapters/opencode/parse";
import { buildRunArgs, buildSpawnArgs, OpenCodeCommandError, parseSimpleModels, parseVerboseModels } from "../server/adapters/opencode/command";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const now = Date.now();
const SID = "ses_testOpenCode123";

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "ao-opencode-"));
  process.env.AO_HOME = join(dir, "home");
  process.env.OPENCODE_DB = opencodeDbPathFor(dir);
  const db = new DatabaseSync(process.env.OPENCODE_DB!);
  db.exec(`
    create table project(id text primary key, worktree text not null);
    create table session(id text primary key, project_id text not null, parent_id text, directory text not null, title text not null, time_created integer not null, time_updated integer not null, time_archived integer, model text);
    create table message(id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);
    create table part(id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);
  `);
  db.prepare("insert into project values (?, ?)").run("p1", "/tmp/demo");
  db.prepare("insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(SID, "p1", null, "/tmp/demo", "New session - test", now - 1000, now, null, JSON.stringify({ providerID: "ollama", id: "qwen2.5-coder:14b" }));
  // A subagent session (parent_id set) belongs to its parent and must not get its own desk.
  db.prepare("insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("ses_childAgent123", "p1", SID, "/tmp/demo", "Child task", now - 500, now, null, "{}");
  db.prepare("insert into message values (?, ?, ?, ?, ?)").run("msg_u", SID, now - 900, now - 900, JSON.stringify({ role: "user" }));
  db.prepare("insert into part values (?, ?, ?, ?, ?, ?)").run("prt_u", "msg_u", SID, now - 900, now - 900, JSON.stringify({ type: "text", text: "Fix the logo on the site" }));
  db.prepare("insert into message values (?, ?, ?, ?, ?)").run("msg_a", SID, now - 800, now - 700, JSON.stringify({ role: "assistant", modelID: "test/model", tokens: { input: 10, output: 20, cache: { read: 30, write: 4 } } }));
  db.prepare("insert into part values (?, ?, ?, ?, ?, ?)").run("prt_a", "msg_a", SID, now - 800, now - 800, JSON.stringify({ type: "text", text: "I updated the logo." }));
  db.prepare("insert into part values (?, ?, ?, ?, ?, ?)").run("prt_t", "msg_a", SID, now - 790, now - 790, JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed", input: { command: "pnpm test" } } }));
  db.prepare("insert into part values (?, ?, ?, ?, ?, ?)").run("prt_f", "msg_a", SID, now - 700, now - 700, JSON.stringify({ type: "step-finish", reason: "stop", tokens: { input: 10, output: 20, cache: { read: 30, write: 4 } } }));
  db.close();
});

function opencodeDbPathFor(dir: string): string { return join(dir, "opencode.db"); }

describe("opencode adapter", () => {
  it("discovers sessions from the local database and mirrors them as JSONL", async () => {
    const refs = await discoverSessions();
    expect(refs).toHaveLength(1);
    const s = refs[0]!;
    expect(s.id).toBe(`opencode:${SID}`);
    expect(s.source).toBe("opencode");
    expect(s.cwd).toBe("/tmp/demo");
    expect(s.title).toBe("Fix the logo on the site");
    expect(s.model).toBe("ollama/qwen2.5-coder:14b");
    const lines = readFileSync(s.file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(5); // user + assistant text + tool + usage + turn_end
    const events = lines.flatMap((line) => parseLine(line).events);
    expect(events.map((e) => e.kind)).toEqual(["turn_start", "message", "tool", "message", "usage", "turn_end"]);
    const usage = events.find((e) => e.kind === "usage");
    expect(usage && usage.kind === "usage" ? usage.input + usage.output : 0).toBe(30);
  });

  it("is idempotent: a second discovery does not duplicate cached lines", async () => {
    const first = await discoverSessions();
    const lines1 = readFileSync(first[0]!.file, "utf8").trim().split("\n").length;
    const second = await discoverSessions();
    expect(readFileSync(second[0]!.file, "utf8").trim().split("\n").length).toBe(lines1);
  });

  it("ignores subagent sessions: only top-level chats become workers", async () => {
    const refs = await discoverSessions();
    expect(refs.map((s) => s.id)).toEqual([`opencode:${SID}`]);
  });

  it("builds a safe argv for a new OpenCode chat (hire) and rejects bad models", () => {
    const args = buildSpawnArgs("please start", { model: "opencode/deepseek-v4.1-flash-free", title: "  New   hire " });
    expect(args.slice(0, 3)).toEqual(["run", "--format", "json"]);
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("opencode/deepseek-v4.1-flash-free");
    expect(args[args.indexOf("--title") + 1]).toBe("New hire");
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("please start");
    expect(() => buildSpawnArgs("x", { model: "bad model" })).toThrow(OpenCodeCommandError);
    expect(() => buildSpawnArgs("  ")).toThrow(OpenCodeCommandError);
  });

  it("parses verbose model metadata (including braces inside strings) and falls back to plain ids", () => {
    const verbose = [
      "opencode/demo",
      "{",
      '  "id": "demo", "providerID": "opencode", "name": "Demo {beta}", "family": "demo", "status": "active",',
      '  "cost": { "input": 1.5, "output": 3, "cache": { "read": 0.2, "write": 0.4 } },',
      '  "limit": { "context": 200000, "output": 8000 },',
      '  "capabilities": { "reasoning": true, "toolcall": true, "attachment": false, "input": { "text": true, "image": true, "pdf": false } },',
      '  "release_date": "2026-10-01", "variants": { "low": {}, "high": {} }',
      "}",
      "ollama/qwen2.5-coder:14b",
      "{",
      '  "id": "qwen2.5-coder:14b", "providerID": "ollama", "name": "Qwen", "cost": { "input": 0, "output": 0 }',
      "}",
    ].join("\n");
    const models = parseVerboseModels(verbose);
    expect(models.map((m) => m.id)).toEqual(["opencode/demo", "ollama/qwen2.5-coder:14b"]);
    expect(models[0]).toMatchObject({ provider: "opencode", model: "demo", name: "Demo {beta}", version: "2026-10-01", context: 200000, output: 8000, reasoning: true, variants: ["low", "high"] });
    expect(models[0]!.cost).toEqual({ input: 1.5, output: 3, cacheRead: 0.2, cacheWrite: 0.4 });
    expect(models[0]!.inputs).toEqual(["text", "image"]);
    expect(models[1]!.context).toBeUndefined();

    expect(parseSimpleModels("opencode/a\nollama/b:1b\nbad id\n").map((m) => m.id)).toEqual(["opencode/a", "ollama/b:1b"]);
  });

  it("builds a safe opencode run argv and rejects bad ids", () => {
    const args = buildRunArgs(`opencode:${SID}`, "--prompt-like text", { fork: true, files: ["/tmp/a.png"] });
    expect(args.slice(0, 4)).toEqual(["run", "--session", SID, "--format"]);
    expect(args).toContain("--fork");
    expect(args).toContain("--file");
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("--prompt-like text");
    expect(() => buildRunArgs("bad id", "x")).toThrow(OpenCodeCommandError);
    expect(() => buildRunArgs(`opencode:${SID}`, "  ")).toThrow(OpenCodeCommandError);
  });
});
