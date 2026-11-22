/** Anger room session logic (pure): pick a weapon, smash props for 60 s, earn points, then the room resets. */
export interface Weapon { id: string; name: string; icon: string; power: number }
export const WEAPONS: Weapon[] = [
  { id: "bat", name: "Bat", icon: "🏏", power: 1 },
  { id: "sledge", name: "Sledgehammer", icon: "🔨", power: 2 },
  { id: "frying-pan", name: "Frying pan", icon: "🍳", power: 1 },
];
export const SESSION_S = 60;

export interface Target { id: number; icon: string; hp: number; pts: number; x: number; z: number; alive: boolean }
export interface Session { weapon: string | null; startedAt: number; points: number; targets: Target[] }

const KINDS: { icon: string; hp: number; pts: number }[] = [
  { icon: "🖥️", hp: 2, pts: 10 }, { icon: "🪴", hp: 1, pts: 5 }, { icon: "🖨️", hp: 3, pts: 20 }, { icon: "📠", hp: 2, pts: 10 }, { icon: "🏺", hp: 1, pts: 5 },
];
export const TARGET_COUNT = 8;

/** Fresh set of targets, laid out on a grid inside a (w x d) room. `rnd` makes it deterministic in tests. */
export function spawnTargets(w: number, d: number, rnd: () => number = Math.random): Target[] {
  const cols = 4, rows = Math.ceil(TARGET_COUNT / cols);
  return Array.from({ length: TARGET_COUNT }, (_, i) => {
    const k = KINDS[Math.floor(rnd() * KINDS.length)]!;
    const c = i % cols, r = Math.floor(i / cols);
    return { id: i, icon: k.icon, hp: k.hp, pts: k.pts, x: ((c + 0.5) / cols - 0.5) * (w - 2), z: ((r + 0.5) / rows - 0.5) * (d - 3) - 0.5, alive: true };
  });
}
export const startSession = (weapon: string | null, now: number, w: number, d: number, rnd?: () => number): Session => ({ weapon, startedAt: now, points: 0, targets: spawnTargets(w, d, rnd) });
export const timeLeft = (s: Session, now: number): number => Math.max(0, SESSION_S - (now - s.startedAt) / 1000);
export const isOver = (s: Session, now: number): boolean => timeLeft(s, now) <= 0 || s.targets.every((t) => !t.alive);

/** Hit a target. Needs a chosen weapon and a running session; damage = weapon power. Returns a new session. */
export function smash(s: Session, id: number, now: number): Session {
  const w = WEAPONS.find((x) => x.id === s.weapon);
  if (!w || isOver(s, now)) return s;
  const targets = s.targets.map((t) => (t.id === id && t.alive ? { ...t, hp: t.hp - w.power, alive: t.hp - w.power > 0 } : t));
  const broke = s.targets.find((t) => t.id === id && t.alive && t.hp - w.power <= 0);
  return { ...s, targets, points: s.points + (broke ? broke.pts : 0) };
}
