import { describe, expect, it } from "vitest";
import { KEYMAP, KEY_TABS } from "../src/world/keymap";

describe("keymap tabs", () => {
  it("has unique ids, every entry on a known tab, and every tab has entries", () => {
    expect(new Set(KEYMAP.map((k) => k.id)).size).toBe(KEYMAP.length);
    const ids = new Set(KEY_TABS.map((t) => t.id));
    for (const k of KEYMAP) expect(ids.has(k.tab ?? "basics"), k.id).toBe(true);
    for (const t of KEY_TABS) expect(KEYMAP.filter((k) => (k.tab ?? "basics") === t.id).length, t.id).toBeGreaterThan(2);
  });
  it("the special tabs explain the game keys, the race keys and the numbered popups", () => {
    const text = (tab: string) => KEYMAP.filter((k) => k.tab === tab).map((k) => `${k.keys} ${k.label}`).join("\n");
    expect(text("games")).toMatch(/Play vs agent/); expect(text("games")).toMatch(/Space/); expect(text("games")).toMatch(/1 2 3/);
    expect(text("race")).toMatch(/Shift/); expect(text("race")).toMatch(/Nitro/); expect(text("race")).toMatch(/Monster/);
    expect(text("popups")).toMatch(/1 - 9/); expect(text("popups")).toMatch(/Z, then 1-9/); expect(text("popups")).toMatch(/Water cooler/); expect(text("popups")).toMatch(/Anger room/);
  });
  it("only the basics tab has clickable entries", () => {
    for (const k of KEYMAP.filter((x) => x.tab && x.tab !== "basics")) expect(k.actionable, k.id).toBe(false);
  });
});
