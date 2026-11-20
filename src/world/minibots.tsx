import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, InstancedMesh, Object3D } from "three";
import type { SubagentInfo } from "../api";
import type { Layout } from "./layout";
import { conductors } from "./roam";

const MAX = 200;
const ACTIVE_MS = 2 * 60_000;
const o = new Object3D();
const c = new Color();
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };

interface Mini { x: number; z: number; type: string; active: boolean; phase: number }

/**
 * Sub-agents as minibots standing in the corners of their parent's project area; the parent (the conductor) waves a
 * baton while any of them is working. Minibots that are working bob and glow, finished ones stand dim.
 */
export function Minibots({ layout, subs }: { layout: Layout; subs: Record<string, SubagentInfo[]> }) {
  const body = useRef<InstancedMesh>(null);
  const eyes = useRef<InstancedMesh>(null);
  const geoBody = useMemo(() => new BoxGeometry(0.5, 0.34, 0.3), []);
  const geoEyes = useMemo(() => new BoxGeometry(0.34, 0.07, 0.04), []);
  const minis = useMemo<Mini[]>(() => {
    const out: Mini[] = [], used = new Map<string, number>();
    const now = Date.now();
    conductors.clear();
    for (const d of layout.desks) {
      const list = subs[d.worker.id];
      if (!list?.length) continue;
      const area = layout.areas.find((a) => a.name === d.worker.team);
      if (!area) continue;
      let h = 0; for (const ch of d.worker.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const corner = h % 4, sx = corner % 2 ? 1 : -1, sz = corner < 2 ? -1 : 1;
      for (const s of list) {
        const key = `${area.name}|${corner}`, n = used.get(key) ?? 0;
        if (n >= 9) break;
        used.set(key, n + 1);
        const active = !s.finished && now - s.mtimeMs < ACTIVE_MS;
        if (active) conductors.add(d.worker.id);
        out.push({
          x: area.x + sx * (area.w / 2 - 1.1 - (n % 3) * 0.7), z: area.z + sz * (area.d / 2 - 1.1 - Math.floor(n / 3) * 0.7),
          type: s.type, active, phase: n * 1.3,
        });
        if (out.length >= MAX) return out;
      }
    }
    return out;
  }, [layout, subs]);

  useLayoutEffect(() => {
    const b = body.current, e = eyes.current;
    if (!b || !e) return;
    minis.forEach((m, i) => {
      b.setColorAt(i, c.setHSL(hue(m.type) / 360, m.active ? 0.6 : 0.12, m.active ? 0.55 : 0.32));
      e.setColorAt(i, c.set(m.active ? "#7dffb0" : "#46505f"));
    });
    b.count = e.count = minis.length;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (e.instanceColor) e.instanceColor.needsUpdate = true;
  }, [minis]);

  useFrame((state) => {
    const b = body.current, e = eyes.current;
    if (!b || !e) return;
    const t = state.clock.elapsedTime;
    minis.forEach((m, i) => {
      const bob = m.active ? Math.abs(Math.sin(t * 6 + m.phase)) * 0.12 : 0;
      o.position.set(m.x, 0.34 + bob, m.z); o.rotation.set(0, m.active ? Math.sin(t * 2 + m.phase) * 0.5 : 0, 0); o.scale.setScalar(1); o.updateMatrix();
      b.setMatrixAt(i, o.matrix);
      o.position.set(m.x, 0.4 + bob, m.z + 0.16 * Math.cos(o.rotation.y)); o.updateMatrix();
      e.setMatrixAt(i, o.matrix);
    });
    b.instanceMatrix.needsUpdate = true; e.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={body} args={[geoBody, undefined, MAX]} frustumCulled={false}><meshStandardMaterial roughness={0.6} /></instancedMesh>
      <instancedMesh ref={eyes} args={[geoEyes, undefined, MAX]} frustumCulled={false}><meshBasicMaterial toneMapped={false} /></instancedMesh>
    </>
  );
}
