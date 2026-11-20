import { useEffect, useState } from "react";
import { api, poll, type WorkSpan } from "../api";
import { applyFilters } from "./teamFilters";
import { useStore } from "../state/store";
import { displayName, fmtDuration, relTime } from "../util";
import { StateBadge } from "./Badge";

const KEY = "agent-office.controlHistory";
const clock = (ts: number) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** What was working, and when: running spans on top, then finished ones. */
function History() {
  const { snapshot, selectWorker } = useStore();
  const [spans, setSpans] = useState<WorkSpan[]>([]);
  const [team, setTeam] = useState("");
  useEffect(() => poll(async () => {
    try { setSpans((await api.history()).spans); } catch { /* ignore */ }
  }, 3000), []);
  const color = (name: string) => snapshot?.teams.find((t) => t.name === name)?.botColor ?? "#d97757";
  const teams = [...new Set(spans.map((s) => s.team))].sort();
  const shown = spans.filter((s) => !team || s.team === team);
  return (
    <>
      <div className="tb-row">
        <select value={team} onChange={(e) => setTeam(e.target.value)} title="Filter by project">
          <option value="">All projects</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="muted small">{shown.length} work sessions since the server first recorded (kept across restarts)</span>
      </div>
      {shown.length === 0 && <p className="muted">Nothing recorded yet. Work shows up here as it happens.</p>}
      <ul className="history">
        {shown.map((s) => (
          <li key={`${s.session}-${s.start}`} className="worker" onClick={() => selectWorker(s.session)}>
            <span className="swatch" style={{ background: color(s.team) }} />
            <span className="muted small">{s.team}</span>
            <span className="title">{s.title || "(untitled)"}</span>
            {s.activities.map((a) => <span key={a} className="tag">{a}</span>)}
            {s.waited && <span className="tag helper" title="needed a human at some point">waited</span>}
            <span className="small">{s.end === null ? <b className="s-working">working now</b> : fmtDuration(s.end - s.start)}</span>
            <span className="muted small" title={clock(s.start)}>{clock(s.start)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ControlRoom() {
  const { snapshot, selectWorker, filters, tasks } = useStore();
  const [history, setHistory] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const flip = () => { setHistory(!history); try { localStorage.setItem(KEY, history ? "0" : "1"); } catch { /* ignore */ } };
  if (!snapshot) return <section className="panel"><p className="muted">Loading…</p></section>;
  const groups = applyFilters(snapshot.teams, filters, tasks)
    .map((t) => ({
      team: t,
      workers: t.workers
        .filter((w) => w.state === "working" || w.state === "waiting")
        .sort((a, b) => Number(b.state === "waiting") - Number(a.state === "waiting")),
    }))
    .filter((g) => g.workers.length > 0)
    .sort((a, b) => Number(b.workers.some((w) => w.state === "waiting")) - Number(a.workers.some((w) => w.state === "waiting")));
  return (
    <section className="panel">
      <h1>Control Room</h1>
      <div className="tb-row">
        <button className={`chip ${!history ? "on" : ""}`} onClick={() => history && flip()}>Live</button>
        <button className={`chip ${history ? "on" : ""}`} onClick={() => !history && flip()}>History</button>
      </div>
      {history ? <History /> : (
        <>
          {groups.length === 0 && <p className="muted">Nobody is working right now. All quiet.</p>}
          {groups.map(({ team, workers }) => (
            <div className="team" key={team.name}>
              <h2><span className="swatch" style={{ background: team.botColor }} />{team.name}</h2>
              <div className="tiles">
                {workers.map((w) => (
                  <div key={w.id} className={`tile ${w.state === "waiting" ? "waiting" : ""}`} onClick={() => selectWorker(w.id)}>
                    <div><StateBadge state={w.state} /> <span className="activity">{w.activity}</span></div>
                    <div className="title">{displayName(w)}</div>
                    {w.preview && <div className="muted small clip">{w.preview}</div>}
                    <div className="muted small">{relTime(w.lastEventAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
