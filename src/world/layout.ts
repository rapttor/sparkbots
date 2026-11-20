import { Color } from "three";
import type { Snapshot, Worker } from "../../server/adapters/types";

export const MAX_DESKS = 150;
export const RECENT_PER_TEAM = 12;
const PITCH_X = 3.5; // desks are 2.2 wide to fit the status screen
const PITCH_Z = 3.8;
const MARGIN = 3;

export interface DeskSlot { index: number; worker: Worker; x: number; z: number; color: Color }
export interface TeamArea { name: string; x: number; z: number; w: number; d: number; color: Color }
export interface Layout {
  desks: DeskSlot[];
  areas: TeamArea[];
  minX: number; maxX: number; minZ: number; maxZ: number;
}

const safeColor = (c: string): Color => {
  try { return new Color(c); } catch { return new Color("#888888"); }
};

/** Projects carrying any label with onMap:false (e.g. Finished, Abandoned) are left off the map unless showAll. */
export function visibleTeams(snap: Snapshot, showAll: boolean) {
  if (showAll) return snap.teams;
  const off = new Set((snap.labelDefs ?? []).filter((d) => !d.onMap).map((d) => d.id));
  return snap.teams.filter((t) => !(t.labels ?? []).some((id) => off.has(id)));
}

/** Deterministic: teams by name in a grid, desks by worker id in a grid inside each team area. */
export function computeLayout(snap: Snapshot | null, showAll = false): Layout {
  const empty: Layout = { desks: [], areas: [], minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  if (!snap) return empty;
  const vis = visibleTeams(snap, showAll);
  if (vis.length === 0) return empty;

  // Select visible workers: non-asleep + 12 most recent per team, then cap globally.
  const cands: { w: Worker; team: string; awake: boolean }[] = [];
  for (const t of vis) {
    const recent = new Set([...t.workers].sort((a, b) => b.lastEventAt - a.lastEventAt).slice(0, RECENT_PER_TEAM).map((w) => w.id));
    for (const w of t.workers) if (w.state !== "asleep" || recent.has(w.id)) cands.push({ w, team: t.name, awake: w.state !== "asleep" });
  }
  cands.sort((a, b) => Number(b.awake) - Number(a.awake) || b.w.lastEventAt - a.w.lastEventAt || (a.w.id < b.w.id ? -1 : 1));
  const keep = new Set(cands.slice(0, MAX_DESKS).map((c) => c.w.id));

  const teams = [...vis].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const per = teams.map((t) => t.workers.filter((w) => keep.has(w.id)).sort((a, b) => (a.id < b.id ? -1 : 1)));
  const shown = teams.map((t, i) => ({ t, ws: per[i] })).filter((x) => x.ws.length > 0);
  if (shown.length === 0) return empty;

  const dcOf = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)));
  const maxDc = Math.max(...shown.map((s) => dcOf(s.ws.length)));
  const maxRows = Math.max(...shown.map((s) => Math.ceil(s.ws.length / dcOf(s.ws.length))));
  const cellW = maxDc * PITCH_X + MARGIN;
  const cellD = maxRows * PITCH_Z + MARGIN + 1;
  const cols = Math.ceil(Math.sqrt(shown.length));
  const rows = Math.ceil(shown.length / cols);

  const desks: DeskSlot[] = [];
  const areas: TeamArea[] = [];
  shown.forEach(({ t, ws }, ti) => {
    const cx = (ti % cols - (cols - 1) / 2) * cellW;
    const cz = (Math.floor(ti / cols) - (rows - 1) / 2) * cellD;
    const color = safeColor(t.color);
    areas.push({ name: t.name, x: cx, z: cz, w: cellW - 1, d: cellD - 1, color });
    const dc = dcOf(ws.length);
    const r = Math.ceil(ws.length / dc);
    ws.forEach((w, i) => {
      const x = cx + ((i % dc) - (dc - 1) / 2) * PITCH_X;
      const z = cz + (Math.floor(i / dc) - (r - 1) / 2) * PITCH_Z + 0.4;
      desks.push({ index: desks.length, worker: w, x, z, color });
    });
  });
  return {
    desks, areas,
    minX: -(cols * cellW) / 2, maxX: (cols * cellW) / 2,
    minZ: -(rows * cellD) / 2, maxZ: (rows * cellD) / 2,
  };
}
