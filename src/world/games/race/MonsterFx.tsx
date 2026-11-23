import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D, SphereGeometry, MeshBasicMaterial } from "three";
import type { RaceHub } from "./hub";
import { speedOf } from "./car";

const N = 220;
/** Particle kinds: 0 grey smoke from the chimneys, 1 fire out of the back (orange to yellow). */
const SMOKE = new Color("#5a5d66"), FIRE_A = new Color("#ff6a13"), FIRE_B = new Color("#ffd84a");

/**
 * Monster truck show: smoke from the two chimneys, fire out of the back when it accelerates (more on its back wheels), a cloud of smoke while it
 * tumbles. One small instanced pool, only while a monster-truck race runs. Cosmetic.
 */
export function MonsterFx({ hub }: { hub: RaceHub }) {
  const mesh = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new SphereGeometry(1, 6, 4), []), mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), []);
  const o = useMemo(() => new Object3D(), []), col = useMemo(() => new Color(), []);
  const p = useRef({ x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), kind: new Uint8Array(N), next: 0, acc: 0 });
  useFrame((_, dtRaw) => {
    const m = mesh.current, sim = hub.sim;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.1), a = p.current;
    if (sim?.spec.stunts) {
      a.acc += dt;
      const step = 1 / 40;
      while (a.acc > step) {
        a.acc -= step;
        for (const rc of sim.racers) {
          const c = rc.car; if (rc.out) continue;
          const fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx, th = Math.max(0, rc.input.throttle), rolling = c.rollT > 0;
          const spawn = (lx: number, ly: number, lz: number, kind: number, vx: number, vy: number, vz: number, life: number) => {
            const i = a.next++ % N;
            a.x[i] = c.x + fx * lx + rx * lz; a.y[i] = ly; a.z[i] = c.z + fz * lx + rz * lz;
            a.vx[i] = vx; a.vy[i] = vy; a.vz[i] = vz; a.life[i] = a.max[i] = life; a.kind[i] = kind;
          };
          // chimneys: always puffing, harder with the throttle; a thick cloud while it rolls
          for (const side of [-0.8, 0.8]) if (Math.random() < 0.35 + 0.5 * th + (rolling ? 0.6 : 0)) spawn(-1.2, 3.0, side, 0, c.vx * 0.5 + (Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 1.2, c.vz * 0.5 + (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.8);
          // fire from the back: when you accelerate, bigger on the back wheels
          if (!rolling && (th > 0.4 || c.nitroT > 0) && Math.random() < 0.9) {
            const big = 1 + c.pitch * 3 + (c.nitroT > 0 ? 3 : 0);
            spawn(-1.75, 1.0 + Math.random() * 0.3, (Math.random() - 0.5) * 0.7, 1, c.vx * 0.3 - fx * (4 + Math.random() * 3) * big, 0.3 + Math.random() * 0.8, c.vz * 0.3 - fz * (4 + Math.random() * 3) * big, 0.28 + Math.random() * 0.2);
          }
          void speedOf; // (kept for later tuning: speed-based flame length)
        }
      }
    }
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (a.life[i]! <= 0) continue;
      a.life[i]! -= dt;
      if (a.life[i]! <= 0) continue;
      a.x[i]! += a.vx[i]! * dt; a.y[i]! += a.vy[i]! * dt; a.z[i]! += a.vz[i]! * dt;
      const k = 1 - a.life[i]! / a.max[i]!; // 0 new .. 1 gone
      const fire = a.kind[i] === 1;
      o.position.set(a.x[i]!, a.y[i]!, a.z[i]!);
      o.scale.setScalar(fire ? 0.28 * (1 - k * 0.7) : 0.25 + k * 0.9);
      o.updateMatrix(); m.setMatrixAt(n, o.matrix);
      if (fire) col.copy(FIRE_A).lerp(FIRE_B, 1 - k); else col.copy(SMOKE).multiplyScalar(1 - k * 0.5);
      m.setColorAt(n, col);
      n++;
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, N]} frustumCulled={false} raycast={() => null} />;
}
