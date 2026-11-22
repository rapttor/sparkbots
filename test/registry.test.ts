import { describe, expect, it } from "vitest";
import { ADAPTERS, adapterOf } from "../server/adapters/registry";

describe("source adapter registry", () => {
  it("lists claude, codex and opencode; an unknown or missing source is Claude", () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual(["claude", "codex", "opencode"]);
    expect(adapterOf(undefined).id).toBe("claude");
    expect(adapterOf("codex").id).toBe("codex");
  });
  it("only the mirrored database (OpenCode) drops sessions that vanish, and has its own bot colour", () => {
    expect(ADAPTERS.filter((a) => a.mirrored).map((a) => a.id)).toEqual(["opencode"]);
    expect(ADAPTERS.filter((a) => a.defaultColor).map((a) => a.id)).toEqual(["opencode"]);
  });
  it("each session gets its own parser (Codex keeps per-session state)", () => {
    const codex = adapterOf("codex");
    expect(codex.lineParser()).not.toBe(codex.lineParser());
    expect(codex.lineParser()("not json").ok).toBe(false);
  });
  it("maps a tool name to an activity per tool", () => {
    expect(adapterOf("claude").toolActivity("Edit")).toBe("coding");
    expect(adapterOf("claude").toolActivity("Bash", "git push")).toBe("shipping");
  });
  it("every adapter can read chat history and discover", () => {
    for (const a of ADAPTERS) { expect(typeof a.recentMessages).toBe("function"); expect(typeof a.discover).toBe("function"); }
  });
});
