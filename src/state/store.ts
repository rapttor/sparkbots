import { create } from "zustand";
import type { Snapshot } from "../../server/adapters/types";
import type { StatsSnapshot } from "../../server/stats/aggregate";
import { loadFilters, saveFilters, type TeamFilters } from "../panels/teamFilters";
import type { TeamTasks } from "../api";
import { countMessage, nerd } from "./nerd";
import { ClientState, type ServerMsg, type Slice } from "../shared/sync";

import { activeChatId, closeTab, loadDock, openChatTab, openPanel, saveDock, setActive, setWidth, type DockState, type PanelId, type TabKey } from "./dock";
import { DEFAULT_JEANS, loadDevLook, saveDevLook, type DevLook } from "../world/devLook";
export type { PanelId } from "./dock";

/** Ask another part of the UI to bring something into view: the 3D camera flies to an agent / project, the Teams list scrolls to a project. */
export interface FocusRequest { kind: "agent" | "team" | "point"; id: string; n: number; x?: number; z?: number }

interface OfficeState {
  snapshot: Snapshot | null;
  stats: StatsSnapshot | null;
  connected: boolean;
  dock: DockState;            // side dock with tabs (panels and one chat per agent) + the big dialog
  focus: FocusRequest | null;
  focusAgent: (id: string) => void;
  focusTeam: (name: string) => void;
  focusPoint: (x: number, z: number) => void;
  activateTab: (key: TabKey) => void;
  closeTab: (key: TabKey) => void;
  toggleDock: () => void;
  setDockSide: (s: "left" | "right") => void;
  resizeDock: (w: number) => void;
  openDialog: (p: PanelId | null) => void;
  seen: Record<string, number>; // per worker: timestamp of the last message the user has seen
  markSeen: (id: string, at: number) => void;
  markAllSeen: (m: Record<string, number>) => void;
  filters: TeamFilters;       // global project/worker filters shown in the header, applied on every screen
  setFilters: (f: TeamFilters) => void;
  tasks: TeamTasks;
  chatId?: string;            // the agent whose chat tab is showing: it runs to its desk and opens its laptop
  followers: string[];        // agents walking with the manager
  toggleFollower: (id: string) => void;
  setFollowers: (ids: string[]) => void;
  clearFollowers: () => void;
  meetingOpen: boolean;       // the one-message-to-everyone chat
  setMeetingOpen: (v: boolean) => void;
  viewInfo: { mode: "overview" | "walk"; locked: boolean; hasDefault: boolean; tags: boolean; showAll: boolean; zoomPct: number; fitDist: number; maxDist: number }; // mirrored from the 3D office for the View panel
  setViewInfo: (v: Partial<OfficeState["viewInfo"]>) => void;
  showKeymap: boolean;        // the clickable key legend in the 3D view
  setShowKeymap: (v: boolean) => void;
  managerColor: string;       // the player's pants colour
  avatar: string;             // the owner character (developer | raptor | spark)
  devLook: DevLook;           // developer options (top, logo, glasses, beard, overweight)
  controller: "avatar" | "hand"; // how you drive walk mode: a walking avatar, or a floating hand
  openChat: (id?: string) => void;
  setManagerColor: (c: string) => void;
  setAvatar: (id: string) => void;
  setDevLook: (p: Partial<DevLook>) => void;
  setController: (c: "avatar" | "hand") => void;
  setPanel: (p: PanelId) => void;
  selectWorker: (id?: string) => void; // open its chat tab and fly the camera to it
}

export const useStore = create<OfficeState>((set) => ({
  snapshot: null,
  stats: null,
  connected: false,
  dock: loadDock(),
  focus: null,
  chatId: undefined,
  focusAgent: (id) => set((s) => ({ focus: { kind: "agent", id, n: (s.focus?.n ?? 0) + 1 } })),
  focusPoint: (x, z) => set((s) => ({ focus: { kind: "point", id: "", x, z, n: (s.focus?.n ?? 0) + 1 } })),
  focusTeam: (name) => set((s) => ({ focus: { kind: "team", id: name, n: (s.focus?.n ?? 0) + 1 } })),
  activateTab: (key) => set((s) => { const dock = setActive(s.dock, key); saveDock(dock); return { dock, chatId: activeChatId(dock) }; }),
  closeTab: (key) => set((s) => { const dock = closeTab(s.dock, key); saveDock(dock); return { dock, chatId: activeChatId(dock) }; }),
  toggleDock: () => set((s) => { const dock = { ...s.dock, open: !s.dock.open && (s.dock.panel !== null || s.dock.chats.length > 0) }; saveDock(dock); return { dock, chatId: activeChatId(dock) }; }),
  setDockSide: (side) => set((s) => { const dock = { ...s.dock, side }; saveDock(dock); return { dock }; }),
  resizeDock: (w) => set((s) => { const dock = setWidth(s.dock, w); saveDock(dock); return { dock }; }),
  openDialog: (p) => set((s) => ({ dock: p === null ? { ...s.dock, dialog: null } : { ...s.dock, dialog: p } })),
  filters: loadFilters(),
  setFilters: (filters) => { saveFilters(filters); set({ filters }); },
  tasks: {},
  seen: (() => { try { return JSON.parse(localStorage.getItem("ao.seen") ?? "{}") as Record<string, number>; } catch { return {}; } })(),
  markSeen: (id, at) => set((s) => {
    if ((s.seen[id] ?? 0) >= at) return s;
    const seen = { ...s.seen, [id]: at };
    try { localStorage.setItem("ao.seen", JSON.stringify(seen)); } catch { /* private mode */ }
    return { seen };
  }),
  markAllSeen: (m) => set((s) => {
    const seen = { ...s.seen, ...m };
    try { localStorage.setItem("ao.seen", JSON.stringify(seen)); } catch { /* private mode */ }
    return { seen };
  }),
  followers: [],
  toggleFollower: (id) => set((s) => ({ followers: s.followers.includes(id) ? s.followers.filter((x) => x !== id) : [...s.followers, id].slice(-12) })),
  setFollowers: (ids) => set({ followers: ids.slice(0, 12) }),
  clearFollowers: () => set({ followers: [], meetingOpen: false }),
  meetingOpen: false,
  setMeetingOpen: (meetingOpen) => set({ meetingOpen }),
  viewInfo: { mode: "overview", locked: false, hasDefault: false, tags: false, showAll: false, zoomPct: 0, fitDist: 0, maxDist: 0 },
  setViewInfo: (v) => set((s) => ({ viewInfo: { ...s.viewInfo, ...v } })),
  showKeymap: (() => { try { return localStorage.getItem("ao.keymap") !== "0"; } catch { return true; } })(),
  setShowKeymap: (showKeymap) => { try { localStorage.setItem("ao.keymap", showKeymap ? "1" : "0"); } catch { /* private mode */ } set({ showKeymap }); },
  managerColor: (() => { try { return localStorage.getItem("ao.managerColor") || DEFAULT_JEANS; } catch { return DEFAULT_JEANS; } })(),
  avatar: (() => { try { return localStorage.getItem("ao.avatar") || "developer"; } catch { return "developer"; } })(),
  devLook: loadDevLook(),
  controller: (() => { try { return localStorage.getItem("ao.controller") === "hand" ? "hand" : "avatar"; } catch { return "avatar"; } })(),
  openChat: (id) => set((s) => {
    const dock = id ? openChatTab(s.dock, id) : s.dock.active.startsWith("chat:") ? closeTab(s.dock, s.dock.active) : s.dock; // no id: close the visible chat
    saveDock(dock);
    return { dock, chatId: activeChatId(dock) };
  }),
  setManagerColor: (managerColor) => { try { localStorage.setItem("ao.managerColor", managerColor); } catch { /* private mode */ } set({ managerColor }); },
  setAvatar: (avatar) => { try { localStorage.setItem("ao.avatar", avatar); } catch { /* private mode */ } set({ avatar }); },
  setDevLook: (p) => set((s) => { const devLook = { ...s.devLook, ...p }; saveDevLook(devLook); return { devLook }; }),
  setController: (controller) => { try { localStorage.setItem("ao.controller", controller); } catch { /* private mode */ } set({ controller }); },
  setPanel: (p) => set((s) => { const dock = openPanel(s.dock, p); saveDock(dock); return { dock, chatId: activeChatId(dock) }; }),
  selectWorker: (id) => set((s) => {
    if (!id) return {};
    const dock = openChatTab(s.dock, id);
    saveDock(dock);
    return { dock, chatId: activeChatId(dock), focus: { kind: "agent", id, n: (s.focus?.n ?? 0) + 1 } };
  }),
}));

const token = () => new URLSearchParams(location.search).get("t") ?? "";
const q = () => `?t=${encodeURIComponent(token())}`;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${path}${q()}`);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

const sync = new ClientState();

/** Browser-side event bus for "this slice changed" pings from the server (see useLive in state/live.ts). */
type Listener = (kind: Slice, id?: string) => void;
const listeners = new Set<Listener>();
export const onChanged = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
let wsOpen = false;
export const wsConnected = () => wsOpen;

async function loadSnapshot() {
  const s = await getJson<Snapshot>("/api/snapshot");
  if (s && sync.rev < 0) useStore.setState({ snapshot: s }); // only before the first hello
}
async function loadStats() {
  const s = await getJson<StatsSnapshot>("/api/stats");
  if (s) useStore.setState({ stats: s });
}

let started = false;
export function startSync(): void {
  if (started) return;
  started = true;
  void loadSnapshot();
  void loadStats();
  onChanged((k) => { if (k === "stats") void loadStats(); });

  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws${q()}`);
    ws.onopen = () => { wsOpen = true; useStore.setState({ connected: true }); };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      const raw = String(ev.data);
      try { m = JSON.parse(raw) as ServerMsg; } catch { return; /* malformed push */ }
      countMessage(m.type, raw.length, m.type === "patch" ? m.ops.length : 0);
      if (m.type === "hello") useStore.setState({ snapshot: sync.reset(m.rev, m.snapshot) });
      else if (m.type === "patch") {
        const next = sync.apply(m.rev, m.at, m.ops);
        if (next) useStore.setState({ snapshot: next });
        else { nerd.ws.resyncs++; ws.close(); } // missed a patch: reconnecting sends a fresh hello
      } else if (m.type === "changed") for (const fn of listeners) fn(m.kind, m.id);
    };
    ws.onclose = () => {
      wsOpen = false;
      useStore.setState({ connected: false });
      sync.rev = -1;
      for (const fn of listeners) fn("board"); // connection state changed: let live views fall back to polling
      setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
  };
  connect();
}
