import { Color } from "three";
import type { Snapshot, Worker } from "../../server/adapters/types";
import { ZONES, placeZone, type PlacedZone, type Place, type Zone } from "./zones";

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
  zones: PlacedZone[];
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
  const empty: Layout = { desks: [], areas: [], zones: [], minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  if (!snap) return empty;
  const vis = visibleTeams(snap, showAll);

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

  const dcOf = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)));
  const maxDc = Math.max(1, ...shown.map((s) => dcOf(s.ws.length)));
  const maxRows = Math.max(1, ...shown.map((s) => Math.ceil(s.ws.length / dcOf(s.ws.length))));
  const cellW = maxDc * PITCH_X + MARGIN;
  const cellD = maxRows * PITCH_Z + MARGIN + 1;
  // Team cells sit on a k x k grid (k odd) around a central plaza that holds the amenities.
  let k = 3;
  while (k * k - 1 < shown.length) k += 2;
  const mid = (k - 1) / 2;
  const slots: [number, number][] = [];
  for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) if (!(r === mid && c === mid)) slots.push([c, r]);
  slots.sort((a, b) => Math.hypot(a[0] - mid, a[1] - mid) - Math.hypot(b[0] - mid, b[1] - mid) || a[1] - b[1] || a[0] - b[0]);

  // Every room and outdoor area lives in the central plaza: the manager and data rooms at the top, the amenities in the
  // middle, the outdoor areas and fun rooms below. Rows are packed left to right and a new row starts when the group changes.
  const GROUP: Record<Place, number> = { north: 0, center: 1, west: 1, east: 2, south: 3 };
  const center = [...ZONES].sort((a, b) => GROUP[a.place] - GROUP[b.place] || a.id.localeCompare(b.id));
  const PLAZA_W = 34, GAP = 1.5;
  const rowsOfZones: Zone[][] = [[]];
  let rowW = 0;
  for (const z of center) {
    const cur = rowsOfZones[rowsOfZones.length - 1]!;
    if (cur.length && (rowW + z.size[0] > PLAZA_W || GROUP[cur[cur.length - 1]!.place] !== GROUP[z.place])) { rowsOfZones.push([]); rowW = 0; }
    rowsOfZones[rowsOfZones.length - 1]!.push(z); rowW += z.size[0] + GAP;
  }
  const rowDims = rowsOfZones.map((r) => ({ w: r.reduce((n, z) => n + z.size[0] + GAP, -GAP), d: Math.max(0, ...r.map((z) => z.size[1])) }));
  const plazaW = Math.max(cellW, ...rowDims.map((r) => r.w + 4), center.length ? 12 : 0);
  const plazaD = Math.max(cellD, rowDims.reduce((n, r) => n + r.d + GAP, 0) + 3, center.length ? 12 : 0);
  const colW = Array.from({ length: k }, (_, c) => (c === mid ? plazaW : cellW));
  const rowD = Array.from({ length: k }, (_, r) => (r === mid ? plazaD : cellD));
  const totalW = colW.reduce((a, b) => a + b, 0), totalD = rowD.reduce((a, b) => a + b, 0);
  const colX = colW.map((_, c) => colW.slice(0, c).reduce((a, b) => a + b, 0) + colW[c]! / 2 - totalW / 2);
  const rowZ = rowD.map((_, r) => rowD.slice(0, r).reduce((a, b) => a + b, 0) + rowD[r]! / 2 - totalD / 2);

  const desks: DeskSlot[] = [];
  const areas: TeamArea[] = [];
  shown.forEach(({ t, ws }, ti) => {
    const [c, r0] = slots[ti]!;
    const cx = colX[c]!, cz = rowZ[r0]!;
    const color = safeColor(t.color);
    areas.push({ name: t.name, x: cx, z: cz, w: cellW - 1, d: cellD - 1, color }); // its own size, centred in its (possibly larger) grid cell
    const dc = dcOf(ws.length);
    const r = Math.ceil(ws.length / dc);
    ws.forEach((w, i) => {
      const x = cx + ((i % dc) - (dc - 1) / 2) * PITCH_X;
      const z = cz + (Math.floor(i / dc) - (r - 1) / 2) * PITCH_Z + 0.4;
      desks.push({ index: desks.length, worker: w, x, z, color });
    });
  });

  // zones: center ones packed into the plaza, the rest stacked outside the grid on their side
  const zones: PlacedZone[] = [];
  let zz = rowZ[mid]! - rowDims.reduce((n, r) => n + r.d + GAP, -GAP) / 2;
  rowsOfZones.forEach((row, ri) => {
    let zx = colX[mid]! - rowDims[ri]!.w / 2;
    for (const z of row) { zones.push(placeZone(z, zx + z.size[0] / 2, zz + z.size[1] / 2)); zx += z.size[0] + GAP; }
    zz += rowDims[ri]!.d + GAP;
  });
  return { desks, areas, zones, minX: -totalW / 2, maxX: totalW / 2, minZ: -totalD / 2, maxZ: totalD / 2 };
}
