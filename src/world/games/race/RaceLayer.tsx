import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Object3D, Quaternion, SphereGeometry, type InstancedMesh } from "three";
import { displayName } from "../../../util";
import { mulberry32 } from "../types";
import { effectiveState, roams } from "../../roam";
import type { Layout } from "../../layout";
import { CARMA_TIME, ITEM_ICON, MAX_CARS } from "./sim";
import { slideOf, speedOf } from "./car";
import { AGENT_SPEED, CAR_KINDS, CAR_TYPES, type CarKind, type Part } from "./carTypes";
import { LAPS, RaceHub, type RaceEnv } from "./hub";
import { raceCam } from "./cam";
import { sendView } from "../../viewBus";
import { buildTrack, pointAt, trackInput, type Track } from "./track";
import { goTo } from "../goto";
import { shortName } from "./names";

/** The one race hub of the page. Its world is wired up by <RaceLayer>; until then nobody is idle. */
const none: RaceEnv = { rng: Math.random, idle: () => [], alive: () => false, name: (a) => a, color: () => "#ffffff" };
export const raceHub = new RaceHub(none);
const AUTO_KEY = "sparkbots.race.auto";
try { raceHub.auto = localStorage.getItem(AUTO_KEY) !== "0"; } catch { /* storage blocked: default on */ }

let panelOpen = false;
const panelSubs = new Set<() => void>();
/** Open (or close) the race setup panel; the 🎮 Games popover has the button for it. */
export function openRacePanel(on = true): void { panelOpen = on; for (const f of panelSubs) f(); }

const DRIVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " ", "c", "escape", "e", "shift"]);
let fpv = false; // camera: behind the car (default) or from the driver's seat; C toggles
const angleDiff = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Flat ribbon along the centre line between lateral offsets a..b (to the right of the direction of travel). */
function ribbon(t: Track, a: number, b: number, y: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < t.n; i++) {
    const j = (i + 1) % t.n, dx = t.xs[j]! - t.xs[i]!, dz = t.zs[j]! - t.zs[i]!, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    pos.push(t.xs[i]! + nx * a, y, t.zs[i]! + nz * a, t.xs[i]! + nx * b, y, t.zs[i]! + nz * b);
    const k = i * 2, m = ((i + 1) % t.n) * 2;
    idx.push(k, m, k + 1, k + 1, m, m + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Bold red/white kerbs along both road edges: 2 m blocks, one mesh with vertex colours. */
function kerbs(t: Track): BufferGeometry {
  const pos: number[] = [], col: number[] = [], red = new Color("#d92b2b"), white = new Color("#f4f4f4"), W = 0.8;
  for (const side of [-1, 1]) for (let i = 0; i < t.n; i++) {
    const j = (i + 1) % t.n, dx = t.xs[j]! - t.xs[i]!, dz = t.zs[j]! - t.zs[i]!, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    const o = side * t.halfWidth, o2 = side * (t.halfWidth - W);
    const j2 = (i + 2) % t.n, dx2 = t.xs[j2]! - t.xs[j]!, dz2 = t.zs[j2]! - t.zs[j]!, l2 = Math.hypot(dx2, dz2) || 1, nx2 = -dz2 / l2, nz2 = dx2 / l2;
    const a = [t.xs[i]! + nx * o, t.zs[i]! + nz * o], b = [t.xs[i]! + nx * o2, t.zs[i]! + nz * o2], c = [t.xs[j]! + nx2 * o, t.zs[j]! + nz2 * o], d = [t.xs[j]! + nx2 * o2, t.zs[j]! + nz2 * o2];
    const k = Math.floor(i / 2) % 2 ? white : red;
    for (const q of [a, b, c, c, b, d]) { pos.push(q[0]!, 0.05, q[1]!); col.push(k.r, k.g, k.b); }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function partGeometry(p: Part): BufferGeometry {
  if (p.shape === "box") return new BoxGeometry(p.size[0], p.size[1], p.size[2]);
  if (p.shape === "sph") return new SphereGeometry(p.size[0], 12, 8);
  const g = p.shape === "cyl" ? new CylinderGeometry(p.size[0], p.size[0], p.size[1], 14) : new ConeGeometry(p.size[0], p.size[1], 12);
  if (p.axis === "z") g.rotateX(Math.PI / 2);
  else if (p.axis === "x") g.rotateZ(p.shape === "cone" && p.tip === -1 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

// ---- squash splashes (carmageddon): a small pool of flying bits ------------------------------------------------------
const PCOUNT = 96;
const parts = { x: new Float32Array(PCOUNT), y: new Float32Array(PCOUNT), z: new Float32Array(PCOUNT), vx: new Float32Array(PCOUNT), vy: new Float32Array(PCOUNT), vz: new Float32Array(PCOUNT), life: new Float32Array(PCOUNT), next: 0 };
const pcolors: string[] = new Array(PCOUNT).fill("#ffffff");
let splashVersion = 0;
function splash(x: number, z: number, color: string): void {
  for (let k = 0; k < 16; k++) {
    const i = parts.next++ % PCOUNT, a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
    parts.x[i] = x; parts.y[i] = 0.4; parts.z[i] = z; parts.vx[i] = Math.cos(a) * v; parts.vz[i] = Math.sin(a) * v; parts.vy[i] = 3 + Math.random() * 4; parts.life[i] = 1 + Math.random() * 0.8;
    pcolors[i] = k % 3 === 0 ? "#ffffff" : color;
  }
  splashVersion++;
}

/**
 * The race track (13.7.10): road, kerbs, tyres, potholes, oil, the mini robots, the cars (several parts each, instanced) and the
 * start/join chip. Everything is drawn and stepped only while a race runs; with no race the layer costs one timer tick per frame.
 * Cosmetic: a car whose agent starts working drops out, and nothing a race does ever reaches an agent's work.
 */
export function RaceLayer({ layout }: { layout: Layout }) {
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const ver = useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.version);
  const track = useMemo(() => buildTrack(trackInput(layout)), [layout]);
  useEffect(() => { raceHub.setTrack(track); }, [track]);

  useEffect(() => {
    const desk = (id: string) => layoutRef.current.desks.find((d) => d.worker.id === id);
    const env: RaceEnv = {
      rng: mulberry32((Math.random() * 2 ** 32) >>> 0),
      idle: () => layoutRef.current.desks.filter((d) => effectiveState(d.worker.id, d.worker.state) === "idle").map((d) => d.worker.id),
      alive: (a) => { const d = desk(a); return !!d && effectiveState(a, d.worker.state) === "idle"; },
      name: (a) => { const d = desk(a); return d ? shortName(displayName(d.worker), d.worker.team) : a; },
      color: (a) => desk(a)?.worker.color ?? "#ffb020",
    };
    raceHub.setEnv(env);
    return () => { raceHub.stop(); raceHub.setEnv(none); };
  }, []);

  // keyboard: only while you are driving, in the capture phase so the walking controls never see these keys
  const keys = useRef(new Set<string>());
  const camReady = useRef(false), camYaw = useRef(0), { camera } = useThree();
  const driving = raceHub.userRacing;
  useEffect(() => {
    if (!driving) { keys.current.clear(); return; }
    raceCam.active = true; camReady.current = false;
    sendView({ t: "mode", mode: "walk" }); // the 3D scene (not the label map) must be showing
    const typing = (e: KeyboardEvent) => { const el = e.target as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
    const down = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (!DRIVE_KEYS.has(k) || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); if (k === "c") { if (!e.repeat) fpv = !fpv; return; } if (k === "escape") { raceHub.stop(); return; } if (k === "e" || k === "shift") { if (!e.repeat && raceHub.userId) raceHub.sim?.useItem(raceHub.userId); return; } keys.current.add(k); };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (DRIVE_KEYS.has(k)) { keys.current.delete(k); } };
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", clear);
    return () => { raceCam.active = false; sendView({ t: "reset" }); window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", clear); keys.current.clear(); };
  }, [driving]);

  const spec = raceHub.sim?.spec ?? CAR_TYPES[raceHub.kind];
  const carParts = useMemo(() => spec.parts.map((p) => ({ p, geo: partGeometry(p), partM: new Matrix4().makeTranslation(p.at[0], p.at[1], p.at[2]) })), [spec]);
  const carMeshes = useRef<(InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const base = useMemo(() => new Matrix4(), []), tmp = useMemo(() => new Matrix4(), []), q = useMemo(() => new Quaternion(), []), e = useMemo(() => new Euler(0, 0, 0, "YXZ"), []);
  const colored = useRef(-1);
  const road = useMemo(() => (track ? { asphalt: ribbon(track, -track.halfWidth, track.halfWidth, 0.03), kerbs: kerbs(track) } : null), [track]);
  const potM = useRef<InstancedMesh>(null), oilM = useRef<InstancedMesh>(null), tyreM = useRef<InstancedMesh>(null), botB = useRef<InstancedMesh>(null), botH = useRef<InstancedMesh>(null), splashM = useRef<InstancedMesh>(null);
  const pickM = useRef<InstancedMesh>(null), missM = useRef<InstancedMesh>(null), trapM = useRef<InstancedMesh>(null);
  const decorFor = useRef<unknown>(null);
  const clock = useRef(0);

  useFrame((_, dt) => {
    raceHub.tick(Math.min(dt, 0.1));
    const sim = raceHub.sim;
    if (!sim) { decorFor.current = null; return; }
    clock.current += dt;
    const me = driving && raceHub.userId ? sim.get(raceHub.userId) : undefined;
    if (me) {
      const ks = keys.current;
      const up = ks.has("arrowup") || ks.has("w"), down = ks.has("arrowdown") || ks.has("s"), l = ks.has("arrowleft") || ks.has("a"), r = ks.has("arrowright") || ks.has("d");
      sim.setInput(raceHub.userId!, { throttle: (up ? 1 : 0) - (down ? 1 : 0), steer: (r ? 1 : 0) - (l ? 1 : 0), drift: ks.has(" ") });
    }
    // camera: behind the car or from the driver's seat; eases in from wherever it was
    if (me && raceCam.active) {
      const car = me.car, sp = sim.spec;
      if (!camReady.current) { camYaw.current = car.h; camReady.current = true; }
      camYaw.current += angleDiff(car.h - camYaw.current) * (1 - Math.exp(-(fpv ? 14 : 4) * dt));
      const fx = Math.cos(camYaw.current), fz = Math.sin(camYaw.current);
      const goal = fpv ? [car.x + fx * 0.4, sp.eye, car.z + fz * 0.4] : [car.x - fx * sp.camBack, sp.camUp, car.z - fz * sp.camBack];
      const k = 1 - Math.exp(-7 * dt);
      camera.position.set(camera.position.x + (goal[0]! - camera.position.x) * k, camera.position.y + (goal[1]! - camera.position.y) * k, camera.position.z + (goal[2]! - camera.position.z) * k);
      camera.lookAt(car.x + fx * (fpv ? 12 : 5), fpv ? sp.eye * 0.8 : sp.eye * 0.5, car.z + fz * (fpv ? 12 : 5));
    }
    // carmageddon: your car runs agents over (visual only: they flatten for a moment, burst into bits, reappear at their desk and run off)
    if (me && sim.carmageddon && speedOf(me.car) > 2.5) {
      const ids: string[] = [], now = performance.now(), hr = sim.spec.hitRadius;
      for (const [id, ro] of roams) {
        if (ro.squash && ro.squash > now) continue;
        if (Math.hypot(ro.x - me.car.x, ro.z - me.car.z) > hr) continue;
        ro.squash = now + 3500; ro.flee = null; ids.push(id);
        splash(ro.x, ro.z, layoutRef.current.desks.find((d) => d.worker.id === id)?.worker.color ?? "#ffb020");
        raceHub.squash();
      }
      if (ids.length) sendView({ t: "animate", ids });
    }
    // cars
    const flick = 0.75 + 0.25 * Math.sin(clock.current * 45);
    sim.racers.forEach((rc, i) => {
      if (i >= MAX_CARS) return;
      const c = rc.car;
      e.set(Math.max(-0.25, Math.min(0.25, slideOf(c) * 0.02)), -c.h, 0);
      q.setFromEuler(e);
      base.compose(dummy.position.set(c.x, rc.out ? -50 : c.slick > 0 ? 0.05 : 0, c.z), q, dummy.scale.set(1, 1, 1));
      carParts.forEach((cp, k) => {
        const m = carMeshes.current[k];
        if (!m) return;
        if (cp.p.flame) {
          const sc = (0.25 + Math.max(0, rc.input.throttle) * 0.9 + (speedOf(c) / sim.spec.maxSpeed) * 0.4) * flick, dir = cp.p.tip === -1 ? -1 : 1;
          tmp.compose(dummy.position.set(cp.p.at[0] - dir * (cp.p.size[1] * (sc - 1)) / 2 * -1, cp.p.at[1], cp.p.at[2]), q.identity(), dummy.scale.set(sc, 1, 1));
          tmp.premultiply(base);
          q.setFromEuler(e);
        } else tmp.multiplyMatrices(base, cp.partM);
        m.setMatrixAt(i, tmp);
      });
    });
    carMeshes.current.forEach((m) => { if (m) { m.count = sim.racers.length; m.instanceMatrix.needsUpdate = true; } });
    if (colored.current !== ver) {
      carParts.forEach((cp, k) => { const m = carMeshes.current[k]; if (m && cp.p.color === "team") { sim.racers.forEach((rc, i) => m.setColorAt(i, new Color(rc.color))); if (m.instanceColor) m.instanceColor.needsUpdate = true; } });
      colored.current = ver;
    }
    // static decor: potholes, oil, tyre stacks (written once per race)
    if (decorFor.current !== sim) {
      decorFor.current = sim;
      const pots = sim.decor.hazards.filter((h) => h.kind === "pothole"), oils = sim.decor.hazards.filter((h) => h.kind === "oil");
      const put = (m: InstancedMesh | null, n: number, f: (i: number) => [number, number, number, number]) => { if (!m) return; for (let i = 0; i < n; i++) { const [x, y, z, sc] = f(i); dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sc, 1, sc); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); } m.count = n; m.instanceMatrix.needsUpdate = true; };
      put(potM.current, pots.length, (i) => [pots[i]!.x, 0.06, pots[i]!.z, pots[i]!.r]);
      put(oilM.current, oils.length, (i) => [oils[i]!.x, 0.055, oils[i]!.z, oils[i]!.r]);
      const tyres = sim.decor.tyres.flatMap((t) => Array.from({ length: t.n }, (_, k) => ({ x: t.x, z: t.z, y: 0.3 + k * 0.55 })));
      put(tyreM.current, tyres.length, (i) => [tyres[i]!.x, tyres[i]!.y, tyres[i]!.z, 1]);
    }
    // item boxes (spin; gone while cooling down), missiles in flight, oil slicks dropped by drivers, explosions
    const pm = pickM.current;
    if (pm) { sim.decor.pickups.forEach((pk, i) => { dummy.position.set(pk.x, sim.pickupCd[i]! > 0 ? -50 : 0.9 + Math.sin(clock.current * 3 + i) * 0.12, pk.z); dummy.rotation.set(0.4, clock.current * 2 + i, 0.4); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); }); pm.count = sim.decor.pickups.length; pm.instanceMatrix.needsUpdate = true; }
    const mm = missM.current;
    if (mm) { sim.missiles.forEach((m, i) => { dummy.position.set(m.x, 0.7, m.z); dummy.rotation.set(0, -m.h, Math.PI / 2); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); mm.setMatrixAt(i, dummy.matrix); }); mm.count = sim.missiles.length; mm.instanceMatrix.needsUpdate = true; }
    const tm = trapM.current;
    if (tm) { sim.traps.forEach((tr, i) => { dummy.position.set(tr.x, 0.058, tr.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.8, 1, 1.8); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix); }); tm.count = sim.traps.length; tm.instanceMatrix.needsUpdate = true; }
    while (sim.events.length) { const ev = sim.events.pop()!; splash(ev.x, ev.z, ev.color); }
    // the mini robots crossing the road
    const bb = botB.current, bh = botH.current;
    if (bb && bh) sim.crossers.forEach((k, i) => {
      const flat = k.phase === "flat", bob = k.phase === "run" ? Math.abs(Math.sin(clock.current * 14 + i)) * 0.12 : 0;
      dummy.position.set(k.x, flat ? 0.05 : 0.3 + bob, k.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(flat ? 1.6 : 1, flat ? 0.15 : 1, flat ? 1.6 : 1); dummy.updateMatrix(); bb.setMatrixAt(i, dummy.matrix);
      dummy.position.set(k.x, flat ? 0.12 : 0.72 + bob, k.z); dummy.scale.set(flat ? 1.4 : 1, flat ? 0.2 : 1, flat ? 1.4 : 1); dummy.updateMatrix(); bh.setMatrixAt(i, dummy.matrix);
      bb.setColorAt(i, new Color(k.color));
    });
    if (bb && bh) { bb.count = bh.count = sim.crossers.length; bb.instanceMatrix.needsUpdate = bh.instanceMatrix.needsUpdate = true; if (bb.instanceColor) bb.instanceColor.needsUpdate = true; }
    // splash bits
    const sm = splashM.current;
    if (sm) {
      let n = 0;
      for (let i = 0; i < PCOUNT; i++) {
        if (parts.life[i]! <= 0) continue;
        parts.life[i] = parts.life[i]! - dt; parts.vy[i] = parts.vy[i]! - 14 * dt;
        parts.x[i] = parts.x[i]! + parts.vx[i]! * dt; parts.z[i] = parts.z[i]! + parts.vz[i]! * dt; parts.y[i] = Math.max(0.05, parts.y[i]! + parts.vy[i]! * dt);
        dummy.position.set(parts.x[i]!, parts.y[i]!, parts.z[i]!); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(0.2, parts.life[i]!)); dummy.updateMatrix(); sm.setMatrixAt(n, dummy.matrix); sm.setColorAt(n, new Color(pcolors[i]!)); n++;
      }
      sm.count = n; sm.instanceMatrix.needsUpdate = true; if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    }
  });

  void ver; void splashVersion;
  if (!track || !road) return null;
  const sim = raceHub.sim;
  return (
    <>
      {sim && (
        <group>
          <mesh geometry={road.asphalt}><meshStandardMaterial color="#58607a" roughness={0.95} polygonOffset polygonOffsetFactor={-2} side={2} /></mesh>
          <mesh geometry={road.kerbs}><meshBasicMaterial vertexColors side={2} /></mesh>
          <mesh position={[track.xs[0]!, 0.06, track.zs[0]!]} rotation={[0, -Math.atan2(track.zs[1]! - track.zs[0]!, track.xs[1]! - track.xs[0]!), 0]}>
            <boxGeometry args={[0.7, 0.02, track.halfWidth * 2 - 1.6]} /><meshBasicMaterial color="#ffffff" />
          </mesh>
          <instancedMesh ref={potM} args={[undefined, undefined, 40]} frustumCulled={false}><cylinderGeometry args={[1, 1, 0.02, 14]} /><meshStandardMaterial color="#17120e" roughness={1} /></instancedMesh>
          <instancedMesh ref={oilM} args={[undefined, undefined, 40]} frustumCulled={false}><cylinderGeometry args={[1, 1, 0.02, 18]} /><meshStandardMaterial color="#2b1d46" roughness={0.15} metalness={0.4} /></instancedMesh>
          <instancedMesh ref={tyreM} args={[undefined, undefined, 400]} frustumCulled={false}><cylinderGeometry args={[0.55, 0.55, 0.5, 12]} /><meshStandardMaterial color="#1a1a1d" roughness={0.9} /></instancedMesh>
          <instancedMesh ref={pickM} args={[undefined, undefined, 80]} frustumCulled={false}><boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="#ffd166" emissive="#ff9a2e" emissiveIntensity={0.7} /></instancedMesh>
          <instancedMesh ref={missM} args={[undefined, undefined, 8]} frustumCulled={false}><cylinderGeometry args={[0.16, 0.16, 1.2, 8]} /><meshStandardMaterial color="#e53935" emissive="#ff5a2e" emissiveIntensity={0.8} /></instancedMesh>
          <instancedMesh ref={trapM} args={[undefined, undefined, 16]} frustumCulled={false}><cylinderGeometry args={[1, 1, 0.02, 18]} /><meshStandardMaterial color="#2b1d46" roughness={0.15} metalness={0.4} /></instancedMesh>
          <instancedMesh ref={botB} args={[undefined, undefined, 8]} frustumCulled={false}><boxGeometry args={[0.38, 0.5, 0.3]} /><meshStandardMaterial roughness={0.6} /></instancedMesh>
          <instancedMesh ref={botH} args={[undefined, undefined, 8]} frustumCulled={false}><boxGeometry args={[0.3, 0.24, 0.26]} /><meshStandardMaterial color="#e7ecf5" roughness={0.5} /></instancedMesh>
          <instancedMesh ref={splashM} args={[undefined, undefined, PCOUNT]} frustumCulled={false}><boxGeometry args={[0.14, 0.14, 0.14]} /><meshBasicMaterial /></instancedMesh>
          {carParts.map((cp, k) => (
            <instancedMesh key={`${spec.kind}-${k}`} ref={(m) => { carMeshes.current[k] = m; }} args={[cp.geo, undefined, MAX_CARS]} frustumCulled={false}>
              {cp.p.flame ? <meshBasicMaterial color={cp.p.color} /> : <meshStandardMaterial color={cp.p.color === "team" ? "#ffffff" : cp.p.color} roughness={0.5} metalness={cp.p.color === "#c9d0dc" ? 0.6 : 0.1} />}
            </instancedMesh>
          ))}
        </group>
      )}
      <Html fullscreen zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}><RaceOverlay /><RaceHud /></Html>
    </>
  );
}

const CSS = `
.race-bar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:flex-start;pointer-events:none}
.race-bar>*{pointer-events:auto}
.race-pop{padding:8px 10px;background:#151b27ee;border:1px solid #3a4558;border-radius:8px;color:#e7ecf5;font-size:12px;min-width:200px}
.race-pop button{margin-right:6px}.race-pop ol{margin:4px 0;padding-left:18px}
.race-stop{padding:3px 10px;background:#7a1f1f;border:1px solid #c44;border-radius:999px;color:#fff;font-size:12px;cursor:pointer}
.race-hud{position:absolute;top:56px;left:12px;padding:8px 12px;background:#10151fcc;border:1px solid #3a4558;border-radius:8px;color:#e7ecf5;font:12px ui-monospace,Menlo,monospace;line-height:1.5;pointer-events:none;min-width:170px}\n.race-hud b{font-size:15px}\n.race-lights{font-size:20px;letter-spacing:4px}
`;

/** Bottom-centre chip: start a race, take a seat (arrows or WASD, space = drift), standings while it runs. */
function RaceOverlay() {
  useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.version);
  const open = useSyncExternalStore((cb) => { panelSubs.add(cb); return () => { panelSubs.delete(cb); }; }, () => panelOpen);
  const setOpen = openRacePanel;
  const [, tick] = useState(0);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState("");    // car to take over ("" = a new car of your own)
  const [color, setColor] = useState("#ffd166");
  const sim = raceHub.sim;
  useEffect(() => { if (!sim) return; const h = setInterval(() => tick((n) => n + 1), 400); return () => clearInterval(h); }, [sim]);
  const lapOf = (id: string) => { const r = sim?.get(id); return r ? Math.min(LAPS, Math.max(0, r.lap) + 1) : 0; };
  return (
    <>
      <style>{CSS}</style>
      <div className="race-bar">
        {sim && <button className="games-chip" style={{ display: "flex", gap: 6, padding: "3px 8px", background: "#151b27ee", border: "1px solid #3a4558", borderRadius: 999, color: "#e7ecf5", fontSize: 12, cursor: "pointer" }} title="Race track" onClick={() => setOpen(!open)}>
          🏎 Race{sim.phase === "countdown" ? " · get ready" : sim.phase === "over" ? " · finished" : " · live"}
        </button>}
        {sim && <button className="race-stop" title="Stop the race (Esc while driving)" onClick={() => raceHub.stop()}>⏹ Stop race{raceHub.userRacing ? " · Esc" : ""}</button>}
        {(open || sim) && (
          <div className="race-pop" role="dialog" aria-label="Race track">
            {sim?.phase === "countdown" && <div className="race-lights">{sim.time < -2 ? "🔴🔴🔴" : sim.time < -1 ? "🔴🔴" : "🔴"}</div>}
            {sim && sim.phase !== "countdown" && (
              <ol>
                {(sim.phase === "over" ? raceHub.last.map((r, i) => <li key={i}>{r.name}{r.time !== null ? ` · ${r.time.toFixed(1)} s` : " · did not finish"}</li>) : sim.order.slice(0, 5).map((id) => <li key={id}>{sim.get(id)!.name} · lap {lapOf(id)}/{LAPS}</li>))}
              </ol>
            )}
            <div>
              {!sim && <button onClick={() => setOpen(false)} title="Close">✕</button>}
              {!sim && !raceHub.carmageddon && <button onClick={() => { const ok = raceHub.start(false); setMsg(ok ? "" : "Needs at least two idle agents."); if (ok && raceHub.track) { const p = pointAt(raceHub.track, -9); goTo(p.x, p.z); } }}>Start race</button>}
              {!sim && raceHub.carmageddon && <button onClick={() => setMsg(raceHub.join(undefined, color) ? "" : "Could not start.")}>Start carmageddon</button>}
              {!raceHub.userRacing && !raceHub.carmageddon && (!sim || sim.phase !== "over") && <button onClick={() => setMsg(raceHub.join(pick || undefined, color) ? "" : "Could not take that seat.")}>Drive</button>}
              {raceHub.userRacing && <button onClick={() => raceHub.leave()}>Leave</button>}
              {sim && <button onClick={() => raceHub.stop()}>Stop</button>}
            </div>
            {!sim && (
              <div>
                <select aria-label="Car type" value={raceHub.kind} onChange={(e) => { raceHub.kind = e.target.value as CarKind; tick((n) => n + 1); }}>
                  {CAR_KINDS.map((k) => <option key={k} value={k}>{CAR_TYPES[k].icon} {CAR_TYPES[k].name} · top {Math.round(CAR_TYPES[k].maxSpeed / AGENT_SPEED)}x agent</option>)}
                </select>
                <label title="Off by default. You drive anywhere, no road edge, and run agents over (they just flatten for a moment: cosmetic)."><input type="checkbox" checked={raceHub.carmageddon} onChange={(e) => { raceHub.carmageddon = e.target.checked; tick((n) => n + 1); }} /> Carmageddon</label>
              </div>
            )}
            {sim?.carmageddon && <div>💥 Run over: <b>{raceHub.squashed}</b> · {Math.max(0, Math.round(240 - sim.time))} s left</div>}
            {!raceHub.userRacing && (
              <div>
                {sim && sim.phase !== "over" && (
                  <select aria-label="Car to drive" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">{sim.phase === "countdown" ? "my own new car" : "take over a car…"}</option>
                    {sim.racers.filter((r) => !r.out && r.finishedAt === null).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                {(!sim || (!pick && sim.phase === "countdown")) && <label> colour <input type="color" aria-label="Car colour" value={color} onChange={(e) => setColor(e.target.value)} /></label>}
              </div>
            )}
            {raceHub.userRacing && <div className="muted">Arrows or WASD to drive · Space to drift · E: use item · C: camera · Esc: stop</div>}
            {sim && <div className="muted">The map stays as it was at the start until the race ends.</div>}
            {msg && <div role="alert">{msg}</div>}
            <label><input type="checkbox" checked={raceHub.auto} onChange={(e) => { raceHub.auto = e.target.checked; try { localStorage.setItem(AUTO_KEY, e.target.checked ? "1" : "0"); } catch { /* ignore */ } tick((n) => n + 1); }} /> Idle agents race on their own</label>
          </div>
        )}
      </div>
    </>
  );
}

/** Nerd stats while you drive: place, lap, speed, lap times, bumps, drift, agents run over. Refreshes ~8 times a second. */
function RaceHud() {
  useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.version);
  const [, tick] = useState(0);
  const sim = raceHub.sim, me = sim && raceHub.userId ? sim.get(raceHub.userId) : undefined;
  useEffect(() => { if (!me) return; const h = setInterval(() => tick((n) => n + 1), 120); return () => clearInterval(h); }, [me]);
  if (!sim || !me || me.out) return null;
  const sp = speedOf(me.car), place = sim.order.indexOf(me.id) + 1, t = (v: number | null) => (v === null ? "–" : `${v.toFixed(1)}s`);
  return (
    <div className="race-hud" role="status" aria-label="Race stats">
      <div>{sim.spec.icon} {sim.spec.name}{me.car.drifting ? " · 🔥 drifting" : ""}{me.car.slick > 0 ? " · 🛢 oil" : ""}</div>
      {sim.carmageddon ? (
        <>
          <div>💥 Run over <b>{raceHub.squashed}</b></div>
          <div>Time left <b>{Math.max(0, Math.round(CARMA_TIME - sim.time))}s</b></div>
        </>
      ) : (
        <>
          <div>Place <b>{place}</b>/{sim.racers.filter((r) => !r.out).length}</div>
          <div>Lap <b>{Math.min(sim.laps, me.lap + 1)}</b>/{sim.laps}{me.finishedAt !== null ? " · finished" : ""}</div>
          <div>Last {t(me.lastLap)} · best {t(me.bestLap)}</div>
        </>
      )}
      <div>Item <b>{me.item ? `${ITEM_ICON[me.item]} ${me.item}` : "–"}</b>{me.item ? " · press E" : ""}</div>
      <div>Speed <b>{Math.round(sp * 3.6)}</b> km/h · {(sp / AGENT_SPEED).toFixed(1)}x agent</div>
      <div>Time {Math.max(0, sim.time).toFixed(1)}s · knocks {me.bumps} · walls {me.car.hits}</div>
    </div>
  );
}
