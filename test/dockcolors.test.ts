import { describe, expect, it } from "vitest";
import { DEFAULT_DOCK_COLORS, colorOfDock, dockColor, resetDockColors, setDockColor } from "../src/state/dockColors";

describe("dock colours", () => {
  it("every tab has a default; a custom colour wins; reset restores", () => {
    expect(dockColor("stats")).toBe(DEFAULT_DOCK_COLORS.stats);
    setDockColor("stats", "#112233");
    expect(dockColor("stats")).toBe("#112233");
    setDockColor("stats", "not-a-colour"); // invalid: falls back to the default
    expect(dockColor("stats")).toBe(DEFAULT_DOCK_COLORS.stats);
    setDockColor("stats", "#112233"); resetDockColors();
    expect(dockColor("stats")).toBe(DEFAULT_DOCK_COLORS.stats);
  });
  it("the dock takes the colour of its panel, or the chat colour on a chat tab", () => {
    expect(colorOfDock({ active: "panel", panel: "board" })).toBe(DEFAULT_DOCK_COLORS.board);
    expect(colorOfDock({ active: "chat:abc", panel: "board" })).toBe(DEFAULT_DOCK_COLORS.chat);
  });
});
