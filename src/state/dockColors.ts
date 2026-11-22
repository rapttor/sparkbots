import { useSyncExternalStore } from "react";
import { isChat, type DockState, type PanelId } from "./dock";

/** Every sidebar tab has a colour that tints the sidebar (edge glow, header, background). Defaults below; the user can change each in Settings. */
export const DEFAULT_DOCK_COLORS: Record<string, string> = {
  view: "#60a5fa", projects: "#a78bfa", map: "#34d399", chats: "#4fd1c5", teams: "#f59e0b", control: "#f87171", stats: "#38bdf8",
  board: "#fb923c", notes: "#facc15", data: "#22d3ee", services: "#c084fc", server: "#94a3b8", settings: "#9ca3af", chat: "#4fd1c5",
};
/** Settings rows: the tab key and its label (chat = every agent chat tab). */
export const DOCK_COLOR_LABELS: { key: string; label: string }[] = [
  { key: "view", label: "View" }, { key: "projects", label: "Projects" }, { key: "map", label: "Map" }, { key: "chats", label: "Chats list" },
  { key: "chat", label: "Agent chat" }, { key: "teams", label: "Teams" }, { key: "control", label: "Control room" }, { key: "stats", label: "Stats" },
  { key: "board", label: "Board" }, { key: "notes", label: "Notes" }, { key: "data", label: "Data room" }, { key: "services", label: "Services" },
  { key: "server", label: "Server room" }, { key: "settings", label: "Settings" },
];

const KEY = "ao.dockColors";
const HEX = /^#[0-9a-fA-F]{6}$/;
let custom: Record<string, string> = (() => { try { const o = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>; return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && HEX.test(v))) as Record<string, string>; } catch { return {}; } })();
const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; for (const f of subs) f(); };

export const dockColor = (key: string): string => custom[key] ?? DEFAULT_DOCK_COLORS[key] ?? "#4fd1c5";
export function setDockColor(key: string, color: string | null): void {
  if (color && HEX.test(color) && color !== DEFAULT_DOCK_COLORS[key]) custom = { ...custom, [key]: color }; else { const { [key]: _drop, ...rest } = custom; custom = rest; }
  try { localStorage.setItem(KEY, JSON.stringify(custom)); } catch { /* private mode */ }
  emit();
}
export const resetDockColors = (): void => { custom = {}; try { localStorage.removeItem(KEY); } catch { /* private mode */ } emit(); };
/** Re-renders when any colour changes. */
export const useDockColorVersion = (): number => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);

/** The colour of what the dock is showing now: its panel, or "chat" for an agent chat tab. */
export const colorOfDock = (d: Pick<DockState, "active" | "panel">): string => dockColor(isChat(d.active) ? "chat" : (d.panel as PanelId | null) ?? "chats");
