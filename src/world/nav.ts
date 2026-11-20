import type { Aabb } from "./collide";

/** Walkable grid over the campus. Blocked cells = desks and solid furniture, grown by the robot's radius. */
export interface NavGrid { ox: number; oz: number; cell: number; w: number; h: number; blocked: Uint8Array }

export function buildNav(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, boxes: Aabb[], cell = 0.5, inflate = 0.4): NavGrid {
  const ox = bounds.minX - 4, oz = bounds.minZ - 4;
  const w = Math.max(1, Math.ceil((bounds.maxX + 4 - ox) / cell)), h = Math.max(1, Math.ceil((bounds.maxZ + 4 - oz) / cell));
  const blocked = new Uint8Array(w * h);
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor((b.minX - inflate - ox) / cell)), x1 = Math.min(w - 1, Math.floor((b.maxX + inflate - ox) / cell));
    const z0 = Math.max(0, Math.floor((b.minZ - inflate - oz) / cell)), z1 = Math.min(h - 1, Math.floor((b.maxZ + inflate - oz) / cell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * w + x] = 1;
  }
  return { ox, oz, cell, w, h, blocked };
}

const FAR = 65535;
const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** One breadth-first distance field per destination, shared by every robot walking there. */
export class Flow {
  private fields = new Map<string, Uint16Array>();
  constructor(readonly grid: NavGrid) {}

  private cellOf(x: number, z: number): [number, number] {
    const g = this.grid;
    return [Math.min(g.w - 1, Math.max(0, Math.floor((x - g.ox) / g.cell))), Math.min(g.h - 1, Math.max(0, Math.floor((z - g.oz) / g.cell)))];
  }

  /** Distances (in cells) from every free cell to the destination; FAR = cannot get there. */
  field(tx: number, tz: number): Uint16Array {
    const g = this.grid, [cx, cz] = this.cellOf(tx, tz), key = `${cx},${cz}`;
    let f = this.fields.get(key);
    if (f) return f;
    f = new Uint16Array(g.w * g.h).fill(FAR);
    // the destination itself may sit inside a grown obstacle (e.g. a chair next to a desk): start from the nearest free cell
    let sx = cx, sz = cz;
    if (g.blocked[cz * g.w + cx]) {
      let best = Infinity;
      for (let r = 1; r < 8 && best === Infinity; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= g.w || z >= g.h || g.blocked[z * g.w + x]) continue;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; sx = x; sz = z; }
      }
    }
    const q = new Int32Array(g.w * g.h);
    let head = 0, tail = 0;
    f[sz * g.w + sx] = 0; q[tail++] = sz * g.w + sx;
    while (head < tail) {
      const i = q[head++]!, x = i % g.w, z = (i / g.w) | 0, d = f[i]!;
      for (const [dx, dz] of NB) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const j = nz * g.w + nx;
        if (g.blocked[j] || f[j]! <= d + 1) continue;
        if (dx !== 0 && dz !== 0 && (g.blocked[z * g.w + nx] || g.blocked[nz * g.w + x])) continue; // no cutting corners
        f[j] = d + 1; q[tail++] = j;
      }
    }
    if (this.fields.size > 160) this.fields.delete(this.fields.keys().next().value!); // keep memory bounded
    this.fields.set(key, f);
    return f;
  }

  /** Unit direction from (x, z) towards the destination of `field`, or null when there is no way. */
  dir(x: number, z: number, f: Uint16Array): { dx: number; dz: number } | null {
    const g = this.grid, [cx, cz] = this.cellOf(x, z);
    let best = f[cz * g.w + cx]!, bx = 0, bz = 0, found = false;
    for (const [dx, dz] of NB) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
      const d = f[nz * g.w + nx]!;
      if (d < best) { best = d; bx = dx; bz = dz; found = true; }
    }
    if (!found) return null;
    const len = Math.hypot(bx, bz);
    return { dx: bx / len, dz: bz / len };
  }
}

/** The navigation shared by the scene and the roaming code. */
export const nav: { flow: Flow | null } = { flow: null };
