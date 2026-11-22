/** Slash commands / skills for the chat composer: list shape, filtering, and the built-ins that make sense in a headless run. */

export interface SlashItem {
  name: string;               // without the leading slash; sub-folders joined with ":" (git/commit -> git:commit)
  description?: string;
  argumentHint?: string;
  source: "project" | "user" | "skill" | "builtin";
}

/** Built-ins that work with `claude -p`. Interactive-only ones (/clear, /model, /config, ...) are left out on purpose. */
export const BUILTIN_COMMANDS: SlashItem[] = [
  { name: "compact", description: "Summarize the conversation to free up context (optional focus text)", argumentHint: "[what to keep]", source: "builtin" },
  { name: "context", description: "Show how much of the context window is used", source: "builtin" },
  { name: "cost", description: "Show token usage and cost of this session", source: "builtin" },
];

/** The slash query being typed (`/com` -> "com"), or null when the text is not a lone slash command word. */
export function slashQuery(text: string): string | null {
  const m = /^\/([\w:.\-]*)$/.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

/** Commands matching what was typed: prefix matches first, then substring matches (name or description). */
export function filterSlash(items: SlashItem[], query: string, limit = 12): SlashItem[] {
  const q = query.toLowerCase();
  const seen = new Set<string>(), out: SlashItem[] = [];
  const add = (list: SlashItem[]) => { for (const i of list) if (!seen.has(i.name)) { seen.add(i.name); out.push(i); } };
  add(items.filter((i) => i.name.toLowerCase().startsWith(q)));
  if (q) add(items.filter((i) => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)));
  return out.slice(0, limit);
}
