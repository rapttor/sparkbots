/** Race track (13.7.10). Pure: no React, no three.js. A closed loop generated from the campus layout that never touches a room or a team area. */
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface TrackInput { zones: Rect[]; areas: Rect[]; bounds: Rect }
export interface Pt { x: number; z: number }

export const STEP = 1;            // spacing of the centre line points (m)
export const HALF_WIDTH = 2.6;    // the road is 5.2 m wide
export const CLEARANCE = 5.4;     // free ground beside the road: you may leave it by two car widths (see offroadLimit) before a wall stops you
const CORNER_R = 9;
const MIN_HALF_EXTENT = 14;       // a tiny layout still gets a decent loop

export interface Track {
  kind: "inner" | "contour" | "outer";
  xs: number[]; zs: number[];     // centre line, closed (the last point connects to the first)
  cum: number[];                  // cum[i] = distance from point 0 to point i
  n: number;
  length: number;
  halfWidth: number;
  rect: Rect;                     // the rounded rectangle the loop follows
}

export interface TrackPos { i: number; s: number; lat: number; dist: number; tx: number; tz: number }

/** Where a loop must run so that its road edge stays `need` from a box, even in rounded corners of radius r. */
const offsetFor = (r: number, need: number): number => (r > need ? r - (r - need) / Math.SQRT2 + 0.05 : need);

const distToRect = (x: number, z: number, r: Rect): number => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Rounded-rectangle loop, resampled to even spacing. Clockwise seen from above (+x right, +z down on screen). */
function roundedLoop(rect: Rect, r: number): { xs: number[]; zs: number[]; cum: number[]; length: number } {
  const rr = Math.min(r, (rect.x1 - rect.x0) / 2 - 0.5, (rect.z1 - rect.z0) / 2 - 0.5);
  const corners: [number, number, number][] = [
    [rect.x1 - rr, rect.z0 + rr, -Math.PI / 2], [rect.x1 - rr, rect.z1 - rr, 0], [rect.x0 + rr, rect.z1 - rr, Math.PI / 2], [rect.x0 + rr, rect.z0 + rr, Math.PI],
  ];
  const raw: Pt[] = [];
  for (const [cx, cz, a0] of corners) {
    const steps = Math.max(4, Math.ceil((rr * (Math.PI / 2)) / 0.5));
    for (let k = 0; k <= steps; k++) { const a = a0 + (k / steps) * (Math.PI / 2); raw.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr }); }
  }
  // even resample along the closed polyline
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) { const a = raw[i]!, b = raw[(i + 1) % raw.length]!; const d = Math.hypot(b.x - a.x, b.z - a.z); seg.push(d); total += d; }
  const n = Math.max(8, Math.round(total / STEP)), step = total / n;
  const pre: number[] = [0];
  for (const d of seg) pre.push(pre[pre.length - 1]! + d);
  const start = total - ((rect.x1 - rect.x0) / 2 - rr); // the middle of the top straight: the start line has a long run-up and run-out
  const xs: number[] = [], zs: number[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const want = (start + k * step) % total;
    if (k === 0 || want < pre[i]!) i = 0;
    while (pre[i + 1]! < want && i < raw.length - 1) i++;
    const a = raw[i]!, b = raw[(i + 1) % raw.length]!, t = seg[i]! > 0 ? (want - pre[i]!) / seg[i]! : 0;
    xs.push(a.x + (b.x - a.x) * t); zs.push(a.z + (b.z - a.z) * t);
  }
  const cum = xs.map((_, k) => k * step);
  return { xs, zs, cum, length: total };
}

/** Marching squares on a distance field: the closed loops where the field crosses `level`. Pure and deterministic. */
function isoLoops(f: Float32Array, w: number, h: number, ox: number, oz: number, cell: number, level: number): Pt[][] {
  const pt = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const edgeKey = (i: number, j: number, horiz: boolean): number => (j * w + i) * 2 + (horiz ? 0 : 1);
  const edgePt = (i: number, j: number, horiz: boolean): number => {
    const k = edgeKey(i, j, horiz);
    if (!pt.has(k)) {
      const i1 = horiz ? i + 1 : i, j1 = horiz ? j : j + 1, v0 = f[j * w + i]!, v1 = f[j1 * w + i1]!, t = (level - v0) / (v1 - v0);
      pt.set(k, { x: ox + (i + (i1 - i) * t) * cell, z: oz + (j + (j1 - j) * t) * cell });
    }
    return k;
  };
  const link = (a: number, b: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const idx = (f[j * w + i]! > level ? 1 : 0) | (f[j * w + i + 1]! > level ? 2 : 0) | (f[(j + 1) * w + i + 1]! > level ? 4 : 0) | (f[(j + 1) * w + i]! > level ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = () => edgePt(i, j, true), B = () => edgePt(i, j + 1, true), L = () => edgePt(i, j, false), R = () => edgePt(i + 1, j, false);
    switch (idx) {
      case 1: case 14: link(L(), T()); break;
      case 2: case 13: link(T(), R()); break;
      case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(R(), B()); break;
      case 5: link(L(), T()); link(R(), B()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(L(), B()); break;
      case 10: link(T(), R()); link(L(), B()); break;
    }
  }
  const seen = new Set<number>(), loops: Pt[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let prev = -1, cur = start;
    for (let guard = 0; guard < adj.size + 2; guard++) {
      seen.add(cur); loop.push(pt.get(cur)!);
      const nb = adj.get(cur)!, next = nb[0] !== prev ? nb[0]! : nb[1] ?? nb[0]!;
      if (nb.length !== 2) { loop.length = 0; break; } // not a clean loop (touches the grid edge): ignore
      prev = cur; cur = next;
      if (cur === start) break;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

const polyLen = (p: Pt[]): number => { let l = 0; for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; l += Math.hypot(b.x - a.x, b.z - a.z); } return l; };
const bboxArea = (p: Pt[]): number => { const xs = p.map((q) => q.x), zs = p.map((q) => q.z); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)); };
const inside = (p: Pt, poly: Pt[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};

/** Resample a closed polyline at even spacing. */
function resample(p: Pt[], step: number): Pt[] {
  const total = polyLen(p), n = Math.max(8, Math.round(total / step)), d = total / n, out: Pt[] = [];
  let i = 0, acc = 0, segLen = Math.hypot(p[1 % p.length]!.x - p[0]!.x, p[1 % p.length]!.z - p[0]!.z);
  for (let k = 0; k < n; k++) {
    const want = k * d;
    while (acc + segLen < want && i < p.length - 1) { acc += segLen; i++; const a = p[i]!, b = p[(i + 1) % p.length]!; segLen = Math.hypot(b.x - a.x, b.z - a.z); }
    const a = p[i]!, b = p[(i + 1) % p.length]!, t = segLen > 0 ? (want - acc) / segLen : 0;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

const turnAt = (p: Pt[], i: number): number => {
  const n = p.length, a = p[(i - 1 + n) % n]!, b = p[i]!, c = p[(i + 1) % n]!;
  const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
  return Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
};
export const MAX_TURN = 0.2; // rad per metre of road: a corner radius of at least 5 m

/** Smooth a 1 m-spaced closed loop until no bend is sharper than MAX_TURN. */
function smoothLoop(p0: Pt[]): Pt[] {
  let p = p0;
  for (let pass = 0; pass < 80; pass++) {
    let worst = 0;
    for (let i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(turnAt(p, i)));
    if (worst <= MAX_TURN * 0.9 && pass >= 6) break;
    const n = p.length, K = 3;
    p = p.map((_, i) => { let x = 0, z = 0; for (let k = -K; k <= K; k++) { const q = p[(i + k + n * 4) % n]!; x += q.x; z += q.z; } return { x: x / (2 * K + 1), z: z / (2 * K + 1) }; });
    p = resample(p, STEP);
  }
  return p;
}

/** The loop that hugs the shape of the campus: the contour at a distance from all rects, smoothed. Null when the shape is not one piece. */
function contourLoop(rects: Rect[], need: number): Pt[] | null {
  const cell = 1;
  const hullAll = { x0: Math.min(...rects.map((r) => r.x0)), z0: Math.min(...rects.map((r) => r.z0)), x1: Math.max(...rects.map((r) => r.x1)), z1: Math.max(...rects.map((r) => r.z1)) };
  const pad = need + 14, ox = hullAll.x0 - pad, oz = hullAll.z0 - pad;
  const w = Math.ceil((hullAll.x1 - hullAll.x0 + 2 * pad) / cell) + 1, h = Math.ceil((hullAll.z1 - hullAll.z0 + 2 * pad) / cell) + 1;
  if (w * h > 400_000) return null;
  const f = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let m = Infinity; for (const r of rects) m = Math.min(m, distToRect(ox + i * cell, oz + j * cell, r)); f[j * w + i] = m; }
  for (let extra = 1.2; extra < 9; extra += 0.8) {
    const loops = isoLoops(f, w, h, ox, oz, cell, need + extra);
    if (!loops.length) return null;
    loops.sort((a, b) => bboxArea(b) - bboxArea(a));
    const outer = loops[0]!;
    if (loops.slice(1).some((l) => !inside(l[0]!, outer))) return null; // a second separate piece: no single loop around everything
    if (polyLen(outer) < 80) return null;
    const sm = smoothLoop(resample(outer, STEP));
    if (minClearance(sm.map((q) => q.x), sm.map((q) => q.z), rects) >= need - 1e-6) return sm;
  }
  return null;
}

const minClearance = (xs: number[], zs: number[], rects: Rect[]): number => {
  let m = Infinity;
  for (let i = 0; i < xs.length; i++) for (const r of rects) m = Math.min(m, distToRect(xs[i]!, zs[i]!, r));
  return m;
};

/**
 * Build the loop. First choice: a ring through the plaza around all rooms, if the gap to the team areas is wide enough.
 * Otherwise: a ring around the whole campus. Null when there is nothing to race around.
 */
export function buildTrack(input: TrackInput): Track | null {
  if (!input.zones.length && !input.areas.length) return null;
  const need = HALF_WIDTH + CLEARANCE;
  const off = offsetFor(CORNER_R, need);
  const all = [...input.zones, ...input.areas];
  const hull = (rs: Rect[]): Rect => ({ x0: Math.min(...rs.map((r) => r.x0)), z0: Math.min(...rs.map((r) => r.z0)), x1: Math.max(...rs.map((r) => r.x1)), z1: Math.max(...rs.map((r) => r.z1)) });
  const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
  const atLeast = (r: Rect): Rect => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = Math.max((r.x1 - r.x0) / 2, MIN_HALF_EXTENT), hz = Math.max((r.z1 - r.z0) / 2, MIN_HALF_EXTENT);
    return { x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz };
  };
  const make = (kind: Track["kind"], rect: Rect): Track => {
    const l = roundedLoop(rect, CORNER_R);
    return { kind, xs: l.xs, zs: l.zs, cum: l.cum, n: l.xs.length, length: l.length, halfWidth: HALF_WIDTH, rect };
  };
  if (input.zones.length) {
    const inner = make("inner", grow(hull(input.zones), off));
    if (minClearance(inner.xs, inner.zs, all) >= need - 1e-6) return inner;
  }
  const c = contourLoop(all, need);
  if (c) {
    // start line in the straightest stretch: a long run-up and run-out
    const n = c.length, W = 14;
    let bestI = 0, best = Infinity;
    for (let i = 0; i < n; i += 2) { let sc = 0; for (let k = -W; k <= W; k++) sc += Math.abs(turnAt(c, (i + k + n * 2) % n)); if (sc < best) { best = sc; bestI = i; } }
    const rot = [...c.slice(bestI), ...c.slice(0, bestI)], length = polyLen(rot), xs = rot.map((q) => q.x), zs = rot.map((q) => q.z);
    const rect = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
    return { kind: "contour", xs, zs, cum: xs.map((_, k) => (k * length) / n), n, length, halfWidth: HALF_WIDTH, rect };
  }
  const everything = [...all, input.bounds];
  return make("outer", grow(atLeast(hull(everything)), off));
}

/** The track input for a computed layout (structural type, so this file stays free of the layout's three.js imports). */
export function trackInput(layout: { zones: { x: number; z: number; w: number; d: number }[]; areas: { x: number; z: number; w: number; d: number }[]; minX: number; maxX: number; minZ: number; maxZ: number }): TrackInput {
  const box = (o: { x: number; z: number; w: number; d: number }): Rect => ({ x0: o.x - o.w / 2, z0: o.z - o.d / 2, x1: o.x + o.w / 2, z1: o.z + o.d / 2 });
  return { zones: layout.zones.map(box), areas: layout.areas.map(box), bounds: { x0: layout.minX, z0: layout.minZ, x1: layout.maxX, z1: layout.maxZ } };
}

/** Does the road (centre line +- half width) stay clear of every rect? Used by tests and as a sanity check. */
export const trackClearance = (t: Track, rects: Rect[]): number => minClearance(t.xs, t.zs, rects) - t.halfWidth;

const wrap = (s: number, len: number): number => ((s % len) + len) % len;

/** Position and direction on the centre line at distance s (wraps around). */
export function pointAt(t: Track, s: number): { x: number; z: number; tx: number; tz: number } {
  const ss = wrap(s, t.length), step = t.length / t.n, i = Math.min(t.n - 1, Math.floor(ss / step)), j = (i + 1) % t.n, f = ss / step - i;
  const x = t.xs[i]! + (t.xs[j]! - t.xs[i]!) * f, z = t.zs[i]! + (t.zs[j]! - t.zs[i]!) * f;
  const dx = t.xs[j]! - t.xs[i]!, dz = t.zs[j]! - t.zs[i]!, d = Math.hypot(dx, dz) || 1;
  return { x, z, tx: dx / d, tz: dz / d };
}

/** Nearest point of the centre line. `hint` (a previous index) limits the search to a window, -1 searches everything. lat > 0 = right of the direction of travel. */
export function project(t: Track, x: number, z: number, hint = -1): TrackPos {
  let best = -1, bd = Infinity;
  const scan = (i: number) => { const k = ((i % t.n) + t.n) % t.n, d = (t.xs[k]! - x) ** 2 + (t.zs[k]! - z) ** 2; if (d < bd) { bd = d; best = k; } };
  if (hint < 0) for (let i = 0; i < t.n; i++) scan(i); else for (let i = hint - 10; i <= hint + 10; i++) scan(i);
  const step = t.length / t.n;
  let out: TrackPos | null = null;
  for (const a of [(best - 1 + t.n) % t.n, best]) {
    const b = (a + 1) % t.n, ax = t.xs[a]!, az = t.zs[a]!, dx = t.xs[b]! - ax, dz = t.zs[b]! - az, len2 = dx * dx + dz * dz || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + dx * f, pz = az + dz * f, d = Math.hypot(x - px, z - pz), l = Math.sqrt(len2);
    if (!out || d < out.dist) out = { i: a, s: a * step + f * step, lat: ((x - px) * -dz + (z - pz) * dx) / l, dist: d, tx: dx / l, tz: dz / l };
  }
  return out!;
}

/** Starting grid: row k (two cars side by side) sits behind the line at s = 0. Returns position + heading. */
export function gridSlot(t: Track, k: number): { x: number; z: number; h: number; s: number } {
  const row = Math.floor(k / 2), side = k % 2 === 0 ? -1 : 1, s = -4 - row * 4.5, p = pointAt(t, s);
  const nx = -p.tz, nz = p.tx; // normal on the side lat > 0
  const o = side * t.halfWidth * 0.45;
  return { x: p.x + nx * o, z: p.z + nz * o, h: Math.atan2(p.tz, p.tx), s };
}
