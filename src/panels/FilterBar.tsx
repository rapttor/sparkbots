import { useEffect, useRef, useState } from "react";
import type { WorkerState } from "../../server/adapters/types";
import { useStore } from "../state/store";
import {
  DEFAULT_FILTERS, SORTS, STATUSES, UNLABELED, applyFilters, isDefault, statusCounts, type SortId,
} from "./teamFilters";

const AWAKE: WorkerState[] = ["waiting", "working", "error", "done", "idle"];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Global filters, rendered in the app header: they narrow Teams, Control Room, the 3D office and the Board alike. */
export function FilterBar() {
  const { snapshot, filters: f, setFilters, tasks } = useStore();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!snapshot) return null;
  const defs = snapshot.labelDefs ?? [];
  const counts = statusCounts(snapshot.teams);
  const shown = applyFilters(snapshot.teams, f, tasks).length;
  const active = !isDefault(f);
  const nExtra = f.statuses.length + f.labels.length + (f.openTasks ? 1 : 0);

  return (
    <div className="filterbar" ref={wrap}>
      <input type="search" className="fb-search" placeholder="Filter projects or workers…" value={f.search}
        onChange={(e) => setFilters({ ...f, search: e.target.value })} />
      <button className={`small ${nExtra ? "fb-on" : ""}`} onClick={() => setOpen(!open)}>Filters{nExtra ? ` (${nExtra})` : ""} ▾</button>
      {active && <button className="small" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: f.sort })}>Clear</button>}
      <span className="muted small">{shown} of {snapshot.teams.length}</span>
      {open && (
        <div className="fb-drop">
          <div className="tb-row">
            <span className="muted small">Status:</span>
            <button className={`chip ${!f.statuses.length ? "on" : ""}`} onClick={() => setFilters({ ...f, statuses: [] })}>all</button>
            <button className={`chip ${sameSet(f.statuses, AWAKE) ? "on" : ""}`} title="Everything that is not asleep"
              onClick={() => setFilters({ ...f, statuses: AWAKE })}>active</button>
            {STATUSES.map((s) => (
              <button key={s} className={`chip ${f.statuses.includes(s) ? "on" : ""}`}
                onClick={() => setFilters({ ...f, statuses: flip(f.statuses, s) })}>{s} {counts[s]}</button>
            ))}
          </div>
          <div className="tb-row">
            <span className="muted small">Labels:</span>
            {defs.map((d) => (
              <button key={d.id} className={`chip ${f.labels.includes(d.id) ? "on" : ""}`}
                style={{ borderColor: d.color, ...(f.labels.includes(d.id) ? { background: d.color, color: "#0b0f17" } : { color: d.color }) }}
                onClick={() => setFilters({ ...f, labels: flip(f.labels, d.id) })}>{d.name}</button>
            ))}
            <button className={`chip ${f.labels.includes(UNLABELED) ? "on" : ""}`}
              onClick={() => setFilters({ ...f, labels: flip(f.labels, UNLABELED) })}>Unlabeled</button>
          </div>
          <div className="tb-row">
            <label className="tb-check">
              <input type="checkbox" checked={f.openTasks} onChange={(e) => setFilters({ ...f, openTasks: e.target.checked })} /> Has open tasks
            </label>
            <select value={f.sort} onChange={(e) => setFilters({ ...f, sort: e.target.value as SortId })} title="Sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
