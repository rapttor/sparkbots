import type { Worker } from "../../server/adapters/types";

/**
 * Things you can do to an agent from the 3D office (key, popup menu, keymap). One file per action in `actions/`,
 * picked up automatically. Two kinds:
 *  - "fx":   cosmetic only, runs at once (see fxAction.ts to make one in a few lines)
 *  - "real": sends something to a session or changes app data; always runs behind a confirmation and may refuse (`can`)
 */
export interface BotAction {
  key: string;                                  // single lowercase key
  label: string;
  hint: string;
  kind: "fx" | "real";
  run: (workerId: string, worker?: Worker) => void | Promise<unknown>;
  confirm?: (w: Worker) => string;              // real actions: the exact text shown before running
  can?: (w: Worker) => string | null;           // real actions: null = allowed, else the reason it is not
}

/** Keys already used by movement and the viewer. */
export const RESERVED_KEYS = ["w", "a", "s", "d", "e", "v", "m", "l", "t", "x", "q", "r", "u", "i", "o", "0"];

const mods = import.meta.glob("./actions/*.ts", { eager: true }) as Record<string, { default: BotAction }>;

/** Checks a list of actions; returns the valid ones and a message for each rejected one. Pure, so it is easy to test. */
export function validateActions(list: BotAction[]): { ok: BotAction[]; errors: string[] } {
  const ok: BotAction[] = [], errors: string[] = [], seen = new Set<string>();
  for (const a of list) {
    const why =
      !a || !/^[a-z1-9]$/.test(a.key ?? "") ? "key must be one lowercase letter or digit 1-9"
      : RESERVED_KEYS.includes(a.key) ? `key "${a.key}" is reserved`
      : seen.has(a.key) ? `key "${a.key}" is used twice`
      : !a.label || !a.hint ? "label and hint are required"
      : a.kind !== "fx" && a.kind !== "real" ? "kind must be fx or real"
      : a.kind === "real" && !a.confirm ? "real actions need a confirm text"
      : "";
    if (why) { errors.push(`${a?.label ?? "?"}: ${why}`); continue; }
    seen.add(a.key); ok.push(a);
  }
  return { ok, errors };
}

const checked = validateActions(Object.values(mods).map((m) => m.default));
for (const e of checked.errors) console.warn(`[actions] ${e}`);
export const ACTIONS: BotAction[] = checked.ok.sort((a, b) => a.label.localeCompare(b.label));
