import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverSessions } from "../server/adapters/codex/discover";
import { parseLine, toolActivity } from "../server/adapters/codex/parse";
import { recentMessages } from "../server/adapters/codex/transcript";

const ID = "01a1fd1a-8a2e-7b50-a44f-0f67b7b42e84";
const row = (type: string, payload: object) => JSON.stringify({ timestamp: "2026-11-21T08:00:00Z", type, payload });
const lines = [
  row("session_meta", { id: ID, session_id: ID, cwd: "/work/sparkbots" }),
  row("event_msg", { type: "task_started", session_id: ID }),
  row("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Add Codex support" }] }),
  row("event_msg", { type: "item_completed", item: { type: "AgentMessage", content: [{ type: "Text", text: "Working on it…" }] } }),
  row("response_item", { type: "custom_tool_call", name: "apply_patch" }),
  row("token_usage_record", { session_id: ID, usage: { input_tokens: 10, output_tokens: 4, cached_input_tokens: 3, cache_write_input_tokens: 0 } }),
  row("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Implemented." }] }),
  row("event_msg", { type: "task_complete", session_id: ID }),
];

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("Codex adapter", () => {
  it("parses lifecycle, messages, tools, and usage", () => {
    const events = lines.flatMap((line) => parseLine(line).events);
    expect(events.map((e) => e.kind)).toEqual(["turn_start", "message", "message", "tool", "usage", "message", "turn_end"]);
    expect(events.find((e) => e.kind === "message" && e.role === "assistant")).toMatchObject({ preview: "Working on it…" });
    expect(events.find((e) => e.kind === "usage")).toMatchObject({ input: 10, output: 4, cacheRead: 3 });
    expect(toolActivity("apply_patch")).toBe("coding");
  });

  it("discovers a namespaced session and reads its chat", async () => {
    root = await mkdtemp(join(tmpdir(), "codex-adapter-"));
    const day = join(root, "sessions", "2026", "11", "21"); await mkdir(day, { recursive: true });
    const file = join(day, `rollout-2026-11-21T08-00-00-${ID}.jsonl`);
    await writeFile(file, lines.join("\n") + "\n");
    await writeFile(join(root, "session_index.jsonl"), JSON.stringify({ id: ID, thread_name: "Codex adapter test" }) + "\n");
    const sessions = await discoverSessions(root);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: `codex:${ID}`, source: "codex", cwd: "/work/sparkbots", title: "Codex adapter test" });
    expect(await recentMessages(file)).toMatchObject([{ role: "user", text: "Add Codex support" }, { role: "assistant", text: "Implemented." }]);
  });
});
