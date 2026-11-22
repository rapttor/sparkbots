import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RunManager, buildLiveArgs, CommandError, type RunEvent } from "../server/adapters/claude-code/command";
import { parseApprovalRequest, approvalResponse, unsupportedControlResponse, userMessageLine, pendingApprovals, describeToolInput } from "../src/shared/claudeStream";

const FAKE = resolve("test/bin/fake-claude-live.mjs");
beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });
const until = async (f: () => boolean, ms = 4000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };

describe("approval protocol helpers", () => {
  const line = { type: "control_request", request_id: "r1", request: { subtype: "can_use_tool", tool_name: "Write", input: { file_path: "/a" }, tool_use_id: "tu1", description: "/a" } };
  it("parses a can_use_tool request", () => {
    expect(parseApprovalRequest(line)).toEqual({ requestId: "r1", tool: "Write", input: { file_path: "/a" }, toolUseId: "tu1", description: "/a" });
  });
  it("ignores other control requests and junk", () => {
    expect(parseApprovalRequest({ ...line, request: { subtype: "hook_callback" } })).toBeNull();
    expect(parseApprovalRequest({ type: "assistant" })).toBeNull();
    expect(parseApprovalRequest(null)).toBeNull();
    expect(parseApprovalRequest({ type: "control_request", request: {} })).toBeNull();
  });
  it("builds allow (echoing the input), deny, unsupported and user lines", () => {
    expect(JSON.parse(approvalResponse("r1", true, { a: 1 }))).toEqual({ type: "control_response", response: { subtype: "success", request_id: "r1", response: { behavior: "allow", updatedInput: { a: 1 } } } });
    expect(JSON.parse(approvalResponse("r1", false, {}, "no")).response.response).toEqual({ behavior: "deny", message: "no" });
    expect(JSON.parse(unsupportedControlResponse("r2")).response).toEqual({ subtype: "error", request_id: "r2", error: "not supported by SparkBots" });
    expect(JSON.parse(userMessageLine("hi\n\"x\""))).toEqual({ type: "user", message: { role: "user", content: "hi\n\"x\"" } });
  });
  it("tracks unanswered questions in a log", () => {
    const log = [{ type: "approval_request", request_id: "a", tool_name: "Bash", input: {} }, { type: "approval_request", request_id: "b", tool_name: "Write", input: {} }, { type: "approval_resolved", request_id: "a", decision: "allow" }];
    expect(pendingApprovals(log).map((p) => p.request_id)).toEqual(["b"]);
    expect(pendingApprovals([])).toEqual([]);
  });
  it("describes tool input in one line", () => {
    expect(describeToolInput("Bash", { command: "ls -la" })).toBe("ls -la");
    expect(describeToolInput("Write", { file_path: "/x", content: "y" })).toBe("/x");
    expect(describeToolInput("Foo", { z: 1 })).toBe("Foo");
    expect(describeToolInput("Bash", { command: "x".repeat(400) }).length).toBe(298);
  });
});

describe("live args", () => {
  it("uses the stdio permission tool and resume, never a bypass", () => {
    const a = buildLiveArgs("s1", { model: "sonnet", allowedTools: ["Read"] });
    expect(a).toEqual(expect.arrayContaining(["-p", "--input-format", "stream-json", "--permission-prompt-tool", "stdio", "--resume", "s1", "--model", "sonnet", "--allowedTools=Read"]));
    expect(a.join(" ")).not.toMatch(/dangerously|bypass/i);
  });
  it("refuses bypassPermissions and bad model names", () => {
    expect(() => buildLiveArgs("s", { permissionMode: "bypassPermissions" })).toThrow(CommandError);
    expect(() => buildLiveArgs("s", { model: "--evil" })).toThrow(/invalid model/);
  });
});

describe("RunManager live mode", () => {
  const mk = () => { const m = new RunManager(() => false, FAKE); m.liveMode = () => true; const seen: RunEvent[] = []; m.listeners.add((e) => seen.push(e)); return { m, seen }; };
  const lines = (seen: RunEvent[], type: string) => seen.filter((e) => (e.line as { type: string }).type === type);

  it("asks the chat, allows once, and keeps one process for two turns", async () => {
    const { m, seen } = mk();
    const r1 = m.send("s1", process.cwd(), "first"); if (r1.queued) throw new Error("queued");
    await until(() => lines(seen, "approval_request").length === 1);
    const q = lines(seen, "approval_request")[0]!.line as { request_id: string; tool_name: string };
    expect(q.tool_name).toBe("Write");
    expect(r1.run.status).toBe("running");
    m.respondApproval(r1.run.runId, q.request_id, true);
    await until(() => r1.run.status === "done");
    expect(lines(seen, "approval_resolved")[0]!.line).toMatchObject({ decision: "allow" });
    const r2 = m.send("s1", process.cwd(), "second"); if (r2.queued) throw new Error("queued");
    expect(r2.run.pid).toBe(r1.run.pid); // the same process
    await until(() => lines(seen, "approval_request").length === 2);
    const q2 = lines(seen, "approval_request")[1]!.line as { request_id: string };
    m.respondApproval(r2.run.runId, q2.request_id, false);
    await until(() => r2.run.status === "done");
    expect(seen.some((e) => JSON.stringify(e.line).includes("denied: Denied in the SparkBots chat"))).toBe(true);
    m.closeLive();
  });

  it("queues a message sent while a question is open and sends it after the turn", async () => {
    const { m, seen } = mk();
    const a = m.send("s2", process.cwd(), "one"); if (a.queued) throw new Error();
    const b = m.send("s2", process.cwd(), "two");
    expect(b.queued).toBe(true);
    await until(() => lines(seen, "approval_request").length === 1);
    m.respondApproval(a.run.runId, (lines(seen, "approval_request")[0]!.line as { request_id: string }).request_id, true);
    await until(() => lines(seen, "approval_request").length === 2); // the queued message started its turn
    expect(m.runs.filter((r) => r.session === "s2").length).toBe(2);
    m.closeLive();
  });

  it("rejects answers for unknown or already answered questions", async () => {
    const { m, seen } = mk();
    const a = m.send("s3", process.cwd(), "x"); if (a.queued) throw new Error();
    await until(() => lines(seen, "approval_request").length === 1);
    const id = (lines(seen, "approval_request")[0]!.line as { request_id: string }).request_id;
    expect(() => m.respondApproval(a.run.runId, "nope", true)).toThrow(/no longer open/);
    m.respondApproval(a.run.runId, id, true);
    expect(() => m.respondApproval(a.run.runId, id, true)).toThrow(CommandError);
    expect(() => m.respondApproval("unknown-run", id, true)).toThrow(/not waiting/);
    m.closeLive();
  });

  it("Stop kills the process and marks the run stopped; the next message starts a fresh one", async () => {
    const { m, seen } = mk();
    const a = m.send("s4", process.cwd(), "x"); if (a.queued) throw new Error();
    await until(() => lines(seen, "approval_request").length === 1);
    m.stop(a.run.runId);
    await until(() => !!a.run.endedAt);
    expect(a.run.status).toBe("stopped");
    expect(lines(seen, "approval_resolved")[0]!.line).toMatchObject({ decision: "cancelled" });
    const b = m.send("s4", process.cwd(), "y"); if (b.queued) throw new Error();
    expect(b.run.pid).not.toBe(a.run.pid);
    m.closeLive();
  });

  it("reports its own live pids (so liveness does not call them a terminal), and forgets them when they exit", async () => {
    const { m, seen } = mk();
    const a = m.send("s5", process.cwd(), "x"); if (a.queued) throw new Error();
    expect(m.livePids().has(a.run.pid)).toBe(true);
    await until(() => lines(seen, "approval_request").length === 1);
    m.stop(a.run.runId);
    await until(() => !!a.run.endedAt);
    expect(m.livePids().size).toBe(0);
  });

  it("is off by default: the one-shot path is used", () => {
    const m = new RunManager(() => false, FAKE);
    expect(m.liveMode()).toBe(false);
  });
});
