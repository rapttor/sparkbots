import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { Layout } from "../layout";
import { newlyWorking } from "../servicebots";
import { player } from "../roam";
import { KITCHEN_SETS } from "./kitchenSets";
import { Glass } from "./Glass";
import { CHEF_LOOKS, MENU, chefLook, dishById, newOrder, place, tick, type ChefLookId, type Order } from "./menu";
import { FIRE_FLAG, initFire, loadFlag, tickFire, type FireState } from "./fire";
import { FOOD_CHANCE, MAX_FLIGHTS, FLIGHT_S, emitFoodDelivered, flight } from "./drones";
import { bubble, btn, panel, pointer, Stop } from "./ui";

/** Ingredient colours flying over the pan, per cuisine. */
const FOOD_COLORS: Record<ChefLookId, [string, string]> = { plain: ["#22c55e", "#ef4444"], italian: ["#ef4444", "#fde68a"], chinese: ["#fb7185", "#f8fafc"], american: ["#92400e", "#facc15"], mexican: ["#facc15", "#16a34a"] };

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
  const fEmoji = useRef<(HTMLSpanElement | null)[]>([]);
  const fireDrones = useRef<(Group | null)[]>([]);
  const flames = useRef<(Mesh | null)[]>([]);
  const chef = useRef<Group>(null);
  const arms = useRef<(Group | null)[]>([]);
  const food = useRef<(Mesh | null)[]>([]);
  const steam = useRef<(Mesh | null)[]>([]);
  const knife = useRef<Mesh>(null);
  const sets = useRef<Partial<Record<ChefLookId, Group | null>>>({});
  const kit = useRef<{ id: ChefLookId; from: ChefLookId | null; t0: number }>({ id: "plain", from: null, t0: -10 }); // the kitchen set on show and when it changed
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
    if (next !== orderRef.current) {
      if (next.state === "ready" && orderRef.current.state === "preparing" && rz && flights.current.length < MAX_FLIGHTS) { // your meal is done: a drone brings it to you, carrying the dish icon
        const from = { x: rz.x, z: rz.z - 2.6 };
        flights.current.push({ id: "manager", t: 0, from, to: { x: from.x, z: from.z + 3 }, carry: true, emoji: dishById(next.dish ?? "")?.icon ?? "🍽" });
      }
      orderRef.current = next; setOrder(next);
    }
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
      if (!fl) { g.visible = false; const em0 = fEmoji.current[i]; if (em0) em0.textContent = ""; continue; }
      const to = fl.id === "manager" && player.on ? { x: player.x, z: player.z } : fl.to; // your meal flies to wherever you are now
      const p = flight(fl.from, to, fl.t);
      const em = fEmoji.current[i]; if (em) em.textContent = fl.carry && p.carrying ? fl.emoji : "";
      g.visible = true; g.position.set(p.x, p.y, p.z); g.rotation.y = Math.atan2(to.x - fl.from.x, to.z - fl.from.z);
      const b = fBox.current[i]; if (b) b.visible = fl.carry && p.carrying;
    }
    // fire: flames flicker over the stove; two firefighter drones arrive once `responders` is set
    flames.current.forEach((m, i) => { if (m) { m.visible = fire.current.burning; m.scale.set(0.3 + Math.sin(t * 9 + i) * 0.08, 0.5 + Math.abs(Math.sin(t * 7 + i * 2)) * 0.4, 0.3); } });
    fireDrones.current.forEach((g, i) => {
      if (!g) return;
      g.visible = fire.current.responders;
      if (g.visible) g.position.set(-2.6 + (i ? 1.0 : -0.8), 2.3 + Math.sin(t * 5 + i) * 0.05, -3.2);
    });
    // the kitchen transforms with the cuisine: the old set collapses, the new one pops up with a little overshoot
    const want = chefLook(orderRef.current).id;
    if (want !== kit.current.id) kit.current = { id: want, from: kit.current.id, t0: t };
    const since = t - kit.current.t0;
    for (const id of Object.keys(KITCHEN_SETS) as ChefLookId[]) {
      const g = sets.current[id]; if (!g) continue;
      let k = 0;
      if (id === kit.current.id) { const u = Math.min(1, Math.max(0, (since - 0.2) / 0.5)); k = u <= 0 ? 0 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); }
      else if (id === kit.current.from) k = Math.max(0, 1 - since / 0.2);
      g.visible = k > 0.01; g.scale.set(1, Math.max(0.01, k), 1);
    }
    { // cooking: arms chop and stir, food flips over the pan, steam rises, the knife taps the board; all stops when nothing is cooking
      const cooking = orderRef.current.state === "preparing", col = chefLook(orderRef.current).hat;
      arms.current.forEach((g, i) => { if (g) g.rotation.x = cooking ? -1.1 + Math.sin(t * 9 + i * Math.PI) * 0.45 : -0.15 + Math.sin(t * 1.3 + i) * 0.04; });
      food.current.forEach((m, i) => {
        if (!m) return; m.visible = cooking;
        if (!cooking) return;
        const k = (t * 1.6 + i / 3) % 1; // flip: up and down, spinning
        m.position.set(0.35 + (i - 1) * 0.07, 0.62 + Math.sin(k * Math.PI) * 0.35, 0.28); m.rotation.set(k * 6, k * 4, 0);
        (m.material as unknown as { color: { set: (c: string) => void } }).color.set(i === 1 ? col : FOOD_COLORS[chefLook(orderRef.current).id][i % 2]!);
      });
      steam.current.forEach((m, i) => {
        if (!m) return;
        const k = (t * 0.7 + i / 4) % 1; m.visible = cooking;
        m.position.set(0.35 + Math.sin(t * 2 + i) * 0.05, 0.7 + k * 0.7, 0.28); m.scale.setScalar(0.07 + k * 0.12);
        (m.material as MeshBasicMaterial).opacity = 0.5 * (1 - k);
      });
      if (knife.current) knife.current.position.y = cooking ? 0.58 + Math.abs(Math.sin(t * 9)) * 0.1 : 0.55;
    }
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
      {/* the kitchen behind the chef: one set per cuisine, only the active one is visible (see kitchenSets.ts) */}
      <group position={[rz.x, 0.3, rz.z]}> {/* 0.3 = raised kitchen floor in zones/restaurant.ts */}
        {(Object.keys(KITCHEN_SETS) as ChefLookId[]).map((id) => (
          <group key={id} ref={(g) => { sets.current[id] = g; }} visible={id === "plain"}>
            {KITCHEN_SETS[id].map((b, i) => (
              <mesh key={i} position={[b.at[0], (b.y ?? 0) + b.size[1] / 2, b.at[1]]}>
                <boxGeometry args={b.size} />
                {b.glow ? <meshBasicMaterial color={b.color} toneMapped={false} />
                  : b.glass ? <meshStandardMaterial color={b.color} transparent opacity={0.55} roughness={0.2} />
                  : <meshStandardMaterial color={b.color} roughness={0.7} />}
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* glass in front of the chef: you watch the cook through it, over the counter */}
      <Glass at={[rz.x, 0.3 + 1.55, rz.z - 3.42]} w={6.0} h={1.3} />
      {/* chef behind the counter and the glass */}
      <group position={[rz.x, 0.35, rz.z - 4.0]} scale={1.3}>
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
          {[-1, 1].map((side, i) => ( // arms hang from the shoulders and swing forward when cooking
            <group key={side} ref={(g) => { arms.current[i] = g; }} position={[side * 0.42, 0.75, 0]}>
              <mesh position={[0, -0.18, 0]}><boxGeometry args={[0.11, 0.38, 0.11]} /><meshStandardMaterial color={look.body} roughness={0.6} /></mesh>
            </group>
          ))}
        </group>
        {/* prep table in front of the chef: cutting board + knife on the left, pan with flipping food and steam on the right */}
        <mesh position={[0, 0.25, 0.3]}><boxGeometry args={[1.3, 0.5, 0.3]} /><meshStandardMaterial color="#8b5e3c" /></mesh>
        <mesh position={[-0.35, 0.52, 0.3]}><boxGeometry args={[0.5, 0.04, 0.26]} /><meshStandardMaterial color="#e6c999" /></mesh>
        <mesh ref={knife} position={[-0.3, 0.55, 0.3]}><boxGeometry args={[0.05, 0.03, 0.24]} /><meshStandardMaterial color="#cbd5e1" metalness={0.6} /></mesh>
        <mesh position={[0.35, 0.53, 0.3]}><boxGeometry args={[0.36, 0.06, 0.28]} /><meshStandardMaterial color="#1f2937" /></mesh>
        {[0, 1, 2].map((i) => <mesh key={`f${i}`} ref={(m) => { food.current[i] = m; }} visible={false}><boxGeometry args={[0.07, 0.07, 0.07]} /><meshStandardMaterial color="#ef4444" /></mesh>)}
        {[0, 1, 2, 3].map((i) => <mesh key={`s${i}`} ref={(m) => { steam.current[i] = m; }} visible={false}><sphereGeometry args={[1, 6, 4]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} /></mesh>)}
        {menu && order.state === "idle" && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[30, 0]}>
            <Stop><div style={panel}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🍽 Menu</div>
              {MENU.map((d) => (
                <button key={d.id} style={btn} title={d.blurb} onClick={() => { const n = place(orderRef.current, d.id, Date.now()); orderRef.current = n; setOrder(n); setMenu(false); setToast(CHEF_LOOKS[d.cuisine].quip); }}>{d.icon} {d.name}</button>
              ))}
            </div></Stop>
          </Html>
        )}
        {(order.state !== "idle" || toast) && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div style={bubble}>
              {order.state === "preparing" ? `${dish?.icon} Cooking… ${look.quip}` : order.state === "ready" ? `${dish?.icon} Order up! Enjoy` : toast}
            </div>
          </Html>
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
          <Html position={[0, -0.55, 0]} center style={{ pointerEvents: "none" }}><span ref={(el) => { fEmoji.current[i] = el; }} style={{ fontSize: 26, textShadow: "0 1px 4px #000" }} /></Html>
        </group>
      ))}
    </>
  );
}
