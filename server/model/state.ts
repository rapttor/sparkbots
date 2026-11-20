import type { Activity, AgentEvent, WorkerState } from "../adapters/types";

/** Thresholds (ms) — sourced from Config, never hardcoded in callers. */
export interface Thresholds { idleMs: number; asleepMs: number; doneMs: number; errorMs: number }

export interface Runtime {
  state: WorkerState;
  activity: Activity;
  since: number;          // when `state` was entered
  lastEventAt: number;
  helpers: Set<string>;
  preview?: string;
  said?: { text: string; at: number }; // latest assistant message (for the speech bubble above the bot)
  hooked?: boolean;       // fed by hook events: exact state, skip the quiet-time heuristic
}

export const initialRuntime = (now: number, lastEventAt = 0): Runtime =>
  ({ state: "asleep", activity: "idle", since: now, lastEventAt, helpers: new Set() });

export interface Input { alive: boolean; mtimeMs: number }

const set = (rt: Runtime, state: WorkerState, now: number) => {
  if (rt.state !== state) { rt.state = state; rt.since = now; }
};

/** Apply one transcript/hook event. `activityOf` maps a tool event to an Activity. */
export function applyEvent(rt: Runtime, e: AgentEvent, activityOf: (tool: string, target?: string) => Activity): Runtime {
  rt.lastEventAt = Math.max(rt.lastEventAt, e.at);
  switch (e.kind) {
    case "turn_start": set(rt, "working", e.at); break;
    case "tool": set(rt, "working", e.at); rt.activity = activityOf(e.tool, e.target); break;
    case "message": rt.preview = e.preview; if (e.role === "assistant") rt.said = { text: e.preview, at: e.at }; if (e.role === "user") set(rt, "working", e.at); break;
    case "permission_wait": set(rt, "waiting", e.at); break;
    case "subagent": e.state === "start" ? rt.helpers.add(e.childId) : rt.helpers.delete(e.childId); break;
    case "turn_end": rt.activity = "idle"; rt.helpers.clear(); set(rt, "done", e.at); break;
    case "error": set(rt, "error", e.at); break;
    case "usage": break;
  }
  return rt;
}

/** Time-based transitions (§4.4). Call periodically. Pure w.r.t. `now`. */
export function tick(rt: Runtime, now: number, input: Input, t: Thresholds): Runtime {
  const quiet = now - Math.max(rt.lastEventAt, input.mtimeMs);

  if (rt.state === "done" && now - rt.since >= t.doneMs) set(rt, "idle", now);
  if (rt.state === "error" && now - rt.since >= t.errorMs) set(rt, "idle", now);

  // mtime heuristic (lowest-priority liveness source): fresh writes mean working.
  // Only writes not already explained by processed events (tailer/hooks) count, else a fresh turn_end would flip back to working.
  if ((rt.state === "idle" || rt.state === "asleep") && now - input.mtimeMs < t.idleMs && input.mtimeMs - rt.lastEventAt > 2000) {
    rt.activity = rt.activity === "idle" ? "running" : rt.activity;
    set(rt, "working", now);
  }
  // working with no activity beyond threshold and no turn_end seen -> idle
  if (rt.state === "working" && quiet >= t.idleMs && input.alive && !(rt.hooked && now - rt.lastEventAt < t.asleepMs)) { rt.activity = "idle"; set(rt, "idle", now); }

  if (input.alive && rt.state === "asleep") set(rt, "idle", now);
  if (!input.alive && (rt.state === "idle" || rt.state === "working") && quiet >= t.asleepMs) {
    rt.activity = "idle"; set(rt, "asleep", now);
  }
  return rt;
}

export const thresholdsFrom = (c: { idleThresholdSec: number; asleepAfterMin: number; doneWaveSec: number; errorSec: number }): Thresholds =>
  ({ idleMs: c.idleThresholdSec * 1000, asleepMs: c.asleepAfterMin * 60_000, doneMs: c.doneWaveSec * 1000, errorMs: c.errorSec * 1000 });
