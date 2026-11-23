import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { Layout } from "../layout";
import { Glass } from "./Glass";
import { FLIGHT_S, OUT_S, flight } from "./drones";
import { MANAGER_ID, setCafeOrderHandler } from "../servicebots";
import { managerAt } from "../roam";
import { bumpCaffeine } from "../caffeine";
import { bubble, pointer } from "./ui";

const BREW_S = 2.5, READY_S = 2.5, EVERY_S = 14;   // brewing time (fast), how long an ambient cup waits, pause between ambient coffees
const MAX_DRONES = 3;
interface Flight { id: string; t: number; bumped?: boolean; from: { x: number; z: number }; home: { x: number; z: number } }
const MACHINE = { x: -1.5, z: -2.2 }, CUP_Z = -1.95, BAR = { x: -0.9, z: -2.95 };

/**
 * The cafe: a barista robot behind a glass pane makes coffee now and then (click it to order one): arms work the machine,
 * steam rises, a thin stream fills the cup, then the cup slides to the counter. Cosmetic; the cup is the only moving prop.
 */
export function Cafe({ layout }: { layout: Layout }) {
  const cz = layout.zones.find((z) => z.zone.id === "cafe");
  const arms = useRef<(Group | null)[]>([]);
  const steam = useRef<(Mesh | null)[]>([]);
  const stream = useRef<Mesh>(null);
  const cup = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const bar = useRef<Group>(null);
  const phase = useRef({ state: "idle" as "idle" | "brewing" | "ready", t0: 0, next: 4 });
  const [msg, setMsg] = useState("");
  const orders = useRef<string[]>([]);           // who ordered, in order; the barista makes one cup at a time
  const current = useRef<string | null>(null);   // the order being brewed (null = an ambient cup nobody ordered)
  const flights = useRef<Flight[]>([]);
  const dGroups = useRef<(Group | null)[]>([]);
  const dCup = useRef<(Mesh | null)[]>([]);
  const dRotor = useRef<(Mesh | null)[]>([]);
  const lay = useRef(layout); lay.current = layout;
  // a bubble goes away by itself after a few seconds; a timer, not the frame loop, because the scene stops rendering while a panel covers it
  useEffect(() => { if (!msg) return; const h = setTimeout(() => setMsg(""), 5000); return () => clearTimeout(h); }, [msg]);
  useEffect(() => { // the coffee ordering entry point (O key, agent menu, the barista at the coffee factory)
    setCafeOrderHandler((id) => {
      if (!lay.current.zones.some((z) => z.zone.id === "cafe") || orders.current.length >= 6 || orders.current.includes(id)) return false;
      orders.current.push(id); setMsg("☕ Order taken"); return true;
    });
    return () => setCafeOrderHandler(null);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime, p = phase.current;
    if (p.state === "idle" && ((orders.current.length > 0 && flights.current.length < MAX_DRONES) || (orders.current.length === 0 && t >= p.next))) { current.current = orders.current.shift() ?? null; p.state = "brewing"; p.t0 = t; setMsg("☕ Brewing…"); }
    if (p.state === "brewing" && t - p.t0 > BREW_S) {
      const id = current.current;
      if (id && cz && flights.current.length < MAX_DRONES) { // an ordered cup: a drone takes it to whoever asked
        flights.current.push({ id, t: 0, from: { x: cz.x + MACHINE.x + 0.5, z: cz.z - 1.6 }, home: { x: cz.x + MACHINE.x + 0.5, z: cz.z - 1.6 } });
        p.state = "idle"; p.next = t + 7; setMsg("🚁 Your coffee is on its way");
      } else { p.state = "ready"; p.t0 = t; setMsg("☕ Coffee's ready!"); }
      current.current = null;
    }
    if (p.state === "ready" && t - p.t0 > READY_S) { p.state = "idle"; p.next = t + EVERY_S; setMsg(""); }
    // drones: out to the person, hover, back; the manager is wherever you are now (avatar or hand), agents are at their desk
    flights.current = flights.current.filter((fl) => fl.t < FLIGHT_S);
    for (const fl of flights.current) fl.t += Math.min(0.1, delta);
    for (let i = 0; i < MAX_DRONES; i++) {
      const g = dGroups.current[i], fl = flights.current[i];
      if (!g) continue;
      if (!fl) { g.visible = false; continue; }
      const d = fl.id === MANAGER_ID ? null : lay.current.desks.find((x) => x.worker.id === fl.id);
      const to = fl.id === MANAGER_ID ? { x: managerAt.x, z: managerAt.z } : d ? { x: d.x, z: d.z + 0.8 } : { x: fl.home.x, z: fl.home.z + 2.5 };
      const f = flight(fl.home, to, fl.t);
      if (!fl.bumped && fl.t >= OUT_S && fl.id !== MANAGER_ID) { fl.bumped = true; bumpCaffeine(fl.id, "coffee"); } // the level rises when the cup lands, not when it was ordered
      g.visible = true; g.position.set(f.x, f.y, f.z); g.rotation.y = Math.atan2(to.x - fl.home.x, to.z - fl.home.z);
      const c = dCup.current[i]; if (c) c.visible = f.carrying;
      const r = dRotor.current[i]; if (r) r.rotation.y = t * 30;
    }
    const brewing = p.state === "brewing", k = brewing ? (t - p.t0) / BREW_S : p.state === "ready" ? 1 : 0;
    arms.current.forEach((g, i) => { if (g) g.rotation.x = brewing ? -1.15 + Math.sin(t * 5 + i * 2) * 0.25 : -0.12 + Math.sin(t * 1.2 + i) * 0.04; });
    steam.current.forEach((m, i) => {
      if (!m) return; m.visible = brewing || (p.state === "ready" && i < 2);
      const u = (t * 0.8 + i / 4) % 1;
      m.position.set(MACHINE.x + 0.25 + Math.sin(t * 2 + i) * 0.05, 1.7 + u * 0.7, MACHINE.z); m.scale.setScalar(0.07 + u * 0.12);
      (m.material as MeshBasicMaterial).opacity = 0.5 * (1 - u);
    });
    if (stream.current) { stream.current.visible = brewing && k < 0.92; stream.current.scale.y = 1; }
    if (fill.current) { fill.current.scale.y = Math.max(0.01, k); fill.current.position.y = 0.02 + (0.1 * Math.max(0.01, k)); }
    if (cup.current) cup.current.position.set(MACHINE.x + (p.state === "ready" ? Math.min(1, (t - p.t0) * 2) * 1.0 : 0), 1.0, CUP_Z);
    if (bar.current) bar.current.position.y = Math.sin(t * 1.4) * 0.015 + (brewing ? Math.abs(Math.sin(t * 5)) * 0.02 : 0);
  });

  if (!cz) return null;
  return (
    <>
    <group position={[cz.x, 0, cz.z]}>
      {/* glass over the counter, between the customers and the barista */}
      <Glass at={[0, 1.0 + 0.7, -1.76]} w={7} h={1.4} tint="#ffe2b8" />
      {/* barista behind the counter; click to order a coffee */}
      <group ref={bar} position={[BAR.x, 0, BAR.z]} scale={1.3} onClick={(e) => { e.stopPropagation(); const p = phase.current; if (p.state === "idle") p.next = 0; }} {...pointer}>
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[1.0, 1.9, 0.9]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.7, 0.55, 0.45]} /><meshStandardMaterial color="#d6a77a" roughness={0.6} /></mesh>
        <mesh position={[0, 0.5, 0.23]}><boxGeometry args={[0.5, 0.4, 0.03]} /><meshStandardMaterial color="#3f2a1a" /></mesh>
        <mesh position={[0, 0.95, 0]}><boxGeometry args={[0.46, 0.28, 0.42]} /><meshStandardMaterial color="#9ca3af" roughness={0.6} /></mesh>
        <mesh position={[0, 1.18, 0]}><boxGeometry args={[0.5, 0.08, 0.5]} /><meshStandardMaterial color="#3f2a1a" /></mesh>
        {[-0.1, 0.1].map((x) => <mesh key={x} position={[x, 0.98, 0.22]}><boxGeometry args={[0.07, 0.1, 0.03]} /><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>)}
        {[-0.18, 0.18].map((x) => <mesh key={x} position={[x, 0.2, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#374151" /></mesh>)}
        {[-1, 1].map((side, i) => (
          <group key={side} ref={(g) => { arms.current[i] = g; }} position={[side * 0.42, 0.75, 0]}>
            <mesh position={[0, -0.18, 0]}><boxGeometry args={[0.11, 0.38, 0.11]} /><meshStandardMaterial color="#d6a77a" roughness={0.6} /></mesh>
          </group>
        ))}
      </group>
      {/* coffee: a stream from the machine into the cup, which fills up and then slides along the counter */}
      <mesh ref={stream} position={[MACHINE.x, 1.2, CUP_Z]} visible={false}><boxGeometry args={[0.03, 0.4, 0.03]} /><meshBasicMaterial color="#5b3a1e" /></mesh>
      <group ref={cup} position={[MACHINE.x, 1.0, CUP_Z]}>
        <mesh position={[0, 0.07, 0]}><boxGeometry args={[0.16, 0.14, 0.16]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        <mesh ref={fill} position={[0, 0.03, 0]} scale={[1, 0.01, 1]}><boxGeometry args={[0.13, 0.1, 0.13]} /><meshBasicMaterial color="#5b3a1e" /></mesh>
      </group>
      {[0, 1, 2, 3].map((i) => <mesh key={i} ref={(m) => { steam.current[i] = m; }} visible={false}><sphereGeometry args={[1, 6, 4]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} /></mesh>)}
      {msg && <Html position={[BAR.x, 2.9, BAR.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={bubble}>{msg}</div></Html>}
    </group>
    {/* coffee drones (world coordinates): body, spinning rotor, and the cup they carry */}
    {Array.from({ length: MAX_DRONES }, (_, i) => (
      <group key={i} ref={(g) => { dGroups.current[i] = g; }} visible={false}>
        <mesh><boxGeometry args={[0.5, 0.1, 0.5]} /><meshStandardMaterial color="#38bdf8" /></mesh>
        <mesh ref={(m) => { dRotor.current[i] = m; }} position={[0, 0.1, 0]}><boxGeometry args={[0.9, 0.02, 0.1]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
        <mesh ref={(m) => { dCup.current[i] = m; }} position={[0, -0.22, 0]}><boxGeometry args={[0.16, 0.18, 0.16]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      </group>
    ))}
    </>
  );
}
