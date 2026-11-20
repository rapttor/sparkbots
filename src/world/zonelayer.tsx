import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Object3D } from "three";
import type { Layout } from "./layout";

const o = new Object3D();
const c = new Color();

/**
 * Furniture of every zone as instanced colored boxes, plus the ground of outdoor areas. Rooms have no floor color. Their
 * titles are floating labels (labels.tsx). "Ghost" props (glass walls, fences) are see-through force fields.
 */
export function ZonesLayer({ layout, onZone }: { layout: Layout; onZone?: (zoneId: string) => void }) {
  const all = useMemo(() => layout.zones.flatMap((z) => z.props), [layout]);
  const solid = useMemo(() => all.filter((p) => !p.ghost), [all]);
  const ghost = useMemo(() => all.filter((p) => p.ghost), [all]);
  const meshA = useRef<InstancedMesh>(null);
  const meshB = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const fill = (m: InstancedMesh | null, list: typeof all) => {
    if (!m) return;
    list.forEach((p, i) => {
      o.position.set(p.x, p.y + p.h / 2, p.z); o.scale.set(p.w, p.h, p.d); o.rotation.set(0, 0, 0); o.updateMatrix();
      m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(p.color));
    });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(() => { fill(meshA.current, solid); fill(meshB.current, ghost); }, [solid, ghost]);

  return (
    <>
      {layout.zones.filter((z) => z.zone.outdoor || z.zone.id === "data-room").map(({ zone, x, z, w, d }) => (
        <mesh key={zone.id} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]}
          onClick={onZone && zone.id === "data-room" ? (e) => { e.stopPropagation(); onZone(zone.id); } : undefined}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={zone.floor} transparent={!zone.outdoor} opacity={zone.outdoor ? 1 : 0.001} depthWrite={!!zone.outdoor} />
        </mesh>
      ))}
      {solid.length > 0 && (
        <instancedMesh key={`s${solid.length}`} ref={meshA} args={[geo, undefined, Math.max(1, solid.length)]} frustumCulled={false}>
          <meshStandardMaterial roughness={0.85} />
        </instancedMesh>
      )}
      {ghost.length > 0 && (
        <instancedMesh key={`g${ghost.length}`} ref={meshB} args={[geo, undefined, Math.max(1, ghost.length)]} frustumCulled={false} renderOrder={5}>
          <meshBasicMaterial transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
    </>
  );
}
