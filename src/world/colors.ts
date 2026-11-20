import type { WorkerState } from "../../server/adapters/types";

/** Same palette as the 2D state badges (.s-* in styles.css). Asleep is a dim grey. */
export const STATE_COLORS: Record<WorkerState, string> = {
  asleep: "#5f6879",
  idle: "#60a5fa",
  working: "#4ade80",
  waiting: "#ffb020",
  done: "#4fd1c5",
  error: "#f87171",
};

export const STATE_ORDER: WorkerState[] = ["waiting", "working", "error", "done", "idle", "asleep"];
export const STATE_LABELS: Record<WorkerState, string> = {
  asleep: "Asleep", idle: "Idle", working: "Working", waiting: "Waiting", done: "Done", error: "Error",
};
