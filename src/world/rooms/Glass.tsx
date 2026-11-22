import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

/**
 * A see-through pane with a frame and two light streaks that slowly slide across, so it reads as glass even against a dark
 * background. Purely visual (no collision, no clicks): `at` is the centre, `w` x `h` the size, `tint` the glass colour.
 */
export function Glass({ at, w, h, tint = "#9be7ff" }: { at: [number, number, number]; w: number; h: number; tint?: string }) {
  const streaks = useRef<(Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    streaks.current.forEach((m, i) => { if (m) m.position.x = -w / 2 + ((t * 0.25 + i * 0.5) % 1) * w; });
  });
  const frame = "#9aa7b8";
  return (
    <group position={at}>
      <mesh renderOrder={3}><boxGeometry args={[w, h, 0.03]} /><meshStandardMaterial color={tint} transparent opacity={0.3} roughness={0.05} metalness={0.2} depthWrite={false} /></mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { streaks.current[i] = m; }} position={[0, 0, 0.02]} rotation={[0, 0, 0.5]} renderOrder={4}>
          <boxGeometry args={[0.12 + i * 0.08, h * 1.3, 0.005]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, h / 2, 0]}><boxGeometry args={[w + 0.1, 0.07, 0.09]} /><meshStandardMaterial color={frame} /></mesh>
      <mesh position={[0, -h / 2, 0]}><boxGeometry args={[w + 0.1, 0.07, 0.09]} /><meshStandardMaterial color={frame} /></mesh>
      {[-w / 2, 0, w / 2].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.07, h, 0.09]} /><meshStandardMaterial color={frame} /></mesh>)}
    </group>
  );
}
