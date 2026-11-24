import { describe, expect, it } from "vitest";
import { isViewKey, normKey, viewKeyInput } from "../src/world/viewKeys";
import { ACTIONS, RESERVED_KEYS } from "../src/world/actions";
import { KEYMAP } from "../src/world/keymap";

describe("view keys", () => {
  it("[ ] turn, - = zoom, Shift is faster, and Shift+[ counts as [", () => {
    expect(normKey("{")).toBe("["); expect(normKey("}")).toBe("]"); expect(normKey("_")).toBe("-"); expect(normKey("+")).toBe("="); expect(normKey("a")).toBe("a");
    expect(viewKeyInput(new Set(["]"]))).toEqual({ turn: 1, zoom: 0, fast: 1 });
    expect(viewKeyInput(new Set(["[", "shift"]))).toEqual({ turn: -1, zoom: 0, fast: 2 });
    expect(viewKeyInput(new Set(["-"]))).toEqual({ turn: 0, zoom: 1, fast: 1 });   // - = further away
    expect(viewKeyInput(new Set(["="]))).toEqual({ turn: 0, zoom: -1, fast: 1 });  // = / + = closer
    expect(viewKeyInput(new Set(["[", "]"])).turn).toBe(0);
    expect(isViewKey("{")).toBe(true); expect(isViewKey("w")).toBe(false);
  });
  it("reuses nothing: no action key, reserved key or other keymap entry uses [ ] - =", () => {
    const used = new Set([...RESERVED_KEYS, ...ACTIONS.map((a) => a.key)]);
    for (const k of ["[", "]", "-", "="]) expect(used.has(k), k).toBe(false);
    const caps = KEYMAP.filter((e) => !e.id.startsWith("view-") && !["p-numbers", "p-anger"].includes(e.id)) /* those two write a range, "1 - 9" */.flatMap((e) => e.keys.split(" / ").flatMap((c) => c.split(" ")));
    for (const k of ["[", "]", "-", "="]) expect(caps.includes(k), k).toBe(false);
  });
});
