import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D } from "three";
import { roams } from "../../roam";
import { HALF_WIDTH, pointAt, type Track } from "./track";
import { USER_ID, type RaceHub } from "./hub";

export const RACE_INSTANCE = "race";
const MAX_MARKS = 900;      // tyre marks kept on the road (oldest are overwritten)
const MARK_GAP = 0.45;      // m between two marks of one wheel
const SIDE = HALF_WIDTH + 2.4; // how far beside the road centre the drivers' bots stand (inside the free ground next to the kerb)

/** Where the k-th driver's bot stands: beside the start straight, a little further back for each one. Pure, so it is testable. */
export function pitSpot(t: Track, k: number): { x: number; z: number; face: number } {
  const p = pointAt(t, t.length - 5 - k * 2.2);
  const nx = -p.tz, nz = p.tx;                     // right of the direction of travel
  const x = p.x + nx * SIDE, z = p.z + nz * SIDE;
  return { x, z, face: Math.atan2(p.x - x, p.z - z) }; // looking at the road
}

/** While a race runs, the robots whose cars drive stand at the track side (they walk there, then watch); they go back to normal when it ends. Cosmetic: `bots.ts` drops this the moment real work calls. */
export function useTrackSideDrivers(hub: RaceHub, track: Track | null, version: number): void {
  const placed = useRef<string[]>([]);
  useEffect(() => {
    const release = () => { for (const id of placed.current) { const r = roams.get(id); if (r?.game?.instance === RACE_INSTANCE) { r.game = null; r.tx = r.x; r.tz = r.z; r.wait = 0; } } placed.current = []; };
    release();
    const sim = hub.sim;
    if (!sim || !track) return;
    let k = 0;
    for (const rc of sim.racers) {
      if (rc.id === USER_ID || rc.id.startsWith("pit")) continue;
      const r = roams.get(rc.id);
      if (!r || r.mode !== "wander") continue; // a table game they were at is called off by its hub once the agent is gone
      const s = pitSpot(track, k++);
      r.visit = null; r.clip = null;
      r.game = { instance: RACE_INSTANCE, x: s.x, z: s.z, face: s.face, arrived: false };
      placed.current.push(rc.id);
    }
    return release;
  }, [hub, track, version]);
}

/** Dark marks on the road behind a car that drifts or slides. One instanced mesh used as a ring buffer; cleared when the race is gone. */
export function TyreMarks({ hub }: { hub: RaceHub }) {
  const mesh = useRef<InstancedMesh>(null);
  const geo = useRef(new BoxGeometry(0.34, 0.01, 0.7));
  const mat = useRef(new MeshBasicMaterial({ color: "#14161c", transparent: true, opacity: 0.55, depthWrite: false }));
  const o = useRef(new Object3D());
  const next = useRef(0), count = useRef(0);
  const last = useRef(new Map<string, { x: number; z: number }>());
  useFrame(() => {
    const m = mesh.current, sim = hub.sim;
    if (!m) return;
    if (!sim) { if (count.current) { count.current = 0; next.current = 0; m.count = 0; last.current.clear(); } return; }
    for (const r of sim.racers) {
      const c = r.car;
      const lateral = c.vx * -Math.sin(c.h) + c.vz * Math.cos(c.h);
      if (r.out || !(c.drifting || Math.abs(lateral) > 3) || Math.hypot(c.vx, c.vz) < 5) { last.current.delete(r.id); continue; }
      const prev = last.current.get(r.id);
      if (prev && Math.hypot(c.x - prev.x, c.z - prev.z) < MARK_GAP) continue;
      last.current.set(r.id, { x: c.x, z: c.z });
      const fx = Math.cos(c.h), fz = Math.sin(c.h), lx = -Math.sin(c.h), lz = Math.cos(c.h);
      for (const side of [-1, 1]) {
        o.current.position.set(c.x - fx * 0.9 + lx * side * 0.55, 0.045, c.z - fz * 0.9 + lz * side * 0.55);
        o.current.rotation.set(0, -c.h, 0);
        o.current.updateMatrix();
        m.setMatrixAt(next.current, o.current.matrix);
        next.current = (next.current + 1) % MAX_MARKS; count.current = Math.min(MAX_MARKS, count.current + 1);
      }
    }
    m.count = count.current; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo.current, mat.current, MAX_MARKS]} frustumCulled={false} raycast={() => null} />;
}
