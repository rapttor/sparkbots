/** Gym fun (pure): boredom thoughts on the treadmill and the "too much pumping" blow-up timing. */
export const BORED_LINES = [
  "Why the hell would anyone do this on purpose?",
  "I'm running… to stay exactly where I am.",
  "The belt moves. I go nowhere. Efficient.",
  "Is it over yet? It's been 40 seconds.",
  "I could be idle somewhere with coffee.",
];
export const boredLine = (rnd = Math.random()): string => BORED_LINES[Math.min(BORED_LINES.length - 1, Math.floor(rnd * BORED_LINES.length))]!;

export const PUMP_LIMIT_S = 14;  // lifting this long makes a robot swell
export const BLOW_S = 3;         // the over-pump effect lasts a few seconds, then it re-forms in place
export type Pump = "normal" | "swelling" | "blown";
/** Phase for a lifter that has been at the bench for `s` seconds. */
export function pumpPhase(s: number): Pump { return s < PUMP_LIMIT_S - 4 ? "normal" : s < PUMP_LIMIT_S ? "swelling" : s < PUMP_LIMIT_S + BLOW_S ? "blown" : "normal"; }
/** Scale factor for the swelling effect (1 = normal). */
export function pumpScale(s: number): number { const p = pumpPhase(s); return p === "swelling" ? 1 + 0.5 * ((s - (PUMP_LIMIT_S - 4)) / 4) : p === "blown" ? 0.01 : 1; }
