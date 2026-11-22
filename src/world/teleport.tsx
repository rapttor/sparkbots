import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";

/** Star-Trek style beam effect: a glowing column with sparkles that rise away ("out": dematerialize) or fall in ("in": materialize). Cosmetic only. */
const DURATION = 1.1, SPARKS = 14, POOL = 3;
interface Beam { x: number; z: number; kind: "out" | "in"; t: number }
const beams: Beam[] = [];
export const playBeam = (x: number, z: number, kind: "out" | "in"): void => { if (beams.length >= POOL) beams.shift(); beams.push({ x, z, kind, t: 0 }); };

export function TeleportFx() {
  const groups = useRef<(Group | null)[]>([]);
  const cols = useRef<(Mesh | null)[]>([]);
  const sparks = useRef<(Mesh | null)[][]>([[], [], []]);
  useFrame((_, dt) => {
    for (let i = beams.length - 1; i >= 0; i--) { beams[i]!.t += Math.min(dt, 0.1); if (beams[i]!.t > DURATION) beams.splice(i, 1); }
    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i], b = beams[i];
      if (!g) continue;
      if (!b) { g.visible = false; continue; }
      g.visible = true; g.position.set(b.x, 0, b.z);
      const k = b.t / DURATION, kk = b.kind === "out" ? k : 1 - k; // progress of the effect itself
      const col = cols.current[i];
      if (col) {
        col.scale.set(1 - 0.5 * kk, 1, 1 - 0.5 * kk);
        (col.material as MeshBasicMaterial).opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.55;
      }
      for (let s = 0; s < SPARKS; s++) {
        const m = sparks.current[i]![s]; if (!m) continue;
        const a = (s / SPARKS) * Math.PI * 2 + k * 6, u = (kk + s / SPARKS) % 1, r = 0.5 * (1 - 0.6 * u);
        m.position.set(Math.cos(a) * r, 0.1 + u * 2.4, Math.sin(a) * r);
        m.scale.setScalar(0.07 * Math.sin(Math.min(1, k) * Math.PI) + 0.01);
      }
    }
  });
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <mesh ref={(m) => { cols.current[i] = m; }} position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 2.6, 14, 1, true]} /><meshBasicMaterial color="#7dd3fc" transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
          {Array.from({ length: SPARKS }, (_, s) => (
            <mesh key={s} ref={(m) => { sparks.current[i]![s] = m; }}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#e0f2fe" toneMapped={false} /></mesh>
          ))}
        </group>
      ))}
    </>
  );
}
