import { useEffect, useState } from "react";
import { api } from "../api";
import type { LabelDef, Worker, WorkerState } from "../../server/adapters/types";
import { useDataCenter } from "../state/dataCenter";
import { useStore } from "../state/store";
import { relTime, fmtNum, fmtDuration, displayName } from "../util";
import { StateBadge } from "./Badge";
import { BotIcon } from "./BotIcon";
import { filterAndSort } from "./teamFilters";

function Row({ w }: { w: Worker }) {
  const selectWorker = useStore((s) => s.selectWorker);
  return (
    <li className={`worker ${w.state === "asleep" ? "dim" : ""}`} onClick={() => selectWorker(w.id)}>
      <BotIcon color={w.color} onPick={(c) => { void api.setBotColor(w.id, c).catch(() => {}); }} />
      <StateBadge state={w.state} />
      <span className="activity">{w.activity}</span>
      <span className="title">{displayName(w)}</span>
      {w.liveInTerminal && <span className="tag">Live in terminal</span>}
      {w.helpers > 0 && <span className="tag helper">{w.helpers} helper{w.helpers > 1 ? "s" : ""}</span>}
      <span className="time">{relTime(w.lastEventAt)}</span>
    </li>
  );
}

const ACTIONS = [
  { label: "▶ Continue", mode: "phase", target: "continue" },
  { label: "＋ New worker", mode: "phase", target: "new" },
  { label: "⏩ All phases", mode: "all", target: "continue" },
] as const;

function TeamActions({ team }: { team: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  const run = async (mode: "phase" | "all", target: "continue" | "new") => {
    setBusy(true);
    setMsg(null);
    try {
      const plan = await api.teamRun(team, mode, target, true);
      const where = plan.session && plan.target === "continue" ? `Resume session ${plan.session}` : "New session";
      if (!window.confirm(`${plan.prompt}\n\nCwd: ${plan.cwd}\n${where}`)) return;
      const r = await api.teamRun(team, mode, target);
      setMsg({ ok: true, text: r.queued ? "Queued" : "Started" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="team-actions">
      {ACTIONS.map((a) => (
        <button key={a.label} className="small" disabled={busy} onClick={(e) => { e.stopPropagation(); void run(a.mode, a.target); }}>
          {a.label}
        </button>
      ))}
      {msg && <span className={`small ${msg.ok ? "s-working" : "s-error"}`}>{msg.text}</span>}
    </span>
  );
}

function Stat({ n, label, cls = "" }: { n: number | string; label: string; cls?: string }) {
  return <span className={`stat ${cls}`}><b>{n}</b> {label}</span>;
}

/** Sum what every session of a project has processed. `known` is false until the background stats pass has run. */
function totals(ws: Worker[]) {
  const t = { working: 0, live: 0, turns: 0, tools: 0, tokens: 0, workMs: 0, known: false };
  for (const w of ws) {
    if (w.state === "working" || w.state === "waiting") t.working++;
    if (w.state !== "asleep") t.live++;
    if (w.stats) { t.known = true; t.turns += w.stats.turns; t.tools += w.stats.tools; t.tokens += w.stats.tokens; t.workMs += w.stats.workMs; }
  }
  return t;
}

const PROTECTED = ["current", "waiting-decision", "finished", "abandoned"];
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function LabelChip({ d }: { d: LabelDef }) {
  return (
    <span className="label-chip" style={{ borderColor: d.color, color: d.color }} title={d.onMap ? "on map" : "hidden from map"}>
      {d.name}
    </span>
  );
}

function LabelMenu({ team, defs, current }: { team: string; defs: LabelDef[]; current: string[] }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#60a5fa");
  const [onMap, setOnMap] = useState(true);
  const guard = async (fn: () => Promise<unknown>) => {
    setErr("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const toggle = (id: string) =>
    guard(() => api.setTeamLabels(team, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const create = () => guard(async () => {
    if (!name.trim()) return;
    const d = await api.createLabel(name.trim(), color, onMap);
    await api.setTeamLabels(team, [...current, d.id]);
    setName("");
  });
  const remove = (d: LabelDef) => {
    if (!window.confirm(`Delete label "${d.name}" from all projects?`)) return;
    void guard(() => api.deleteLabel(d.id));
  };
  return (
    <span className="label-menu-wrap" onClick={stop}>
      <button className="small" title="Labels" onClick={() => setOpen(!open)}>🏷</button>
      {open && (
        <div className="label-menu">
          {defs.map((d) => (
            <div className="label-row" key={d.id}>
              <label>
                <input type="checkbox" checked={current.includes(d.id)} onChange={() => void toggle(d.id)} />
                <span className="swatch" style={{ background: d.color }} /> {d.name}
              </label>
              {!PROTECTED.includes(d.id) && <button className="link" title="Delete label" onClick={() => remove(d)}>×</button>}
            </div>
          ))}
          <form className="label-new" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <input placeholder="New label…" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <label title="Show on map"><input type="checkbox" checked={onMap} onChange={(e) => setOnMap(e.target.checked)} /> map</label>
            <button className="small" type="submit" disabled={!name.trim()}>Add</button>
          </form>
          {err && <div className="small s-error">{err}</div>}
        </div>
      )}
    </span>
  );
}

function Toolbar({ allOpen, toggleOpen, shown, total }: { allOpen: boolean; toggleOpen: () => void; shown: number; total: number }) {
  return (
    <div className="team-toolbar">
      <div className="tb-row">
        <button className="small" onClick={toggleOpen} title="Show or hide the working / active workers of every project">
          {allOpen ? "▾ Hide active workers" : "▸ Show active workers"}
        </button>
        <span className="muted small">{shown} of {total} projects (filters are in the header)</span>
      </div>
    </div>
  );
}

export function Teams() {
  const snapshot = useStore((s) => s.snapshot);
  const [showSleep, setShowSleep] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tasks = useStore((s) => s.tasks);
  const filters = useStore((s) => s.filters);
  const focus = useStore((s) => s.focus);
  useEffect(() => { // "Open in Teams" from the 3D office: expand that project and scroll to it
    if (focus?.kind !== "team") return;
    setExpanded((e) => ({ ...e, [focus.id]: true }));
    setTimeout(() => document.getElementById(`team-${focus.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!snapshot) return <section className="panel"><p className="muted">Loading…</p></section>;
  const defs = snapshot.labelDefs ?? [];
  const visible = filterAndSort(snapshot.teams, filters, tasks);
  const withActive = visible.filter((t) => t.workers.some((w) => w.state !== "asleep"));
  const toggleOpen = () => {
    const close = withActive.length > 0 && withActive.every((t) => expanded[t.name]);
    const next = { ...expanded };
    for (const t of withActive) next[t.name] = !close;
    setExpanded(next);
  };
  return (
    <section className="panel">
      <h1>Teams</h1>
      <Toolbar shown={visible.length} total={snapshot.teams.length}
        allOpen={withActive.length > 0 && withActive.every((t) => expanded[t.name])} toggleOpen={toggleOpen} />
      {snapshot.teams.length === 0 && <p className="muted">No teams found.</p>}
      {snapshot.teams.length > 0 && visible.length === 0 && <p className="muted">No projects match the filters.</p>}
      {visible.map((t) => {
        const open = !!expanded[t.name];
        const shownWorkers = filters.statuses.length ? t.workers.filter((w) => filters.statuses.includes(w.state)) : t.workers;
        const awake = shownWorkers.filter((w) => w.state !== "asleep");
        const asleep = shownWorkers.filter((w) => w.state === "asleep");
        const show = showSleep[t.name] || (filters.statuses.length > 0 && asleep.length > 0);
        const tot = totals(t.workers);
        const tk = tasks[t.name];
        return (
          <div className="team" key={t.name} id={`team-${t.name}`}>
            <h2 className="team-head" onClick={() => setExpanded({ ...expanded, [t.name]: !open })}>
              <span className="caret">{open ? "▾" : "▸"}</span>
              <BotIcon color={t.botColor} size={34} title="Project bot color: recolors this project's robots in the 3D room (click to change)"
                onPick={(c) => { void api.setTeamBotColor(t.name, c).catch(() => {}); }} />
              {t.name}
              {t.labels.map((id) => defs.find((d) => d.id === id)).filter((d): d is LabelDef => !!d).map((d) => <LabelChip key={d.id} d={d} />)}
              <button className="small" title="Fly the 3D camera to this project" onClick={(e) => { e.stopPropagation(); useStore.getState().focusTeam(t.name); }}>📍</button>
              <button className="small" title="Search this project's conversations in the Data room" onClick={(e) => { e.stopPropagation(); useDataCenter.getState().openFor(t.name); useStore.getState().setPanel("data"); }}>🗄</button>
              <LabelMenu team={t.name} defs={defs} current={t.labels} />
              <TeamActions team={t.name} />
            </h2>
            <div className="team-stats" onClick={() => setExpanded({ ...expanded, [t.name]: !open })}>
              <Stat n={tot.working} label="working" cls={tot.working ? "s-working" : ""} />
              <Stat n={tot.live} label="live" />
              <Stat n={t.workers.length} label="sessions" />
              {tot.known && <>
                <Stat n={fmtNum(tot.turns)} label="prompts" />
                <Stat n={fmtNum(tot.tools)} label="tool calls" />
                <Stat n={fmtNum(tot.tokens)} label="tokens" />
                <Stat n={fmtDuration(tot.workMs)} label="worked" />
              </>}
              {tk && <span className="stat" title={`${tk.file}${tk.phase ? ` — ${tk.phase}` : ""}`}>
                <b>{tk.done}/{tk.done + tk.open}</b> tasks
                <span className="bar"><i style={{ width: `${Math.round((100 * tk.done) / Math.max(1, tk.done + tk.open))}%` }} /></span>
              </span>}
              <span className="muted small">{relTime(t.lastActivityAt)}</span>
            </div>
            {open && (
              <>
                <ul>
                  {awake.map((w) => <Row key={w.id} w={w} />)}
                  {show && asleep.map((w) => <Row key={w.id} w={w} />)}
                </ul>
                {asleep.length > 0 && !filters.statuses.length && (
                  <button className="link" onClick={() => setShowSleep({ ...showSleep, [t.name]: !show })}>
                    {show ? "hide sleeping" : `show ${asleep.length} sleeping`}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
