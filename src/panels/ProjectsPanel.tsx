import { useState } from "react";
import { useStore } from "../state/store";
import { BotIcon } from "./BotIcon";
import { api } from "../api";
import { applyFilters } from "./teamFilters";
import { fmtDuration, fmtNum, relTime } from "../util";
import { ProjectActions } from "../world/ProjectActions";
import { sendView } from "../world/viewBus";

/** Every project at a glance: its robots' states, a fly-to button, and group actions (continue all, rally, meeting ...). */
export function ProjectsPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const filters = useStore((s) => s.filters);
  const tasks = useStore((s) => s.tasks);
  const focusTeam = useStore((s) => s.focusTeam);
  const setPanel = useStore((s) => s.setPanel);
  const showAll = useStore((s) => s.viewInfo.showAll);
  const [open, setOpen] = useState<string>("");
  if (!snapshot) return <section className="panel"><p className="muted">Loading…</p></section>;
  const teams = applyFilters(snapshot.teams, filters, tasks);
  return (
    <section className="panel">
      <h1>Projects</h1>
      <p className="muted small">{teams.length} of {snapshot.teams.length} projects (the filters in the header apply).</p>
      <label className="vp-check small"><input type="checkbox" checked={showAll} onChange={(e) => sendView({ t: "showAll", on: e.target.checked })} /> Show finished / abandoned projects in the 3D office</label>
      <div className="cards">
        {teams.map((t) => {
          const working = t.workers.filter((w) => w.state === "working").length, waiting = t.workers.filter((w) => w.state === "waiting").length;
          const tokens = t.workers.reduce((n, w) => n + (w.stats?.tokens ?? 0), 0), work = t.workers.reduce((n, w) => n + (w.stats?.workMs ?? 0), 0);
          const isOpen = open === t.name;
          return (
            <div className="card" key={t.name}>
              <div className="card-top">
                <span className="proj-name"><BotIcon color={t.botColor} size={22} title="Project bot color" onPick={(c) => { void api.setTeamBotColor(t.name, c).catch(() => {}); }} /><strong title={t.name}>{t.name}</strong></span>
                <span className="muted small">{relTime(t.lastActivityAt)}</span>
              </div>
              <div className="card-meta small">
                <span>{t.workers.length} agent{t.workers.length === 1 ? "" : "s"}</span>
                {working > 0 && <span className="s-working">{working} working</span>}
                {waiting > 0 && <span className="s-waiting">{waiting} waiting</span>}
                <span className="muted">{fmtNum(tokens)} tokens · {fmtDuration(work)}</span>
              </div>
              <div className="card-actions">
                <button className="small" onClick={() => focusTeam(t.name)} title="Fly the 3D camera to this project">📍 Go</button>
                <button className="small" onClick={() => { setPanel("teams"); focusTeam(t.name); }}>Open in Teams</button>
                <button className={`small ${isOpen ? "fb-on" : ""}`} onClick={() => setOpen(isOpen ? "" : t.name)}>Actions {isOpen ? "▾" : "▸"}</button>
              </div>
              {isOpen && <div className="proj-actions"><ProjectActions name={t.name} workers={t.workers} /></div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
