import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { ZAP_MS, activeZaps, zapLevel } from "./actions";
import { roams } from "./roam";

const SLOTS = 4;   // simultaneous zap effects
const SPARKS = 10;
const BOLT = 6;    // segments in the lightning bolt

/** Lightning from above, a flash, and flying sparks at each recently zapped robot. Pooled: no allocation per zap. */
export function Zaps() {
  return <>{Array.from({ length: SLOTS }, (_, i) => <ZapSlot key={i} slot={i} />)}</>;
}

function ZapSlot({ slot }: { slot: number }) {
  const g = useRef<Group>(null);
  const flash = useRef<Mesh>(null);
  const sparks = useRef<(Mesh | null)[]>([]);
  const bolt = useRef<(Mesh | null)[]>([]);
  const idx = useMemo(() => Array.from({ length: SPARKS }, (_, k) => k), []);
  const seg = useMemo(() => Array.from({ length: BOLT }, (_, k) => k), []);

  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const id = activeZaps()[slot];
    const r = id ? roams.get(id) : undefined;
    const lvl = id ? zapLevel(id) : 0;
    if (!id || !r || lvl <= 0) { grp.visible = false; return; }
    grp.visible = true;
    grp.position.set(r.x, 0, r.z);
    const age = 1 - lvl; // 0 -> 1
    if (flash.current) {
      flash.current.position.y = 1.1;
      flash.current.scale.setScalar(0.4 + Math.sin(age * Math.PI) * 1.1 + Math.random() * 0.15);
      (flash.current.material as { opacity: number }).opacity = lvl * 0.8;
    }
    // jagged bolt from the sky down to the bot's head; re-rolled every frame so it flickers
    const top = 4.2, bottom = 1.2, h = (top - bottom) / BOLT;
    bolt.current.forEach((m, k) => {
      if (!m) return;
      m.visible = age < 0.45 && Math.random() > 0.15;
      m.position.set((Math.random() - 0.5) * 0.5 * (k / BOLT + 0.2), top - h * (k + 0.5), (Math.random() - 0.5) * 0.5 * (k / BOLT + 0.2));
      m.scale.set(0.09, h * 1.15, 0.09);
      m.rotation.z = (Math.random() - 0.5) * 0.8;
    });
    sparks.current.forEach((m, k) => {
      if (!m) return;
      const a = (k / SPARKS) * Math.PI * 2 + k;
      const d = 0.3 + age * 1.6;
      m.position.set(Math.cos(a) * d, 1.1 + Math.sin(age * Math.PI) * 0.9 - age * 0.4 + (k % 3) * 0.1, Math.sin(a) * d);
      m.scale.setScalar(0.07 * lvl + 0.02);
      m.rotation.set(age * 9 + k, age * 7, 0);
    });
  });

  return (
    <group ref={g} visible={false}>
      <mesh ref={flash}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial color="#fff6a8" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
      </mesh>
      {seg.map((k) => (
        <mesh key={`b${k}`} ref={(m) => { bolt.current[k] = m; }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#fffbe0" toneMapped={false} />
        </mesh>
      ))}
      {idx.map((k) => (
        <mesh key={`s${k}`} ref={(m) => { sparks.current[k] = m; }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={k % 2 ? "#ffd93d" : "#7dd3ff"} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export { ZAP_MS };
