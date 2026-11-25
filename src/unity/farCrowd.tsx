import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";

/**
 * Level of detail for the Unity crowd. A full owner character is about 14 meshes (14 draw calls); beyond ~22 units from the camera it
 * is a speck anyway, so it is drawn as a three-box figure instead, and ALL such figures share three instanced draw calls, however
 * many there are. `FarEntry`s are published by the players/ghosts while they are far; this component draws them.
 */
export interface FarEntry { x: number; z: number; r: number; h: number; legs: string; body: string; head: string }
export const farSolid = new Map<string, FarEntry>(); // far players
export const farGhost = new Map<string, FarEntry>(); // far ghosts (drawn see-through)
export const FAR_NEAR = 20, FAR_FAR = 24; // hysteresis: becomes far beyond 24, near again inside 20

const MAX = 80;
const dummy = new Object3D();
const tint = new Color();

function Set3({ entries, ghost }: { entries: Map<string, FarEntry>; ghost: boolean }) {
  const legs = useRef<InstancedMesh>(null), body = useRef<InstancedMesh>(null), head = useRef<InstancedMesh>(null);
  useLayoutEffect(() => { for (const m of [legs, body, head]) if (m.current) m.current.count = 0; }, []);
  useFrame(() => {
    const L = legs.current, Bd = body.current, H = head.current;
    if (!L || !Bd || !H) return;
    let i = 0;
    for (const e of entries.values()) {
      if (i >= MAX) break;
      dummy.rotation.set(0, e.r, 0);
      const put = (m: InstancedMesh, y: number, sx: number, sy: number, sz: number, color: string) => {
        dummy.position.set(e.x, y * e.h, e.z); dummy.scale.set(sx * e.h, sy * e.h, sz * e.h); dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, tint.set(color));
      };
      put(L, 0.225, 0.36, 0.45, 0.22, e.legs);
      put(Bd, 0.625, 0.5, 0.35, 0.3, e.body);
      put(H, 0.92, 0.2, 0.2, 0.2, e.head);
      i++;
    }
    for (const m of [L, Bd, H]) { m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  const mat = <meshStandardMaterial roughness={0.7} transparent={ghost} opacity={ghost ? 0.3 : 1} depthWrite={!ghost} emissive={ghost ? "#335544" : "#000000"} />;
  return (
    <>
      <instancedMesh ref={legs} args={[undefined, undefined, MAX]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} />{mat}</instancedMesh>
      <instancedMesh ref={body} args={[undefined, undefined, MAX]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} />{mat}</instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, MAX]} frustumCulled={false}><sphereGeometry args={[1, 10, 8]} />{mat}</instancedMesh>
    </>
  );
}

export function FarCrowd() {
  return <><Set3 entries={farSolid} ghost={false} /><Set3 entries={farGhost} ghost /></>;
}
