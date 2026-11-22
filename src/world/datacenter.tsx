import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Color, CylinderGeometry, InstancedMesh, Object3D, SphereGeometry, TubeGeometry, Vector3, type Group, type MeshBasicMaterial } from "three";
import { useStore } from "../state/store";
import type { Layout } from "./layout";
import { AISLES, AISLE_X, RACKS, RACK_SIZE } from "./datacenterSlots";
import { player } from "./roam";

/** The console desk (see zones/data-room.ts) is the way into the Data room panel: click it, or press E close to it. */
const CONSOLE = { x: 3.2, z: -1.3, reach: 2.6 };
export const consoleSpot = { near: false };
export const openDataRoom = () => useStore.getState().setPanel("data");

const LEDS_PER_RACK = 8;
const HUB = new Vector3(-1.6, 3.4, -3.9);   // where the cables meet, above the back of the rack block
const OFF = new Color("#20242d"), RED = new Color("#ff3b30"), GREEN = new Color("#3ddc84"), AMBER = new Color("#ffb020");
const o = new Object3D();

interface Rack { name: string; color: string; working: number; live: number }

/** One rack per project (first N by name). `working` = busy agents, `live` = awake agents; both drive the blinking. */
function useRacks(): (Rack | null)[] {
  const teams = useStore((s) => s.snapshot?.teams);
  return useMemo(() => {
    const sorted = [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name)).slice(0, RACKS.length);
    return RACKS.map((_, i) => {
      const t = sorted[i]; if (!t) return null;
      return { name: t.name, color: t.botColor || "#4fd1c5",
        working: t.workers.filter((w) => w.state === "working" || w.state === "waiting").length,
        live: t.workers.filter((w) => w.state !== "asleep").length };
    });
  }, [teams]);
}

/**
 * The animated Data center (fixed furniture and the force field live in zones/data-room.ts): red LEDs that blink faster the busier
 * the project is, spinning tape reels, hydra cables that run to a hub with data packets on the working ones, and inspector robots.
 * Everything is instanced or a handful of meshes; nothing re-renders per frame.
 */
export function DataCenter({ layout }: { layout: Layout }) {
  const zone = layout.zones.find((z) => z.zone.id === "data-room");
  const racks = useRacks();
  const racksRef = useRef(racks); racksRef.current = racks;
  const leds = useRef<InstancedMesh>(null), reels = useRef<InstancedMesh>(null), packets = useRef<InstancedMesh>(null);
  const bots = useRef<(Group | null)[]>([]);
  const spin = useRef<number[]>(RACKS.flatMap(() => [0, 0]));
  const last = useRef(0);
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);

  const ledGeo = useMemo(() => new SphereGeometry(0.035, 6, 4), []);
  const reelGeo = useMemo(() => new CylinderGeometry(0.11, 0.11, 0.03, 6), []);
  const packetGeo = useMemo(() => new SphereGeometry(0.05, 6, 4), []);
  const curves = useMemo(() => RACKS.map((r, i) => {
    const top = new Vector3(r.x, RACK_SIZE[1], r.z);
    const mid = new Vector3((r.x + HUB.x) / 2 + (i % 2 ? 0.3 : -0.3), 3.0 + (i % 3) * 0.15, (r.z + HUB.z) / 2);
    return new CatmullRomCurve3([top, new Vector3(r.x, 2.7, r.z), mid, HUB]);
  }), []);
  const tubes = useMemo(() => curves.map((c) => new TubeGeometry(c, 20, 0.03, 5)), [curves]);
  const trunk = useMemo(() => new TubeGeometry(new CatmullRomCurve3([HUB, new Vector3(HUB.x, 3.9, HUB.z - 1.2), new Vector3(HUB.x, 3.6, HUB.z - 3.5)]), 16, 0.12, 6), []);

  useEffect(() => { // colours the instances once; per-frame updates only change the ones that blink
    if (!leds.current) return;
    for (let i = 0; i < RACKS.length * LEDS_PER_RACK; i++) leds.current.setColorAt(i, OFF);
    if (leds.current.instanceColor) leds.current.instanceColor.needsUpdate = true;
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime, rs = racksRef.current;
    if (zone) { // close to the console? (player = avatar or hand position)
      const n = player.on && Math.hypot(player.x - (zone.x + CONSOLE.x), player.z - (zone.z + CONSOLE.z)) < CONSOLE.reach;
      if (n !== nearRef.current) { nearRef.current = n; consoleSpot.near = n; setNear(n); }
    }
    // LEDs: ~12 updates a second is plenty for a blink
    if (leds.current && t - last.current > 0.08) {
      last.current = t;
      for (let i = 0; i < RACKS.length; i++) {
        const r = rs[i];
        for (let k = 0; k < LEDS_PER_RACK; k++) {
          const idx = i * LEDS_PER_RACK + k;
          let c = OFF;
          if (r) {
            const rate = r.working ? 6 + (k % 3) * 2 : 1.5;
            const lit = Math.sin(t * rate + idx * 1.7) > (r.working ? -0.3 : r.live ? 0.55 : 0.93);
            if (lit) c = k % 4 === 3 ? GREEN : k % 4 === 2 && r.working ? AMBER : RED;
          }
          leds.current.setColorAt(idx, c);
        }
      }
      if (leds.current.instanceColor) leds.current.instanceColor.needsUpdate = true;
    }
    // tape reels spin: fast when busy, slow when only awake, still when empty/asleep
    if (reels.current) {
      RACKS.forEach((rk, i) => {
        const r = rs[i], speed = r ? (r.working ? 5 : r.live ? 1 : 0) : 0;
        for (let side = 0; side < 2; side++) {
          const n = i * 2 + side; spin.current[n] = (spin.current[n]! + dt * speed * (side ? -1 : 1)) % (Math.PI * 2);
          o.position.set(rk.x + (side ? 0.2 : -0.2), 1.95, rk.z + RACK_SIZE[2] / 2 + 0.02);
          o.rotation.set(Math.PI / 2, spin.current[n]!, 0); o.scale.setScalar(1); o.updateMatrix();
          reels.current!.setMatrixAt(n, o.matrix);
        }
      });
      reels.current.instanceMatrix.needsUpdate = true;
    }
    // data packets ride the cables of working racks towards the hub
    if (packets.current) {
      const p = new Vector3();
      RACKS.forEach((_, i) => {
        const on = !!rs[i]?.working;
        curves[i]!.getPoint((t * 0.35 + i * 0.37) % 1, p);
        o.position.copy(p); o.rotation.set(0, 0, 0); o.scale.setScalar(on ? 1 : 0); o.updateMatrix();
        packets.current!.setMatrixAt(i, o.matrix);
      });
      packets.current.instanceMatrix.needsUpdate = true;
    }
    // inspector robots patrol the aisles
    bots.current.forEach((g, i) => {
      if (!g) return;
      const [x0, x1] = AISLE_X, w = Math.sin(t * (0.22 + i * 0.05) + i * 2.1);
      const x = (x0 + x1) / 2 + (w * (x1 - x0)) / 2;
      g.position.set(x, 0, AISLES[i % AISLES.length]!);
      g.rotation.y = Math.cos(t * (0.22 + i * 0.05) + i * 2.1) > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.02;
      const eye = g.children[2] as unknown as { material: MeshBasicMaterial };
      if (eye?.material) eye.material.color.set(Math.sin(t * 4 + i) > 0.2 ? "#33c3f0" : "#ffb020"); // scanning
    });
  });

  if (!zone) return null;
  return (
    <group position={[zone.x, 0, zone.z]}>
      <instancedMesh ref={leds} args={[ledGeo, undefined, RACKS.length * LEDS_PER_RACK]} frustumCulled={false}
        onUpdate={(m) => { // fixed LED positions on each rack front
          RACKS.forEach((r, i) => { for (let k = 0; k < LEDS_PER_RACK; k++) {
            o.position.set(r.x + (k % 2 ? 0.22 : -0.22), 0.45 + Math.floor(k / 2) * 0.3, r.z + RACK_SIZE[2] / 2 + 0.03);
            o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); m.setMatrixAt(i * LEDS_PER_RACK + k, o.matrix);
          } });
          m.instanceMatrix.needsUpdate = true;
        }}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={reels} args={[reelGeo, undefined, RACKS.length * 2]} frustumCulled={false}><meshBasicMaterial color="#c9d1dd" /></instancedMesh>
      <instancedMesh ref={packets} args={[packetGeo, undefined, RACKS.length]} frustumCulled={false}><meshBasicMaterial color="#9be7ff" /></instancedMesh>

      {/* hydra cables: project-coloured, from every rack to the hub, then one trunk out through the back wall to the "AI datacenter" */}
      {tubes.map((g, i) => racks[i] && <mesh key={i} geometry={g}><meshBasicMaterial color={racks[i]!.color} /></mesh>)}
      <mesh geometry={trunk}><meshStandardMaterial color="#2b3342" /></mesh>
      <mesh position={HUB}><sphereGeometry args={[0.22, 10, 8]} /><meshBasicMaterial color="#33c3f0" /></mesh>

      {/* project names */}
      {racks.map((r, i) => r && (
        <Html key={i} position={[RACKS[i]!.x, RACK_SIZE[1] + 0.25, RACKS[i]!.z]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="rack-label" style={{ borderColor: r.color }}>{r.name}</div>
        </Html>
      ))}

      {/* the console: click it (or E nearby) to open the Data room panel */}
      <mesh position={[3.2, 0.95, -1.95]} onClick={(e) => { e.stopPropagation(); openDataRoom(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <boxGeometry args={[2.4, 1.4, 1.1]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {near && (
        <Html position={[3.2, 2.0, -1.8]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="rack-label" style={{ borderColor: "#33c3f0" }}>E · open Data room</div>
        </Html>
      )}

      {/* inspector robots */}
      {AISLES.map((_, i) => (
        <group key={i} ref={(g) => { bots.current[i] = g; }} scale={0.7}>
          <mesh position={[0, 0.45, 0]}><boxGeometry args={[0.4, 0.5, 0.3]} /><meshStandardMaterial color="#8a93a3" /></mesh>
          <mesh position={[0, 0.88, 0]}><boxGeometry args={[0.32, 0.26, 0.28]} /><meshStandardMaterial color="#c9d1dd" /></mesh>
          <mesh position={[0, 0.9, 0.15]}><boxGeometry args={[0.22, 0.08, 0.02]} /><meshBasicMaterial color="#33c3f0" /></mesh>
          <mesh position={[0, 1.1, 0]}><boxGeometry args={[0.03, 0.14, 0.03]} /><meshStandardMaterial color="#5a6372" /></mesh>
        </group>
      ))}
    </group>
  );
}
