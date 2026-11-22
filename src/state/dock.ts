/**
 * State of the side dock next to the always-visible 3D office, and of the big dialog. The icons in the header are toggles:
 * each one shows its panel in the dock (click it again to hide it). Only chats are tabs: one per agent.
 * Pure functions, easy to test.
 */
export type PanelId = "world" | "view" | "projects" | "map" | "chats" | "teams" | "control" | "stats" | "board" | "notes" | "data" | "services" | "server" | "settings";
export type TabKey = string; // "panel" or "chat:<workerId>"

export interface DockState {
  open: boolean;
  side: "left" | "right";
  width: number;        // px, side dock only (on narrow screens the dock is a bottom sheet)
  panel: PanelId | null; // the panel chosen with the header icons
  chats: string[];       // agents whose chat tab is open
  active: TabKey;        // "panel" or a chat tab
  dialog: PanelId | null; // a panel shown in the big window (the Board always opens there)
}

export const MIN_WIDTH = 320, MAX_WIDTH = 900, MAX_CHATS = 8;
export const PANEL_KEY: TabKey = "panel";
export const chatTab = (id: string): TabKey => `chat:${id}`;
export const isChat = (k: TabKey) => k.startsWith("chat:");
export const chatOf = (k: TabKey) => k.slice(5);

export const DEFAULT_DOCK: DockState = { open: false, side: "right", width: 440, panel: null, chats: [], active: "", dialog: null };
const KEY = "ao.dock2";

const clamp = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)));
const hasContent = (d: Pick<DockState, "panel" | "chats">) => d.panel !== null || d.chats.length > 0;

export function loadDock(): DockState {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DockState> | null;
    if (!o) return { ...DEFAULT_DOCK };
    const panel = typeof o.panel === "string" && o.panel !== "board" && o.panel !== "world" ? (o.panel as PanelId) : null;
    return {
      ...DEFAULT_DOCK, panel, open: o.open === true && panel !== null, side: o.side === "left" ? "left" : "right",
      width: typeof o.width === "number" ? clamp(o.width) : DEFAULT_DOCK.width, active: panel ? PANEL_KEY : "",
    };
  } catch { return { ...DEFAULT_DOCK }; }
}
/** Only the layout choices and the chosen panel are remembered; chats and the dialog are not. */
export function saveDock(d: DockState): void {
  try { localStorage.setItem(KEY, JSON.stringify({ open: d.open, side: d.side, width: d.width, panel: d.panel })); } catch { /* private mode */ }
}

/** Header icon clicked. The Board toggles the big window, "world" just closes it; any other panel toggles in the dock. */
export function openPanel(d: DockState, id: PanelId): DockState {
  if (id === "world") return { ...d, dialog: null };
  if (id === "board") return { ...d, dialog: d.dialog === "board" ? null : "board" };
  if (d.open && d.active === PANEL_KEY && d.panel === id) { // showing it already: hide it
    const last = d.chats[d.chats.length - 1];
    return last ? { ...d, panel: null, active: chatTab(last) } : { ...d, panel: null, active: "", open: false };
  }
  return { ...d, open: true, panel: id, active: PANEL_KEY, dialog: d.dialog === id ? null : d.dialog };
}

export function openChatTab(d: DockState, workerId: string): DockState {
  let chats = d.chats.includes(workerId) ? d.chats : [...d.chats, workerId];
  if (chats.length > MAX_CHATS) { const drop = chats.find((c) => c !== workerId)!; chats = chats.filter((c) => c !== drop); } // keep the newest chats
  return { ...d, open: true, chats, active: chatTab(workerId) };
}

export function closeTab(d: DockState, key: TabKey): DockState {
  if (!isChat(key)) return d;
  const id = chatOf(key);
  if (!d.chats.includes(id)) return d;
  const chats = d.chats.filter((c) => c !== id);
  let active = d.active;
  if (active === key) active = d.panel ? PANEL_KEY : chats.length ? chatTab(chats[chats.length - 1]!) : "";
  return { ...d, chats, active, open: d.open && hasContent({ panel: d.panel, chats }) };
}

export function setActive(d: DockState, key: TabKey): DockState {
  if (key === PANEL_KEY) return d.panel ? { ...d, active: key, open: true } : d;
  return isChat(key) && d.chats.includes(chatOf(key)) ? { ...d, active: key, open: true } : d;
}
export const setWidth = (d: DockState, w: number): DockState => ({ ...d, width: clamp(w) });
export const dockVisible = (d: DockState): boolean => d.open && hasContent(d);
/** Is this panel the one on show in the dock? (what the header icon highlights) */
export const panelShowing = (d: DockState, id: PanelId): boolean => (id === "board" ? d.dialog === "board" : d.open && d.active === PANEL_KEY && d.panel === id);

/** The agent whose chat is the visible tab (undefined while the dock is closed): that agent runs to its desk in the 3D office. */
export const activeChatId = (d: DockState): string | undefined => (d.open && isChat(d.active) ? chatOf(d.active) : undefined);

export const PANEL_TITLES: Record<PanelId, string> = {
  world: "Office", view: "View", projects: "Projects", map: "Map", chats: "Chats", teams: "Teams", control: "Control Room", stats: "Stats", board: "Board", notes: "Notes", data: "Data room", services: "Services", server: "Server room", settings: "Settings",
};
