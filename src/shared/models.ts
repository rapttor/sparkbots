/** Choices for the per-chat model picker. */
export interface ModelChoice { value: string; label: string; hint?: string }

export const CLAUDE_ALIASES = ["opus", "sonnet", "haiku"];

/**
 * Picker entries: Claude Code's default, the chat's current model, aliases, models of added services (Ollama, ...),
 * and whatever is currently typed/selected (so a custom name never disappears). No duplicates.
 */
export function modelChoices(current: string, sessionModel: string | undefined, serviceModels: string[]): ModelChoice[] {
  const out: ModelChoice[] = [{ value: "", label: "Default", hint: "Claude Code's / the project's default" }];
  const seen = new Set<string>([""]);
  const add = (value: string | undefined, label?: string, hint?: string) => { if (value && !seen.has(value)) { seen.add(value); out.push({ value, label: label ?? value, ...(hint ? { hint } : {}) }); } };
  add(sessionModel, sessionModel, "this chat's current model");
  for (const a of CLAUDE_ALIASES) add(a, a, "alias for the latest");
  for (const m of serviceModels) add(m, m, "from a service you added");
  add(current, current, "custom");
  return out;
}

/** What the picker button shows: the chosen model, else the chat's current one (marked), else "default". */
export function modelLabel(chosen: string, sessionModel: string | undefined): string {
  return chosen || (sessionModel ? `${sessionModel} (current)` : "default");
}
