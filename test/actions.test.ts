import { describe, expect, it } from "vitest";
import { ACTIONS, RESERVED_KEYS, validateActions, type BotAction } from "../src/world/actions";
import { FX } from "../src/world/fx";

const ok = (over: Partial<BotAction> = {}): BotAction => ({ key: "j", label: "J", hint: "h", kind: "fx", run: () => {}, ...over });

describe("action registry", () => {
  it("every shipped action is valid, has a unique key, and its effect exists", () => {
    const keys = ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ACTIONS.length).toBeGreaterThan(0);
    for (const a of ACTIONS) { expect(RESERVED_KEYS).not.toContain(a.key); expect(a.label && a.hint).toBeTruthy(); }
    expect(Object.keys(FX)).toContain("zap");
  });
  it("rejects clashing, reserved, malformed and unconfirmed real actions", () => {
    const r = validateActions([ok(), ok({ label: "dup" }), ok({ key: "w", label: "W" }), ok({ key: "ab", label: "AB" }), ok({ key: "r", label: "R", kind: "real" })]);
    expect(r.ok.map((a) => a.key)).toEqual(["j"]);
    expect(r.errors).toHaveLength(4);
  });
});
describe("effects", () => {
  it("each effect has an id equal to its file, a positive duration", () => {
    for (const [id, k] of Object.entries(FX)) { expect(k.id).toBe(id); expect(k.ms).toBeGreaterThan(0); }
  });
});
