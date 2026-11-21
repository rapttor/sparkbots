import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BoxGeometry, Color, CylinderGeometry, InstancedMesh, SphereGeometry, Sphere, Vector3,
  type Group, type Mesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Worker as BotWorker } from "../../server/adapters/types";
import { useStore } from "../state/store";
import { api, type SubagentInfo } from "../api";
import { useLive } from "../state/live";
import { DESK_D, DESK_W, PLAYER_RADIUS, deskBoxes, resolveMove } from "./collide";
import { DeskScreens } from "./screens";
import { SpeechBubbles } from "./bubbles";
import { AgentMenu, type SceneApi } from "./AgentMenu";
import { KeymapLegend, type KeyEntry } from "./KeymapLegend";
import { KEYMAP } from "./keymap";
import { viewState, type PanReq, type ViewState, type Warp, type ZoomReq } from "./controls3d";
import { applyFilters } from "../panels/teamFilters";
import { MAX_DESKS, computeLayout, visibleTeams, type Layout, type TeamArea } from "./layout";
import { nav, Flow, buildNav } from "./nav";
import { ZonesLayer } from "./zonelayer";
import { lunchAll, wakeAll, followerList, insideRoom, meeting, MAX_SEATS, setFollowers, startErrand, setPois } from "./roam";
import { roams, setLook, clearLook, player as playerState, pushPlayerOut } from "./roam";
import { ACTIONS } from "./actions";
import { Minibots } from "./minibots";
import { MANAGER_ID, requestCoffee, ServiceBots } from "./servicebots";
import { CoffeeFactory } from "./coffeefactory";
import { ManagerWalls } from "./walls";
import { nerd, sampleFrame } from "../state/nerd";
import { clearView, loadView, saveView } from "./viewDefault";
import { zoneIcon } from "./zones";
import { Labels, type LabelItem, type LabelsApi } from "./labels";
import { RoomMenu } from "./RoomMenu";
import { FxLayer } from "./fxlayer";
import { Icons } from "./icons";
import { ConferenceLayer } from "./conference";
import { FollowBar } from "./FollowBar";
import { MeetingChat } from "./MeetingChat";
import { NameTags } from "./nametags";
import { dummy, modeOf, poseBot, stepRoam, writeStatic, type Meshes } from "./bots";
import { StatusLegend } from "./legends";
import { onView } from "./viewBus";
import { nearestBot, nearestDesk, selectWorker, typing } from "./sceneUtils";

type Mode = "overview" | "walk";
interface Nearby { id: string; title: string }

const WALK_SPEED = 5, SPRINT_SPEED = 11, SPRINT_ACCEL = 1.8; // units per second; accel = how quickly the sprint builds up (higher = faster)
const WALK_PITCH = Math.atan2(4.5, 6.5); // default camera elevation behind the manager
const WALK_DIST = Math.hypot(4.5, 6.5);

interface JumpReq { area: TeamArea; n: number }

export interface AngleReq { dyaw: number; dpitch: number; n: number }
interface SceneCtl { onScreen: (i: number) => void; closeup: { i: number; n: number } | null; closeupExit: number; onCloseup: (on: boolean) => void; onReady: () => void; saveView: number; clearView: number; labels: { current: LabelsApi | null }; active: boolean; subs: Record<string, SubagentInfo[]>; tags: boolean; api: { current: SceneApi | null }; onPick: (id: string, x: number, y: number) => void; pan: PanReq | null; angle: AngleReq | null; zoom: ZoomReq | null; reset: number; locked: boolean; warp: Warp | null; view: { current: ViewState } }

function Scene({ mode, layout, jump, onNearby, onEnter, ctl }: { mode: Mode; layout: Layout; jump: JumpReq | null; onNearby: (n: Nearby | null) => void; onEnter: (a: TeamArea) => void; ctl: SceneCtl }) {
  const activeRef = useRef(ctl.active);
  activeRef.current = ctl.active;
  useEffect(() => { if (!ctl.active) keys.current.clear(); }, [ctl.active]); // a key held while you switched panels must not keep walking
  const lockedRef = useRef(ctl.locked);
  lockedRef.current = ctl.locked;
  const flight = useRef<{ t: number; fromC: Vector3; toC: Vector3; fromT: Vector3; toT: Vector3 } | null>(null);
  const layoutRef = useRef(layout);
  const boxes = useMemo(() => [
    ...deskBoxes(layout.desks),
    ...layout.zones.flatMap((z) => z.props.filter((p) => p.solid).map((p) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 }))),
  ], [layout]);
  // shared navigation + the spots idle robots can visit follow the layout
  useMemo(() => {
    nav.flow = new Flow(buildNav(layout, boxes)); setPois(layout.zones.flatMap((z) => z.pois));
    const c = layout.zones.find((z) => z.zone.id === "conference-room");
    meeting.room = c ? { x: c.x, z: c.z, w: c.w, d: c.d } : null;
  }, [layout, boxes]);
  useEffect(() => { setFollowers(useStore.getState().followers); return useStore.subscribe((s) => setFollowers(s.followers)); }, []);
  const animatedRef = useRef<number[]>([]);
  const meshesRef = useRef<Meshes | null>(null);
  const refs = {
    desk: useRef<InstancedMesh>(null), ring: useRef<InstancedMesh>(null), body: useRef<InstancedMesh>(null),
    legA: useRef<InstancedMesh>(null), legB: useRef<InstancedMesh>(null),
    visor: useRef<InstancedMesh>(null), antenna: useRef<InstancedMesh>(null), beacon: useRef<InstancedMesh>(null),
    codexHead: useRef<InstancedMesh>(null), codexBody: useRef<InstancedMesh>(null), codexVisor: useRef<InstancedMesh>(null), codexEyes: useRef<InstancedMesh>(null),
  };
  const { camera, gl } = useThree();
  const pick = (id: string, ev: MouseEvent) => { // popup position relative to the 3D view; shift+click = follow me / stop following
    if (ev.shiftKey) { useStore.getState().toggleFollower(id); return; }
    const r = gl.domElement.getBoundingClientRect();
    ctl.onPick(id, ev.clientX - r.left, ev.clientY - r.top);
  };
  const managerColor = useStore((s) => s.managerColor);
  const chatId = useStore((s) => s.chatId); // this worker runs to its desk and opens its laptop
  const fetchedRef = useRef(chatId);
  fetchedRef.current = chatId;
  const dest = useRef<Vector3 | null>(null); // click-to-move target (walk mode)
  const goTo = (pt: Vector3) => { if (modeRef.current === "walk") dest.current = new Vector3(pt.x, 0, pt.z); };
  const walkZoom = useRef(loadView()?.walk.zoom ?? 1); // 1 = default follow distance; scroll down zooms out, up zooms in
  const controls = useRef<{ target: Vector3; update: () => void } | null>(null);
  const framed = useRef(false);
  const player = useRef<Group>(null);
  const speedNow = useRef(5), stride = useRef(0);
  const readyOnce = useRef(false);
  const pLegA = useRef<Mesh>(null), pLegB = useRef<Mesh>(null), pArms = useRef<Mesh>(null); // the manager walks too
  const pos = useRef(new Vector3(0, 0, 12));
  const keys = useRef(new Set<string>());
  const nearbyId = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Shared geometries + materials (one material set).
  const assets = useMemo(() => {
    // Blocky pixel bot: body + four legs merged; arm bar (waves when done); two eye boxes (glow in the state color).
    const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const body = box(0.86, 0.58, 0.5, 0, 0, 0);
    // legs hang from their top (pivot at the body's underside) so they can swing; two diagonal pairs
    const leg = (x: number) => box(0.09, 0.22, 0.09, x, -0.11);
    const legsA = mergeGeometries([leg(-0.33), leg(0.18)])!;
    const legsB = mergeGeometries([leg(-0.18), leg(0.32)])!;
    const arms = box(1.15, 0.15, 0.2, 0, 0);
    const eyes = mergeGeometries([box(0.07, 0.14, 0.04, -0.255, 0), box(0.07, 0.14, 0.04, 0.255, 0)])!;
    // Codex pet: stepped cloud helmet, small body, dark terminal visor and cyan code-chevron eyes.
    const codexHead = mergeGeometries([
      box(0.82, 0.52, 0.52, 0, 0), box(0.58, 0.12, 0.52, 0, 0.31),
      box(0.96, 0.3, 0.52, 0, 0), box(0.16, 0.14, 0.52, -0.48, -0.04), box(0.16, 0.14, 0.52, 0.48, -0.04),
    ])!;
    const codexBody = box(0.48, 0.28, 0.38, 0, 0);
    const codexVisor = box(0.66, 0.28, 0.04, 0, 0);
    const chevron = (side: number) => mergeGeometries([
      box(0.055, 0.07, 0.025, side * 0.18, 0.07), box(0.055, 0.07, 0.025, side * 0.13, 0), box(0.055, 0.07, 0.025, side * 0.18, -0.07),
    ])!;
    const codexEyes = mergeGeometries([chevron(-1), chevron(1)])!;
    const mats = {
      solid: { color: "#e8ecf4", roughness: 0.55, metalness: 0.1 },
    };
    return {
      deskG: new BoxGeometry(DESK_W, 0.8, DESK_D),
      ringG: new CylinderGeometry(0.55, 0.55, 0.03, 24),
      bodyG: body, legAG: legsA, legBG: legsB,
      visorG: eyes,
      antennaG: arms,
      beaconG: new SphereGeometry(0.18, 12, 10),
      codexHeadG: codexHead, codexBodyG: codexBody, codexVisorG: codexVisor, codexEyesG: codexEyes,
      mats,
    };
  }, []);

  const frame = useCallback(() => {
    const l = layoutRef.current;
    const saved = loadView(); // the view you saved as your default wins
    if (saved) {
      camera.position.set(...saved.cam);
      if (controls.current) { controls.current.target.set(...saved.target); controls.current.update(); } else camera.lookAt(...saved.target);
      return;
    }
    // otherwise: look at the rooms in the middle (and the projects right around them), not the whole campus
    const zs = l.zones;
    const box = zs.length
      ? { minX: Math.min(...zs.map((z) => z.x - z.w / 2)), maxX: Math.max(...zs.map((z) => z.x + z.w / 2)), minZ: Math.min(...zs.map((z) => z.z - z.d / 2)), maxZ: Math.max(...zs.map((z) => z.z + z.d / 2)) }
      : { minX: l.minX, maxX: l.maxX, minZ: l.minZ, maxZ: l.maxZ };
    const span = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) + (zs.length ? 26 : 10);
    const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
    camera.position.set(cx, span * 0.85, cz + span * 0.3);
    if (controls.current) { controls.current.target.set(cx, 0, cz); controls.current.update(); }
    else camera.lookAt(cx, 0, cz);
  }, [camera]);

  useLayoutEffect(() => {
    layoutRef.current = layout;
    const r = refs;
    if (!r.desk.current || !r.ring.current || !r.body.current || !r.visor.current || !r.antenna.current || !r.legA.current || !r.legB.current || !r.beacon.current || !r.codexHead.current || !r.codexBody.current || !r.codexVisor.current || !r.codexEyes.current) return;
    meshesRef.current = {
      desk: r.desk.current, ring: r.ring.current, body: r.body.current, legA: r.legA.current, legB: r.legB.current,
      visor: r.visor.current, antenna: r.antenna.current, beacon: r.beacon.current,
      codexHead: r.codexHead.current, codexBody: r.codexBody.current, codexVisor: r.codexVisor.current, codexEyes: r.codexEyes.current,
    };
    // Clicks on instanced meshes are first tested against one cached bounding sphere. Robots wander, lie down and move away from
    // where they were when it was computed, so make it cover the whole campus: otherwise idle or sleeping robots cannot be clicked.
    for (const m of [r.desk.current, r.body.current, r.antenna.current]) m.boundingSphere = new Sphere(new Vector3(), 1e5);
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

  // Laptop close-up: fly to a spot right in front of the screen (the orbit limits are relaxed while we are there).
  type Orbit = { target: Vector3; update: () => void; minDistance: number; maxPolarAngle: number };
  const prevView = useRef<{ cam: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const c = ctl.closeup, o = controls.current as unknown as Orbit | null;
    if (!c || !o) return;
    const d = layoutRef.current.desks[c.i];
    if (!d) return;
    if (!prevView.current) prevView.current = { cam: camera.position.clone(), target: o.target.clone() };
    o.minDistance = 0.5; o.maxPolarAngle = Math.PI / 2.02;
    const screenAt = new Vector3(d.x, 1.36, d.z - 0.33);
    flight.current = { t: 0, fromC: camera.position.clone(), toC: new Vector3(screenAt.x, screenAt.y + 0.1, screenAt.z + 1.35), fromT: o.target.clone(), toT: screenAt };
    ctl.onCloseup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.closeup]);
  useEffect(() => {
    const o = controls.current as unknown as Orbit | null, p = prevView.current;
    if (!ctl.closeupExit || !o || !p) return;
    prevView.current = null;
    flight.current = { t: 0, fromC: camera.position.clone(), toC: p.cam, fromT: o.target.clone(), toT: p.target };
    setTimeout(() => { o.minDistance = 4; o.maxPolarAngle = Math.PI / 2.3; }, 900);
    ctl.onCloseup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.closeupExit]);

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
  // Walk view angle: yaw (turn around the manager) and pitch (camera height). Slight by design: limited ranges.
  const yaw = useRef(loadView()?.walk.yaw ?? 0), pitch = useRef(loadView()?.walk.pitch ?? WALK_PITCH);
  const turn = useCallback((dyaw: number, dpitch: number) => {
    yaw.current = Math.max(-1.3, Math.min(1.3, yaw.current + dyaw));
    pitch.current = Math.max(0.3, Math.min(1.2, pitch.current + dpitch));
  }, []);
  useEffect(() => {
    const a = ctl.angle;
    if (!a) return;
    if (modeRef.current === "walk") { turn(a.dyaw, a.dpitch); return; }
    const c = controls.current; // overview: orbit the camera around what it looks at (turn) and raise/lower it (tilt)
    if (!c) return;
    const off = camera.position.clone().sub(c.target);
    const len = off.length(), r = Math.hypot(off.x, off.z);
    const ang = Math.atan2(off.x, off.z) + a.dyaw;
    const el = Math.max(0.25, Math.min(1.35, Math.atan2(off.y, r) + a.dpitch));
    camera.position.set(c.target.x + Math.sin(ang) * Math.cos(el) * len, c.target.y + Math.sin(el) * len, c.target.z + Math.cos(ang) * Math.cos(el) * len);
    c.update();
  }, [ctl.angle, turn, camera]);
  useEffect(() => { // overview pan: slide the camera and its target over the floor, relative to the view direction
    const pn = ctl.pan, c = controls.current;
    if (!pn || !c || modeRef.current !== "overview") return;
    const off = camera.position.clone().sub(c.target);
    const dist = off.length();
    const fx = -off.x, fz = -off.z, fl = Math.hypot(fx, fz) || 1; // forward on the ground
    const gx = fx / fl, gz = fz / fl;                 // ground forward; ground right is (-gz, gx)
    const dx = gx * pn.forward - gz * pn.right, dz = gz * pn.forward + gx * pn.right;
    const k = dist * 0.8;
    c.target.x += dx * k; c.target.z += dz * k;
    camera.position.x += dx * k; camera.position.z += dz * k;
    c.update();
  }, [ctl.pan, camera]);
  useEffect(() => { // right mouse button drag changes the angle
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { if (e.button === 2 && modeRef.current === "walk") { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); } };
    const move = (e: PointerEvent) => { if (!drag) return; turn(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004); drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; };
    const menu = (e: Event) => { if (modeRef.current === "walk") e.preventDefault(); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("contextmenu", menu);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("contextmenu", menu); };
  }, [gl, turn]);
  useEffect(() => {
    if (ctl.reset > 0) {
      const w = loadView()?.walk;
      walkZoom.current = w?.zoom ?? 1; yaw.current = w?.yaw ?? 0; pitch.current = w?.pitch ?? WALK_PITCH;
      if (modeRef.current === "overview") frame();
    }
  }, [ctl.reset, frame]);
  useEffect(() => { // "Save as default view": remember the overview camera (when in overview) and the walk zoom / angle
    if (!ctl.saveView) return;
    const prev = loadView();
    const inOverview = modeRef.current === "overview" && controls.current;
    saveView({
      cam: inOverview ? [camera.position.x, camera.position.y, camera.position.z] : prev?.cam ?? [camera.position.x, camera.position.y, camera.position.z],
      target: inOverview ? [controls.current!.target.x, controls.current!.target.y, controls.current!.target.z] : prev?.target ?? [0, 0, 0],
      walk: { zoom: walkZoom.current, yaw: yaw.current, pitch: pitch.current },
    });
  }, [ctl.saveView, camera]);
  useEffect(() => { if (ctl.clearView) { clearView(); walkZoom.current = 1; yaw.current = 0; pitch.current = WALK_PITCH; if (modeRef.current === "overview") frame(); } }, [ctl.clearView, frame]);
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

  // Sleepers and parked robots are skipped by the frame loop; anything that needs them to move (an action, an errand, following) adds them back.
  const ensureAnimated = (id: string) => {
    const i = layoutRef.current.desks.findIndex((d) => d.worker.id === id);
    if (i >= 0 && !animatedRef.current.includes(i)) animatedRef.current = [...animatedRef.current, i];
  };
  useEffect(() => { // followers are always animated
    const wake = () => useStore.getState().followers.forEach(ensureAnimated);
    wake();
    return useStore.subscribe((s, p) => { if (s.followers !== p.followers) wake(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);
  // What the popup menu, the legend and the key handler can ask the scene to do (always about the current layout).
  useEffect(() => {
    const animate = ensureAnimated;
    ctl.api.current = {
      talk: () => { const d = nearestDesk(layoutRef.current, pos.current); if (d) selectWorker(d.worker.id); },
      act: (key, id) => {
        const a = ACTIONS.find((x) => x.key === key);
        const target = id ?? nearestBot(layoutRef.current, pos.current)?.worker.id;
        if (!a || !target) return;
        const w = layoutRef.current.desks.find((d) => d.worker.id === target)?.worker;
        if (a.kind === "real") { // real actions never run without the exact text being confirmed first
          if (!w || a.can?.(w) || !window.confirm(a.confirm!(w))) return;
          void Promise.resolve(a.run(target, w)).catch((e: Error) => window.alert(e.message));
          return;
        }
        a.run(target, w); animate(target);
      },
      sendTo: (id, poiId) => { if (startErrand(id, poiId, () => {}, 60_000)) animate(id); },
      archive: (id, done) => {
        // walk to the data room to file itself away; without one the archive happens at once
        if (!startErrand(id, "data-room:console", done)) done();
        else { const i = layoutRef.current.desks.findIndex((d) => d.worker.id === id); if (i >= 0 && !animatedRef.current.includes(i)) animatedRef.current = [...animatedRef.current, i]; }
      },
      look: (id, state, sit) => { if (state) { setLook(id, state, !!sit); animate(id); } else clearLook(id); },
    };
    return () => { ctl.api.current = null; };
  }, [ctl.api]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!activeRef.current || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (e.repeat) return; // holding a key must not fire an action (or a confirmation) over and over
      if (modeRef.current !== "walk") return;
      if (k === "e") ctl.api.current?.talk();
      else if (ACTIONS.some((a) => a.key === k)) ctl.api.current?.act(k);
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
    ctl.labels.current?.update(camera, gl.domElement.clientWidth, gl.domElement.clientHeight); // floating titles follow the camera
    if (!readyOnce.current) { readyOnce.current = true; ctl.onReady(); }
    sampleFrame(dt, state.clock.elapsedTime, gl.info);
    nerd.bots = roams.size;
    ctl.view.current.mode = modeRef.current;
    const mvx = pos.current.x - playerState.x, mvz = pos.current.z - playerState.z, mv = Math.hypot(mvx, mvz);
    if (mv > 0.002) { playerState.hx = mvx / mv; playerState.hz = mvz / mv; playerState.still = 0; } else playerState.still += dt; // followers trail, then huddle
    playerState.on = modeRef.current === "walk"; playerState.x = pos.current.x; playerState.z = pos.current.z;
    meeting.count = meeting.room && followerList().length && insideRoom(meeting.room, pos.current.x, pos.current.z) ? Math.min(followerList().length, MAX_SEATS) : 0;
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
      m.codexHead.instanceMatrix.needsUpdate = true;
      m.codexBody.instanceMatrix.needsUpdate = true;
      m.codexVisor.instanceMatrix.needsUpdate = true;
      m.codexEyes.instanceMatrix.needsUpdate = true;
      m.visor.instanceMatrix.needsUpdate = true;
      m.antenna.instanceMatrix.needsUpdate = true;
      m.legA.instanceMatrix.needsUpdate = true;
      m.legB.instanceMatrix.needsUpdate = true;
      m.beacon.instanceMatrix.needsUpdate = true;
    }

    if (modeRef.current !== "walk") {
      if (nearbyId.current) { nearbyId.current = null; onNearby(null); }
      return;
    }
    const ks = keys.current;
    let dx = (ks.has("d") || ks.has("arrowright") ? 1 : 0) - (ks.has("a") || ks.has("arrowleft") ? 1 : 0);
    let dz = (ks.has("s") || ks.has("arrowdown") ? 1 : 0) - (ks.has("w") || ks.has("arrowup") ? 1 : 0);
    if (dx !== 0 || dz !== 0) { // keys move relative to the camera: W is always "away from the camera"
      const c = Math.cos(yaw.current), sn = Math.sin(yaw.current);
      [dx, dz] = [dx * c + dz * sn, -dx * sn + dz * c];
    }
    const p = pos.current;
    const g = player.current;
    if (dx !== 0 || dz !== 0) dest.current = null; // keyboard cancels click-to-move
    else if (dest.current) {
      const tx = dest.current.x - p.x, tz = dest.current.z - p.z, dist = Math.hypot(tx, tz);
      if (dist < 0.2) dest.current = null; else { dx = tx / dist; dz = tz / dist; }
    }
    // Holding Shift sprints: the speed builds up smoothly from walking pace towards a top speed, and drops back when you stop.
    const moving = dx !== 0 || dz !== 0;
    const want = moving && ks.has("shift") ? SPRINT_SPEED : WALK_SPEED;
    if (!moving) speedNow.current = WALK_SPEED;
    else speedNow.current += (want - speedNow.current) * (1 - Math.exp(-(want > speedNow.current ? SPRINT_ACCEL : 9) * dt));
    const spd = speedNow.current;
    if (moving) {
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      const l = layoutRef.current;
      const r = resolveMove(
        p,
        { x: Math.min(l.maxX + 6, Math.max(l.minX - 6, p.x + dx * spd * dt)), z: Math.min(l.maxZ + 8, Math.max(l.minZ - 6, p.z + dz * spd * dt)) },
        boxes, PLAYER_RADIUS,
      );
      const moved = Math.hypot(r.x - p.x, r.z - p.z);
      p.x = r.x; p.z = r.z;
      pushPlayerOut(p);
      if (dest.current && moved < spd * dt * 0.25) dest.current = null; // blocked by a desk: stop
      if (g) g.rotation.y = Math.atan2(-dx, -dz);
    }
    // the manager's own walk cycle: legs swing in diagonal pairs, hands seesaw; eases back to rest when standing
    const walking = dx !== 0 || dz !== 0;
    stride.current += dt * 11 * (spd / WALK_SPEED); // faster legs when sprinting
    const ph = stride.current;
    const sw = walking ? Math.sin(ph) * 0.85 : 0;
    const ease = 1 - Math.exp(-14 * dt);
    if (pLegA.current && pLegB.current && pArms.current) {
      pLegA.current.rotation.x += (sw - pLegA.current.rotation.x) * ease;
      pLegB.current.rotation.x += (-sw - pLegB.current.rotation.x) * ease;
      pArms.current.rotation.z += ((walking ? -Math.sin(ph) * 0.6 : 0) - pArms.current.rotation.z) * ease;
    }
    if (g) g.position.copy(p);
    const z = walkZoom.current;
    const D = WALK_DIST * z * (1 + ((spd - WALK_SPEED) / (SPRINT_SPEED - WALK_SPEED)) * 0.15), ce = Math.cos(pitch.current); // the camera drops back a little when sprinting
    camera.position.lerp(dummy.position.set(p.x + Math.sin(yaw.current) * ce * D, Math.sin(pitch.current) * D, p.z + Math.cos(yaw.current) * ce * D), 1 - Math.exp(-6 * dt));
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
        </group>
      ))}

      <instancedMesh ref={refs.desk} args={[assets.deskG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined;
          if (d) pick(d.worker.id, e.nativeEvent);
        }}>
        <meshStandardMaterial color="#3a4256" roughness={0.8} />
      </instancedMesh>
      <ZonesLayer layout={layout} onZone={(id) => { if (id === "data-room") useStore.getState().setPanel("data"); }} />
      <ConferenceLayer layout={layout} />
      <DeskScreens layout={layout} openId={chatId} onScreen={ctl.onScreen} />
      <FxLayer />
      <Icons />
      <Minibots layout={layout} subs={ctl.subs} />
      <CoffeeFactory layout={layout} />
      <ServiceBots layout={layout} />
      <ManagerWalls layout={layout} onOpenBoard={() => useStore.getState().setPanel("board")} onOpenNotes={() => useStore.getState().setPanel("notes")} />
      {ctl.tags && <NameTags layout={layout} getCenter={() => (modeRef.current === "walk" ? pos.current : controls.current?.target ?? pos.current)} />}
      <SpeechBubbles layout={layout} getPos={(id) => roams.get(id)} />
      <instancedMesh ref={refs.ring} args={[assets.ringG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.body} args={[assets.bodyG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.legA} args={[assets.legAG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.legB} args={[assets.legBG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.antenna} args={[assets.antennaG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.visor} args={[assets.visorG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.codexHead} args={[assets.codexHeadG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.codexBody} args={[assets.codexBodyG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial {...assets.mats.solid} />
      </instancedMesh>
      <instancedMesh ref={refs.codexVisor} args={[assets.codexVisorG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.3} metalness={0.15} />
      </instancedMesh>
      <instancedMesh ref={refs.codexEyes} args={[assets.codexEyesG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.beacon} args={[assets.beaconG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Player bot (walk mode only) */}
      <group ref={player} visible={mode === "walk"}>
        <mesh geometry={assets.bodyG} position={[0, 0.6, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
        <mesh ref={pLegA} geometry={assets.legAG} position={[0, 0.31, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
        <mesh ref={pLegB} geometry={assets.legBG} position={[0, 0.31, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
        <mesh geometry={assets.visorG} position={[0, 0.67, -0.255]}><meshBasicMaterial color="#7dffb0" toneMapped={false} /></mesh>
        <mesh ref={pArms} geometry={assets.antennaG} position={[0, 0.53, 0]}><meshStandardMaterial {...assets.mats.solid} color={managerColor} /></mesh>
      </group>

      {mode === "overview" && (
        <OrbitControls ref={controls as never} makeDefault enableDamping enableZoom={!ctl.locked} minPolarAngle={0} maxPolarAngle={Math.PI / 2.3}
          minDistance={4} maxDistance={Math.max(60, floor)} />
      )}
    </>
  );
}


const box: React.CSSProperties = {
  position: "absolute", padding: "8px 10px", background: "rgba(10,12,20,0.78)", color: "#dfe6ff",
  font: "12px/1.5 system-ui, sans-serif", borderRadius: 6, pointerEvents: "none",
};

/** `active` = the 3D office is the panel on screen. It stays mounted while you look at other panels, so the camera, zoom,
 *  position, followers and open chats are exactly as you left them; while inactive it draws nothing and ignores keys. */
export default function World({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<Mode>("overview");
  const [hidden, setHidden] = useState(() => document.hidden);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const snapshot = useStore((st) => st.snapshot);
  const chatId = useStore((st) => st.chatId);
  const openChat = useStore((st) => st.openChat);
  const markAllSeen = useStore((st) => st.markAllSeen);
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
  // other panels ask the camera to go somewhere: "fly to this agent / project" (Teams, Control Room, search results)
  const focus = useStore((st) => st.focus);
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === "point") { if (focus.x !== undefined && focus.z !== undefined) setWarp((w) => ({ x: focus.x!, z: focus.z!, n: (w?.n ?? 0) + 1 })); return; }
    if (focus.kind === "agent") {
      const d = layout.desks.find((x) => x.worker.id === focus.id);
      if (d) setJump((j) => ({ area: { name: d.worker.title, x: d.x, z: d.z, w: 5, d: 5, color: d.color }, n: (j?.n ?? 0) + 1 }));
    } else {
      const a = layout.areas.find((x) => x.name === focus.id);
      if (a) setJump((j) => ({ area: a, n: (j?.n ?? 0) + 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  // floating titles: one per project and per room / leisure area; clicking one takes you there
  const labelItems = useMemo<LabelItem[]>(() => [
    ...layout.areas.map((a): LabelItem => ({ id: `p:${a.name}`, name: a.name, x: a.x, z: a.z, y: 3.2, color: `#${a.color.getHexString()}`, kind: "project", area: a })),
    ...layout.zones.map(({ zone, x, z, w, d }): LabelItem => ({
      id: `z:${zone.id}`, name: `${zoneIcon(zone)} ${zone.name}`, x, z, y: 3.6, color: "#7a869c", kind: "room", poiId: zone.pois[0] ? `${zone.id}:${zone.pois[0].id}` : undefined,
      area: { name: zone.name, x, z, w, d, color: new Color(zone.floor) },
    })),
  ], [layout]);
  useEffect(() => { nerd.labels = labelItems.length; }, [labelItems]);
  const lsGet = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
  const lsSet = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* private mode */ } };
  const [locked, setLocked] = useState(() => lsGet("ao.zoomLock"));
  const [zoom, setZoom] = useState<ZoomReq | null>(null);
  const [reset, setReset] = useState(0);
  const [saveN, setSaveN] = useState(0);
  // Click a laptop screen: the camera flies right in front of it so you can read it; "Back" (or Esc) returns.
  const [closeup, setCloseup] = useState<{ i: number; n: number } | null>(null);
  const [closeupExit, setCloseupExit] = useState(0);
  const [inCloseup, setInCloseup] = useState(false);
  const startCloseup = (i: number) => {
    const go = () => setCloseup((c) => ({ i, n: (c?.n ?? 0) + 1 }));
    if (mode === "walk") { setMode("overview"); setTimeout(go, 250); } else go();
  };
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [clearN, setClearN] = useState(0);
  const [hasDefault, setHasDefault] = useState(() => loadView() !== null);
  const [angle, setAngle] = useState<AngleReq | null>(null);
  const [pan, setPan] = useState<PanReq | null>(null);
  const sceneApi = useRef<SceneApi | null>(null);
  const labelsApi = useRef<LabelsApi | null>(null);
  const [subs, setSubs] = useState<Record<string, SubagentInfo[]>>({});
  useLive(async () => { try { setSubs(await api.subagents()); } catch { /* ignore */ } }, ["subagents"]);
  const [tags, setTags] = useState(() => lsGet("ao.nametags"));
  const showKeymap = useStore((st) => st.showKeymap);
  const showStatusCounts = useStore((st) => st.showStatusCounts);
  const setShowKeymap = useStore((st) => st.setShowKeymap);
  const frame = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [roomMenu, setRoomMenu] = useState<{ item: LabelItem; x: number; y: number } | null>(null);
  const allWorkers = useMemo(() => snapshot?.teams.flatMap((t) => t.workers) ?? [], [snapshot]);
  const onPick = useCallback((id: string, x: number, y: number) => setMenu({ id, x, y }), []);
  const menuWorker = menu ? snapshot?.teams.flatMap((t) => t.workers).find((x) => x.id === menu.id) : undefined;
  const [warp, setWarp] = useState<Warp | null>(null);
  const view = useRef<ViewState>(viewState);
  // Double-click a project area in overview: switch to walk mode and stand next to that project.
  const enterTeam = useCallback((area: TeamArea) => {
    setMode("walk");
    setJump((j) => ({ area, n: (j?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    const t = setInterval(vis, 1500); // some embedded panes never send visibilitychange: do not stay frozen
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); clearInterval(t); };
  }, []);

  // One list of things the keyboard (and the clickable keymap) can do from here.
  const toggleMode = () => setMode((m) => (m === "overview" ? "walk" : "overview"));
  const openMap = () => useStore.getState().setPanel("map"); // the minimap lives in the Map tab
  const toggleLock = () => { lsSet("ao.zoomLock", !locked); setLocked(!locked); };
  const resetView = () => setReset((n) => n + 1);
  const closeOverlays = () => { if (inCloseup) setCloseupExit((n) => n + 1); else if (menu) setMenu(null); else if (chatId) openChat(undefined); };
  const toggleTags = () => { lsSet("ao.nametags", !tags); setTags(!tags); };
  // the View and Projects panels (in the dock) drive the office through this bus; the office mirrors its state back for them
  const busRef = useRef<(c: import("./viewBus").ViewCmd) => void>(() => {});
  busRef.current = (c) => {
    if (c.t === "mode") setMode((m) => c.mode ?? (m === "overview" ? "walk" : "overview"));
    else if (c.t === "zoom") setZoom((z) => ({ factor: c.factor, n: (z?.n ?? 0) + 1 }));
    else if (c.t === "pan") setPan((q) => ({ right: c.right, forward: c.forward, n: (q?.n ?? 0) + 1 }));
    else if (c.t === "angle") setAngle((a) => ({ dyaw: c.dyaw, dpitch: c.dpitch, n: (a?.n ?? 0) + 1 }));
    else if (c.t === "reset") setReset((n) => n + 1);
    else if (c.t === "lock") toggleLock();
    else if (c.t === "tags") toggleTags();
    else if (c.t === "saveDefault") { setSaveN((n) => n + 1); setTimeout(() => setHasDefault(loadView() !== null), 100); }
    else if (c.t === "clearDefault") { setClearN((n) => n + 1); setHasDefault(false); }
    else if (c.t === "showAll") setShowAll(c.on);
    else if (c.t === "animate") c.ids.forEach((id) => sceneApi.current?.look(id, "idle"));
  };
  useEffect(() => onView((c) => busRef.current(c)), []);
  useEffect(() => { useStore.getState().setViewInfo({ mode, locked, hasDefault, tags, showAll }); }, [mode, locked, hasDefault, tags, showAll]);
  const clearFollowers = useStore((st) => st.clearFollowers);
  const meetingOpen = useStore((st) => st.meetingOpen);
  const setMeetingOpen = useStore((st) => st.setMeetingOpen);
  const nFollowers = useStore((st) => st.followers.length);
  // group moves: rally every waiting agent round you, wake every sleeper, send the idle ones to lunch
  const ids = (pred: (w: BotWorker) => boolean) => layout.desks.filter((d) => pred(d.worker)).map((d) => d.worker.id);
  const rallying = useStore((st) => st.followers.length > 0 && st.followers.every((f) => layout.desks.find((d) => d.worker.id === f)?.worker.state === "waiting"));
  const rally = () => { if (rallying) clearFollowers(); else useStore.getState().setFollowers(ids((w) => w.state === "waiting")); };
  const wakeEveryone = () => { const a = ids((w) => w.state === "asleep"); wakeAll(a); a.forEach((id) => sceneApi.current?.look(id, "idle")); };
  const lunch = () => { lunchAll(ids((w) => w.state === "idle")); };
  const orderCoffee = () => { requestCoffee(MANAGER_ID); };
  const hotkeys = { o: orderCoffee, r: rally, u: wakeEveryone, i: lunch, x: clearFollowers, q: () => setMeetingOpen(!meetingOpen), v: toggleMode, m: openMap, l: toggleLock, t: toggleTags, "0": resetView };
  const hotRef = useRef(hotkeys); hotRef.current = hotkeys;
  const activeRef2 = useRef(active); activeRef2.current = active;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef2.current || typing(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      (hotRef.current as Record<string, (() => void) | undefined>)[e.key.toLowerCase()]?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const walking = mode === "walk";
  const nearWhy = !walking ? "Walk mode only" : !nearby ? "No agent close by" : null;
  const entries: KeyEntry[] = KEYMAP.map((def) => {
    const act = def.id.startsWith("action:") ? def.id.slice(7) : "";
    const run: Record<string, [() => void, string | null]> = {
      mode: [toggleMode, null], talk: [() => sceneApi.current?.talk(), nearWhy], minimap: [openMap, null],
      rally: [rally, ids((w) => w.state === "waiting").length || rallying ? null : "Nobody is waiting for you"],
      wake: [wakeEveryone, ids((w) => w.state === "asleep").length ? null : "Nobody is asleep"],
      lunch: [lunch, ids((w) => w.state === "idle").length ? null : "Nobody is idle"],
      coffee: [orderCoffee, layout.zones.some((z) => z.zone.id === "coffee-station") ? null : "There is no coffee station"],
      lock: [toggleLock, null], tags: [toggleTags, null], dismiss: [clearFollowers, nFollowers ? null : "Nobody is following you"],
      meeting: [() => setMeetingOpen(!meetingOpen), nFollowers ? null : "Nobody is following you"], reset: [resetView, null], esc: [closeOverlays, menu || chatId ? null : "Nothing is open"],
    };
    if (act) run[def.id] = [() => sceneApi.current?.act(act), nearWhy];
    const r = run[def.id];
    return { def, run: r?.[0], why: r?.[1] };
  });

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", minHeight: 240 }}>
    <div ref={frame} style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
      <Canvas onPointerMissed={() => { setMenu(null); setRoomMenu(null); }} frameloop={hidden || !active ? "never" : "always"} dpr={[1, 2]} camera={{ position: [0, 40, 20], fov: 50, near: 0.1, far: 1000 }}>
        <Scene mode={mode} layout={layout} jump={jump} onNearby={setNearby} onEnter={enterTeam} ctl={{ onScreen: startCloseup, closeup, closeupExit, onCloseup: setInCloseup, onReady, saveView: saveN, clearView: clearN, labels: labelsApi, active, subs, tags, api: sceneApi, onPick, pan, angle, zoom, reset, locked, warp, view }} />
      </Canvas>
      {showStatusCounts && <StatusLegend />}
      <button onClick={clearBubbles} style={{ position: "absolute", top: 10, right: 10, padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Mark every speech bubble as read">Clear bubbles</button>
      {!ready && <p className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0, pointerEvents: "none" }}>Building the office…</p>}
      <Labels apiRef={labelsApi} items={labelItems} onPick={(it, cx, cy) => {
        const r = frame.current?.getBoundingClientRect();
        setMenu(null); setRoomMenu({ item: it, x: cx - (r?.left ?? 0), y: cy - (r?.top ?? 0) + 12 });
      }} />
      {roomMenu && (
        <RoomMenu item={roomMenu.item} x={Math.max(4, Math.min(roomMenu.x, (frame.current?.clientWidth ?? 800) - 262))} y={Math.max(4, Math.min(roomMenu.y, (frame.current?.clientHeight ?? 600) - 340))}
          workers={roomMenu.item.kind === "project" ? allWorkers.filter((w) => w.team === roomMenu.item.area.name) : []} everyone={allWorkers}
          scene={sceneApi.current ?? { talk() {}, act() {}, look() {}, sendTo() {}, archive: (_id, done) => done() }}
          onGo={() => setJump((j) => ({ area: roomMenu.item.area, n: (j?.n ?? 0) + 1 }))} onClose={() => setRoomMenu(null)} />
      )}
      {inCloseup && <button className="closeup-back" onClick={() => setCloseupExit((n) => n + 1)}>← Back to the office</button>}
      <FollowBar />
      {meetingOpen && <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 6 }}><MeetingChat onClose={() => setMeetingOpen(false)} /></div>}
      {showKeymap && <KeymapLegend entries={entries} onHide={() => setShowKeymap(false)} />}
      {menu && menuWorker && (
        <AgentMenu worker={menuWorker} scene={sceneApi.current ?? { talk() {}, act() {}, look() {}, sendTo() {}, archive: (_id, done) => done() }} onClose={() => setMenu(null)}
          x={Math.max(4, Math.min(menu.x + 6, (frame.current?.clientWidth ?? 800) - 262))} y={Math.max(4, Math.min(menu.y, (frame.current?.clientHeight ?? 600) - 330))} />
      )}
      {nearby && (
        <div style={{ ...box, left: "50%", bottom: 24, transform: "translateX(-50%)", fontSize: 14 }}>
          Press <b>E</b> to talk to {nearby.title} · <b>Z</b> zap
        </div>
      )}
    </div>
    </div>
  );
}

