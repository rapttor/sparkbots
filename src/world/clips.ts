import type { WorkerState } from "../../server/adapters/types";

/** Extra body motion added on top of the base pose (all optional). Angles in radians, hop/bob in world units. */
export interface ClipPose { bob?: number; sway?: number; wave?: number; swing?: number; hop?: number; spin?: number; lean?: number }

/**
 * A short animation. One file per clip in `clips/`, picked up automatically:
 *  - "idle" clips are picked at random while an idle robot stands still (`seconds` = how long each lasts)
 *  - "status" clips play for as long as the robot is in `state` (done, error, waiting, ...)
 */
export interface Clip {
  id: string;
  kind: "idle" | "status" | "special"; // special: played on request by code (e.g. the conductor)
  state?: WorkerState;                       // status clips
  seconds?: [number, number];                // idle clips: min and max duration
  icon?: string;                             // emoji floating above the head while it plays
  orbit?: { rx: number; rz: number; speed: number }; // walk an ellipse around the desk (radians per second)
  pose: (t: number, phase: number) => ClipPose; // t = seconds since the clip started
}

const mods = import.meta.glob("./clips/*.ts", { eager: true }) as Record<string, { default: Clip }>;
export const CLIPS: Clip[] = Object.values(mods).map((m) => m.default);
export const IDLE_CLIPS = CLIPS.filter((c) => c.kind === "idle");
export const clipById = (id: string): Clip | undefined => CLIPS.find((c) => c.id === id);
export const statusClip = (state: WorkerState): Clip | undefined => CLIPS.find((c) => c.kind === "status" && c.state === state);

/** Icon floating over a robot for a status even without a clip. */
export const STATE_ICON: Partial<Record<WorkerState, string>> = { error: "❗", waiting: "❓", asleep: "💤" };

/** Problems with a clip definition (used by the test and when loading). */
export function clipProblems(c: Clip): string[] {
  const p: string[] = [];
  if (!c.id) p.push("id missing");
  if (c.kind === "status" && !c.state) p.push("status clip needs a state");
  if (c.kind === "idle" && (!c.seconds || c.seconds[0] <= 0 || c.seconds[1] < c.seconds[0])) p.push("idle clip needs seconds [min, max]");
  const o = c.pose(0.5, 0);
  for (const [k, v] of Object.entries(o)) if (typeof v !== "number" || !Number.isFinite(v)) p.push(`pose.${k} is not a finite number`);
  return p;
}
