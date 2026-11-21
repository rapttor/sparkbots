import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { Layout } from "./layout";

const BELT_X = 3.1;      // belt runs from -BELT_X to +BELT_X at z = 1.3
const BELT_SPEED = 0.8;  // units per second
const STRIPES = 12, CUPS = 5;

/**
 * The moving parts of the coffee factory (see zones/coffee-station.ts for the fixed furniture): a conveyor belt with cups
 * riding on it, a spinning grinder gear, steam over the boiler, smoke from the chimney and blinking status lights.
 */
export function CoffeeFactory({ layout }: { layout: Layout }) {
  const st = layout.zones.find((z) => z.zone.id === "coffee-station");
  const stripes = useRef<(Mesh | null)[]>([]);
  const cups = useRef<(Group | null)[]>([]);
  const gear = useRef<Mesh>(null);
  const steam = useRef<(Mesh | null)[]>([]);
  const smoke = useRef<(Mesh | null)[]>([]);
  const lights = useRef<(Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    stripes.current.forEach((m, i) => { if (m) m.position.x = ((i * (2 * BELT_X / STRIPES) + t * BELT_SPEED) % (2 * BELT_X)) - BELT_X; });
    cups.current.forEach((g, i) => { if (g) g.position.x = ((i * (2 * BELT_X / CUPS) + t * BELT_SPEED) % (2 * BELT_X)) - BELT_X; });
    if (gear.current) gear.current.rotation.y = t * 2.2;
    steam.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.6 + i / 3) % 1;
      m.position.y = 1.95 + k * 0.9; m.scale.setScalar(0.14 + k * 0.2);
      (m.material as MeshBasicMaterial).opacity = 0.55 * (1 - k);
    });
    smoke.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.35 + i / 4) % 1;
      m.position.set(4.2 + k * 0.9, 3.2 + k * 1.4, -2.6); m.scale.setScalar(0.2 + k * 0.45);
      (m.material as MeshBasicMaterial).opacity = 0.4 * (1 - k);
    });
    lights.current.forEach((m, i) => {
      if (!m) return;
      m.visible = i === 0 ? true : i === 1 ? Math.sin(t * 3) > 0 : Math.sin(t * 0.7) > 0.8; // green on, amber blinks, red flashes now and then
    });
  });

  if (!st) return null;
  return (
    <group position={[st.x, 0, st.z]}>
      {/* belt surface stripes (they slide, so the belt looks like it moves) and cups riding on it */}
      {Array.from({ length: STRIPES }, (_, i) => (
        <mesh key={`s${i}`} ref={(m) => { stripes.current[i] = m; }} position={[0, 0.52, 1.3]}>
          <boxGeometry args={[0.12, 0.02, 0.78]} /><meshStandardMaterial color="#555c68" />
        </mesh>
      ))}
      {Array.from({ length: CUPS }, (_, i) => (
        <group key={`c${i}`} ref={(g) => { cups.current[i] = g; }} position={[0, 0.52, 1.3]}>
          <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.22, 0.2, 0.22]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
          <mesh position={[0, 0.21, 0]}><boxGeometry args={[0.18, 0.03, 0.18]} /><meshStandardMaterial color="#6b3f1d" /></mesh>
        </group>
      ))}
      <mesh ref={gear} position={[-3.7, 1.16, -0.9]}><boxGeometry args={[0.6, 0.1, 0.6]} /><meshStandardMaterial color="#9aa4b2" metalness={0.5} roughness={0.4} /></mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={`v${i}`} ref={(m) => { steam.current[i] = m; }} position={[3.7, 2, -2.1]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} toneMapped={false} /></mesh>
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={`k${i}`} ref={(m) => { smoke.current[i] = m; }} position={[4.2, 3.2, -2.6]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#9ca3af" transparent opacity={0.3} depthWrite={false} toneMapped={false} /></mesh>
      ))}
      {([["#22c55e", -0.35], ["#fbbf24", 0], ["#f87171", 0.35]] as const).map(([c, dx], i) => (
        <mesh key={`l${i}`} ref={(m) => { lights.current[i] = m; }} position={[3.7 + dx, 1.27, -1.45]}><boxGeometry args={[0.16, 0.16, 0.06]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>
      ))}
    </group>
  );
}
