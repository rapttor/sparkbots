import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSubagents } from "../server/adapters/claude-code/subagents";

describe("listSubagents", () => {
  it("reads agent-*.meta.json next to the session file and ignores junk", () => {
    const root = mkdtempSync(join(tmpdir(), "ao-"));
    const session = join(root, "abc.jsonl");
    const dir = join(root, "abc", "subagents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent-a1.meta.json"), JSON.stringify({ agentType: "Explore", description: "find x", model: "haiku", finished: false }));
    writeFileSync(join(dir, "agent-a1.jsonl"), "{}\n");
    writeFileSync(join(dir, "agent-b2.meta.json"), "{not json");
    writeFileSync(join(dir, "notes.txt"), "x");
    const l = listSubagents(session);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: "a1", type: "Explore", description: "find x", model: "haiku", finished: false });
    expect(listSubagents(join(root, "none.jsonl"))).toEqual([]);
  });
});
