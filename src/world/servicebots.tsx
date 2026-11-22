import { bumpCaffeine } from "./caffeine";
import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, InstancedMesh, Object3D, type Group, type Mesh } from "three";
import type { Layout } from "./layout";
import { nav } from "./nav";
import { player, roams } from "./roam";

const POOL = 3;          // service robots out at once
const MAX_QUEUE = 4;     // deliveries waiting for a free robot
const SPEED = 3.2;       // units / s
const FLOW_RANGE = 1.5;  // closer than this to the target: walk straight
const PREP_S = 1.4;      // the barista needs this long per cup
const WAIT_S = 1.5;      // time spent at the desk
const SCALE = 0.7;
const o = new Object3D();

type Pt = { x: number; z: number };

/** Ids whose state just changed to "working". `prev` is updated; ids never seen before are only recorded (no spawn at load). */
export function newlyWorking(prev: Map<string, string>, desks: { worker: { id: string; state: string } }[]): string[] {
  const out: string[] = [];
  for (const { worker } of desks) {
    const before = prev.get(worker.id);
    if (before !== undefined && before !== "working" && worker.state === "working") out.push(worker.id);
    prev.set(worker.id, worker.state);
  }
  return out;
}

/** One walking step towards `target`. Uses `flowDir` (unit vector) when given, otherwise walks straight; never overshoots. */
export function stepToward(pos: Pt, target: Pt, speed: number, dt: number, flowDir?: { dx: number; dz: number } | null): { x: number; z: number; arrived: boolean } {
  const dx = target.x - pos.x, dz = target.z - pos.z, dist = Math.hypot(dx, dz), step = speed * dt;
  if (dist <= step || dist < 1e-6) return { x: target.x, z: target.z, arrived: true };
  const d = flowDir && dist > FLOW_RANGE ? flowDir : { dx: dx / dist, dz: dz / dist };
  return { x: pos.x + d.dx * step, z: pos.z + d.dz * step, arrived: false };
}

interface Bot { x: number; z: number; id: string; stage: "out" | "wait" | "back"; wait: number; ry: number; phase: number }

/** Anyone (or the manager) can order a coffee: the request waits here until the component hands it to a free service robot. */
export const MANAGER_ID = "manager";
const pending: string[] = [];
export function requestCoffee(id: string): boolean {
  if (pending.length >= 8 || pending.includes(id)) return false;
  pending.push(id);
  if (id !== MANAGER_ID) bumpCaffeine(id, "coffee"); // cosmetic caffeine level (13.4.5)
  return true;
}

/** Cosmetic NPC robots that carry a coffee to an agent's desk when it starts working. Not sessions. */
export function ServiceBots({ layout }: { layout: Layout }) {
  const body = useRef<InstancedMesh>(null);
  const visor = useRef<InstancedMesh>(null);
  const cup = useRef<InstancedMesh>(null);
  const geoBody = useMemo(() => new BoxGeometry(0.5, 0.5, 0.4), []);
  const geoVisor = useMemo(() => new BoxGeometry(0.36, 0.07, 0.04), []);
  const geoCup = useMemo(() => new BoxGeometry(0.18, 0.18, 0.18), []);
  const prev = useRef(new Map<string, string>());
  const queue = useRef<string[]>([]);
  const bots = useRef<Bot[]>([]);
  const baristaRef = useRef<Group>(null), baristaArm = useRef<Mesh>(null), baristaSteam = useRef<Mesh>(null);
  const nextReady = useRef(0);
  const [toast, setToast] = useState(0); // > 0: order taken (time), < 0: queue full
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(0), 2600); return () => clearTimeout(t); }, [toast]);
  const lay = useRef(layout);
  lay.current = layout;

  useEffect(() => {
    for (const id of newlyWorking(prev.current, layout.desks)) {
      if (queue.current.length < MAX_QUEUE && !queue.current.includes(id)) queue.current.push(id);
    }
  }, [layout]);

  useFrame((_, delta) => {
    const b = body.current, v = visor.current, c = cup.current;
    if (!b || !v || !c) return;
    const dt = Math.min(delta, 0.1), L = lay.current;
    const poi = L.zones.find((z) => z.zone.id === "coffee-station")?.pois.find((p) => p.id === "coffee-station:order");
    if (!poi) { queue.current.length = 0; bots.current.length = 0; b.count = v.count = c.count = 0; return; }
    const home = { x: poi.x, z: poi.z };
    while (pending.length) { const id = pending.shift()!; if (queue.current.length < MAX_QUEUE + 4 && !queue.current.includes(id)) queue.current.push(id); }

    const nowS = performance.now() / 1000;
    while (queue.current.length && bots.current.length < POOL && nowS >= nextReady.current) {
      nextReady.current = nowS + PREP_S; // the barista makes one cup at a time
      bots.current.push({ x: home.x, z: home.z, id: queue.current.shift()!, stage: "out", wait: 0, ry: 0, phase: Math.random() * 6 });
    }

    const t = performance.now() / 1000;
    let nb = 0, nc = 0;
    for (let i = bots.current.length - 1; i >= 0; i--) {
      const bot = bots.current[i]!;
      const isMgr = bot.id === MANAGER_ID;
      const desk = isMgr ? undefined : L.desks.find((d) => d.worker.id === bot.id);
      if (!isMgr && !desk) { bots.current.splice(i, 1); continue; }
      let moving = false;
      if (bot.stage === "wait") {
        bot.wait += dt;
        if (bot.wait >= WAIT_S) bot.stage = "back";
      } else {
        const r = roams.get(bot.id);
        const target = bot.stage === "out" ? (isMgr ? { x: player.x, z: player.z } : r ? { x: r.x, z: r.z } : { x: desk!.x, z: desk!.z + 0.95 }) : home;
        const f = nav.flow;
        const dir = f ? f.dir(bot.x, bot.z, f.field(target.x, target.z)) : null;
        const s = stepToward(bot, target, SPEED, dt, dir);
        if (!s.arrived) { bot.ry = Math.atan2(s.x - bot.x, s.z - bot.z); moving = true; }
        bot.x = s.x; bot.z = s.z;
        if (s.arrived) {
          if (bot.stage === "out") { bot.stage = "wait"; bot.wait = 0; }
          else { bots.current.splice(i, 1); continue; }
        }
      }
      const bob = moving ? Math.abs(Math.sin(t * 9 + bot.phase)) * 0.06 : 0;
      o.position.set(bot.x, 0.25 * SCALE + 0.05 + bob, bot.z); o.rotation.set(0, bot.ry, 0); o.scale.setScalar(SCALE); o.updateMatrix();
      b.setMatrixAt(nb, o.matrix);
      o.position.set(bot.x + Math.sin(bot.ry) * 0.2 * SCALE, 0.33 * SCALE + 0.05 + bob, bot.z + Math.cos(bot.ry) * 0.2 * SCALE); o.updateMatrix();
      v.setMatrixAt(nb, o.matrix);
      nb++;
      if (bot.stage === "out") {
        o.position.set(bot.x + Math.sin(bot.ry) * 0.3, 0.9, bot.z + Math.cos(bot.ry) * 0.3); o.rotation.set(0, bot.ry, 0); o.scale.setScalar(1); o.updateMatrix();
        c.setMatrixAt(nc++, o.matrix);
      }
    }
    // the barista behind the counter: works the machine while orders are queued or on their way, otherwise idles
    const busy = queue.current.length > 0 || bots.current.length > 0 || nowS < nextReady.current;
    if (baristaRef.current) baristaRef.current.position.y = busy ? Math.abs(Math.sin(t * 6)) * 0.04 : Math.sin(t * 1.3) * 0.015;
    if (baristaArm.current) baristaArm.current.rotation.z = busy ? Math.sin(t * 9) * 0.7 : Math.sin(t * 1.3) * 0.08;
    if (baristaSteam.current) { baristaSteam.current.visible = busy; baristaSteam.current.position.y = 1.35 + ((t * 0.8) % 1) * 0.4; baristaSteam.current.scale.setScalar(0.06 + ((t * 0.8) % 1) * 0.06); }
    b.count = v.count = nb; c.count = nc;
    b.instanceMatrix.needsUpdate = v.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
  });

  const st = lay.current.zones.find((z) => z.zone.id === "coffee-station");
  return (
    <>
      {st && (
        <group position={[st.x + 0.1, 0.05, st.z - 2.95]} rotation={[0, Math.PI, 0]} scale={1.35}
          onClick={(e) => { e.stopPropagation(); if (requestCoffee(MANAGER_ID)) setToast(Date.now()); else setToast(-Date.now()); }}
          onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
          <mesh position={[0, 0.9, 0]}><boxGeometry args={[1.4, 1.9, 1.2]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>{/* generous click target */}
          <group ref={baristaRef}>
            <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.7, 0.5, 0.45]} /><meshStandardMaterial color="#b45309" roughness={0.6} /></mesh>
            <mesh position={[0, 0.6, -0.23]}><boxGeometry args={[0.52, 0.34, 0.05]} /><meshStandardMaterial color="#f5f5f4" roughness={0.7} /></mesh>
            <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.46, 0.28, 0.42]} /><meshStandardMaterial color="#b45309" roughness={0.6} /></mesh>
            <mesh position={[0, 1.13, 0]}><boxGeometry args={[0.4, 0.22, 0.4]} /><meshStandardMaterial color="#ffffff" roughness={0.6} /></mesh>
            <mesh position={[-0.1, 0.93, -0.22]}><boxGeometry args={[0.07, 0.12, 0.03]} /><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>
            <mesh position={[0.1, 0.93, -0.22]}><boxGeometry args={[0.07, 0.12, 0.03]} /><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>
            <mesh ref={baristaArm} position={[0, 0.62, 0]}><boxGeometry args={[1.0, 0.13, 0.16]} /><meshStandardMaterial color="#b45309" roughness={0.6} /></mesh>
            <mesh position={[-0.18, 0.2, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#7c2d12" /></mesh>
            <mesh position={[0.18, 0.2, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#7c2d12" /></mesh>
          </group>
          {toast !== 0 && (
            <Html position={[0, 1.9, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className="barista-toast">{toast > 0 ? "☕ Coming right up!" : "☕ One moment, I'm busy…"}</div>
            </Html>
          )}
          <mesh ref={baristaSteam} position={[1.6, 1.4, -0.65]} visible={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.55} toneMapped={false} /></mesh>
        </group>
      )}
      <instancedMesh ref={body} args={[geoBody, undefined, POOL]} frustumCulled={false}><meshStandardMaterial color="#2dd4bf" roughness={0.6} /></instancedMesh>
      <instancedMesh ref={visor} args={[geoVisor, undefined, POOL]} frustumCulled={false}><meshBasicMaterial color="#ffffff" toneMapped={false} /></instancedMesh>
      <instancedMesh ref={cup} args={[geoCup, undefined, POOL]} frustumCulled={false}><meshStandardMaterial color="#ffffff" roughness={0.5} /></instancedMesh>
    </>
  );
}
