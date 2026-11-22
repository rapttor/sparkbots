import { useMemo, useState } from "react";
import { NerdStats } from "./NerdStats";
import { api, call } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import type { Tokens } from "../../server/stats/aggregate";
import type { WorkerState } from "../../server/adapters/types";
import { STATE_COLORS, STATE_LABELS, STATE_ORDER } from "../world/colors";
import { fmtNum } from "../util";

const total = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite;
const pad = (n: number) => String(n).padStart(2, "0");

const SERVICES = [
  { id: "claude", label: "Claude Code", color: "var(--accent)" },
  { id: "codex", label: "Codex", color: "var(--blue)" },
  { id: "opencode", label: "OpenCode", color: "var(--amber)" },
] as const;
const RANGES = [7, 30, 90] as const;

/** One entry per day for the last `n` days; per service tokens (only the chosen services). */
function lastDays(bySourceDay: Record<string, Record<string, Tokens>>, n: number, chosen: string[]) {
  const out: { day: string; parts: Record<string, number>; tokens: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parts: Record<string, number> = {}; let sum = 0;
    for (const id of chosen) { const t = bySourceDay[id]?.[k]; parts[id] = t ? total(t) : 0; sum += parts[id]!; }
    out.push({ day: k, parts, tokens: sum });
  }
  return out;
}

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
  const [range, setRange] = useState<number>(() => loadPref("ao.statsRange", 30, (v) => RANGES.includes(v as 7)));
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { useStore.setState({ stats: await api.refreshStats() }); } catch { /* the next automatic pass will catch up */ } finally { setRefreshing(false); } };
  const [off, setOff] = useState<string[]>(() => loadPref("ao.statsOff", [], Array.isArray)); // services switched off in the toggle
  if (!stats) return <section className="panel"><h1>Stats</h1><AgentStates /><p className="muted">Loading…</p></section>;
  const present = SERVICES.filter((x) => stats.bySource?.[x.id]);
  const chosen = present.filter((x) => !off.includes(x.id)).map((x) => x.id as string);
  const pickRange = (n: number) => { setRange(n); savePref("ao.statsRange", n); };
  const toggle = (id: string) => { const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id]; setOff(next); savePref("ao.statsOff", next); };
  const days = lastDays(stats.bySourceDay ?? {}, range, chosen);
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const hmax = Math.max(1, ...stats.hourHeatmap);
  const W = 600, H = 140, bw = W / days.length;
  const grand = Math.max(1, present.reduce((n, x) => n + total(stats.bySource[x.id]!), 0));
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
        {RANGES.map((n) => <button key={n} className={`chip ${range === n ? "on" : ""}`} aria-pressed={range === n} onClick={() => pickRange(n)}>{n} d</button>)}
      </div>
      <h2>Tokens per day (last {range} days)</h2>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" role="img" aria-label="Tokens per day, stacked by service">
        {days.map((d, i) => {
          let y = H;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.tokens.toLocaleString()} tokens`}</title>
              {present.filter((x) => chosen.includes(x.id)).map((x) => {
                const h = (d.parts[x.id]! / max) * H; y -= h;
                return h > 0 ? <rect key={x.id} x={i * bw + 1} y={y} width={Math.max(1, bw - 2)} height={h} fill={x.color} /> : null;
              })}
            </g>
          );
        })}
        <text x="0" y={H + 14} className="axis">{days[0]!.day}</text>
        <text x={W} y={H + 14} textAnchor="end" className="axis">{days[days.length - 1]!.day}</text>
      </svg>
      <p className="muted small">History is kept in SparkBots' own cache, so days stay even after a tool deletes old transcripts. Stats refresh about every 30 s.</p>

      <h2>By service</h2>
      <table>
        <thead><tr><th>Service</th><th>Tokens</th><th>Share</th><th>Input</th><th>Output</th><th>Cache</th><th>Est. cost</th></tr></thead>
        <tbody>
          {present.map((x) => {
            const t = stats.bySource[x.id]!, c = stats.costBySource?.[x.id];
            return (
              <tr key={x.id}>
                <td><span className="legend-dot" style={{ background: x.color }} /> {x.label}</td>
                <td>{fmtNum(total(t))}</td><td>{Math.round((100 * total(t)) / grand)}%</td>
                <td>{fmtNum(t.input)}</td><td>{fmtNum(t.output)}</td><td>{fmtNum(t.cacheRead + t.cacheWrite)}</td>
                <td>{c !== undefined ? `$${c.toFixed(2)}` : <span className="muted" title="No price table for this service">–</span>}</td>
              </tr>
            );
          })}
          {present.length === 0 && <tr><td colSpan={7} className="muted">No data</td></tr>}
        </tbody>
      </table>

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
