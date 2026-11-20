import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { activeFx } from "./fx";
import { roams } from "./roam";

const SLOTS = 8;
const PARTS = 14;
const BOLT = 6;

/** Draws the particles / flash / lightning of whatever effects are playing (pooled: no allocation per effect). */
export function FxLayer() {
  return <>{Array.from({ length: SLOTS }, (_, i) => <Slot key={i} slot={i} />)}</>;
}

function Slot({ slot }: { slot: number }) {
  const g = useRef<Group>(null);
  const flash = useRef<Mesh>(null);
  const parts = useRef<(Mesh | null)[]>([]);
  const bolt = useRef<(Mesh | null)[]>([]);
  const lastKind = useRef("");
  const idx = useMemo(() => Array.from({ length: PARTS }, (_, k) => k), []);
  const seg = useMemo(() => Array.from({ length: BOLT }, (_, k) => k), []);

  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const a = activeFx()[slot];
    const r = a ? roams.get(a.worker) : undefined;
    if (!a || !r) { grp.visible = false; return; }
    grp.visible = true;
    grp.position.set(r.x, 0, r.z);
    const { kind, age, level } = a;
    if (lastKind.current !== kind.id) { // recolor only when the slot starts showing a different effect
      lastKind.current = kind.id;
      const cols = kind.particles?.colors ?? ["#ffffff"];
      parts.current.forEach((m, k) => { if (m) (m.material as MeshBasicMaterial).color.set(cols[k % cols.length]!); });
      if (flash.current && kind.flash) (flash.current.material as MeshBasicMaterial).color.set(kind.flash.color);
    }
    if (flash.current) {
      flash.current.visible = !!kind.flash;
      if (kind.flash) {
        flash.current.position.y = 1.1;
        flash.current.scale.setScalar(0.4 * kind.flash.size + Math.sin(age * Math.PI) * kind.flash.size + Math.random() * 0.1);
        (flash.current.material as MeshBasicMaterial).opacity = level * 0.8;
      }
    }
    const top = 4.2, bottom = 1.2, h = (top - bottom) / BOLT;
    bolt.current.forEach((m, k) => {
      if (!m) return;
      m.visible = !!kind.bolt && age < 0.45 && Math.random() > 0.15;
      m.position.set((Math.random() - 0.5) * 0.5 * (k / BOLT + 0.2), top - h * (k + 0.5), (Math.random() - 0.5) * 0.5 * (k / BOLT + 0.2));
      m.scale.set(0.09, h * 1.15, 0.09);
      m.rotation.z = (Math.random() - 0.5) * 0.8;
    });
    const p = kind.particles;
    parts.current.forEach((m, k) => {
      if (!m) return;
      if (!p || k >= p.count) { m.visible = false; return; }
      m.visible = true;
      const ang = (k / p.count) * Math.PI * 2 + k;
      const d = 0.25 + age * p.spread;
      m.position.set(Math.cos(ang) * d, 1.1 + p.rise * age + Math.sin(age * Math.PI) * 0.5 - (p.gravity ?? 0) * age * age + (k % 3) * 0.08, Math.sin(ang) * d);
      m.scale.setScalar(p.size * (level + 0.25));
      m.rotation.set(age * 9 + k, age * 7, 0);
    });
  });

  return (
    <group ref={g} visible={false}>
      <mesh ref={flash}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
      </mesh>
      {seg.map((k) => (
        <mesh key={`b${k}`} ref={(m) => { bolt.current[k] = m; }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#fffbe0" toneMapped={false} />
        </mesh>
      ))}
      {idx.map((k) => (
        <mesh key={`p${k}`} ref={(m) => { parts.current[k] = m; }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
