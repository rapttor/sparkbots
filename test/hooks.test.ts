import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { installInto, uninstallFrom, isInstalled, hookToEvents, diffText, type Settings } from "../server/adapters/claude-code/hooks";

const user: Settings = { model: "x", hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "/bin/other", args: ["hook"] }] }] } };

describe("hooks install", () => {
  it("adds entries, keeps the user's own, is idempotent", () => {
    const a = installInto(user, 4317, "tok"); const b = installInto(a, 4317, "tok");
    expect(isInstalled(a)).toBe(true);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.hooks!.PreToolUse).toHaveLength(2);
    expect(a.hooks!.PreToolUse[0].hooks[0].command).toBe("/bin/other");
  });
  it("uninstall removes exactly what was added", () => {
    expect(uninstallFrom(installInto(user, 4317, "tok"))).toEqual(user);
    expect(uninstallFrom({ model: "x" })).toEqual({ model: "x" });
  });
  it("diff shows only added lines on install", () => {
    const d = diffText(user, installInto(user, 4317, "tok"));
    expect(d).toContain("+ ");
    expect(d.split("\n").some((l) => l.startsWith("- "))).toBe(false);
  });
  it("CLI backs up settings.json and round-trips on disk", () => {
    const claude = mkdtempSync(join(tmpdir(), "cl-")), ao = mkdtempSync(join(tmpdir(), "ao-"));
    const f = join(claude, "settings.json"); writeFileSync(f, JSON.stringify(user, null, 2) + "\n");
    const env = { ...process.env, CLAUDE_HOME: claude, AO_HOME: ao };
    const run = (a: string) => execFileSync("npx", ["tsx", "server/index.ts", "hooks", a, "--yes"], { env, encoding: "utf8" });
    run("install");
    expect(isInstalled(JSON.parse(readFileSync(f, "utf8")))).toBe(true);
    expect(readdirSync(join(ao, "backups"))).toHaveLength(1);
    run("uninstall");
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual(user);
  }, 30000);
});

describe("hook payloads", () => {
  it("maps events", () => {
    expect(hookToEvents({ hook_event_name: "Stop", session_id: "s" })[0].kind).toBe("turn_end");
    expect(hookToEvents({ hook_event_name: "Notification", session_id: "s" })[0].kind).toBe("permission_wait");
    expect(hookToEvents({ hook_event_name: "PreToolUse", session_id: "s", tool_name: "Edit", tool_input: { file_path: "/a" } })[0]).toMatchObject({ kind: "tool", tool: "Edit", target: "/a" });
    expect(hookToEvents({ hook_event_name: "PreToolUse", session_id: "s", tool_name: "Task" })).toHaveLength(2);
  });
  it("ignores junk", () => { expect(hookToEvents({})).toEqual([]); expect(hookToEvents({ session_id: "s", hook_event_name: "Wat" })).toEqual([]); });
});
