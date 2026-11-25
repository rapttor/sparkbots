import { create } from "zustand";
import { api } from "../api";
import { useStore } from "../state/store";
import {
  CLOSE, UNITY_MAX_TEXT, cleanText, emptyRoom, parseMsg, pruneBubbles, reduceRoom, relayUrl,
  type UnityRoomState,
} from "../shared/unity";

/**
 * Unity client: one WebSocket to the relay while you are inside, nothing at all otherwise. Positions live in `live` (a plain map
 * the 3D scene reads every frame); the zustand state only holds what the HUD needs (who is here, bubbles, ghosts, status).
 */
export type UnityStatus = "idle" | "connecting" | "online" | "reconnecting" | "banned" | "replaced" | "error";

export interface Live { x: number; y: number; z: number; r: number }
/** Latest known position of every peer (target for interpolation). Not reactive on purpose. */
export const live = new Map<string, Live>();
/** Non-reactive effect clock: when someone last arrived through the booth (performance.now()), read by the 3D scene each frame. */
export const fx = { arrival: -1e9 };

interface UnityState {
  inside: boolean;
  status: UnityStatus;
  note: string;
  room: UnityRoomState;
  muted: string[];      // ids whose bubbles are hidden (kept in this browser)
  reported: string[];   // ids reported this session
  enter: () => Promise<boolean>;
  leave: (message?: string) => void; // always says goodbye on purpose; a message (optional) becomes your ghost's text
  say: (text: string) => void;
  move: (x: number, z: number, r: number) => void;
  setGhost: (on: boolean) => void;
  mute: (id: string, on: boolean) => void;
  report: (id: string) => void;
}

const MUTE_KEY = "ao.unity.muted";
const loadMuted = (): string[] => { try { const a = JSON.parse(localStorage.getItem(MUTE_KEY) ?? "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, 200) : []; } catch { return []; } };

let ws: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let tries = 0;
let sweep: ReturnType<typeof setInterval> | null = null;
let lastPos = 0, lastSent = { x: NaN, z: NaN, r: NaN };
let lastSay = 0;
let hello: { key: string; name: string; ghost: boolean; relay: string } | null = null;

const send = (m: object): void => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function stop(): void {
  if (retry) { clearTimeout(retry); retry = null; }
  if (sweep) { clearInterval(sweep); sweep = null; }
  const w = ws; ws = null;
  if (w) { w.onclose = null; w.onmessage = null; w.onerror = null; try { w.close(1000); } catch { /* already closed */ } }
  live.clear();
  hello = null;
}

export const useUnity = create<UnityState>((set, get) => {
  function connect(): void {
    if (!hello || !get().inside) return;
    const h = hello;
    let sock: WebSocket;
    try { sock = new WebSocket(relayUrl(h.relay)); } catch { set({ status: "error", note: "The relay address is not valid." }); return; }
    ws = sock;
    set({ status: tries === 0 ? "connecting" : "reconnecting", note: tries === 0 ? "Connecting…" : "Reconnecting…" });

    sock.onopen = () => {
      // Everybody appears as the owner character they set up themselves (Settings > 3D office): avatar, look and colour.
      const me = useStore.getState();
      sock.send(JSON.stringify({ t: "hello", key: h.key, name: h.name || "Guest", color: me.managerColor, avatar: me.avatar, look: me.devLook, ghost: h.ghost }));
    };
    sock.onmessage = (ev) => {
      const m = parseMsg(String(ev.data));
      if (!m) return;
      if (m.t === "replaced") { set({ status: "replaced", note: "Unity is open in another window, so this one was closed." }); return; }
      if (m.t === "pos") { const p = live.get(m.id); if (p) { p.x = m.x; p.y = m.y; p.z = m.z; p.r = m.r; } return; }
      if (m.t === "welcome") {
        tries = 0; live.clear(); lastPos = 0; lastSent = { x: NaN, z: NaN, r: NaN }; // send my position right away
        for (const p of m.peers) live.set(p.id, { x: p.x, y: p.y, z: p.z, r: p.r });
        fx.arrival = performance.now();
        set({ status: "online", note: "" });
      } else if (m.t === "join") { live.set(m.peer.id, { x: m.peer.x, y: m.peer.y, z: m.peer.z, r: m.peer.r }); fx.arrival = performance.now(); }
      else if (m.t === "leave") live.delete(m.id);
      set((s) => ({ room: reduceRoom(s.room, m, Date.now()) }));
    };
    sock.onerror = () => { /* onclose follows */ };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      if (!get().inside) return;
      if (ev.code === CLOSE.banned) { set({ status: "banned", note: "You have been removed from Unity." }); return; }
      if (ev.code === CLOSE.replaced || get().status === "replaced") { set({ status: "replaced", note: "Unity is open in another window, so this one was closed." }); return; }
      tries++;
      set({ status: "reconnecting", note: tries > 3 ? "Can't reach the relay. Still trying…" : "Reconnecting…" });
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)));
    };
  }

  return {
    inside: false,
    status: "idle",
    note: "",
    room: emptyRoom(),
    muted: loadMuted(),
    reported: [],

    enter: async () => {
      if (get().inside) return true;
      let s;
      try { s = await api.unity(); } catch { set({ note: "Could not read the Unity settings." }); return false; }
      if (!s.enabled || !s.key) { set({ note: "Switch Unity on in its panel first." }); return false; }
      stop();
      tries = 0;
      hello = { key: s.key, name: s.name, ghost: s.ghost, relay: s.relay };
      set({ inside: true, room: emptyRoom(), reported: [], note: "Connecting…", status: "connecting" });
      sweep = setInterval(() => set((st) => { const room = pruneBubbles(st.room, Date.now()); return room === st.room ? st : { room }; }), 500);
      connect();
      return true;
    },

    leave: (message) => {
      // Goodbye on purpose, so the relay leaves a plain or message ghost. Closing the window instead (no bye) leaves a broken one.
      if (get().status === "online") send({ t: "bye", ...(message ? { text: cleanText(message, UNITY_MAX_TEXT) } : {}) });
      stop();
      set({ inside: false, status: "idle", note: "", room: emptyRoom() });
    },

    say: (raw) => {
      const text = cleanText(raw, UNITY_MAX_TEXT);
      const now = Date.now();
      if (!text || now - lastSay < 1000 || get().status !== "online") return;
      lastSay = now;
      send({ t: "say", text });
      set((s) => ({ room: reduceRoom(s.room, { t: "say", id: s.room.me, text }, now) })); // the relay does not echo to the sender
    },

    // Called every frame by the scene; sends at most ~10 times a second, and only when something changed.
    move: (x, z, r) => {
      const now = performance.now();
      if (now - lastPos < 100) return;
      if (Math.abs(x - lastSent.x) < 0.02 && Math.abs(z - lastSent.z) < 0.02 && Math.abs(r - lastSent.r) < 0.02) return;
      lastPos = now; lastSent = { x, z, r };
      send({ t: "pos", x, y: 0, z, r });
    },

    setGhost: (on) => { if (hello) hello.ghost = on; send({ t: "ghost", on }); },

    mute: (id, on) => set((s) => {
      const muted = on ? [...new Set([...s.muted, id])].slice(-200) : s.muted.filter((m) => m !== id);
      try { localStorage.setItem(MUTE_KEY, JSON.stringify(muted)); } catch { /* private mode */ }
      return { muted };
    }),

    report: (id) => { if (get().reported.includes(id)) return; send({ t: "report", id }); set((s) => ({ reported: [...s.reported, id] })); },
  };
});
