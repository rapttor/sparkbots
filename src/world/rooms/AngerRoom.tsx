import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, InstancedMesh, Object3D, type Group } from "three";
import type { Layout } from "../layout";
import { insideRoom, player } from "../roam";
import { DEBRIS_CAP, DebrisPool, HIT_AT, WEAPONS, flatten, hitShake, isOver, itemDef, slotPos, smash, startRun, startSession, stopRun, swingPose, tickWaves, timeLeft, weaponById, type Session, type Target } from "./anger";
import { ItemModel } from "./AngerItems";
import { bubble, btn, panel, pointer } from "./ui";

const o = new Object3D(), col = new Color();
interface Pending { id: number; at: number }

/**
 * Anger room. Pick a weapon (walk in, or click the rack), then click RECEPTION to start a wrecking run: office junk keeps
 * reappearing in small waves until you click reception again. A little smasher bot walks up to what you click, swings its
 * weapon (wind-up, hit, recover); the item wobbles, flattens and finally bursts into debris. Cosmetic only.
 */
export function AngerRoom({ layout }: { layout: Layout }) {
  const az = layout.zones.find((z) => z.zone.id === "anger-room");
  const [pick, setPick] = useState(false);
  const [sess, setSess] = useState<Session | null>(null);
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(0);
  const [weapon, setWeapon] = useState<string | null>(null);
  const sessRef = useRef<Session | null>(null); sessRef.current = sess;
  const inside = useRef(false);
  const pool = useMemo(() => new DebrisPool(), []);
  const mesh = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const itemRefs = useRef(new Map<number, Group>());
  const smasher = useRef<Group>(null), arm = useRef<Group>(null);
  const bot = useRef({ x: 0, z: 0, ry: 0, swingT: -1, swingS: 0.7, pending: null as Pending | null, target: null as Target | null });
  const queue = useRef<number[]>([]);

  useFrame((_, delta) => {
    if (!az) return;
    const dt = Math.min(delta, 0.1), now = Date.now();
    // entering the room opens the weapon pick (once per visit, only if no session is running)
    const was = inside.current;
    inside.current = player.on && insideRoom({ x: az.x, z: az.z, w: az.w, d: az.d }, player.x, player.z);
    if (inside.current && !was && !sessRef.current) setPick(true);

    let s = sessRef.current;
    if (s) {
      const n = tickWaves(s, now);
      if (n !== s) { s = n; sessRef.current = n; setSess(n); }
      if (isOver(s, now)) { setTotal((t) => t + s!.points); setSess(null); sessRef.current = null; queue.current.length = 0; s = null; }
      else { const l = s.running ? -1 : Math.ceil(timeLeft(s, now)); setLeft((p) => (p === l ? p : l)); }
    }

    // smasher bot: walk to the next queued item, swing, land the hit at the impact moment
    const b = bot.current;
    const w = s ? weaponById(s.weapon) : undefined;
    if (b.swingT < 0 && queue.current.length && s && w) {
      const t = s.targets.find((x) => x.id === queue.current[0]);
      queue.current.shift();
      if (t) { b.target = t; b.swingT = 0; b.swingS = w.swingS; b.pending = { id: t.id, at: HIT_AT * w.swingS }; }
    }
    if (b.target) {
      const p = slotPos(b.target.slot, az.w, az.d);
      const gx = p.x, gz = p.z + 0.85; // stand in front of the item
      const dx = gx - b.x, dz = gz - b.z, dist = Math.hypot(dx, dz);
      if (dist > 0.05) { const st = Math.min(dist, 4.5 * dt); b.x += (dx / dist) * st; b.z += (dz / dist) * st; }
      b.ry = Math.atan2(p.x - b.x, p.z - b.z);
      if (b.swingT >= 0 && dist < 0.4) {
        b.swingT += dt;
        if (b.pending && b.swingT >= b.pending.at && s) {
          const r = smash(s, b.pending.id, now);
          if (r.s !== s) { sessRef.current = r.s; setSess(r.s); }
          if (r.broke) { const q = slotPos(r.broke.slot, az.w, az.d); pool.spawnBurst(az.x + q.x, 0.4, az.z + q.z, itemDef(r.broke.kind).palette); }
          b.pending = null;
        }
        if (swingPose(b.swingT, b.swingS).done) { b.swingT = -1; b.target = null; }
      }
    }
    if (smasher.current) {
      smasher.current.visible = !!s;
      smasher.current.position.set(b.x, 0, b.z); smasher.current.rotation.y = b.ry;
    }
    if (arm.current) arm.current.rotation.x = b.swingT >= 0 ? swingPose(b.swingT, b.swingS).pitch - 0.4 : -0.4;

    // item reactions (wobble + flatten): written straight onto the meshes, no React
    if (s) for (const t of s.targets) {
      const g = itemRefs.current.get(t.id);
      if (g) { g.rotation.z = hitShake(now, t.hitAt); g.scale.set(1, flatten(t), 1); }
    }

    // debris: one instanced mesh, touched only while something is alive
    const m = mesh.current;
    if (m) {
      const alive = pool.step(dt);
      if (alive > 0 || m.count > 0) {
        let n = 0;
        for (let i = 0; i < DEBRIS_CAP; i++) {
          if (pool.life[i]! <= 0) continue;
          const f = pool.life[i]! / pool.maxLife[i]!, k = pool.kind[i]!;
          const sz = pool.size[i]! * (k === 2 ? 1 + (1 - f) * 2 : k === 1 ? f : 1);
          o.position.set(pool.px[i]!, pool.py[i]!, pool.pz[i]!); o.rotation.set(i, i * 2, 0); o.scale.setScalar(sz); o.updateMatrix();
          m.setMatrixAt(n, o.matrix); m.setColorAt(n, col.set(pool.color[i]!)); n++;
        }
        m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  });
  useLayoutEffect(() => { if (mesh.current) mesh.current.count = 0; }, []);
  useEffect(() => { if (!az) { setSess(null); sessRef.current = null; } }, [az]);
  if (!az) return null;

  const choose = (id: string) => { setWeapon(id); setPick(false); const n = startRun(startSession(id, Date.now()), Date.now()); setSess(n); sessRef.current = n; };
  const reception = () => {
    const s = sessRef.current, now = Date.now();
    if (!weapon && !s) { setPick(true); return; }
    if (!s) { const n = startRun(startSession(weapon, now), now); setSess(n); sessRef.current = n; return; }
    const n = s.running ? stopRun(s, now) : startRun(s, now);
    setSess(n); sessRef.current = n;
  };
  const w = weaponById(sess?.weapon ?? weapon);
  const running = !!sess?.running;
  return (
    <group position={[az.x, 0, az.z]}>
      {/* reception desk (the zone has the furniture; this is the click target and state sign) */}
      <mesh position={[3.0, 0.5, 2.3]} onClick={(e) => { e.stopPropagation(); reception(); }} {...pointer}>
        <boxGeometry args={[2.2, 1.2, 1.0]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[3.0, 1.9, 2.3]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div style={bubble}>🛎 Reception · {running ? "Smashing… click to stop" : "Click to start smashing"}</div>
      </Html>
      <mesh position={[-3.7, 0.9, 2.3]} onClick={(e) => { e.stopPropagation(); if (!sess) setPick(true); }} {...pointer}>
        <boxGeometry args={[1.5, 1.8, 0.8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {sess?.targets.map((t) => {
        const p = slotPos(t.slot, az.w, az.d);
        return (
          <group key={t.id} position={[p.x, 0, p.z]}
            onClick={(e) => { e.stopPropagation(); if (queue.current.length < 6) queue.current.push(t.id); }} {...pointer}>
            <group ref={(g) => { if (g) itemRefs.current.set(t.id, g); else itemRefs.current.delete(t.id); }}><ItemModel kind={t.kind} /></group>
          </group>
        );
      })}
      {/* the smasher bot with its weapon in hand */}
      <group ref={smasher} visible={false}>
        <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.4, 0.5, 0.3]} /><meshStandardMaterial color="#ef4444" /></mesh>
        <mesh position={[0, 0.72, 0]}><boxGeometry args={[0.34, 0.24, 0.3]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
        <mesh position={[0, 0.74, 0.16]}><boxGeometry args={[0.26, 0.06, 0.02]} /><meshBasicMaterial color="#fca5a5" toneMapped={false} /></mesh>
        <group ref={arm} position={[0.26, 0.55, 0.05]}>
          <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.09, 0.09, 0.26]} /><meshStandardMaterial color="#ef4444" /></mesh>
          {w && (
            <group position={[0, 0, 0.26]}>
              <mesh position={[0, 0, w.length / 2]}><boxGeometry args={[0.06, 0.06, w.length]} /><meshStandardMaterial color={w.shaft} /></mesh>
              <mesh position={[0, 0, w.length]}><boxGeometry args={[w.id === "bat" ? 0.1 : 0.16, 0.16, w.id === "wrench" ? 0.16 : 0.2]} /><meshStandardMaterial color={w.head} /></mesh>
            </group>
          )}
        </group>
      </group>
      <instancedMesh ref={mesh} args={[geo, undefined, DEBRIS_CAP]} frustumCulled={false} position={[-az.x, 0, -az.z]}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {pick && (
        <Html position={[-3.7, 2.4, 2.3]} center zIndexRange={[30, 0]}>
          <div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💢 Pick a weapon</div>
            {WEAPONS.map((x) => <button key={x.id} style={btn} onClick={() => choose(x.id)}>{x.icon} {x.name} · {x.power} dmg</button>)}
            <button style={btn} onClick={() => setPick(false)}>Not today</button>
          </div>
        </Html>
      )}
      {sess && <Html position={[0, 2.6, -2.5]} center style={{ pointerEvents: "none" }}><div style={bubble}>{w?.icon} {left >= 0 ? `${left}s` : "wrecking"} · {sess.points} pts</div></Html>}
      {!sess && total > 0 && <Html position={[0, 2.6, -2.5]} center style={{ pointerEvents: "none" }}><div style={bubble}>Feeling better? {total} pts of frustration released</div></Html>}
    </group>
  );
}
