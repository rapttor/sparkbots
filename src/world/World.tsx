import { createPortal } from "react-dom";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import {
  BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, Object3D, SphereGeometry, Vector3,
  type Group,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import fontUrl from "three/examples/fonts/ttf/kenpixel.ttf?url";
import type { Worker as BotWorker, WorkerState } from "../../server/adapters/types";
import { useStore } from "../state/store";
import { DESK_D, DESK_W, PLAYER_RADIUS, deskBoxes, resolveMove } from "./collide";
import { DeskScreens } from "./screens";
import { WorkerChat } from "./WorkerChat";
import { SpeechBubbles } from "./bubbles";
import type { ChatDock } from "./WorkerChat";
import { Minimap, ViewControls, stateColor, type ViewState, type Warp, type ZoomReq } from "./controls3d";
import { applyFilters } from "../panels/teamFilters";
import { MAX_DESKS, computeLayout, visibleTeams, type DeskSlot, type Layout, type TeamArea } from "./layout";
import { STATE_COLORS, STATE_LABELS, STATE_ORDER } from "./colors";
import { roams, player as playerState, separate, pushPlayerOut, type BotMode, type Roam } from "./roam";
import { ACTIONS, zapLevel } from "./actions";
import { Zaps } from "./zap";

type Mode = "overview" | "walk";
interface Nearby { id: string; title: string }

const WHITE = new Color("#ffffff");
const STATE_THREE = Object.fromEntries(
  (Object.keys(STATE_COLORS) as WorkerState[]).map((k) => [k, new Color(STATE_COLORS[k])]),
) as Record<WorkerState, Color>;
const VISOR_GAIN: Record<WorkerState, number> = { asleep: 0.6, idle: 0.8, working: 1.4, waiting: 1.1, done: 1.2, error: 1.3 };
const BODY_TINT: Record<WorkerState, number> = { asleep: 0.12, idle: 0.22, working: 0.28, waiting: 0.28, done: 0.28, error: 0.3 };

// Reused temporaries (no per-frame allocation).
const dummy = new Object3D();
const grp = new Object3D();
const tmp = new Matrix4();
const col = new Color();

const visorColor = (state: WorkerState): Color => col.copy(STATE_THREE[state]).multiplyScalar(VISOR_GAIN[state]);
const bodyColor = (state: WorkerState): Color => col.copy(WHITE).lerp(STATE_THREE[state], BODY_TINT[state]);

/** Sets instance i of `mesh` to grp.matrix * local(pos, rotZ, scale). */
function put(mesh: InstancedMesh, i: number, lx: number, ly: number, lz: number, rz = 0, s = 1): void {
  dummy.position.set(lx, ly, lz);
  dummy.rotation.set(0, 0, rz);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  tmp.multiplyMatrices(grp.matrix, dummy.matrix);
  mesh.setMatrixAt(i, tmp);
}

function putWorld(mesh: InstancedMesh, i: number, x: number, y: number, z: number, s = 1): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

interface Meshes { desk: InstancedMesh; ring: InstancedMesh; body: InstancedMesh; visor: InstancedMesh; antenna: InstancedMesh; beacon: InstancedMesh }

/** Where a bot currently is. Bots leave their chair when idle (wander), lie down when asleep, and run back to the
 *  desk when they are working or when you open their chat. */
/** Where a bot currently is (see roam.ts). */
const ZAP_TINT = new Color("#fff3a0");
const chairOf = (d: DeskSlot) => ({ x: d.x, z: d.z + 0.95 });
const bedOf = (d: DeskSlot) => ({ x: d.x + 1.45, z: d.z + 1.1 }); // on the floor beside the desk
const speedOf: Record<BotMode, number> = { desk: 3, wander: 0.7, sleep: 1.4, rush: 6 };

function roamOf(d: DeskSlot): Roam {
  let r = roams.get(d.worker.id);
  if (!r) {
    const c = d.worker.state === "asleep" ? bedOf(d) : chairOf(d);
    r = { x: c.x, z: c.z, tx: c.x, tz: c.z, wait: 0, ry: 0, lying: d.worker.state === "asleep", moving: false, mode: "desk", awakeUntil: 0, flash: false };
    roams.set(d.worker.id, r);
  }
  return r;
}

function modeOf(d: DeskSlot, fetchedId: string | undefined): BotMode {
  if (d.worker.id === fetchedId) return "rush";
  switch (d.worker.state) {
    case "asleep": return (roams.get(d.worker.id)?.awakeUntil ?? 0) > performance.now() ? "wander" : "sleep"; // a zapped sleeper stays up for a while
    case "idle": return "wander";
    default: return "desk";
  }
}

/** Advances one bot toward its goal. Wander targets stay in the open floor in front of its own desk, clear of desks. */
function stepRoam(d: DeskSlot, dt: number, mode: BotMode): Roam {
  const r = roamOf(d);
  r.mode = mode;
  if (mode === "wander") {
    if (Math.hypot(r.tx - r.x, r.tz - r.z) < 0.05) {
      r.wait -= dt;
      if (r.wait <= 0) {
        const c = chairOf(d);
        r.tx = c.x + (Math.random() * 2.8 - 1.4); r.tz = c.z + 0.3 + Math.random() * 1.6; r.wait = 1 + Math.random() * 4;
      }
    }
  } else {
    const g = mode === "sleep" ? bedOf(d) : chairOf(d);
    r.tx = g.x; r.tz = g.z;
  }
  const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
  r.moving = dist > 0.05;
  if (r.moving) {
    const step = Math.min(dist, speedOf[mode] * dt);
    r.x += (dx / dist) * step; r.z += (dz / dist) * step;
    r.ry = Math.atan2(-dx, -dz);
  } else {
    r.ry = mode === "wander" ? r.ry : 0; // sitting bots face their desk
  }
  separate(d.worker.id, r);
  r.lying = mode === "sleep" && !r.moving;
  return r;
}

/** A bot that has arrived and has nothing to animate can be skipped by the frame loop (asleep or error, parked). */
const settled = (d: DeskSlot, r: Roam, mode: BotMode) => !r.moving && mode !== "rush" && (mode === "sleep" || d.worker.state === "error");

function poseBot(m: Meshes, i: number, d: DeskSlot, t: number, animate: boolean, r: Roam): void {
  const { activity } = d.worker;
  const state = d.worker.state === "asleep" && !r.lying && animate ? "idle" : d.worker.state;
  const ph = i * 0.7;
  let bob = 0, sway = 0, wave = 0, beacon = 0;
  if (r.lying) { /* asleep on the floor: no animation */ }
  else if (r.moving) bob = Math.abs(Math.sin(t * 10 + ph)) * 0.06;
  else if (animate) {
    if (state === "idle") bob = Math.sin(t * 1.2 + ph) * 0.03;
    else if (state === "working") {
      if (activity === "coding") bob = Math.sin(t * 8 + ph) * 0.04;
      else if (activity === "researching") { bob = Math.sin(t * 1.5 + ph) * 0.03; sway = Math.sin(t * 1.2 + ph) * 0.12; }
      else bob = Math.sin(t * 3.5 + ph) * 0.05;
    } else if (state === "done") wave = Math.sin(t * 12) * 0.7;
    else if (state === "waiting") bob = Math.sin(t * 1.2 + ph) * 0.02;
  }
  const c = chairOf(d);
  if (d.worker.state === "waiting") beacon = animate ? 0.8 + 0.4 * Math.sin(t * 5 + ph) : 1;
  // Zapped: shake, hop and spin, with the body flashing white-yellow (restored when it fades).
  const zl = zapLevel(d.worker.id);
  let jx = 0, jz = 0, hop = 0, spin = 0;
  if (zl > 0) {
    jx = (Math.random() - 0.5) * 0.14 * zl; jz = (Math.random() - 0.5) * 0.14 * zl;
    hop = Math.sin((1 - zl) * Math.PI) * 0.45; spin = (1 - zl) * Math.PI * 2;
    const c = col.set(d.worker.color).lerp(ZAP_TINT, Math.min(1, zl * 1.3));
    m.body.setColorAt(i, c); m.antenna.setColorAt(i, c);
    r.flash = true;
  } else if (r.flash) {
    const c = col.set(d.worker.color);
    m.body.setColorAt(i, c); m.antenna.setColorAt(i, c);
    r.flash = false;
  }
  if (r.flash || zl > 0) { if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true; if (m.antenna.instanceColor) m.antenna.instanceColor.needsUpdate = true; }
  grp.position.set(r.x + jx, (r.lying ? 0.45 : 0.6 + bob) + hop, r.z + jz);
  grp.rotation.set(0, r.ry + spin, r.lying ? Math.PI / 2 : sway);
  grp.updateMatrix();
  put(m.body, i, 0, 0, 0);
  put(m.visor, i, 0, 0.07, -0.255);
  put(m.antenna, i, 0, -0.07, 0, wave);
  putWorld(m.beacon, i, c.x, 1.9, c.z, beacon);
}

function writeStatic(m: Meshes, layout: Layout, fetchedId: string | undefined): number[] {
  const n = layout.desks.length;
  const animated: number[] = [];
  for (const mesh of Object.values(m)) mesh.count = n;
  layout.desks.forEach((d, i) => {
    putWorld(m.desk, i, d.x, 0.4, d.z);
    putWorld(m.ring, i, d.x, 0.02, d.z + 0.95);
    const st = d.worker.state;
    m.ring.setColorAt(i, STATE_THREE[st]);
    m.desk.setColorAt(i, WHITE);
    const body = col.set(d.worker.color); // bots use their color; the ring still shows the state
    m.body.setColorAt(i, body);
    m.antenna.setColorAt(i, body);
    m.visor.setColorAt(i, visorColor(st));
    m.beacon.setColorAt(i, STATE_THREE.waiting);
    const mode = modeOf(d, fetchedId);
    const r = roamOf(d);
    poseBot(m, i, d, 0, false, r);
    if (!settled(d, r, mode)) animated.push(i);
  });
  for (const mesh of Object.values(m)) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return animated;
}

/** Talk to a worker right in the room (speech bubble), instead of leaving for the Teams tab. */
function selectWorker(id: string): void {
  useStore.getState().openChat(id);
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

interface JumpReq { area: TeamArea; n: number }

interface SceneCtl { zoom: ZoomReq | null; reset: number; locked: boolean; warp: Warp | null; view: { current: ViewState } }

function Scene({ mode, layout, jump, onNearby, onEnter, ctl }: { mode: Mode; layout: Layout; jump: JumpReq | null; onNearby: (n: Nearby | null) => void; onEnter: (a: TeamArea) => void; ctl: SceneCtl }) {
  const lockedRef = useRef(ctl.locked);
  lockedRef.current = ctl.locked;
  const flight = useRef<{ t: number; fromC: Vector3; toC: Vector3; fromT: Vector3; toT: Vector3 } | null>(null);
  const layoutRef = useRef(layout);
  const boxes = useMemo(() => deskBoxes(layout.desks), [layout]);
  const animatedRef = useRef<number[]>([]);
  const meshesRef = useRef<Meshes | null>(null);
  const refs = {
    desk: useRef<InstancedMesh>(null), ring: useRef<InstancedMesh>(null), body: useRef<InstancedMesh>(null),
    visor: useRef<InstancedMesh>(null), antenna: useRef<InstancedMesh>(null), beacon: useRef<InstancedMesh>(null),
  };
  const { camera, gl } = useThree();
  const managerColor = useStore((s) => s.managerColor);
  const chatId = useStore((s) => s.chatId); // this worker runs to its desk and opens its laptop
  const fetchedRef = useRef(chatId);
  fetchedRef.current = chatId;
  const dest = useRef<Vector3 | null>(null); // click-to-move target (walk mode)
  const goTo = (pt: Vector3) => { if (modeRef.current === "walk") dest.current = new Vector3(pt.x, 0, pt.z); };
  const walkZoom = useRef(1); // 1 = default follow distance; scroll down zooms out, up zooms in
  const controls = useRef<{ target: Vector3; update: () => void } | null>(null);
  const framed = useRef(false);
  const player = useRef<Group>(null);
  const pos = useRef(new Vector3(0, 0, 12));
  const keys = useRef(new Set<string>());
  const nearbyId = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Shared geometries + materials (one material set).
  const assets = useMemo(() => {
    // Blocky pixel bot: body + four legs merged; arm bar (waves when done); two eye boxes (glow in the state color).
    const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const body = mergeGeometries([
      box(0.86, 0.58, 0.5, 0, 0, 0),
      ...[-0.33, -0.18, 0.18, 0.32].map((x) => box(0.09, 0.22, 0.09, x, -0.4)),
    ])!;
    const arms = box(1.15, 0.15, 0.2, 0, 0);
    const eyes = mergeGeometries([box(0.07, 0.14, 0.04, -0.255, 0), box(0.07, 0.14, 0.04, 0.255, 0)])!;
    const mats = {
      solid: { color: "#e8ecf4", roughness: 0.55, metalness: 0.1 },
    };
    return {
      deskG: new BoxGeometry(DESK_W, 0.8, DESK_D),
      ringG: new CylinderGeometry(0.55, 0.55, 0.03, 24),
      bodyG: body,
      visorG: eyes,
      antennaG: arms,
      beaconG: new SphereGeometry(0.18, 12, 10),
      mats,
    };
  }, []);

  const frame = useCallback(() => {
    const l = layoutRef.current;
    const span = Math.max(l.maxX - l.minX, l.maxZ - l.minZ) + 10;
    const cx = (l.minX + l.maxX) / 2, cz = (l.minZ + l.maxZ) / 2;
    camera.position.set(cx, span * 0.85, cz + span * 0.3);
    if (controls.current) { controls.current.target.set(cx, 0, cz); controls.current.update(); }
    else camera.lookAt(cx, 0, cz);
  }, [camera]);

  useLayoutEffect(() => {
    layoutRef.current = layout;
    const r = refs;
    if (!r.desk.current || !r.ring.current || !r.body.current || !r.visor.current || !r.antenna.current || !r.beacon.current) return;
    meshesRef.current = {
      desk: r.desk.current, ring: r.ring.current, body: r.body.current,
      visor: r.visor.current, antenna: r.antenna.current, beacon: r.beacon.current,
    };
    animatedRef.current = writeStatic(meshesRef.current, layout, chatId);
    if (!framed.current && layout.desks.length > 0) { framed.current = true; frame(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, frame, chatId]);

  // Re-frame the overview camera when returning from walk mode; spawn player on entering.
  useEffect(() => {
    if (mode === "overview") frame();
    else {
      const l = layoutRef.current;
      pos.current.set((l.minX + l.maxX) / 2, 0, l.maxZ + 3);
    }
  }, [mode, frame]);

  useEffect(() => {
    if (!jump) return;
    const { area } = jump;
    if (modeRef.current === "walk") {
      pos.current.set(area.x, 0, area.z + area.d / 2 + 1.5);
      return;
    }
    const tgt = new Vector3(area.x, 0, area.z);
    const h = Math.max(area.w, area.d) * 0.9 + 6;
    const cur = controls.current ? controls.current.target.clone() : new Vector3();
    flight.current = { t: 0, fromC: camera.position.clone(), toC: new Vector3(tgt.x, h, tgt.z + h * 0.45), fromT: cur, toT: tgt };
  }, [jump, camera]);

  // Header controls: zoom buttons, reset, minimap click.
  useEffect(() => {
    if (!ctl.zoom || lockedRef.current) return;
    if (modeRef.current === "walk") walkZoom.current = Math.min(8, Math.max(0.35, walkZoom.current * ctl.zoom.factor));
    else if (controls.current) {
      const t = controls.current.target;
      const off = camera.position.clone().sub(t).multiplyScalar(ctl.zoom.factor);
      camera.position.copy(t).add(off);
      controls.current.update();
    }
  }, [ctl.zoom, camera]);
  useEffect(() => { if (ctl.reset > 0) { walkZoom.current = 1; if (modeRef.current === "overview") frame(); } }, [ctl.reset, frame]);
  useEffect(() => {
    const w = ctl.warp;
    if (!w) return;
    if (modeRef.current === "walk") { pos.current.set(w.x, 0, w.z); dest.current = null; return; }
    const tgt = new Vector3(w.x, 0, w.z);
    const cur = controls.current ? controls.current.target.clone() : new Vector3();
    flight.current = { t: 0, fromC: camera.position.clone(), toC: camera.position.clone().add(tgt).sub(cur), fromT: cur, toT: tgt };
  }, [ctl.warp, camera]);

  // Walk-mode mouse wheel zoom (like street-view): scroll down = zoom out, scroll up = zoom in.
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== "walk") return;
      e.preventDefault();
      if (lockedRef.current) return;
      const step = Math.max(-100, Math.min(100, e.deltaY)); // normalize trackpad/mouse
      walkZoom.current = Math.min(8, Math.max(0.35, walkZoom.current * Math.exp(step * 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [gl]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (k === "e" && modeRef.current === "walk") {
        const d = nearestDesk(layoutRef.current, pos.current);
        if (d) selectWorker(d.worker.id);
      }
      const act = ACTIONS.find((a) => a.key === k);
      if (act && modeRef.current === "walk") {
        const b = nearestBot(layoutRef.current, pos.current);
        if (b) {
          act.run(b.worker.id);
          if (!animatedRef.current.includes(b.index)) animatedRef.current = [...animatedRef.current, b.index]; // sleepers must animate to react
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Single frame loop: only non-asleep (and non-error) workers touch their matrices.
  useFrame((state, dt) => {
    ctl.view.current.mode = modeRef.current;
    playerState.on = modeRef.current === "walk"; playerState.x = pos.current.x; playerState.z = pos.current.z;
    if (modeRef.current === "walk") { ctl.view.current.x = pos.current.x; ctl.view.current.z = pos.current.z; }
    else if (controls.current) { ctl.view.current.x = controls.current.target.x; ctl.view.current.z = controls.current.target.z; }
    const fl = flight.current;
    if (fl && controls.current && modeRef.current === "overview") {
      fl.t = Math.min(1, fl.t + dt / 0.8);
      const e = fl.t * fl.t * (3 - 2 * fl.t);
      camera.position.lerpVectors(fl.fromC, fl.toC, e);
      controls.current.target.lerpVectors(fl.fromT, fl.toT, e);
      controls.current.update();
      if (fl.t >= 1) flight.current = null;
    } else if (fl) flight.current = null;
    const m = meshesRef.current;
    const anim = animatedRef.current;
    if (m && anim.length > 0) {
      const t = state.clock.elapsedTime;
      const desks = layoutRef.current.desks;
      for (let k = 0; k < anim.length; k++) {
        const d = desks[anim[k]]!;
        poseBot(m, anim[k], d, t, true, stepRoam(d, Math.min(dt, 0.1), modeOf(d, fetchedRef.current)));
      }
      m.body.instanceMatrix.needsUpdate = true;
      m.visor.instanceMatrix.needsUpdate = true;
      m.antenna.instanceMatrix.needsUpdate = true;
      m.beacon.instanceMatrix.needsUpdate = true;
    }

    if (modeRef.current !== "walk") {
      if (nearbyId.current) { nearbyId.current = null; onNearby(null); }
      return;
    }
    const ks = keys.current;
    let dx = (ks.has("d") || ks.has("arrowright") ? 1 : 0) - (ks.has("a") || ks.has("arrowleft") ? 1 : 0);
    let dz = (ks.has("s") || ks.has("arrowdown") ? 1 : 0) - (ks.has("w") || ks.has("arrowup") ? 1 : 0);
    const p = pos.current;
    const g = player.current;
    if (dx !== 0 || dz !== 0) dest.current = null; // keyboard cancels click-to-move
    else if (dest.current) {
      const tx = dest.current.x - p.x, tz = dest.current.z - p.z, dist = Math.hypot(tx, tz);
      if (dist < 0.2) dest.current = null; else { dx = tx / dist; dz = tz / dist; }
    }
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      const l = layoutRef.current;
      const r = resolveMove(
        p,
        { x: Math.min(l.maxX + 6, Math.max(l.minX - 6, p.x + dx * 5 * dt)), z: Math.min(l.maxZ + 8, Math.max(l.minZ - 6, p.z + dz * 5 * dt)) },
        boxes, PLAYER_RADIUS,
      );
      const moved = Math.hypot(r.x - p.x, r.z - p.z);
      p.x = r.x; p.z = r.z;
      pushPlayerOut(p);
      if (dest.current && moved < 5 * dt * 0.25) dest.current = null; // blocked by a desk: stop
      if (g) g.rotation.y = Math.atan2(-dx, -dz);
    }
    if (g) g.position.copy(p);
    const z = walkZoom.current;
    camera.position.lerp(dummy.position.set(p.x, 4.5 * z, p.z + 6.5 * z), 1 - Math.exp(-6 * dt));
    camera.lookAt(p.x, 1, p.z);

    const near = nearestDesk(layoutRef.current, p);
    const id = near ? near.worker.id : null;
    if (id !== nearbyId.current) {
      nearbyId.current = id;
      onNearby(near ? { id: near.worker.id, title: near.worker.name || near.worker.title } : null);
    }
  });

  const slabs = useMemo(
    () => layout.areas.map((a) => ({ a, color: new Color("#1a1f2e").lerp(a.color, 0.2) })),
    [layout],
  );
  const floor = Math.max(layout.maxX - layout.minX, layout.maxZ - layout.minZ) + 80;

  return (
    <>
      <color attach="background" args={["#0d1019"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[20, 40, 10]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onClick={(e) => { e.stopPropagation(); goTo(e.point); }}>
        <planeGeometry args={[floor, floor]} />
        <meshStandardMaterial color="#10141f" />
      </mesh>
      {slabs.map(({ a, color }) => (
        <group key={a.name}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[a.x, 0, a.z]}
            onClick={(e) => { if (modeRef.current === "walk") { e.stopPropagation(); goTo(e.point); } }}
            onDoubleClick={(e) => { e.stopPropagation(); onEnter(a); }}>
            <planeGeometry args={[a.w, a.d]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <Suspense fallback={null}><Text font={new URL(fontUrl, location.href).href} fontSize={0.8} color="#dfe6ff" anchorX="center" anchorY="middle"
            rotation={[-Math.PI / 2, 0, 0]} position={[a.x, 0.03, a.z - a.d / 2 + 0.6]}>
            {a.name}
          </Text></Suspense>
        </group>
      ))}

      <instancedMesh ref={refs.desk} args={[assets.deskG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined;
          if (d) selectWorker(d.worker.id);
        }}>
        <meshStandardMaterial color="#3a4256" roughness={0.8} />
      </instancedMesh>
      <DeskScreens layout={layout} openId={chatId} />
      <Zaps />
      <SpeechBubbles layout={layout} getPos={(id) => roams.get(id)} />
      <instancedMesh ref={refs.ring} args={[assets.ringG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.body} args={[assets.bodyG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.antenna} args={[assets.antennaG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.visor} args={[assets.visorG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.beacon} args={[assets.beaconG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Player bot (walk mode only) */}
      <group ref={player} visible={mode === "walk"}>
        <mesh geometry={assets.bodyG} position={[0, 0.6, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
        <mesh geometry={assets.visorG} position={[0, 0.67, -0.255]}><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>
        <mesh geometry={assets.antennaG} position={[0, 0.53, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
      </group>

      {mode === "overview" && (
        <OrbitControls ref={controls as never} makeDefault enableDamping enableZoom={!ctl.locked} minPolarAngle={0} maxPolarAngle={Math.PI / 2.3}
          minDistance={4} maxDistance={Math.max(60, floor)} />
      )}
    </>
  );
}

/** The robot closest to the manager (where it stands right now, not its desk), within reach. */
function nearestBot(l: Layout, p: Vector3): { worker: BotWorker; index: number } | null {
  let best: { worker: BotWorker; index: number } | null = null, bd = 4 * 4;
  l.desks.forEach((d, index) => {
    const r = roams.get(d.worker.id);
    const dx = (r?.x ?? d.x) - p.x, dz = (r?.z ?? d.z) - p.z, dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; best = { worker: d.worker, index }; }
  });
  return best;
}

function nearestDesk(l: Layout, p: Vector3): DeskSlot | null {
  let best: DeskSlot | null = null;
  let bd = 2 * 2;
  for (const d of l.desks) {
    const dx = d.x - p.x, dz = d.z - p.z;
    const q = dx * dx + dz * dz;
    if (q < bd) { bd = q; best = d; }
  }
  return best;
}

function StatusLegend() {
  const snapshot = useStore((s) => s.snapshot);
  const counts = useMemo(() => {
    const c: Record<WorkerState, number> = { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 };
    for (const t of snapshot?.teams ?? []) for (const w of t.workers) c[w.state]++;
    return c;
  }, [snapshot]);
  return (
    <div className="legend status-legend">
      {STATE_ORDER.map((s) => (
        <div key={s} className="legend-row">
          <span className="legend-dot" style={{ background: STATE_COLORS[s] }} />
          <span>{STATE_LABELS[s]}</span>
          <b className="legend-n">{counts[s]}</b>
        </div>
      ))}
    </div>
  );
}

function ProjectLegend({ layout, onJump, hidden, showAll, onShowAll }: { layout: Layout; onJump: (a: TeamArea) => void; hidden: number; showAll: boolean; onShowAll: (v: boolean) => void }) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const byTeam = new Map<string, Record<WorkerState, number>>();
    for (const d of layout.desks) {
      let c = byTeam.get(d.worker.team);
      if (!c) { c = { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 }; byTeam.set(d.worker.team, c); }
      c[d.worker.state]++;
    }
    return layout.areas.map((area) => {
      const c = byTeam.get(area.name) ?? { asleep: 0, idle: 0, working: 0, waiting: 0, done: 0, error: 0 };
      const top = STATE_ORDER.find((s) => c[s] > 0) ?? "asleep";
      const summary = STATE_ORDER.filter((s) => c[s] > 0).map((s) => `${c[s]} ${s}`).join(" \u00b7 ");
      return { area, c, top, summary };
    }).sort((a, b) =>
      b.c.waiting - a.c.waiting || b.c.working - a.c.working || (a.area.name < b.area.name ? -1 : a.area.name > b.area.name ? 1 : 0));
  }, [layout]);
  const f = filter.trim().toLowerCase();
  const shown = f ? rows.filter((r) => r.area.name.toLowerCase().includes(f)) : rows;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const picker = (
    <div className="project-picker" ref={wrap}>
      <button className="small" onClick={() => setOpen(!open)}>Projects ({layout.areas.length}) ▾</button>
      {open && (
        <div className="project-dropdown">
          <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects" />
          {(hidden > 0 || showAll) && (
            <label className="project-sum" style={{ cursor: "pointer", paddingLeft: 0 }}>
              <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} style={{ width: "auto" }} /> Show finished/abandoned{hidden > 0 ? ` (${hidden} hidden)` : ""}
            </label>
          )}
          <div className="project-list">
            {shown.map(({ area, top, summary }) => (
              <div key={area.name} className="legend-row project-row" onClick={() => { onJump(area); setOpen(false); }} title={`Jump to ${area.name}`}>
                <span className="legend-dot" style={{ background: `#${area.color.getHexString()}` }} />
                <span className="project-name">{area.name}</span>
                <span className="legend-dot" style={{ background: STATE_COLORS[top] }} />
                <span className="project-sum">{summary}</span>
              </div>
            ))}
            {shown.length === 0 && <div className="project-sum">No projects</div>}
          </div>
        </div>
      )}
    </div>
  );
  // Lives in the app header (slot rendered by App); falls back to inline if the slot is missing.
  const slot = document.getElementById("topbar-slot");
  return slot ? createPortal(picker, slot) : picker;
}

const box: React.CSSProperties = {
  position: "absolute", padding: "8px 10px", background: "rgba(10,12,20,0.78)", color: "#dfe6ff",
  font: "12px/1.5 system-ui, sans-serif", borderRadius: 6, pointerEvents: "none",
};

export default function World() {
  const [mode, setMode] = useState<Mode>("overview");
  const [hidden, setHidden] = useState(() => document.hidden);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const snapshot = useStore((st) => st.snapshot);
  const chatId = useStore((st) => st.chatId);
  const openChat = useStore((st) => st.openChat);
  const markSeen = useStore((st) => st.markSeen);
  const markAllSeen = useStore((st) => st.markAllSeen);
  const said = snapshot?.teams.flatMap((t) => t.workers).find((w) => w.id === chatId)?.said;
  useEffect(() => { if (chatId && said) markSeen(chatId, said.at); }, [chatId, said?.at, markSeen]); // reading the chat clears its bubble
  const clearBubbles = () => {
    const m: Record<string, number> = {};
    for (const t of snapshot?.teams ?? []) for (const w of t.workers) if (w.said) m[w.id] = w.said.at;
    markAllSeen(m);
  };
  const [showAll, setShowAllState] = useState(() => { try { return localStorage.getItem("ao.map.showAll") === "1"; } catch { return false; } });
  const setShowAll = (v: boolean) => { setShowAllState(v); try { localStorage.setItem("ao.map.showAll", v ? "1" : "0"); } catch { /* private mode */ } };
  const filters = useStore((st) => st.filters);
  const tasks = useStore((st) => st.tasks);
  // The header filters narrow what the office shows: only matching projects and workers get a desk.
  const shownSnap = useMemo(
    () => (snapshot ? { ...snapshot, teams: applyFilters(snapshot.teams, filters, tasks).filter((t) => t.workers.length > 0) } : snapshot),
    [snapshot, filters, tasks]);
  const layout = useMemo(() => computeLayout(shownSnap, showAll), [shownSnap, showAll]);
  const hiddenTeams = shownSnap ? shownSnap.teams.length - visibleTeams(shownSnap, false).length : 0;
  const [jump, setJump] = useState<JumpReq | null>(null);
  const lsGet = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
  const lsSet = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* private mode */ } };
  const [dock, setDock] = useState<ChatDock>(() => { try { const v = localStorage.getItem("ao.chatDock"); return v === "left" || v === "right" ? v : "float"; } catch { return "float"; } });
  const setDockPersist = (d: ChatDock) => { setDock(d); try { localStorage.setItem("ao.chatDock", d); } catch { /* private mode */ } };
  const [locked, setLocked] = useState(() => lsGet("ao.zoomLock"));
  const [minimap, setMinimap] = useState(() => lsGet("ao.minimap"));
  const [zoom, setZoom] = useState<ZoomReq | null>(null);
  const [reset, setReset] = useState(0);
  const [warp, setWarp] = useState<Warp | null>(null);
  const view = useRef<ViewState>({ x: 0, z: 0, mode: "overview" });
  const getBots = useCallback(
    () => layout.desks.map((d) => { const r = roams.get(d.worker.id); return { x: r?.x ?? d.x, z: r?.z ?? d.z, color: stateColor(d.worker.state) }; }),
    [layout]);
  // Double-click a project area in overview: switch to walk mode and stand next to that project.
  const enterTeam = useCallback((area: TeamArea) => {
    setMode("walk");
    setJump((j) => ({ area, n: (j?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "v") setMode((m) => (m === "overview" ? "walk" : "overview"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chat = chatId ? <WorkerChat workerId={chatId} onClose={() => openChat(undefined)} dock={dock} onDock={setDockPersist} /> : null;
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", minHeight: 240 }}>
    {dock === "left" && chat && <div className="wc-dock">{chat}</div>}
    <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
      <Canvas frameloop={hidden ? "never" : "always"} dpr={[1, 2]} camera={{ position: [0, 40, 20], fov: 50, near: 0.1, far: 1000 }}>
        <Scene mode={mode} layout={layout} jump={jump} onNearby={setNearby} onEnter={enterTeam} ctl={{ zoom, reset, locked, warp, view }} />
      </Canvas>
      <ViewControls mode={mode} onMode={() => setMode((m) => (m === "overview" ? "walk" : "overview"))}
        onZoom={(factor) => setZoom((z) => ({ factor, n: (z?.n ?? 0) + 1 }))} onReset={() => setReset((n) => n + 1)}
        locked={locked} onLock={() => { lsSet("ao.zoomLock", !locked); setLocked(!locked); }}
        minimap={minimap} onMinimap={() => { lsSet("ao.minimap", !minimap); setMinimap(!minimap); }} />
      {minimap && <Minimap layout={layout} view={view} getBots={getBots} onGo={(x, z) => setWarp((w) => ({ x, z, n: (w?.n ?? 0) + 1 }))} />}
      <StatusLegend />
      <button onClick={clearBubbles} style={{ position: "absolute", top: 10, right: 10, padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Mark every speech bubble as read">Clear bubbles</button>
      <ProjectLegend layout={layout} hidden={hiddenTeams} showAll={showAll} onShowAll={setShowAll} onJump={(area) => setJump((j) => ({ area, n: (j?.n ?? 0) + 1 }))} />
      <div style={{ ...box, left: 10, bottom: 10 }}>
        <div><b>V</b> toggle overview / walk</div>
        <div>Overview: drag to orbit, scroll to zoom, <b>double-click</b> a project to walk in</div>
        <div>Walk: <b>WASD</b> or <b>click the floor</b> to move, <b>E</b> talk to the nearby bot, <b>Z</b> zap the closest bot, <b>scroll</b> to zoom</div>
        <div>Click a desk to talk to its bot</div>
      </div>
      {dock === "float" && chat && <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 5 }}>{chat}</div>}
      {nearby && (
        <div style={{ ...box, left: "50%", bottom: 24, transform: "translateX(-50%)", fontSize: 14 }}>
          Press <b>E</b> to talk to {nearby.title} · <b>Z</b> zap
        </div>
      )}
    </div>
    {dock === "right" && chat && <div className="wc-dock">{chat}</div>}
    </div>
  );
}
