import type { Activity, Snapshot, Team, Worker, WorkerState } from "../../server/adapters/types";

const STATES: WorkerState[] = ["asleep", "asleep", "asleep", "idle", "idle", "working", "working", "waiting", "done", "error"];
const ACTIVITIES: Activity[] = ["coding", "researching", "testing", "shipping", "running", "delegating", "planning"];
const COLORS = ["#4cc9f0", "#f72585", "#b5e48c", "#ffb703", "#9d4edd", "#2ec4b6"];
// Friendly demo names so screenshots and demos never show real projects.
const TEAM_NAMES = ["web-shop", "mobile-app", "api-gateway", "docs-site", "ml-pipeline", "infra"];
const TITLES = ["Fix flaky checkout test", "Add dark mode to settings", "Migrate users table", "Write the onboarding guide", "Speed up image resize", "Review the auth middleware", "Rename the config keys", "Plan the v2 release", "Trace the memory leak", "Add rate limiting"];
const SOURCES = ["claude", "codex", "opencode"] as const;

/** Deterministic fake snapshot (n workers across 6 teams, mixed states) for perf testing. */
export function makeFixtureSnapshot(n = 100): Snapshot {
  const now = Date.now();
  const teams: Team[] = COLORS.map((color, i) => ({ name: TEAM_NAMES[i % TEAM_NAMES.length]!, color, workers: [], lastActivityAt: now, labels: [], botColor: "#d97757" }));
  for (let i = 0; i < n; i++) {
    const team = teams[i % teams.length];
    const state = STATES[(i * 7) % STATES.length];
    const w: Worker = {
      id: `fixture-${String(i).padStart(4, "0")}`,
      team: team.name,
      cwd: `/fixture/${team.name}`,
      title: TITLES[i % TITLES.length]!,
      source: SOURCES[(i * 5) % SOURCES.length],
      state,
      activity: state === "working" ? ACTIVITIES[i % ACTIVITIES.length] : "idle",
      lastEventAt: now - i * 60_000,
      liveInTerminal: false,
      helpers: 0,
      color: "#d97757",
    };
    team.workers.push(w);
  }
  return { at: now, teams, skippedLines: 0, labelDefs: [] };
}
