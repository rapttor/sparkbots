import { useMemo, useState } from "react";
import { NerdStats } from "./NerdStats";
import { api, call } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import type { Tokens } from "../../server/stats/aggregate";
import type { WorkerState } from "../../server/adapters/types";
import { STATE_COLORS, STATE_LABELS, STATE_ORDER } from "../world/colors";
import { fmtNum, fmtShare } from "../util";

const total = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite;
const pad = (n: number) => String(n).padStart(2, "0");

const SERVICES = [
  { id: "claude", label: "Claude Code", color: "var(--accent)" },
  { id: "codex", label: "Codex", color: "var(--blue)" },
  { id: "opencode", label: "OpenCode", color: "var(--amber)" },
] as const;
const RANGES = [7, 30, 90] as const;
type Range = "today" | `${number}` | `${number}-${number}`; // "today", a number of days ("30"), or a month ("2026-05")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const isMonth = (r: string) => /^\d{4}-\d{2}$/.test(r);
const isRange = (v: unknown) => v === "today" || (typeof v === "string" && (RANGES.map(String).includes(v) || isMonth(v)));

interface Bar { key: string; label: string; parts: Record<string, number>; tokens: number }
type Per = Record<string, Record<string, Tokens>>;
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addTok = (a: Tokens, b: Tokens): Tokens => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const zeroTok = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** The bars of the chosen range (hours of today, days of a month, or the last N days) plus per-service token totals inside it. */
function series(byDay: Per, byHour: Per, range: Range, chosen: string[], all: string[]) {
  const keys: { key: string; label: string; src: Per }[] = [];
  const now = new Date();
  if (range === "today") for (let h = 0; h < 24; h++) keys.push({ key: `${keyOf(now)}T${pad(h)}`, label: `${pad(h)}:00`, src: byHour });
  else if (isMonth(range)) {
    const y = Number(range.slice(0, 4)), m = Number(range.slice(5, 7)) - 1, n = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) { const k = keyOf(new Date(y, m, d)); keys.push({ key: k, label: k, src: byDay }); }
  } else for (let i = Number(range) - 1; i >= 0; i--) { const k = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)); keys.push({ key: k, label: k, src: byDay }); }
  const totals: Record<string, Tokens> = Object.fromEntries(all.map((id) => [id, zeroTok()]));
  const bars: Bar[] = keys.map(({ key, label, src }) => {
    const parts: Record<string, number> = {}; let sum = 0;
    for (const id of all) { const t = src[id]?.[key]; if (t) totals[id] = addTok(totals[id]!, t); if (chosen.includes(id)) { parts[id] = t ? total(t) : 0; sum += parts[id]!; } }
    return { key, label, parts, tokens: sum };
  });
  return { bars, totals };
}

/** "YYYY-MM" of every month that has data, newest first. */
const monthsWith = (byDay: Per) => [...new Set(Object.values(byDay).flatMap((d) => Object.keys(d).map((k) => k.slice(0, 7))))].sort().reverse();

function loadPref<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return ok(v) ? (v as T) : fallback; } catch { return fallback; }
}
const savePref = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

function Table({ rows }: { rows: Record<string, Tokens> }) {
  const list = Object.entries(rows).sort((a, b) => total(b[1]) - total(a[1]));
  return (
    <table>
      <thead><tr><th>Name</th><th>Input</th><th>Output</th><th>Cache R</th><th>Cache W</th></tr></thead>
      <tbody>
        {list.map(([k, t]) => (
          <tr key={k}><td>{k}</td><td>{fmtNum(t.input)}</td><td>{fmtNum(t.output)}</td><td>{fmtNum(t.cacheRead)}</td><td>{fmtNum(t.cacheWrite)}</td></tr>
        ))}
        {list.length === 0 && <tr><td colSpan={5} className="muted">No data</td></tr>}
      </tbody>
    </table>
  );
}

interface ServiceRow { id: string; name: string; kind: string; status?: { up: boolean; latencyMs?: number; loaded?: string[]; models?: string[] } }
/** Other AI services you added or found (Ollama, LM Studio, ...): are they up, how fast, what is loaded. Manage them under Services. */
function ServiceStats() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  useLive(async () => { try { setRows(await call<ServiceRow[]>("GET", "/api/services")); } catch { /* ignore */ } }, ["services"]);
  if (!rows.length) return null;
  return (
    <>
      <h2>Other services</h2>
      <table>
        <thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>Latency</th><th>Loaded models</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.kind}</td>
              <td className={s.status ? (s.status.up ? "s-working" : "s-error") : "muted"}>{s.status ? (s.status.up ? "up" : "down") : "not tested"}</td>
              <td>{s.status?.latencyMs !== undefined ? `${s.status.latencyMs} ms` : "–"}</td>
              <td>{s.status?.loaded?.join(", ") || (s.status?.models?.length ? `${s.status.models.length} available` : "–")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** How every agent is doing right now: the Waiting / Working / Error ... counts that used to float in the 3D view. */
function AgentStates() {
  const snapshot = useStore((s) => s.snapshot);
  const counts = useMemo(() => {
    const c: Record<WorkerState, number> = { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 };
    for (const t of snapshot?.teams ?? []) for (const w of t.workers) c[w.state]++;
    return c;
  }, [snapshot]);
  return (
    <>
      <h2>Agents right now</h2>
      <div className="state-counts">
        {STATE_ORDER.map((s) => (
          <div key={s} className="legend-row">
            <span className="legend-dot" style={{ background: STATE_COLORS[s] }} />
            <span>{STATE_LABELS[s]}</span>
            <b className="legend-n">{counts[s]}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function Stats() {
  const stats = useStore((s) => s.stats);
  const [range, setRange] = useState<Range>(() => loadPref<Range>("ao.statsRange", "30", isRange));
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { useStore.setState({ stats: await api.refreshStats() }); } catch { /* the next automatic pass will catch up */ } finally { setRefreshing(false); } };
  const [off, setOff] = useState<string[]>(() => loadPref("ao.statsOff", [], Array.isArray)); // services switched off in the toggle
  if (!stats) return <section className="panel"><h1>Stats</h1><AgentStates /><p className="muted">Loading…</p></section>;
  const present = SERVICES.filter((x) => stats.bySource?.[x.id]);
  const chosen = present.filter((x) => !off.includes(x.id)).map((x) => x.id as string);
  const pickRange = (r: Range) => { setRange(r); savePref("ao.statsRange", r); };
  const toggle = (id: string) => { const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id]; setOff(next); savePref("ao.statsOff", next); };
  const allIds = present.map((x) => x.id as string);
  const { bars: days, totals: rangeTotals } = series(stats.bySourceDay ?? {}, stats.bySourceHour ?? {}, range, chosen, allIds);
  const months = monthsWith(stats.bySourceDay ?? {});
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const hmax = Math.max(1, ...stats.hourHeatmap);
  const W = 600, H = 140, bw = W / days.length;
  const rangeName = range === "today" ? "today, per hour" : isMonth(range) ? monthLabel(range) : `last ${range} days`;
  const grand = Math.max(1, present.reduce((n, x) => n + total(rangeTotals[x.id]!), 0));
  return (
    <section className="panel">
      <div className="tb-row"><h1 style={{ margin: 0 }}>Stats</h1><span className="spacer" />
        <button className="small" disabled={refreshing} title="Re-read changed sessions now instead of waiting for the next automatic pass (every 30 s)" onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
      <AgentStates />
      <div className="tb-row stats-toggle" role="group" aria-label="Chart filters">
        {present.map((x) => (
          <button key={x.id} className={`chip ${off.includes(x.id) ? "" : "on"}`} aria-pressed={!off.includes(x.id)} onClick={() => toggle(x.id)}>
            <span className="legend-dot" style={{ background: x.color }} /> {x.label}
          </button>
        ))}
        <span className="spacer" />
        <button className={`chip ${range === "today" ? "on" : ""}`} aria-pressed={range === "today"} onClick={() => pickRange("today")}>Today</button>
        {RANGES.map((n) => <button key={n} className={`chip ${range === String(n) ? "on" : ""}`} aria-pressed={range === String(n)} onClick={() => pickRange(String(n) as Range)}>{n} d</button>)}
        {months.length > 0 && (
          <select className={`chip ${isMonth(range) ? "on" : ""}`} aria-label="Month" value={isMonth(range) ? range : ""} onChange={(e) => { if (e.target.value) pickRange(e.target.value as Range); }}>
            <option value="">Month…</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        )}
      </div>
      <h2>Tokens {rangeName === "today, per hour" ? "" : "per day "}({rangeName})</h2>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" role="img" aria-label="Tokens per day, stacked by service">
        {days.map((d, i) => {
          let y = H;
          return (
            <g key={d.key}>
              <title>{`${d.label}: ${d.tokens.toLocaleString()} tokens`}</title>
              {present.filter((x) => chosen.includes(x.id)).map((x) => {
                const h = (d.parts[x.id]! / max) * H; y -= h;
                return h > 0 ? <rect key={x.id} x={i * bw + 1} y={y} width={Math.max(1, bw - 2)} height={h} fill={x.color} /> : null;
              })}
            </g>
          );
        })}
        <text x="0" y={H + 14} className="axis">{days[0]!.label}</text>
        <text x={W} y={H + 14} textAnchor="end" className="axis">{days[days.length - 1]!.label}</text>
      </svg>
      <p className="muted small">History is kept in SparkBots' own cache, so days stay even after a tool deletes old transcripts. Stats refresh about every 30 s.</p>

      <h2>By service <span className="muted small">({rangeName})</span></h2>
      <div className="table-scroll"><table>
        <thead><tr><th>Service</th><th>Tokens</th><th>Share</th><th>Input</th><th>Output</th><th>Cache</th><th>Est. cost (all time)</th></tr></thead>
        <tbody>
          {present.map((x) => {
            const t = rangeTotals[x.id]!, c = stats.costBySource?.[x.id];
            return (
              <tr key={x.id}>
                <td><span className="legend-dot" style={{ background: x.color }} /> {x.label}</td>
                <td>{fmtNum(total(t))}</td><td>{fmtShare(total(t), grand)}</td>
                <td>{fmtNum(t.input)}</td><td>{fmtNum(t.output)}</td><td>{fmtNum(t.cacheRead + t.cacheWrite)}</td>
                <td>{c !== undefined ? `$${c.toFixed(2)}` : <span className="muted" title="No price table for this service">–</span>}</td>
              </tr>
            );
          })}
          {present.length === 0 && <tr><td colSpan={7} className="muted">No data</td></tr>}
        </tbody>
      </table></div>

      <h2>Estimated cost <span className="tag">estimate</span></h2>
      <p>
        <strong>${stats.estCostUsd.toFixed(2)}</strong> <span className="muted">Claude Code only, API-equivalent · prices last checked {stats.pricesLastChecked}</span>
      </p>

      <h2>Active hours</h2>
      <div className="heat">
        {stats.hourHeatmap.map((n, h) => (
          <div key={h} className="cell" title={`${pad(h)}:00 — ${n} events`} style={{ opacity: 0.12 + 0.88 * (n / hmax) }}>{h}</div>
        ))}
      </div>

      <h2>Top projects this week</h2>
      <table>
        <tbody>
          {stats.topProjectsWeek.map((p) => <tr key={p.project}><td>{p.project}</td><td>{fmtNum(p.tokens)}</td></tr>)}
          {stats.topProjectsWeek.length === 0 && <tr><td className="muted">No activity this week</td></tr>}
        </tbody>
      </table>

      <ServiceStats />
      <NerdStats />
      <h2>By project</h2><Table rows={stats.byProject} />
      <h2>By model</h2><Table rows={stats.byModel} />
    </section>
  );
}
