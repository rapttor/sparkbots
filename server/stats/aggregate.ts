import type { AgentEvent } from "../adapters/types";
import prices from "./prices.json";

export type UsageEvent = Extract<AgentEvent, { kind: "usage" }>;
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface StatsSnapshot {
  byDay: Record<string, Tokens>;
  byProject: Record<string, Tokens>;
  byModel: Record<string, Tokens>;
  sessionsPerDay: Record<string, number>;
  hourHeatmap: number[];
  topProjectsWeek: { project: string; tokens: number }[];
  estCostUsd: number;
  pricesLastChecked: string;
  label: "estimate";
}

const DAY_MS = 86_400_000;
const zero = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const bump = (m: Record<string, Tokens>, key: string, e: Tokens) => {
  const t = (m[key] ??= zero());
  t.input += e.input; t.output += e.output; t.cacheRead += e.cacheRead; t.cacheWrite += e.cacheWrite;
};
const clone = (m: Record<string, Tokens>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));

type Family = "opus" | "sonnet" | "haiku" | "default";
const familyOf = (model: string): Family => {
  const m = model.toLowerCase();
  return m.includes("opus") ? "opus" : m.includes("sonnet") ? "sonnet" : m.includes("haiku") ? "haiku" : "default";
};

export class StatsAggregator {
  private byDay: Record<string, Tokens> = {};
  private byProject: Record<string, Tokens> = {};
  private byModel: Record<string, Tokens> = {};
  private sessionsPerDay: Record<string, number> = {};
  private hours: number[] = new Array(24).fill(0);
  private projectDay = new Map<string, Map<string, number>>(); // project -> dayStartMs -> input+output
  private seenSessions = new Set<string>();
  private cost = 0;

  add(e: UsageEvent, project: string): void {
    bump(this.byDay, dayKey(e.at), e);
    bump(this.byProject, project, e);
    bump(this.byModel, e.model, e);
    this.hours[new Date(e.at).getHours()]++;
    const d = new Date(e.at);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = this.projectDay.get(project) ?? new Map<string, number>();
    days.set(String(dayStart), (days.get(String(dayStart)) ?? 0) + e.input + e.output);
    this.projectDay.set(project, days);
    const p = prices.perMTok[familyOf(e.model)];
    this.cost += (e.input * p.input + e.output * p.output + e.cacheRead * p.cacheRead + e.cacheWrite * p.cacheWrite) / 1e6;
  }

  sessionStarted(session: string, _project: string, at: number): void {
    if (this.seenSessions.has(session)) return;
    this.seenSessions.add(session);
    const k = dayKey(at);
    this.sessionsPerDay[k] = (this.sessionsPerDay[k] ?? 0) + 1;
  }

  snapshot(now: number = Date.now()): StatsSnapshot {
    const cutoff = now - 7 * DAY_MS;
    const top: { project: string; tokens: number }[] = [];
    for (const [project, days] of this.projectDay) {
      let tokens = 0;
      for (const [ds, n] of days) if (Number(ds) + DAY_MS > cutoff && Number(ds) <= now) tokens += n;
      if (tokens > 0) top.push({ project, tokens });
    }
    top.sort((a, b) => b.tokens - a.tokens);
    return {
      byDay: clone(this.byDay),
      byProject: clone(this.byProject),
      byModel: clone(this.byModel),
      sessionsPerDay: { ...this.sessionsPerDay },
      hourHeatmap: [...this.hours],
      topProjectsWeek: top.slice(0, 5),
      estCostUsd: this.cost,
      pricesLastChecked: prices.lastChecked,
      label: "estimate",
    };
  }
}
