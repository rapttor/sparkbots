/** Pure timing / rule logic for the 3D water-cooler chat (no DOM, no three.js, testable). */
import type { ChatSpeed } from "./settings";

/** Typewriter speed in characters per second. "instant" shows the whole line at once. */
export const CPS: Record<ChatSpeed, number> = { slow: 18, normal: 30, fast: 55, instant: Infinity };
/** How long a finished line stays before the next one appears on its own (automatic advance). */
export const AUTO_DELAY_MS = 3000;
/** A line is typed this long before it counts as finished (instant lines are done at once). */
export const typingMs = (len: number, speed: ChatSpeed): number => (CPS[speed] === Infinity ? 0 : (len / CPS[speed]) * 1000);
export const typedChars = (elapsedMs: number, len: number, speed: ChatSpeed): number => (CPS[speed] === Infinity ? len : Math.max(0, Math.min(len, Math.floor((elapsedMs / 1000) * CPS[speed]))));

export interface StepIn { elapsedMs: number; len: number; speed: ChatSpeed; auto: boolean; next: "bot" | "me" | null; hasOptions: boolean }
export interface StepOut {
  typed: number;          // characters visible now
  done: boolean;          // the line is fully typed
  canContinue: boolean;   // show the "continue ▸" button (another bot line is waiting)
  advance: boolean;       // show the next line now (automatic advance)
  showOptions: boolean;   // this is the last line, fully typed, and the thread offers options
}
/** One tick of the conversation: what is visible, and whether to move on by itself. My own lines never wait; the agent's wait AUTO_DELAY_MS (or a click, or forever in manual mode). */
export function step(i: StepIn): StepOut {
  const typed = typedChars(i.elapsedMs, i.len, i.speed);
  const done = typed >= i.len;
  const waited = i.elapsedMs >= typingMs(i.len, i.speed) + AUTO_DELAY_MS;
  return {
    typed, done,
    canContinue: done && i.next === "bot",
    advance: done && (i.next === "me" || (i.next === "bot" && i.auto && waited)),
    showOptions: done && i.next === null && i.hasOptions,
  };
}

/** Walking away ends the chat. Hysteresis: it arms once you were within NEAR, then ends beyond FAR; a chat opened from afar ends if you never get close within ARM_TIMEOUT_MS. */
export const NEAR = 5, FAR = 6, ARM_TIMEOUT_MS = 15_000;
export function distanceStep(dist: number, armed: boolean, openedMs: number): { armed: boolean; end: boolean } {
  const a = armed || dist <= NEAR;
  return { armed: a, end: dist > FAR && (a || openedMs > ARM_TIMEOUT_MS) };
}

/** Number keys 1-9 pick an option: returns its index, or -1. */
export const optionForKey = (key: string, count: number): number => { const n = /^[1-9]$/.test(key) ? Number(key) - 1 : -1; return n >= 0 && n < count ? n : -1; };

/** The line shown first when a chat opens: unread lines are revealed one by one; otherwise the last line is repeated for context. */
export const revealFrom = (total: number, unread: number): number => Math.max(0, unread > 0 ? total - unread : total - 1);
