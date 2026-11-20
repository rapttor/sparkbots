import { ACTIONS } from "./actions";

/** Every key / mouse binding of the 3D office, in one list: the legend in the 3D view and the Settings > Keymap page both read it. */
export interface KeyDef {
  id: string;
  keys: string;
  label: string;
  /** Can be run by clicking it in the 3D legend (the 3D view supplies the handler and says when it is not possible right now). */
  actionable: boolean;
}

export const KEYMAP: KeyDef[] = [
  { id: "mode", keys: "V", label: "Switch walk / overview", actionable: true },
  { id: "talk", keys: "E", label: "Talk to the nearby agent", actionable: true },
  ...ACTIONS.map((a): KeyDef => ({ id: `action:${a.key}`, keys: a.key.toUpperCase(), label: `${a.label}: ${a.hint}`, actionable: true })),
  { id: "minimap", keys: "M", label: "Open the Map tab (the minimap)", actionable: true },
  { id: "lock", keys: "L", label: "Lock / unlock zoom", actionable: true },
  { id: "coffee", keys: "O", label: "Order a coffee (the barista sends a robot to you)", actionable: true },
  { id: "rally", keys: "R", label: "Rally: every agent waiting for you comes to you", actionable: true },
  { id: "wake", keys: "U", label: "Wake everyone who is asleep (15 s)", actionable: true },
  { id: "lunch", keys: "I", label: "Lunch break: idle agents go to the rooms", actionable: true },
  { id: "dismiss", keys: "X", label: "Send followers back", actionable: true },
  { id: "meeting", keys: "Q", label: "Meeting chat with the followers", actionable: true },
  { id: "follow-click", keys: "Shift+click", label: "Add / remove a follower", actionable: false },
  { id: "tags", keys: "T", label: "Show / hide name tags", actionable: true },
  { id: "reset", keys: "0", label: "Reset the view", actionable: true },
  { id: "esc", keys: "Esc", label: "Close the open menu or chat", actionable: true },
  { id: "move", keys: "W A S D / arrows", label: "Walk (walk mode)", actionable: false },
  { id: "sprint", keys: "Shift", label: "Hold while walking to sprint (speeds up)", actionable: false },
  { id: "floor", keys: "Click floor", label: "Walk there (walk mode)", actionable: false },
  { id: "agent", keys: "Click agent", label: "Open the agent menu", actionable: false },
  { id: "dbl", keys: "Double-click project", label: "Walk into that project (overview)", actionable: false },
  { id: "rdrag", keys: "Right-drag", label: "Turn the view (walk) / pan (overview)", actionable: false },
  { id: "wheel", keys: "Scroll", label: "Zoom", actionable: false },
];
