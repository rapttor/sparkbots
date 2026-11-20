import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Layout } from "./layout";
import { meeting, seatPos } from "./roam";

/** The conference table and chairs. They grow with the number of people inside (4 seats when empty, up to 10). */
export function ConferenceLayer({ layout }: { layout: Layout }) {
  const room = useMemo(() => layout.zones.find((z) => z.zone.id === "conference-room"), [layout]);
  const [n, setN] = useState(4);
  const last = useRef(0);
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 0.25) return;
    last.current = state.clock.elapsedTime;
    const want = Math.max(4, meeting.count);
    if (want !== n) setN(want);
  });
  if (!room) return null;
  const perSide = Math.ceil(n / 2), len = Math.max(4.4, perSide * 1.5 + 0.6);
  const r = { x: room.x, z: room.z, w: room.w, d: room.d };
  return (
    <group>
      <mesh position={[room.x, 0.77, room.z]}><boxGeometry args={[len, 0.1, 1.4]} /><meshStandardMaterial color="#7a5a3a" /></mesh>
      <mesh position={[room.x, 0.37, room.z]}><boxGeometry args={[len - 0.8, 0.7, 0.9]} /><meshStandardMaterial color="#5e4632" /></mesh>
      {Array.from({ length: n }, (_, i) => {
        const s = seatPos(r, i, n), back = s.face === 0 ? 0.3 : -0.3;
        return (
          <group key={i}>
            <mesh position={[s.x, 0.45, s.z]}><boxGeometry args={[0.6, 0.12, 0.6]} /><meshStandardMaterial color="#3c4a5e" /></mesh>
            <mesh position={[s.x, 0.22, s.z]}><boxGeometry args={[0.12, 0.44, 0.12]} /><meshStandardMaterial color="#2a3342" /></mesh>
            <mesh position={[s.x, 0.8, s.z + back]}><boxGeometry args={[0.6, 0.6, 0.1]} /><meshStandardMaterial color="#3c4a5e" /></mesh>
          </group>
        );
      })}
    </group>
  );
}
