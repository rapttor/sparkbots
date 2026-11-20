import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkerState } from "../../server/adapters/types";
import { useStore } from "../state/store";
import type { Layout, TeamArea } from "./layout";
import { STATE_COLORS, STATE_LABELS, STATE_ORDER } from "./colors";

export function StatusLegend() {
  const snapshot = useStore((s) => s.snapshot);
  const counts = useMemo(() => {
    const c: Record<WorkerState, number> = { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 };
    for (const t of snapshot?.teams ?? []) for (const w of t.workers) c[w.state]++;
    return c;
  }, [snapshot]);
  return (
    <div className="legend status-legend">
      {STATE_ORDER.map((s) => (
        <div key={s} className="legend-row">
          <span className="legend-dot" style={{ background: STATE_COLORS[s] }} />
          <span>{STATE_LABELS[s]}</span>
          <b className="legend-n">{counts[s]}</b>
        </div>
      ))}
    </div>
  );
}

export function ProjectLegend({ layout, onJump, hidden, showAll, onShowAll }: { layout: Layout; onJump: (a: TeamArea) => void; hidden: number; showAll: boolean; onShowAll: (v: boolean) => void }) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const byTeam = new Map<string, Record<WorkerState, number>>();
    for (const d of layout.desks) {
      let c = byTeam.get(d.worker.team);
      if (!c) { c = { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 }; byTeam.set(d.worker.team, c); }
      c[d.worker.state]++;
    }
    return layout.areas.map((area) => {
      const c = byTeam.get(area.name) ?? { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 };
      const top = STATE_ORDER.find((s) => c[s] > 0) ?? "asleep";
      const summary = STATE_ORDER.filter((s) => c[s] > 0).map((s) => `${c[s]} ${s}`).join(" \u00b7 ");
      return { area, c, top, summary };
    }).sort((a, b) =>
      b.c.waiting - a.c.waiting || b.c.working - a.c.working || (a.area.name < b.area.name ? -1 : a.area.name > b.area.name ? 1 : 0));
  }, [layout]);
  const f = filter.trim().toLowerCase();
  const shown = f ? rows.filter((r) => r.area.name.toLowerCase().includes(f)) : rows;
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
  const picker = (
    <div className="project-picker" ref={wrap}>
      <button className="small" onClick={() => setOpen(!open)}>Projects ({layout.areas.length}) ▾</button>
      {open && (
        <div className="project-dropdown">
          <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects" />
          {(hidden > 0 || showAll) && (
            <label className="project-sum" style={{ cursor: "pointer", paddingLeft: 0 }}>
              <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} style={{ width: "auto" }} /> Show finished/abandoned{hidden > 0 ? ` (${hidden} hidden)` : ""}
            </label>
          )}
          <div className="project-list">
            {shown.map(({ area, top, summary }) => (
              <div key={area.name} className="legend-row project-row" onClick={() => { onJump(area); setOpen(false); }} title={`Jump to ${area.name}`}>
                <span className="legend-dot" style={{ background: `#${area.color.getHexString()}` }} />
                <span className="project-name">{area.name}</span>
                <span className="legend-dot" style={{ background: STATE_COLORS[top] }} />
                <span className="project-sum">{summary}</span>
              </div>
            ))}
            {shown.length === 0 && <div className="project-sum">No projects</div>}
          </div>
        </div>
      )}
    </div>
  );
  // Lives in the app header (slot rendered by App); falls back to inline if the slot is missing.
  const slot = document.getElementById("topbar-slot");
  return slot ? createPortal(picker, slot) : picker;
}
