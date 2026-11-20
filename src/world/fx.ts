/** Cosmetic effects on robots. An effect is DATA (a FxKind in `fx/<id>.ts`, picked up automatically): how the body moves and
 *  tints, and what particles / flash / lightning appear. Nothing here touches a session. */
export interface FxKind {
  id: string;
  ms: number;                                  // total duration
  pose?: {
    shake?: number;                            // random jitter (world units)
    hop?: number;                              // peak jump height
    spin?: number;                             // radians turned over the duration
    wiggle?: number;                           // sideways sway amplitude (radians)
    armUp?: number;                            // arm bar angle held up (radians)
    tint?: string;                             // body flashes toward this color
  };
  particles?: { count: number; colors: string[]; size: number; spread: number; rise: number; gravity?: number };
  flash?: { color: string; size: number };
  bolt?: boolean;                              // lightning from the sky
}

const mods = import.meta.glob("./fx/*.ts", { eager: true }) as Record<string, { default: FxKind }>;
export const FX: Record<string, FxKind> = Object.fromEntries(Object.values(mods).map((m) => [m.default.id, m.default]));

interface Playing { id: string; worker: string; t0: number; kind: FxKind }
const playing: Playing[] = [];

export function playFx(kindId: string, workerId: string, now = performance.now()): boolean {
  const kind = FX[kindId];
  if (!kind) return false;
  for (let i = playing.length - 1; i >= 0; i--) if (now - playing[i]!.t0 >= playing[i]!.kind.ms) playing.splice(i, 1);
  playing.push({ id: kindId, worker: workerId, t0: now, kind });
  if (playing.length > 24) playing.shift();
  return true;
}

/** Currently playing effects (oldest first) with their progress: age 0 -> 1, level 1 -> 0. */
export function activeFx(now = performance.now()): { worker: string; kind: FxKind; age: number; level: number }[] {
  const out: { worker: string; kind: FxKind; age: number; level: number }[] = [];
  for (const p of playing) {
    const age = (now - p.t0) / p.kind.ms;
    if (age < 1) out.push({ worker: p.worker, kind: p.kind, age, level: 1 - age });
  }
  return out;
}

export interface FxPose { jx: number; jz: number; hop: number; spin: number; sway: number; arm: number; tint?: string; tintAmt: number }
/** Everything the playing effects do to one robot's body right now (null = nothing playing). */
export function fxPose(worker: string, now = performance.now()): FxPose | null {
  let out: FxPose | null = null;
  for (const p of playing) {
    if (p.worker !== worker) continue;
    const age = (now - p.t0) / p.kind.ms;
    if (age >= 1) continue;
    const lvl = 1 - age, ps = p.kind.pose;
    if (!ps) continue;
    out ??= { jx: 0, jz: 0, hop: 0, spin: 0, sway: 0, arm: 0, tintAmt: 0 };
    if (ps.shake) { out.jx += (Math.random() - 0.5) * ps.shake * lvl; out.jz += (Math.random() - 0.5) * ps.shake * lvl; }
    if (ps.hop) out.hop += Math.sin(age * Math.PI) * ps.hop;
    if (ps.spin) out.spin += age * ps.spin;
    if (ps.wiggle) out.sway += Math.sin(age * 22) * ps.wiggle * lvl;
    if (ps.armUp) out.arm += ps.armUp * Math.min(1, lvl * 2.5);
    if (ps.tint) { out.tint = ps.tint; out.tintAmt = Math.max(out.tintAmt, Math.min(1, lvl * 1.3)); }
  }
  return out;
}
export const isFxActive = (worker: string, now = performance.now()) => playing.some((p) => p.worker === worker && now - p.t0 < p.kind.ms);
