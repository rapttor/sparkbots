/** Simulated-chat preferences (browser-local). Read defensively: private mode / missing storage just yields defaults. */
export type ChatSpeed = "slow" | "normal" | "fast" | "instant";
export type ChatFilter = "family" | "pg13";
export interface SimChatSettings { enabled: boolean; speed: ChatSpeed; filter: ChatFilter; idleStart: boolean }

const KEY = "ao.simchat.settings";
export const DEFAULT_SETTINGS: SimChatSettings = { enabled: true, speed: "fast", filter: "pg13", idleStart: true };
/** ms per character for the typewriter. */
export const SPEED_MS: Record<ChatSpeed, number> = { slow: 45, normal: 22, fast: 9, instant: 0 };

const listeners = new Set<() => void>();
let cache: SimChatSettings | null = null;

export function getSettings(): SimChatSettings {
  if (cache) return cache;
  let s = { ...DEFAULT_SETTINGS };
  try { const raw = localStorage.getItem(KEY); if (raw) { const j = JSON.parse(raw) as Partial<SimChatSettings>; s = { ...s, ...pick(j) }; } } catch { /* defaults */ }
  return (cache = s);
}
function pick(j: Partial<SimChatSettings>): Partial<SimChatSettings> {
  const o: Partial<SimChatSettings> = {};
  if (typeof j.enabled === "boolean") o.enabled = j.enabled;
  if (typeof j.idleStart === "boolean") o.idleStart = j.idleStart;
  if (j.speed && j.speed in SPEED_MS) o.speed = j.speed;
  if (j.filter === "family" || j.filter === "pg13") o.filter = j.filter;
  return o;
}
export function setSettings(p: Partial<SimChatSettings>): void {
  cache = { ...getSettings(), ...pick(p) };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export function subscribeSettings(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
