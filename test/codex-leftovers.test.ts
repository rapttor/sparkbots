import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { listArchived, loadArchived } from "../server/adapters/codex/archive";
import { discoverSessions } from "../server/adapters/codex/discover";
import { classify, matchLive } from "../server/adapters/codex/liveness";
import { parseLine, type CodexParseCtx } from "../server/adapters/codex/parse";
import { SearchIndex } from "../server/search";

const ID = "01a1fd1a-8a2e-7b50-a44f-0f67b7b42e84", ID2 = "01a1fd1a-8a2e-7b50-a44f-0f67b7b42e85";
const row = (type: string, payload: object) => JSON.stringify({ timestamp: "2026-11-21T08:00:00Z", type, payload });
const lines = (id: string) => [
  row("session_meta", { id, session_id: id, cwd: "/work/sparkbots" }),
  row("turn_context", { model: "gpt-test-1" }),
  row("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Index the zebra migration" }] }),
  row("event_msg", { type: "item_completed", item: { type: "AgentMessage", content: [{ type: "Text", text: "Migrating zebra tables" }] } }),
  row("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Migrating zebra tables" }] }),
  row("token_usage_record", { session_id: id, usage: { input_tokens: 100, output_tokens: 7, cached_input_tokens: 60, cache_write_input_tokens: 0 } }),
].join("\n") + "\n";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("Codex usage", () => {
  it("takes the model from turn_context and separates cached tokens", () => {
    const ctx: CodexParseCtx = {};
    const ev = lines(ID).split("\n").filter(Boolean).flatMap((l) => parseLine(l, ctx).events);
    expect(ev.find((e) => e.kind === "usage")).toMatchObject({ model: "gpt-test-1", input: 40, cacheRead: 60, output: 7 });
    expect(parseLine(row("token_usage_record", { usage: { input_tokens: 5 } })).events[0]).toMatchObject({ model: "codex" });
  });
});

describe("Codex liveness", () => {
  it("classifies processes and matches them to sessions", () => {
    expect(classify("/usr/local/bin/codex")).toMatchObject({ kind: "interactive" });
    expect(classify("codex exec do things")).toMatchObject({ kind: "headless" });
    expect(classify("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c x=1 app-server")).toBeUndefined();
    expect(classify("codex queue --thread x --message hi")).toBeUndefined();
    expect(classify("/bin/zsh")).toBeUndefined();
    const sessions = [
      { id: `codex:${ID}`, source: "codex" as const, file: "a", cwd: "/work/a", title: "", mtimeMs: 1, sizeBytes: 1 },
      { id: `codex:${ID2}`, source: "codex" as const, file: "b", cwd: "/work/a", title: "", mtimeMs: 2, sizeBytes: 1 },
    ];
    const live = matchLive([{ pid: 9, command: "codex", cwd: "/work/a", kind: "interactive" }], sessions);
    expect([...live.keys()]).toEqual([`codex:${ID2}`]); // newest session in that cwd
    expect(matchLive([{ pid: 9, command: "codex resume", cwd: "/elsewhere", kind: "interactive", thread: ID }], sessions).get(`codex:${ID}`)?.pid).toBe(9);
  });
});

describe("Codex search + archive", () => {
  it("indexes messages once with source metadata", async () => {
    root = await mkdtemp(join(tmpdir(), "codex-search-"));
    const file = join(root, `rollout-2026-11-21T08-00-00-${ID}.jsonl`); await writeFile(file, lines(ID));
    const idx = new SearchIndex(join(root, "i.sqlite"));
    expect(await idx.indexFile(file, `codex:${ID}`, 1, 1, "codex")).toBe(2);
    const hits = idx.search("zebra");
    expect(hits).toHaveLength(2); expect(hits[0]).toMatchObject({ source: "codex", session: `codex:${ID}` });
    expect(idx.isCurrent(file, 1, 1, "codex")).toBe(true); expect(idx.isCurrent(file, 1, 1, "claude")).toBe(false);
    idx.close();
  });

  it("loads archived .zst only into the cache dir", async () => {
    root = await mkdtemp(join(tmpdir(), "codex-arch-"));
    const day = join(root, "home", "sessions", "2026", "09", "20"); await mkdir(day, { recursive: true });
    const name = `rollout-2026-09-20T20-00-00-${ID2}.jsonl`, zst = join(day, `${name}.zst`);
    await writeFile(zst, zstdCompressSync(Buffer.from(lines(ID2))));
    const cache = join(root, "cache");
    expect(await discoverSessions(join(root, "home"), cache)).toHaveLength(0); // archived stay invisible until loaded
    expect(await listArchived(join(root, "home"), cache)).toMatchObject([{ id: `codex:${ID2}`, loaded: false }]);
    expect(await loadArchived({ root: join(root, "home"), cacheDir: cache })).toMatchObject({ loaded: 1, failed: 0 });
    expect(await readFile(join(cache, name), "utf8")).toBe(lines(ID2));
    const found = await discoverSessions(join(root, "home"), cache);
    expect(found).toMatchObject([{ id: `codex:${ID2}`, cwd: "/work/sparkbots" }]);
    expect((await listArchived(join(root, "home"), cache))[0]!.loaded).toBe(true);
  });
});
