import { create } from "zustand";
import type { Snapshot } from "../../server/adapters/types";
import type { StatsSnapshot } from "../../server/stats/aggregate";
import { loadFilters, saveFilters, type TeamFilters } from "../panels/teamFilters";
import type { TeamTasks } from "../api";

export type PanelId = "world" | "teams" | "control" | "stats" | "board" | "server" | "settings";

interface OfficeState {
  snapshot: Snapshot | null;
  stats: StatsSnapshot | null;
  connected: boolean;
  panel: PanelId;
  selectedWorker?: string;
  seen: Record<string, number>; // per worker: timestamp of the last message the user has seen
  markSeen: (id: string, at: number) => void;
  markAllSeen: (m: Record<string, number>) => void;
  filters: TeamFilters;       // global project/worker filters shown in the header, applied on every screen
  setFilters: (f: TeamFilters) => void;
  tasks: TeamTasks;
  chatId?: string;            // worker whose chat bubble is open in the 3D room
  managerColor: string;       // the player bot
  openChat: (id?: string) => void;
  setManagerColor: (c: string) => void;
  setPanel: (p: PanelId) => void;
  selectWorker: (id?: string) => void;
}

export const useStore = create<OfficeState>((set) => ({
  snapshot: null,
  stats: null,
  connected: false,
  panel: "teams",
  selectedWorker: undefined,
  chatId: undefined,
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
  managerColor: (() => { try { return localStorage.getItem("ao.managerColor") || "#d97757"; } catch { return "#d97757"; } })(),
  openChat: (chatId) => set({ chatId }),
  setManagerColor: (managerColor) => { try { localStorage.setItem("ao.managerColor", managerColor); } catch { /* private mode */ } set({ managerColor }); },
  setPanel: (panel) => set({ panel }),
  selectWorker: (selectedWorker) => set({ selectedWorker }),
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

async function loadSnapshot() {
  const s = await getJson<Snapshot>("/api/snapshot");
  if (s) useStore.setState({ snapshot: s });
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
  setInterval(() => void loadStats(), 10_000);

  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws${q()}`);
    ws.onopen = () => useStore.setState({ connected: true });
    ws.onmessage = (ev) => {
      try {
        useStore.setState({ snapshot: JSON.parse(String(ev.data)) as Snapshot });
      } catch {
        /* ignore malformed push */
      }
    };
    ws.onclose = () => {
      useStore.setState({ connected: false });
      setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
  };
  connect();
}
