import { api } from "../../api";
import { displayName } from "../../util";
import type { BotAction } from "../actions";

const TEXT = "Are you still there? Please reply with a one-line status.";
const COOLDOWN_MS = 60_000;
const last = new Map<string, number>();

/** Ask an agent for a one-line status. A real message: confirmed first, refused for sessions open in a terminal, once a minute per agent. */
const nudge: BotAction = {
  key: "g", label: "Nudge", hint: "ask for a one-line status", kind: "real",
  confirm: (w) => `Send this to "${displayName(w)}"?\n\n${TEXT}`,
  can: (w) => (w.liveInTerminal ? "Live in a terminal (use Fork instead)" : w.state === "working" ? "Already working" : performance.now() - (last.get(w.id) ?? -Infinity) < COOLDOWN_MS ? "Nudged a moment ago" : null),
  run: async (id) => { last.set(id, performance.now()); await api.send(id, TEXT); },
};
export default nudge;
