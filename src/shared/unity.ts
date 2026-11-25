/**
 * Unity: the optional public lobby. Presence (position) and short plain-text bubbles through a small relay (see `relay/`).
 * Everything here is pure (no DOM, no network) so it is easy to test. The relay is not trusted: every message is validated
 * and sanitised here before it reaches the scene, and text is only ever rendered as plain text.
 */
import { DEFAULT_DEV_LOOK, LOGO_EMOJIS, TOP_STYLES, type DevLook } from "../world/devLook";

export const UNITY_ROOM = "unity";
export const DEFAULT_RELAY = "wss://sparkbots-relay.rapttor.workers.dev";
export const UNITY_MAX_TEXT = 80;
export const UNITY_BUBBLE_MS = 7000;
export const UNITY_RADIUS = 13; // walkable radius of the Unity floor
export const UNITY_MAX_PEERS = 60;
export const UNITY_MAX_GHOSTS = 30;
export const UNITY_MAX_NAME = 24;

/** The character a player chose in their own SparkBots (avatar + developer look); everybody sees them as that character. */
export type UAvatar = "developer" | "raptor" | "spark";
export type ULook = DevLook;
export interface UPeer { id: string; avatar: UAvatar; look: ULook; name: string; color: string; x: number; y: number; z: number; r: number }
/** How someone left: said goodbye with a message, said goodbye without one, or the connection just dropped (window closed). */
export type GhostKind = "message" | "plain" | "broken";
export interface UGhost extends UPeer { kind: GhostKind; text: string; leftAt: number }

export type UnityMsg =
  | { t: "welcome"; id: string; peers: UPeer[]; ghosts: UGhost[] }
  | { t: "join"; peer: UPeer }
  | { t: "pos"; id: string; x: number; y: number; z: number; r: number }
  | { t: "say"; id: string; text: string }
  | { t: "leave"; id: string; ghost?: UGhost }
  | { t: "replaced" };

/** Close codes the relay uses. */
export const CLOSE = { replaced: 4000, noHello: 4001, badKey: 4002, banned: 4003, flood: 4004 } as const;

export interface UnityRoomState {
  me: string;
  peers: Record<string, UPeer>;
  ghosts: UGhost[];                             // newest first
  bubbles: Record<string, { text: string; until: number }>;
}
export const emptyRoom = (): UnityRoomState => ({ me: "", peers: {}, ghosts: [], bubbles: {} });

// ---- sanitising

const ID = /^[0-9a-f]{16}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const INVISIBLE: [number, number][] = [[0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202f], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const visible = (ch: string): boolean => { const cp = ch.codePointAt(0) ?? 0; return !INVISIBLE.some(([a, b]) => cp >= a && cp <= b); };

/** Plain text only: no control, invisible or bidi characters, collapsed whitespace, capped length. */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return [...s.replace(/\s+/g, " ")].filter(visible).join("").replace(/\s+/g, " ").trim().slice(0, max);
}
const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1e4, Math.min(1e4, n)) : 0);

/** Only known values get through: a relay (or a hello) cannot smuggle arbitrary text into what gets rendered. */
export function lookOf(o: unknown): ULook {
  const l = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  const D = DEFAULT_DEV_LOOK;
  return {
    top: TOP_STYLES.some((t) => t.id === l.top) ? (l.top as ULook["top"]) : D.top,
    topColor: typeof l.topColor === "string" && COLOR.test(l.topColor) ? l.topColor : D.topColor,
    logo: typeof l.logo === "string" && LOGO_EMOJIS.includes(l.logo) ? l.logo : D.logo,
    glasses: typeof l.glasses === "boolean" ? l.glasses : D.glasses,
    beard: typeof l.beard === "boolean" ? l.beard : D.beard,
    overweight: typeof l.overweight === "boolean" ? l.overweight : D.overweight,
  };
}
export const avatarOf = (v: unknown): UAvatar => (v === "raptor" || v === "spark" ? v : "developer");

function peerOf(o: unknown): UPeer | null {
  if (!o || typeof o !== "object") return null;
  const p = o as Record<string, unknown>;
  if (typeof p.id !== "string" || !ID.test(p.id)) return null;
  return { id: p.id, avatar: avatarOf(p.avatar), look: lookOf(p.look), name: cleanText(p.name, UNITY_MAX_NAME) || "Guest", color: typeof p.color === "string" && COLOR.test(p.color) ? p.color : "#4fc3f7", x: num(p.x), y: num(p.y), z: num(p.z), r: num(p.r) };
}
function ghostOf(o: unknown): UGhost | null {
  const p = peerOf(o);
  if (!p) return null;
  const g = o as Record<string, unknown>;
  const kind: GhostKind = g.kind === "message" || g.kind === "broken" ? g.kind : "plain"; // unknown or missing: a plain ghost
  const text = kind === "message" ? cleanText(g.text, UNITY_MAX_TEXT) : ""; // only a goodbye message carries text
  return { ...p, kind: text || kind !== "message" ? kind : "plain", text, leftAt: typeof g.leftAt === "number" && Number.isFinite(g.leftAt) ? g.leftAt : 0 };
}

/** Parse and validate one relay frame. Anything unexpected returns null. */
export function parseMsg(raw: string): UnityMsg | null {
  if (raw.length > 64_000) return null;
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!m || typeof m !== "object") return null;
  switch (m.t) {
    case "welcome": {
      if (typeof m.id !== "string" || !ID.test(m.id)) return null;
      const peers = (Array.isArray(m.peers) ? m.peers : []).slice(0, UNITY_MAX_PEERS).map(peerOf).filter((p): p is UPeer => !!p);
      const ghosts = (Array.isArray(m.ghosts) ? m.ghosts : []).slice(0, UNITY_MAX_GHOSTS).map(ghostOf).filter((g): g is UGhost => !!g);
      return { t: "welcome", id: m.id, peers, ghosts };
    }
    case "join": { const peer = peerOf(m.peer); return peer ? { t: "join", peer } : null; }
    case "pos": return typeof m.id === "string" && ID.test(m.id) ? { t: "pos", id: m.id, x: num(m.x), y: num(m.y), z: num(m.z), r: num(m.r) } : null;
    case "say": {
      const text = cleanText(m.text, UNITY_MAX_TEXT);
      return typeof m.id === "string" && ID.test(m.id) && text ? { t: "say", id: m.id, text } : null;
    }
    case "leave": {
      if (typeof m.id !== "string" || !ID.test(m.id)) return null;
      const ghost = m.ghost ? ghostOf(m.ghost) : null;
      return { t: "leave", id: m.id, ...(ghost ? { ghost } : {}) };
    }
    case "replaced": return { t: "replaced" };
    default: return null;
  }
}

// ---- state

/** Apply one message to the room (positions are handled separately, see `applyPos`, because they change 10 times a second). */
export function reduceRoom(s: UnityRoomState, m: UnityMsg, now: number): UnityRoomState {
  switch (m.t) {
    case "welcome": {
      const peers: Record<string, UPeer> = {};
      for (const p of m.peers) if (p.id !== m.id) peers[p.id] = p;
      return { me: m.id, peers, ghosts: m.ghosts.filter((g) => g.id !== m.id).sort((a, b) => b.leftAt - a.leftAt).slice(0, UNITY_MAX_GHOSTS), bubbles: {} };
    }
    case "join": {
      if (m.peer.id === s.me) return s;
      if (!s.peers[m.peer.id] && Object.keys(s.peers).length >= UNITY_MAX_PEERS) return s;
      return { ...s, peers: { ...s.peers, [m.peer.id]: m.peer }, ghosts: s.ghosts.filter((g) => g.id !== m.peer.id) }; // being here again removes your ghost
    }
    case "say": {
      if (m.id !== s.me && !s.peers[m.id]) return s;
      return { ...s, bubbles: { ...s.bubbles, [m.id]: { text: m.text, until: now + UNITY_BUBBLE_MS } } };
    }
    case "leave": {
      const { [m.id]: _gone, ...peers } = s.peers;
      const { [m.id]: _b, ...bubbles } = s.bubbles;
      const ghosts = m.ghost && m.id !== s.me ? [m.ghost, ...s.ghosts.filter((g) => g.id !== m.id)].slice(0, UNITY_MAX_GHOSTS) : s.ghosts.filter((g) => g.id !== m.id);
      return { ...s, peers, bubbles, ghosts };
    }
    default: return s;
  }
}

/** Drop expired bubbles. Returns the same object when nothing expired (so a store does not re-render). */
export function pruneBubbles(s: UnityRoomState, now: number): UnityRoomState {
  const keys = Object.keys(s.bubbles);
  if (!keys.some((k) => s.bubbles[k]!.until <= now)) return s;
  const bubbles: UnityRoomState["bubbles"] = {};
  for (const k of keys) if (s.bubbles[k]!.until > now) bubbles[k] = s.bubbles[k]!;
  return { ...s, bubbles };
}

// ---- small helpers

export const relayUrl = (base: string, room = UNITY_ROOM): string => `${base.replace(/\/+$/, "")}/room/${room}`;

/** wss:// for any host; plain ws:// only for a relay on this machine (development). */
export const validRelay = (u: unknown): u is string =>
  typeof u === "string" && u.length <= 200 && (/^wss:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?\/?$/i.test(u) || /^ws:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?\/?$/.test(u));

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Keep a ghost inside the walkable floor, whatever the relay says. */
export function clampToFloor(x: number, z: number, radius = UNITY_RADIUS - 0.8): { x: number; z: number } {
  const d = Math.hypot(x, z);
  return d <= radius ? { x, z } : { x: (x / d) * radius, z: (z / d) * radius };
}
