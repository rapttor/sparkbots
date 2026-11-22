import { useMemo } from "react";
import { useStore } from "../state/store";
import { useWidth } from "../dock/useLayout";
import { Minimap, viewState } from "../world/controls3d";
import { computeLayout } from "../world/layout";
import { zoneIcon } from "../world/zones";
import { roomCenter } from "../world/goto";
import { applyFilters } from "./teamFilters";

/** The minimap as a tab: bigger than the floating one, with a list of rooms and projects. Click the map or a name to fly there. */
export function MapPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const filters = useStore((s) => s.filters);
  const tasks = useStore((s) => s.tasks);
  const focusPoint = useStore((s) => s.focusPoint);
  const focusTeam = useStore((s) => s.focusTeam);
  const [ref, width] = useWidth<HTMLElement>();
  const layout = useMemo(() => {
    if (!snapshot) return null;
    const teams = applyFilters(snapshot.teams, filters, tasks).filter((t) => t.workers.length > 0); // same filters as the 3D office
    let showAll = false; try { showAll = localStorage.getItem("ao.map.showAll") === "1"; } catch { /* private mode */ }
    return computeLayout({ ...snapshot, teams }, showAll);
  }, [snapshot, filters, tasks]);
  const size = Math.max(220, Math.min(560, width - 28));
  if (!layout) return <section className="panel"><p className="muted">Loading…</p></section>;
  return (
    <section className="panel" ref={ref}>
      <h1>Map</h1>
      <p className="muted small">Click the map to fly the camera (or move your manager) there. Boxes with numbers are projects (agents · working); icons are rooms.</p>
      <Minimap layout={layout} view={{ current: viewState }} size={size} onGo={(x, z) => focusPoint(x, z)} />
      <h2>Rooms</h2>
      <div className="map-list">
        {layout.zones.map((z) => (
          <button key={z.zone.id} className="chip" onClick={() => { const p = roomCenter(z); focusPoint(p.x, p.z); }} title={`Fly to ${z.zone.name}`}>{zoneIcon(z.zone)} {z.zone.name}</button>
        ))}
      </div>
      <h2>Projects</h2>
      <div className="map-list">
        {layout.areas.map((a) => (
          <button key={a.name} className="chip" style={{ borderColor: `#${a.color.getHexString()}` }} onClick={() => focusTeam(a.name)} title={`Fly to ${a.name}`}>{a.name}</button>
        ))}
      </div>
    </section>
  );
}
