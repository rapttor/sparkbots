import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, DoubleSide, Matrix4, Object3D, type InstancedMesh } from "three";
import { MAX_DESKS, type Layout } from "./layout";
import { MoodDriver } from "./mood";

/** Cubicles (13.4.1 / 13.4.2, simplified): around each existing desk two see-through wall boxes (back and right side) plus a small
 *  shelf with three slots (later: trophies, 13.4.3). Instanced, ghost walls, and none of it can be clicked or collided with:
 *  `raycast` is disabled so clicks reach the desk, laptop and robot behind. The laptop and status screen are untouched.
 *  Also mounts the mood driver (caffeine refresh, nervous mode) so World needs just this one line. */
const WALL_H = 1.25, WALL_T = 0.05;
const SLOTS = 3;
const noRaycast = () => null;

/** Pure placement of the pieces for one desk centre (tested). Boxes as { x, y, z, sx, sy, sz }. */
export interface Piece { x: number; y: number; z: number; sx: number; sy: number; sz: number }
export function cubiclePieces(x: number, z: number): { walls: Piece[]; shelf: Piece; slots: Piece[] } {
  const back: Piece = { x, y: WALL_H / 2, z: z - 0.78, sx: 2.5, sy: WALL_H, sz: WALL_T };
  const side: Piece = { x: x + 1.27, y: WALL_H / 2, z: z + 0.2, sx: WALL_T, sy: WALL_H, sz: 1.95 };
  const shelf: Piece = { x: x - 0.55, y: 1.0, z: z - 0.68, sx: 0.9, sy: 0.04, sz: 0.2 };
  const slots: Piece[] = Array.from({ length: SLOTS }, (_, k) => ({ x: shelf.x - 0.28 + k * 0.28, y: 1.0 + 0.02 + 0.07, z: shelf.z, sx: 0.2, sy: 0.14, sz: 0.14 }));
  return { walls: [back, side], shelf, slots };
}

export function Cubicles({ layout }: { layout: Layout }) {
  const walls = useRef<InstancedMesh>(null);
  const props = useRef<InstancedMesh>(null);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useLayoutEffect(() => {
    const w = walls.current, p = props.current;
    if (!w || !p) return;
    const o = new Object3D(), M = new Matrix4(), c = new Color();
    const put = (mesh: InstancedMesh, i: number, b: Piece) => { o.position.set(b.x, b.y, b.z); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix(); mesh.setMatrixAt(i, M.copy(o.matrix)); };
    let wi = 0, pi = 0;
    for (const d of layout.desks) {
      const { walls: ws, shelf, slots } = cubiclePieces(d.x, d.z);
      for (const b of ws) put(w, wi++, b);
      put(p, pi, shelf); p.setColorAt(pi++, c.set("#6b5b4a"));
      for (const s of slots) { put(p, pi, s); p.setColorAt(pi++, c.set(d.worker.color).multiplyScalar(0.8)); }
    }
    w.count = wi; p.count = pi;
    w.instanceMatrix.needsUpdate = true; p.instanceMatrix.needsUpdate = true;
    if (p.instanceColor) p.instanceColor.needsUpdate = true;
  }, [layout]);
  return (
    <>
      <instancedMesh ref={walls} args={[box, undefined, MAX_DESKS * 2]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial color="#9fb4d0" transparent opacity={0.16} depthWrite={false} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={props} args={[box, undefined, MAX_DESKS * (1 + SLOTS)]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial />
      </instancedMesh>
      <MoodDriver layout={layout} />
    </>
  );
}
