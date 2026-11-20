import { describe, expect, it } from "vitest";
import { DEFAULT_DOCK, MAX_CHATS, PANEL_KEY, activeChatId, chatTab, closeTab, dockVisible, openChatTab, openPanel, panelShowing, setActive, setWidth } from "../src/state/dock";

describe("dock state", () => {
  it("header icons toggle one panel at a time (no panel tabs); the Board toggles the big window", () => {
    let d = openPanel(DEFAULT_DOCK, "teams");
    expect(d).toMatchObject({ open: true, panel: "teams", active: PANEL_KEY });
    expect(panelShowing(d, "teams")).toBe(true);
    d = openPanel(d, "stats"); // another icon replaces the panel
    expect(d.panel).toBe("stats");
    d = openPanel(d, "stats"); // same icon again hides it
    expect(d).toMatchObject({ panel: null, open: false });
    expect(dockVisible(d)).toBe(false);
    d = openPanel(d, "board");
    expect(d.dialog).toBe("board");
    expect(openPanel(d, "board").dialog).toBeNull();
    expect(openPanel(d, "world").dialog).toBeNull();
  });
  it("hiding the panel falls back to the last chat when there is one", () => {
    let d = openChatTab(openPanel(DEFAULT_DOCK, "teams"), "a");
    expect(d.active).toBe(chatTab("a"));
    d = setActive(d, PANEL_KEY);
    d = openPanel(d, "teams");
    expect(d).toMatchObject({ panel: null, active: chatTab("a"), open: true });
  });
  it("one chat tab per agent, newest chats kept, the visible chat drives the agent that runs to its desk", () => {
    let d = openChatTab(DEFAULT_DOCK, "a");
    d = openChatTab(d, "a");
    expect(d.chats).toEqual(["a"]);
    expect(activeChatId(d)).toBe("a");
    for (let i = 0; i < MAX_CHATS + 2; i++) d = openChatTab(d, `x${i}`);
    expect(d.chats).toHaveLength(MAX_CHATS);
    expect(d.chats).toContain(`x${MAX_CHATS + 1}`);
    expect(activeChatId({ ...d, open: false })).toBeUndefined();
  });
  it("closing a chat shows the panel again, or hides the dock when nothing is left", () => {
    let d = openChatTab(openPanel(DEFAULT_DOCK, "teams"), "a");
    d = closeTab(d, chatTab("a"));
    expect(d).toMatchObject({ chats: [], active: PANEL_KEY, panel: "teams", open: true });
    d = openChatTab(openPanel(d, "teams"), "b"); // panel hidden, chat only
    d = closeTab(d, chatTab("b"));
    expect(d).toMatchObject({ open: false, chats: [], active: "" });
    expect(setActive(d, "chat:nope")).toBe(d);
  });
  it("keeps the width in range", () => {
    expect(setWidth(DEFAULT_DOCK, 50).width).toBe(320);
    expect(setWidth(DEFAULT_DOCK, 5000).width).toBe(900);
  });
});
