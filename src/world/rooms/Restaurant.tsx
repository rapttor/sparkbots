import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import type { Layout } from "../layout";
import { newlyWorking } from "../servicebots";
import { CHEF_LOOKS, MENU, chefLook, dishById, newOrder, place, tick, type Order } from "./menu";
import { FIRE_FLAG, initFire, loadFlag, tickFire, type FireState } from "./fire";
import { FOOD_CHANCE, MAX_FLIGHTS, FLIGHT_S, emitFoodDelivered, flight } from "./drones";
import { bubble, btn, panel, pointer } from "./ui";

interface Flight { id: string; t: number; from: { x: number; z: number }; to: { x: number; z: number }; carry: boolean; emoji: string }

/** The restaurant: chef + ordering menu, an occasional (opt-in) kitchen fire with firefighter drones, and meal drones that fly to an agent that just started work. All cosmetic. */
export function Restaurant({ layout }: { layout: Layout }) {
  const rz = layout.zones.find((z) => z.zone.id === "restaurant");
  const [order, setOrder] = useState<Order>(newOrder);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const orderRef = useRef(order); orderRef.current = order;
  const fire = useRef<FireState>(initFire(Date.now()));
  const [burning, setBurning] = useState(false);
  const flagAt = useRef(0), flagOn = useRef(false);
  const prev = useRef(new Map<string, string>());
  const flights = useRef<Flight[]>([]);
  const fGroups = useRef<(Group | null)[]>([]);
  const fBox = useRef<(Mesh | null)[]>([]);
  const fireDrones = useRef<(Group | null)[]>([]);
  const flames = useRef<(Mesh | null)[]>([]);
  const chef = useRef<Group>(null);
  const lay = useRef(layout); lay.current = layout;

  // an agent just started work: sometimes a meal drone flies out to its desk (straight line, no pathfinding)
  useEffect(() => {
    const home = rz ? { x: rz.x, z: rz.z - 3.2 } : null;
    for (const id of newlyWorking(prev.current, layout.desks)) {
      if (!home || flights.current.length >= MAX_FLIGHTS || Math.random() > FOOD_CHANCE) continue;
      const d = layout.desks.find((x) => x.worker.id === id);
      if (d) flights.current.push({ id, t: 0, from: home, to: { x: d.x, z: d.z + 0.8 }, carry: true, emoji: MENU[Math.floor(Math.random() * MENU.length)]!.icon });
    }
  }, [layout, rz]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2800); return () => clearTimeout(t); }, [toast]);

  useFrame((_, delta) => {
    const now = Date.now(), dt = Math.min(delta, 0.1);
    const next = tick(orderRef.current, now);
    if (next !== orderRef.current) { orderRef.current = next; setOrder(next); }
    if (now - flagAt.current > 4000) { flagAt.current = now; flagOn.current = loadFlag(FIRE_FLAG); }
    const f = tickFire(fire.current, now, flagOn.current);
    if (f !== fire.current) { const was = fire.current.burning; fire.current = f; if (was !== f.burning) setBurning(f.burning); }

    const t = performance.now() / 1000;
    flights.current = flights.current.filter((fl) => fl.t < FLIGHT_S);
    for (const fl of flights.current) {
      fl.t += dt;
      if (fl.carry && fl.t > 2.2 + 0.7) { fl.carry = false; emitFoodDelivered(fl.id); } // the meal lands: tell anyone who cares
    }
    for (let i = 0; i < MAX_FLIGHTS; i++) {
      const g = fGroups.current[i], fl = flights.current[i];
      if (!g) continue;
      if (!fl) { g.visible = false; continue; }
      const p = flight(fl.from, fl.to, fl.t);
      g.visible = true; g.position.set(p.x, p.y, p.z); g.rotation.y = Math.atan2(fl.to.x - fl.from.x, fl.to.z - fl.from.z);
      const b = fBox.current[i]; if (b) b.visible = fl.carry && p.carrying;
    }
    // fire: flames flicker over the stove; two firefighter drones arrive once `responders` is set
    flames.current.forEach((m, i) => { if (m) { m.visible = fire.current.burning; m.scale.set(0.3 + Math.sin(t * 9 + i) * 0.08, 0.5 + Math.abs(Math.sin(t * 7 + i * 2)) * 0.4, 0.3); } });
    fireDrones.current.forEach((g, i) => {
      if (!g) return;
      g.visible = fire.current.responders;
      if (g.visible) g.position.set(-2.6 + (i ? 1.0 : -0.8), 2.3 + Math.sin(t * 5 + i) * 0.05, -3.2);
    });
    if (chef.current) {
      const busy = orderRef.current.state === "preparing";
      chef.current.position.y = busy ? Math.abs(Math.sin(t * 6)) * 0.04 : Math.sin(t * 1.3) * 0.015;
      const look = chefLook(orderRef.current);
      chef.current.scale.set(look.belly, 1, look.belly);
    }
  });

  if (!rz) return null;
  const look = chefLook(order);
  const dish = dishById(order.dish ?? "");
  return (
    <>
      {/* chef behind the counter */}
      <group position={[rz.x, 0.05, rz.z - 4.0]}>
        <group ref={chef}
          onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} {...pointer}>
          <mesh position={[0, 0.9, 0]}><boxGeometry args={[1.2, 1.9, 1.0]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
          <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.7, 0.5, 0.45]} /><meshStandardMaterial color={look.body} roughness={0.6} /></mesh>
          <mesh position={[0, 0.95, 0]}><boxGeometry args={[0.46, 0.28, 0.42]} /><meshStandardMaterial color="#9ca3af" roughness={0.6} /></mesh>
          <mesh position={[0, 1.1 + look.hatH / 2, 0]}><boxGeometry args={[0.4, look.hatH + 0.1, 0.4]} /><meshStandardMaterial color={look.hat} roughness={0.6} /></mesh>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.98, 0.22]} rotation={[0, 0, x > 0 ? -look.slant : look.slant]}><boxGeometry args={[0.07, 0.07 + (look.slant ? -0.04 : 0.05), 0.03]} /><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>
          ))}
          {look.mustache && <mesh position={[0, 0.9, 0.23]}><boxGeometry args={[0.3, 0.05, 0.04]} /><meshStandardMaterial color="#1f1f1f" /></mesh>}
          <mesh position={[-0.18, 0.2, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#374151" /></mesh>
          <mesh position={[0.18, 0.2, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#374151" /></mesh>
        </group>
        {menu && order.state === "idle" && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[30, 0]}>
            <div style={panel}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🍽 Menu</div>
              {MENU.map((d) => (
                <button key={d.id} style={btn} title={d.blurb} onClick={() => { const n = place(orderRef.current, d.id, Date.now()); orderRef.current = n; setOrder(n); setMenu(false); setToast(CHEF_LOOKS[d.cuisine].quip); }}>{d.icon} {d.name}</button>
              ))}
            </div>
          </Html>
        )}
        {(order.state !== "idle" || toast) && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div style={bubble}>
              {order.state === "preparing" ? `${dish?.icon} Cooking… ${look.quip}` : order.state === "ready" ? `${dish?.icon} Order up! Enjoy` : toast}
            </div>
          </Html>
        )}
        {order.state === "ready" && dish && (
          <Html position={[1.2, 1.2, 1.0]} center style={{ pointerEvents: "none" }}><span style={{ fontSize: 22 }}>{dish.icon}</span></Html>
        )}
        {burning && <Html position={[-2.6, 2.6, 0]} center style={{ pointerEvents: "none" }}><div style={bubble}>🔥 Fire in the kitchen!</div></Html>}
      </group>
      {/* fire on the stove + firefighter drones */}
      <group position={[rz.x, 0, rz.z]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(m) => { flames.current[i] = m; }} position={[-2.6 + (i - 1) * 0.35, 1.25, -4.35]} visible={false}>
            <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={i === 1 ? "#fbbf24" : "#f97316"} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        ))}
        {[0, 1].map((i) => (
          <group key={i} ref={(g) => { fireDrones.current[i] = g; }} visible={false}>
            <mesh><boxGeometry args={[0.5, 0.12, 0.5]} /><meshStandardMaterial color="#dc2626" /></mesh>
            <mesh position={[0, -0.25, 0.1]}><boxGeometry args={[0.08, 0.4, 0.08]} /><meshBasicMaterial color="#60a5fa" transparent opacity={0.6} toneMapped={false} /></mesh>
          </group>
        ))}
      </group>
      {/* meal drones (world coordinates) */}
      {Array.from({ length: MAX_FLIGHTS }, (_, i) => (
        <group key={i} ref={(g) => { fGroups.current[i] = g; }} visible={false}>
          <mesh><boxGeometry args={[0.5, 0.1, 0.5]} /><meshStandardMaterial color="#f59e0b" /></mesh>
          <mesh ref={(m) => { fBox.current[i] = m; }} position={[0, -0.25, 0]}><boxGeometry args={[0.25, 0.2, 0.25]} /><meshStandardMaterial color="#fde68a" /></mesh>
        </group>
      ))}
    </>
  );
}
