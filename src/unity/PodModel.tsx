import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";

/**
 * The Unity pod: an original hexagonal glass booth with a glowing canopy, built from primitives in the rapttor green.
 * Used as the door in the office and as the way back inside Unity. `glow` (0..1) makes the lamp pulse harder.
 */
export const POD_GREEN = "#4ade80";
export const POD_DARK = "#0b1f17";

export function PodModel({ glow = 0.4 }: { glow?: number }) {
  const lamp = useRef<Mesh>(null);
  const door = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * (1.6 + glow * 2));
    const l = lamp.current?.material as MeshStandardMaterial | undefined;
    if (l) l.emissiveIntensity = 1.2 + pulse * (0.8 + glow * 2.2);
    const d = door.current?.material as MeshStandardMaterial | undefined;
    if (d) d.opacity = 0.35 + 0.2 * pulse;
  });
  return (
    <group>
      {/* plinth */}
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[1.05, 1.15, 0.2, 6]} /><meshStandardMaterial color={POD_DARK} roughness={0.6} /></mesh>
      <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.7, 1.0, 6]} /><meshBasicMaterial color={POD_GREEN} toneMapped={false} /></mesh>
      {/* glass body */}
      <mesh position={[0, 1.35, 0]}><cylinderGeometry args={[0.85, 0.85, 2.3, 6, 1, true]} /><meshStandardMaterial color="#9ff5c7" transparent opacity={0.2} roughness={0.1} metalness={0.2} side={2} depthWrite={false} /></mesh>
      {/* six corner posts */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(a) * 0.85, 1.35, Math.sin(a) * 0.85]}><boxGeometry args={[0.09, 2.3, 0.09]} /><meshStandardMaterial color={POD_DARK} roughness={0.5} /></mesh>;
      })}
      {/* canopy and lamp */}
      <mesh position={[0, 2.65, 0]}><cylinderGeometry args={[0.95, 1.0, 0.18, 6]} /><meshStandardMaterial color={POD_DARK} roughness={0.5} /></mesh>
      <mesh position={[0, 2.78, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.55, 0.75, 6]} /><meshBasicMaterial color={POD_GREEN} toneMapped={false} /></mesh>
      <mesh ref={lamp} position={[0, 2.98, 0]}><sphereGeometry args={[0.2, 16, 12]} /><meshStandardMaterial color="#d9ffe9" emissive={POD_GREEN} emissiveIntensity={1.6} toneMapped={false} /></mesh>
      {/* the doorway: a soft glowing arch on the front face (towards +z) */}
      <mesh ref={door} position={[0, 1.2, 0.74]}><planeGeometry args={[0.7, 1.9]} /><meshStandardMaterial color={POD_GREEN} emissive={POD_GREEN} emissiveIntensity={1.4} transparent opacity={0.45} depthWrite={false} toneMapped={false} /></mesh>
      <pointLight position={[0, 1.4, 0]} color={POD_GREEN} intensity={1.4} distance={5} />
    </group>
  );
}
