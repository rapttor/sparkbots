/** Session titles make poor driver names ("Untitled", whole sentences): short, and never empty. */
export function shortName(title: string, team?: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t || /^untitled$/i.test(t)) return `${team ? team.slice(0, 14) : "Agent"} bot`;
  return t.length > 20 ? `${t.slice(0, 19)}…` : t;
}

