import type { AgentSource, Team, WorkerState } from "../../server/adapters/types";

export const STATUSES: WorkerState[] = ["waiting", "working", "error", "done", "idle", "asleep"];
export const SOURCES: AgentSource[] = ["claude", "codex"];
export const UNLABELED = "__unlabeled__";
export const SORTS = [
  { id: "latest", label: "Latest activity" },
  { id: "status", label: "Status priority" },
  { id: "name", label: "Name A–Z" },
  { id: "tasks", label: "Open tasks (most)" },
  { id: "workers", label: "Workers (most)" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export interface TeamFilters {
  search: string;
  statuses: WorkerState[];
  sources: AgentSource[];
  labels: string[]; // label ids, or UNLABELED
  openTasks: boolean;
  sort: SortId;
}
export type OpenTasks = Record<string, { open: number } | null | undefined>;

export const DEFAULT_FILTERS: TeamFilters = { search: "", statuses: [], sources: [...SOURCES], labels: [], openTasks: false, sort: "latest" };

export const isDefault = (f: TeamFilters) =>
  !f.search.trim() && !f.statuses.length && f.sources.length === SOURCES.length && !f.labels.length && !f.openTasks;

const rank = (s: WorkerState) => { const i = STATUSES.indexOf(s); return i < 0 ? STATUSES.length : i; };
const bestRank = (t: Team) => t.workers.reduce((m, w) => Math.min(m, rank(w.state)), STATUSES.length);
const openOf = (tasks: OpenTasks, t: Team) => tasks[t.name]?.open ?? 0;

export function matchesTeam(t: Team, f: TeamFilters, tasks: OpenTasks): boolean {
  if (!t.workers.some((w) => f.sources.includes(w.source ?? "claude"))) return false;
  const q = f.search.trim().toLowerCase();
  if (q && !t.name.toLowerCase().includes(q) && !t.workers.some((w) => `${w.name ?? ""} ${w.title ?? ""}`.toLowerCase().includes(q))) return false;
  if (f.statuses.length && !t.workers.some((w) => f.statuses.includes(w.state))) return false;
  if (f.labels.length) {
    const ok = f.labels.some((l) => (l === UNLABELED ? t.labels.length === 0 : t.labels.includes(l)));
    if (!ok) return false;
  }
  if (f.openTasks && openOf(tasks, t) <= 0) return false;
  return true;
}

export function statusCounts(teams: Team[]): Record<WorkerState, number> {
  const c = { waiting: 0, working: 0, error: 0, done: 0, idle: 0, asleep: 0 } as Record<WorkerState, number>;
  for (const t of teams) for (const s of new Set(t.workers.map((w) => w.state))) c[s]++;
  return c;
}

export function filterAndSort(teams: Team[], f: TeamFilters, tasks: OpenTasks): Team[] {
  const out = teams.filter((t) => matchesTeam(t, f, tasks));
  const latest = (a: Team, b: Team) => b.lastActivityAt - a.lastActivityAt;
  const cmp: Record<SortId, (a: Team, b: Team) => number> = {
    latest,
    status: (a, b) => bestRank(a) - bestRank(b) || latest(a, b),
    name: (a, b) => a.name.localeCompare(b.name),
    tasks: (a, b) => openOf(tasks, b) - openOf(tasks, a) || latest(a, b),
    workers: (a, b) => b.workers.length - a.workers.length || latest(a, b),
  };
  return out.sort(cmp[f.sort] ?? latest);
}

/** Teams that pass the filters, with workers narrowed to the chosen statuses. Shared by every screen. */
export function applyFilters(teams: Team[], f: TeamFilters, tasks: OpenTasks): Team[] {
  const sourced = teams.map((t) => ({ ...t, workers: t.workers.filter((w) => f.sources.includes(w.source ?? "claude")) }));
  return filterAndSort(sourced, f, tasks).map((t) =>
    f.statuses.length ? { ...t, workers: t.workers.filter((w) => f.statuses.includes(w.state)) } : t);
}

const KEY = "agent-office.teamFilters";
export function loadFilters(): TeamFilters {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<TeamFilters> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_FILTERS;
    return {
      search: typeof raw.search === "string" ? raw.search : "",
      statuses: Array.isArray(raw.statuses) ? raw.statuses.filter((s) => STATUSES.includes(s)) : [],
      sources: Array.isArray(raw.sources) ? raw.sources.filter((s) => SOURCES.includes(s)) : [...SOURCES],
      labels: Array.isArray(raw.labels) ? raw.labels.filter((l) => typeof l === "string") : [],
      openTasks: raw.openTasks === true,
      sort: SORTS.some((s) => s.id === raw.sort) ? (raw.sort as SortId) : "latest",
    };
  } catch { return DEFAULT_FILTERS; }
}
export function saveFilters(f: TeamFilters) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* ignore */ }
}
