import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchIndex, ftsQuery, messageOf } from "../server/search";

const line = (type: string, content: unknown, extra: object = {}) => JSON.stringify({ type, timestamp: "2026-01-02T03:04:05Z", message: { role: type, content }, ...extra });

describe("search", () => {
  it("builds a safe query: quoted prefix terms, no operators", () => {
    expect(ftsQuery('deploy AND "prod" OR -x*')).toBe('"deploy"* "and"* "prod"* "or"*');
    expect(ftsQuery("a ; drop table")).toBe('"drop"* "table"*');
    expect(ftsQuery("   ")).toBe("");
  });
  it("keeps human/assistant text and skips tools, meta, sidechain and tag-wrapped records", () => {
    expect(messageOf(line("user", "hello there"))?.text).toBe("hello there");
    expect(messageOf(line("assistant", [{ type: "text", text: "sure" }, { type: "tool_use", name: "Bash" }]))?.text).toBe("sure");
    expect(messageOf(line("assistant", [{ type: "tool_use", name: "Bash" }]))).toBeNull();
    expect(messageOf(line("user", "x", { isMeta: true }))).toBeNull();
    expect(messageOf(line("user", "x", { isSidechain: true }))).toBeNull();
    expect(messageOf(line("user", "<command-name>/x</command-name>"))).toBeNull();
    expect(messageOf("{broken")).toBeNull();
  });
  it("indexes a transcript incrementally and finds words by prefix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ao-"));
    const idx = new SearchIndex(join(dir, "i.sqlite"));
    const f = join(dir, "s1.jsonl");
    writeFileSync(f, [line("user", "please fix the deployment pipeline"), line("assistant", "The pipeline failed because of a missing token")].join("\n"));
    await idx.build([{ path: f, session: "s1", size: 100, mtime: 5 }]);
    expect(idx.stats()).toEqual({ sessions: 1, messages: 2 });
    const hits = idx.search("deploy");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet).toContain("[[deployment]]");
    expect(idx.search("token", { sessions: new Set(["other"]) })).toEqual([]);
    expect(idx.isCurrent(f, 100, 5)).toBe(true);
    expect(idx.isCurrent(f, 101, 5)).toBe(false);
    idx.close();
  });
});
