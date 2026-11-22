import { useEffect, useState } from "react";
import { api } from "../api";
import type { LabelDef, Worker, WorkerState } from "../../server/adapters/types";
import { useDataCenter } from "../state/dataCenter";
import { useStore } from "../state/store";
import { relTime, fmtNum, fmtDuration, displayName } from "../util";
import { STATE_COLORS, STATE_LABELS, STATE_ORDER } from "../world/colors";
import { BotIcon } from "./BotIcon";
import { filterAndSort } from "./teamFilters";

/** One agent: robot colour (click to change), name over what it is doing, and a state dot with the time. */
function Row({ w }: { w: Worker }) {
  const selectWorker = useStore((s) => s.selectWorker);
  const open = () => selectWorker(w.id);
  return (
    <li className={`tm-agent ${w.state === "asleep" ? "dim" : ""}`} tabIndex={0} role="button" onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
      <BotIcon color={w.color} size={22} onPick={(c) => { void api.setBotColor(w.id, c).catch(() => {}); }} />
      <span className="tm-agent-main">
        <span className="tm-agent-name">{displayName(w)}</span>
        <span className="tm-agent-sub">{w.activity}{w.helpers > 0 ? ` · ${w.helpers} helper${w.helpers > 1 ? "s" : ""}` : ""}{w.liveInTerminal ? " · live in terminal" : ""}</span>
      </span>
      <span className="tm-agent-state" title={STATE_LABELS[w.state]}>
        <i style={{ background: STATE_COLORS[w.state] }} className={w.state === "waiting" ? "pulse" : ""} />
        <span>{relTime(w.lastEventAt)}</span>
      </span>
    </li>
  );
}

const ACTIONS = [
  { label: "Continue", mode: "phase", target: "continue" },
  { label: "New worker", mode: "phase", target: "new" },
  { label: "All phases", mode: "all", target: "continue" },
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
    <div className="tm-actions">
      {ACTIONS.map((a) => (
        <button key={a.label} className="tm-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void run(a.mode, a.target); }}>
          {a.label}
        </button>
      ))}
      {msg && <span className={`small ${msg.ok ? "s-working" : "s-error"}`}>{msg.text}</span>}
    </div>
  );
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
      <button className="tm-icon" title="Labels" aria-label="Labels" aria-expanded={open} onClick={() => setOpen(!open)}>🏷</button>
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

/** Awake agents as little status lights (one per agent, grouped by state); the sleeping ones are only counted. */
function Pips({ workers, max = 36 }: { workers: Worker[]; max?: number }) {
  const awake = workers.filter((w) => w.state !== "asleep").sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const asleep = workers.length - awake.length;
  return (
    <span className="tm-pips">
      {awake.slice(0, max).map((w) => (
        <i key={w.id} className={`tm-pip ${w.state === "waiting" ? "pulse" : ""}`} style={{ background: STATE_COLORS[w.state] }} title={`${displayName(w)}: ${STATE_LABELS[w.state]}`} />
      ))}
      {awake.length > max && <span className="tm-more">+{awake.length - max}</span>}
      {asleep > 0 && <span className="tm-asleep">{awake.length ? `+ ${asleep} asleep` : `${asleep} asleep`}</span>}
    </span>
  );
}

/** All visible projects at once: how many agents are in each state. */
function Summary({ teams, shown, total, allOpen, toggleOpen }: { teams: { workers: Worker[] }[]; shown: number; total: number; allOpen: boolean; toggleOpen: () => void }) {
  const counts = STATE_ORDER.map((s) => [s, teams.reduce((n, t) => n + t.workers.filter((w) => w.state === s).length, 0)] as const);
  return (
    <div className="tm-sum">
      <div className="tm-sum-counts">
        {counts.filter(([s, n]) => n > 0 && s !== "asleep").map(([s, n]) => (
          <span key={s} className="tm-sum-count"><i style={{ background: STATE_COLORS[s] }} /><b>{n}</b> {STATE_LABELS[s].toLowerCase()}</span>
        ))}
        <span className="tm-sum-count muted"><b>{counts.find(([s]) => s === "asleep")?.[1] ?? 0}</b> asleep</span>
      </div>
      <div className="tm-sum-row">
        <span className="muted small">{shown} of {total} projects. Filters are in the header.</span>
        <button className="tm-btn" onClick={toggleOpen} title="Open or close every project that has awake agents">{allOpen ? "Close active" : "Open active"}</button>
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
  const allOpen = withActive.length > 0 && withActive.every((t) => expanded[t.name]);
  const toggleOpen = () => {
    const next = { ...expanded };
    for (const t of withActive) next[t.name] = !allOpen;
    setExpanded(next);
  };
  return (
    <section className="panel tm">
      <h1>Teams</h1>
      <Summary teams={visible} shown={visible.length} total={snapshot.teams.length} allOpen={allOpen} toggleOpen={toggleOpen} />
      {snapshot.teams.length === 0 && <p className="muted">No teams yet. Start a Claude Code, Codex or OpenCode session in a project and it appears here.</p>}
      {snapshot.teams.length > 0 && visible.length === 0 && <p className="muted">No projects match the filters in the header. Clear them to see everything.</p>}
      <div className="tm-list">
        {visible.map((t) => {
          const open = !!expanded[t.name];
          const toggle = () => setExpanded({ ...expanded, [t.name]: !open });
          const shownWorkers = filters.statuses.length ? t.workers.filter((w) => filters.statuses.includes(w.state)) : t.workers;
          const awake = shownWorkers.filter((w) => w.state !== "asleep");
          const asleep = shownWorkers.filter((w) => w.state === "asleep");
          const show = showSleep[t.name] || (filters.statuses.length > 0 && asleep.length > 0);
          const tot = totals(t.workers);
          const tk = tasks[t.name];
          const waiting = t.workers.filter((w) => w.state === "waiting").length;
          const failing = t.workers.filter((w) => w.state === "error").length;
          return (
            <article className={`tm-team ${open ? "open" : ""}`} key={t.name} id={`team-${t.name}`} style={{ "--rail": t.color } as React.CSSProperties}>
              <div className="tm-head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
                <BotIcon color={t.botColor} size={30} title="Project robot colour: recolours this project's robots in the 3D office (click to change)"
                  onPick={(c) => { void api.setTeamBotColor(t.name, c).catch(() => {}); }} />
                <div className="tm-title">
                  <span className="tm-name" title={t.name}>{t.name}</span>
                  {t.labels.map((id) => defs.find((d) => d.id === id)).filter((d): d is LabelDef => !!d).map((d) => <LabelChip key={d.id} d={d} />)}
                </div>
                <span className="tm-tools" onClick={stop}>
                  <button className="tm-icon" title="Fly the 3D camera to this project" aria-label={`Show ${t.name} in the 3D office`} onClick={() => useStore.getState().focusTeam(t.name)}>📍</button>
                  <LabelMenu team={t.name} defs={defs} current={t.labels} />
                  <span className="tm-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                </span>
                <div className="tm-lights"><Pips workers={t.workers} /></div>
                <div className="tm-meta">
                  {waiting > 0 && <span className="tm-flag wait">{waiting} waiting for you</span>}
                  {failing > 0 && <span className="tm-flag err">{failing} with errors</span>}
                  {tot.working > 0 && !waiting && !failing && <span className="tm-flag ok">{tot.working} working</span>}
                  {tk && <span className="tm-tasks" title={`${tk.file}${tk.phase ? `: ${tk.phase}` : ""}`}><b>{tk.done}/{tk.done + tk.open}</b> tasks<span className="bar"><i style={{ width: `${Math.round((100 * tk.done) / Math.max(1, tk.done + tk.open))}%` }} /></span></span>}
                  <span className="tm-time">{relTime(t.lastActivityAt)}</span>
                </div>
              </div>
              {open && (
                <div className="tm-body">
                  <TeamActions team={t.name} />
                  <p className="tm-facts muted small">
                    {t.workers.length} session{t.workers.length === 1 ? "" : "s"}
                    {tot.known && <> · {fmtNum(tot.turns)} prompts · {fmtNum(tot.tools)} tool calls · {fmtNum(tot.tokens)} tokens · {fmtDuration(tot.workMs)} worked</>}
                  </p>
                  <ul className="tm-agents">
                    {awake.map((w) => <Row key={w.id} w={w} />)}
                    {show && asleep.map((w) => <Row key={w.id} w={w} />)}
                  </ul>
                  {awake.length === 0 && !show && asleep.length > 0 && <p className="muted small">Everyone here is asleep.</p>}
                  {asleep.length > 0 && !filters.statuses.length && (
                    <button className="tm-link" onClick={() => setShowSleep({ ...showSleep, [t.name]: !show })}>
                      {show ? "Hide sleeping agents" : `Show ${asleep.length} sleeping agent${asleep.length === 1 ? "" : "s"}`}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
