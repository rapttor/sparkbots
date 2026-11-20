import { useStore } from "../state/store";
import type { Tokens } from "../../server/stats/aggregate";
import { fmtNum } from "../util";

const total = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite;
const pad = (n: number) => String(n).padStart(2, "0");

function last30(byDay: Record<string, Tokens>) {
  const out: { day: string; tokens: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ day: k, tokens: byDay[k] ? total(byDay[k]) : 0 });
  }
  return out;
}

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

export function Stats() {
  const stats = useStore((s) => s.stats);
  if (!stats) return <section className="panel"><p className="muted">Loading…</p></section>;
  const days = last30(stats.byDay);
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const hmax = Math.max(1, ...stats.hourHeatmap);
  const W = 600, H = 140, bw = W / days.length;
  return (
    <section className="panel">
      <h1>Stats</h1>
      <h2>Tokens per day (last 30 days)</h2>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" role="img" aria-label="Tokens per day">
        {days.map((d, i) => {
          const h = (d.tokens / max) * H;
          return (
            <rect key={d.day} x={i * bw + 1} y={H - h} width={bw - 2} height={h} fill="var(--accent)">
              <title>{`${d.day}: ${d.tokens.toLocaleString()} tokens`}</title>
            </rect>
          );
        })}
        <text x="0" y={H + 14} className="axis">{days[0].day}</text>
        <text x={W} y={H + 14} textAnchor="end" className="axis">{days[days.length - 1].day}</text>
      </svg>

      <h2>Estimated cost <span className="tag">estimate</span></h2>
      <p>
        <strong>${stats.estCostUsd.toFixed(2)}</strong> <span className="muted">estimate, API-equivalent · prices last checked {stats.pricesLastChecked}</span>
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

      <h2>By project</h2><Table rows={stats.byProject} />
      <h2>By model</h2><Table rows={stats.byModel} />
    </section>
  );
}
