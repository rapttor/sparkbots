import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, Color, InstancedMesh, Object3D, Plane, Raycaster, Vector2, Vector3, type Group } from "three";
import type { Layout } from "../layout";
import { insideRoom, player } from "../roam";
import { useStore } from "../../state/store";
import { DEBRIS_CAP, DebrisPool, HIT_AT, KIND_SHAPE, PLAYER_SWING_K, WEAPONS, WEAPON_SCALE, clampToRoom, comboMult, comboOf, flatten, fxScale, hitShake, isOver, itemDef, overReception, pivotFor, playerPitch, slotPos, smash, smashMany, startRun, startSession, swingPose, swingTargets, tickWaves, timeLeft, weaponById, type Session, type Target } from "./anger";
import { ItemModel } from "./AngerItems";
import { WeaponModel } from "./AngerWeapon";
import { smashCtl } from "./smashControl";
import { bubble, btn, panel, pointer, Stop } from "./ui";

const o = new Object3D(), col = new Color();
interface Pending { id: number; at: number }

/**
 * Anger room. Pick a weapon (walk in, or click the rack), then click RECEPTION to start a wrecking run: YOU become the weapon.
 * A big low-poly weapon follows the pointer on the floor, a click swings it (wind-up, hit, recover; hold to chain) and hits
 * everything in reach; junk keeps arriving in waves; items wobble, flatten and burst into debris; hits chain into a combo.
 * Reception during a run opens "Exit the game / Keep smashing"; Esc exits too. Without a run, the little smasher bot swings
 * for you at what you click (ambient). Cosmetic only.
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
  const { gl, camera } = useThree();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(false); menuRef.current = menu;
  const [hud, setHud] = useState("");
  const wp = useRef({ x: 0, z: 0, t: -1, swingS: 0.5, hit: false, held: false, buffered: false, shakeAt: 0, power: 1, inited: false });
  const weaponG = useRef<Group>(null), pitchG = useRef<Group>(null);
  const ray = useMemo(() => new Raycaster(), []);
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const tmp = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);

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
    const smashing = !!s?.running;
    if (smashing && (queue.current.length || b.target)) { queue.current.length = 0; b.target = null; b.swingT = -1; b.pending = null; } // YOU are the weapon during a run
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
          if (r.broke) { const q = slotPos(r.broke.slot, az.w, az.d); pool.spawnBurst(az.x + q.x, 0.4, az.z + q.z, itemDef(r.broke.kind).palette, r.broke.kind, w ? fxScale(w) : 1); }
          b.pending = null;
        }
        if (swingPose(b.swingT, b.swingS).done) { b.swingT = -1; b.target = null; }
      }
    }
    if (smasher.current) {
      smasher.current.visible = !!s && !smashing;
      smasher.current.position.set(b.x, 0, b.z); smasher.current.rotation.y = b.ry;
    }
    if (arm.current) arm.current.rotation.x = b.swingT >= 0 ? swingPose(b.swingT, b.swingS).pitch - 0.4 : -0.4;

    // YOU as the weapon: follows the pointer, swings on click, hits everything in reach at the impact moment
    const P = wp.current, gW = weaponG.current;
    if (gW) {
      gW.visible = smashing && !!w;
      if (smashing && w && s) {
        const rest = pivotFor(w);
        if (P.t >= 0 && !menuRef.current) {
          P.t += dt;
          if (!P.hit && P.t >= HIT_AT * P.swingS) {
            P.hit = true; P.shakeAt = now; P.power = fxScale(w);
            const ids = swingTargets(s, P.x, P.z, az.w, az.d);
            const r = smashMany(s, ids, now);
            if (r.s !== s) { sessRef.current = r.s; setSess(r.s); }
            for (const t of r.hit) {
              const q = slotPos(t.slot, az.w, az.d), br = r.broke.includes(t), pal = itemDef(t.kind).palette;
              if (br) pool.spawnBurst(az.x + q.x, 0.4, az.z + q.z, pal, t.kind, P.power);
              else pool.spawnChips(az.x + q.x, 0.4, az.z + q.z, pal, P.power);
            }
            if (!ids.length) pool.spawnChips(az.x + P.x, 0.1, az.z + P.z, ["#9ca3af"], 0.5); // a miss still kicks up some dust
          }
          if (P.t >= P.swingS) { P.t = -1; if (P.held || P.buffered) { P.t = 0; P.hit = false; P.buffered = false; } }
        }
        const sh = hitShake(now, P.shakeAt) * (0.4 + 0.2 * P.power); // a slight shake of the weapon after impact
        gW.position.set(P.x, rest.dy, P.z + rest.dz); gW.rotation.z = sh;
        if (pitchG.current) pitchG.current.rotation.x = playerPitch(P.t, P.swingS);
        const cm = comboOf(s, now), txt = cm > 1 ? `combo ${cm} · x${comboMult(cm)}` : "";
        setHud((p) => (p === txt ? p : txt));
      }
    }
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
          const f = pool.life[i]! / pool.maxLife[i]!, k = pool.kind[i]!, age = pool.maxLife[i]! - pool.life[i]!;
          const sz = pool.size[i]! * (k === 2 ? 1 + (1 - f) * 2 : k === 1 ? f : Math.min(1, f * 2.5)); // everything shrinks away at the end of its life
          const sh = KIND_SHAPE[k]!;
          o.position.set(pool.px[i]!, pool.py[i]!, pool.pz[i]!); o.rotation.set(i + age * (k === 3 ? 3 : 5), i * 2 + age * 3, 0); o.scale.set(sz * sh[0], sz * sh[1], sz * sh[2]); o.updateMatrix();
          m.setMatrixAt(n, o.matrix); m.setColorAt(n, col.set(pool.color[i]!)); n++;
        }
        m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  });
  useLayoutEffect(() => { if (mesh.current) mesh.current.count = 0; }, []);
  const smashing = !!sess?.running;
  // while a run is active YOU are the weapon: the avatar/hand is parked (World), the pointer drives the weapon, the cursor is hidden
  useEffect(() => {
    if (!smashing || !az) return;
    const el = gl.domElement, prevCursor = el.style.cursor, P = wp.current;
    smashCtl.active = true; el.style.cursor = "none"; P.t = -1; P.held = false; P.buffered = false;
    const back = { x: player.x, z: player.z };               // where you were: the camera/avatar return there on exit
    useStore.getState().focusPoint(az.x, az.z + 2.2);        // the camera glides in front of the room (same flight as "Go there")
    const rest = { x: 0, z: 0 };
    const place = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, tmp)) return;
      const c = clampToRoom(tmp.x - az.x, tmp.z - az.z, az.w, az.d);
      P.x = c.x; P.z = c.z; rest.x = tmp.x - az.x; rest.z = tmp.z - az.z;
      el.style.cursor = menuRef.current || overReception(rest.x, rest.z) ? "pointer" : "none";
    };
    const swing = (w: NonNullable<ReturnType<typeof weaponById>>) => { if (P.t < 0) { P.t = 0; P.hit = false; P.swingS = w.swingS * PLAYER_SWING_K; } else P.buffered = true; };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || menuRef.current) return;
      place(e);
      if (overReception(rest.x, rest.z)) return; // that click belongs to the reception desk (menu)
      const w = weaponById(sessRef.current?.weapon ?? null); if (!w) return;
      P.held = true; swing(w);
    };
    const up = () => { P.held = false; };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); exit(); } };
    el.addEventListener("pointermove", place); el.addEventListener("pointerdown", down); window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
    return () => {
      el.removeEventListener("pointermove", place); el.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
      smashCtl.active = false; el.style.cursor = prevCursor; P.held = false; P.t = -1;
      useStore.getState().focusPoint(back.x, back.z);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smashing, az?.x, az?.z]);
  useEffect(() => { if (!az) { setSess(null); sessRef.current = null; } }, [az]);
  if (!az) return null;

  const choose = (id: string) => { setWeapon(id); setPick(false); const n = startRun(startSession(id, Date.now()), Date.now()); setSess(n); sessRef.current = n; };
  // Exit / the header Stop end the whole smashing session at once: the run, its countdown timer and the queued items; the points are banked.
  const exit = () => { const s = sessRef.current; setMenu(false); if (!s) return; setTotal((t) => t + s.points); setSess(null); sessRef.current = null; queue.current.length = 0; setLeft(0); };
  smashCtl.stop = exit;
  smashCtl.hasSession = !!sess; // the Stop button stays while the countdown runs, not only while the weapon is in hand
  const reception = () => {
    const s = sessRef.current, now = Date.now();
    if (!weapon && !s) { setPick(true); return; }
    if (s?.running) { setMenu((m) => !m); return; } // during a run: Exit the game / Keep smashing
    if (!s) { const n = startRun(startSession(weapon, now), now); setSess(n); sessRef.current = n; return; }
    const n = startRun(s, now);
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
        <div style={bubble}>🛎 Reception · {running ? "Smashing… click for the menu" : "Click to start smashing"}</div>
      </Html>
      <mesh position={[-3.7, 0.9, 2.3]} onClick={(e) => { e.stopPropagation(); if (!sess) setPick(true); }} {...pointer}>
        <boxGeometry args={[1.5, 1.8, 0.8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {sess?.targets.map((t) => {
        const p = slotPos(t.slot, az.w, az.d);
        return (
          <group key={t.id} position={[p.x, 0, p.z]}
            onClick={(e) => { e.stopPropagation(); if (!sessRef.current?.running && queue.current.length < 6) queue.current.push(t.id); }} {...(running ? {} : pointer)}>
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
          {w && <group position={[0, 0, 0.26]}><WeaponModel w={w} /></group>}
        </group>
      </group>
      {/* you as the weapon: big, follows the pointer; pitch group swings it */}
      <group ref={weaponG} visible={false}>
        <group ref={pitchG}><group scale={WEAPON_SCALE}>{w && <WeaponModel w={w} />}</group></group>
      </group>
      <instancedMesh ref={mesh} args={[geo, undefined, DEBRIS_CAP]} frustumCulled={false} position={[-az.x, 0, -az.z]}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {menu && running && (
        <Html position={[3.0, 2.5, 2.3]} center zIndexRange={[40, 0]}>
          <Stop><div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💢 {sess!.points} pts · best combo {sess!.best}</div>
            <button style={btn} onClick={() => setMenu(false)}>Keep smashing</button>
            <button style={btn} onClick={exit}>Exit the game</button>
          </div></Stop>
        </Html>
      )}
      {pick && (
        <Html position={[-3.7, 2.4, 2.3]} center zIndexRange={[30, 0]}>
          <Stop><div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💢 Pick a weapon</div>
            {WEAPONS.map((x) => <button key={x.id} style={btn} onClick={() => choose(x.id)}>{x.icon} {x.name} · {x.power} dmg</button>)}
            <button style={btn} onClick={() => setPick(false)}>Not today</button>
          </div></Stop>
        </Html>
      )}
      {sess && <Html position={[0, 2.6, -2.5]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={bubble}>{w?.icon} {left >= 0 ? `${left}s` : "wrecking"} · {sess.points} pts{hud ? ` · ${hud}` : ""}</div></Html>}
      {!sess && total > 0 && <Html position={[0, 2.6, -2.5]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={bubble}>Feeling better? {total} pts of frustration released</div></Html>}
    </group>
  );
}
