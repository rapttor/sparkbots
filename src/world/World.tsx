import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BoxGeometry, Color, CylinderGeometry, DoubleSide, InstancedMesh, Plane, Raycaster, SphereGeometry, Sphere, Vector2, Vector3,
  type Group, type Mesh, type PerspectiveCamera,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Worker as BotWorker } from "../../server/adapters/types";
import { useStore } from "../state/store";
import { api, type SubagentInfo } from "../api";
import { useLive } from "../state/live";
import { DESK_D, DESK_W, PLAYER_RADIUS, resolveMove } from "./collide";
import { advance, fitDistance, flyDurationFor, maxZoomDistance, pairSpot, REDUCED_MAX, smooth, worldPerPixel } from "./camera";
import { getAvatar, sparkParts, type PartRefs, type PoseClip } from "./avatar";
import { avatarTextures } from "./avatarTextures";
import { DeskScreens } from "./screens";
import { SpeechBubbles } from "./bubbles";
import { AgentMenu, type SceneApi } from "./AgentMenu";
import { KeymapLegend, type KeyEntry } from "./KeymapLegend";
import { KEYMAP } from "./keymap";
import { Minimap, viewState, type PanReq, type ViewState, type Warp, type ZoomReq } from "./controls3d";
import { applyFilters } from "../panels/teamFilters";
import { MAX_DESKS, computeLayout, visibleTeams, type Layout, type TeamArea } from "./layout";
import { nav, Flow, buildNav } from "./nav";
import { ZonesLayer } from "./zonelayer";
import { lunchAll, followerList, insideRoom, meeting, MAX_SEATS, setFollowers, startErrand, setPois, rebuildRoamGrid } from "./roam";
import { useShowDesks } from "../state/deskPref";
import { avatarScreen } from "./occlusion";
import { PerformPicker, usePerform } from "./PerformPicker";
import { Windshield } from "./games/race/Windshield";
import { managerAt, roams, setLook, clearLook, player as playerState, pushPlayerOut, holdAgent, releaseAgent } from "./roam";
import { tarsParts } from "./tars";
import { ACTIONS } from "./actions";
import { Minibots } from "./minibots";
import { useNarrow } from "../dock/useLayout";
import { dockVisible } from "../state/dock";
import { MANAGER_ID, requestCoffee, ServiceBots } from "./servicebots";
import { CoffeeFactory } from "./coffeefactory";
import { Cubicles } from "./cubicles";
import { RoomsContent } from "./rooms/RoomsContent";
import { smashCtl } from "./rooms/smashControl";
import { DataCenter, consoleSpot, openDataRoom } from "./datacenter";
import { TeleportFx, playBeam } from "./teleport";
import { nearestFree, roomCenter, travelMode } from "./goto";
import { GamesLayer, GamesHud } from "./games/GamesLayer";
import { ClawLayer } from "./games/ClawLayer";
import { RaceLayer } from "./games/race/RaceLayer";
import { raceCam } from "./games/race/cam";
import { raceHub } from "./games/race/RaceLayer";
import { ManagerWalls } from "./walls";
import { nerd, sampleFrame } from "../state/nerd";
import { clearView, loadFlyPrefs, loadView, saveView } from "./viewDefault";
import { zoneIcon } from "./zones";
import { Labels, type LabelItem, type LabelsApi } from "./labels";
import { RoomMenu } from "./RoomMenu";
import { FxLayer } from "./fxlayer";
import { Icons } from "./icons";
import { ConferenceLayer } from "./conference";
import { FollowBar } from "./FollowBar";
import { MeetingChat } from "./MeetingChat";
import { SimChatBubbles } from "../simchat/SimChat";
import { NameTags } from "./nametags";
import { dummy, modeOf, poseBot, stepRoam, writeStatic, type Meshes } from "./bots";
import { onView } from "./viewBus";
import { nearestBot, selectWorker, typing } from "./sceneUtils";

type Mode = "overview" | "walk";
interface Nearby { id: string; title: string }

const WALK_SPEED = 5, SPRINT_SPEED = 11, SPRINT_ACCEL = 1.8; // units per second; accel = how quickly the sprint builds up (higher = faster)
// One continuous camera: zoom in = first-person (behind the character/hand), zoom out = near top-down overview.
const DIST_IN = 3.2; // camera distance at max zoom in; max zoom out comes from the campus bounds (maxZoomDistance, 13.1.4)
const PITCH_IN = 0.1, PITCH_OUT = 1.5; // tilt at max zoom in (nearly flat) / max zoom out (near top-down)
const tmpAv = new Vector3(); // scratch for the avatar's screen rectangle
const DEFAULT_ZOOM_T = 0.32; // the "story" angle: behind you, a bit low
const startMode = (): "saved" | "plaza" => { try { return localStorage.getItem("ao.startMode") === "plaza" ? "plaza" : "saved"; } catch { return "saved"; } };
const CALL_RADIUS = 2.5;  // an agent farther than this from its desk is "away": clicking the desk calls it
const CALL_MS = 5 * 60_000; // a called agent stays at its desk this long (menu: "Back to the real status" releases it)
const HAND_DIST = 16; // kept for the hand's world-per-pixel speed; zoom uses the same DIST_IN..DIST_OUT curve
// At the far end of the zoom the camera is near top-down and the room slabs z-fight at that distance. From here on,
// hide the 3D world and leave only the project titles (stacked as usual) so picking a project is calm and reliable.
const OVERVIEW_ZOOM = 0.8, OVERVIEW_EXIT = 0.76; // hysteresis so scrolling around the threshold does not strobe
const SIM_STEP = 1 / 30; // bots and their matrices are ticked at ~30 Hz, not once per (possibly 120 Hz) render

interface JumpReq { area: TeamArea; n: number }

export interface AngleReq { dyaw: number; dpitch: number; n: number }
interface SceneCtl { onScreen: (i: number) => void; closeup: { i: number; n: number } | null; closeupExit: number; onCloseup: (on: boolean) => void; onReady: () => void; saveView: number; clearView: number; labels: { current: LabelsApi | null }; active: boolean; subs: Record<string, SubagentInfo[]>; tags: boolean; api: { current: SceneApi | null }; onPick: (id: string, x: number, y: number) => void; pan: PanReq | null; angle: AngleReq | null; zoom: ZoomReq | null; reset: number; locked: boolean; warp: Warp | null; view: { current: ViewState }; skipFrame: { current: boolean }; closeupWalk: { current: boolean }; handZoomCmd: { save: number; restore: number }; handMenuOpen: { current: boolean }; onOverview: (on: boolean) => void }

function Scene({ mode, layout, jump, onNearby, onEnter, ctl }: { mode: Mode; layout: Layout; jump: JumpReq | null; onNearby: (n: Nearby | null) => void; onEnter: (a: TeamArea) => void; ctl: SceneCtl }) {
  const activeRef = useRef(ctl.active);
  activeRef.current = ctl.active;
  useEffect(() => { if (!ctl.active) keys.current.clear(); }, [ctl.active]); // a key held while you switched panels must not keep walking
  const lockedRef = useRef(ctl.locked);
  lockedRef.current = ctl.locked;
  // One tween for every camera move: position + look target, never a snap. `done` runs when it lands.
  const flight = useRef<{ t: number; duration: number; fromC: Vector3; toC: Vector3; fromT: Vector3; toT: Vector3; done?: () => void } | null>(null);
  const look = useRef(new Vector3(0, 0, 0)); // where the camera looks in walk mode (no OrbitControls there)
  const playerInit = useRef(false);
  const layoutRef = useRef(layout);
  const boxes = useMemo(() => [
    // desks are NOT obstacles: you and the robots walk straight through them (only room furniture blocks)
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
  const simAccum = useRef(0); // seconds since the last bot tick (see SIM_STEP)
  const bossTimer = useRef(5); // seconds until the next "boss is coming" few nearby sleepers wake up
  const bossAt = useRef(new Vector3(0, 0, 0));
  const meshesRef = useRef<Meshes | null>(null);
  const showDesks = useShowDesks();
  const refs = {
    desk: useRef<InstancedMesh>(null), ring: useRef<InstancedMesh>(null), body: useRef<InstancedMesh>(null),
    legA: useRef<InstancedMesh>(null), legB: useRef<InstancedMesh>(null),
    visor: useRef<InstancedMesh>(null), antenna: useRef<InstancedMesh>(null), beacon: useRef<InstancedMesh>(null),
    codexHead: useRef<InstancedMesh>(null), codexBody: useRef<InstancedMesh>(null), codexVisor: useRef<InstancedMesh>(null), codexEyes: useRef<InstancedMesh>(null),
    tarsFrame: useRef<InstancedMesh>(null), tarsSide: useRef<InstancedMesh>(null), tarsFace: useRef<InstancedMesh>(null),
  };
  const { camera, gl, size } = useThree();
  // The dock floats over the scene (it never resizes the view); the camera slides its view window so the scene centre stays in the free area.
  const dockState = useStore((st) => st.dock);
  const narrowNow = useNarrow();
  const viewShift = useRef(0);
  useFrame((_, dt) => {
    const cam = camera as PerspectiveCamera;
    const want = !narrowNow && dockVisible(dockState) ? (dockState.side === "right" ? 1 : -1) * dockState.width / 2 : 0;
    const cur = viewShift.current + (want - viewShift.current) * (1 - Math.exp(-8 * Math.min(dt, 0.1)));
    viewShift.current = Math.abs(cur - want) < 0.5 ? want : cur;
    if (viewShift.current === 0) { if (cam.view?.enabled) cam.clearViewOffset(); }
    else cam.setViewOffset(size.width, size.height, viewShift.current, 0, size.width, size.height);
  });
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
  const goTo = (pt: Vector3) => {
    if (modeRef.current !== "walk" || smashCtl.active) return; // smashing in the anger room: you are the weapon, floor clicks do nothing
    if (controllerRef.current === "hand") { handPos.current.set(pt.x, 0, pt.z); clampHand(); return; }
    dest.current = new Vector3(pt.x, 0, pt.z);
  };
  const distOut = useRef(200); distOut.current = maxZoomDistance(layout); // max zoom-out from the campus bounds (13.1.4)
  // One zoom value drives both distance and tilt: 0 = first-person, 1 = near top-down overview.
  const zoomT = useRef((() => { try { const v = Number(localStorage.getItem("ao.camZoom")); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_ZOOM_T; } catch { return DEFAULT_ZOOM_T; } })());
  const [labelsOnly, setLabelsOnly] = useState(() => zoomT.current >= OVERVIEW_ZOOM);
  useEffect(() => { ctl.onOverview(labelsOnly); }, [labelsOnly, ctl.onOverview]);
  // Centre of everything drawn (areas + rooms), so the top view can line the whole office up on screen.
  const overviewCenter = useMemo(() => {
    let minX = layout.minX, maxX = layout.maxX, minZ = layout.minZ, maxZ = layout.maxZ;
    for (const a of layout.areas) { minX = Math.min(minX, a.x - a.w / 2); maxX = Math.max(maxX, a.x + a.w / 2); minZ = Math.min(minZ, a.z - a.d / 2); maxZ = Math.max(maxZ, a.z + a.d / 2); }
    for (const z of layout.zones) { minX = Math.min(minX, z.x - z.w / 2); maxX = Math.max(maxX, z.x + z.w / 2); minZ = Math.min(minZ, z.z - z.d / 2); maxZ = Math.max(maxZ, z.z + z.d / 2); }
    return new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  }, [layout]);
  const overviewCenterRef = useRef(overviewCenter);
  overviewCenterRef.current = overviewCenter;
  const wasLabelsOnly = useRef(labelsOnly);
  const aligning = useRef(labelsOnly); // true while entering the top view: turn the map back to a straight-on angle
  const yaw = useRef(loadView()?.walk.yaw ?? 0);
  const controls = useRef<{ target: Vector3; update: () => void; enabled?: boolean } | null>(null);
  const frozen = useRef(false); // true during a laptop close-up: the follow camera is paused
  const framed = useRef(false);
  const player = useRef<Group>(null);
  const speedNow = useRef(5), stride = useRef(0);
  const readyOnce = useRef(false);
  const avatarId = useStore((s) => s.avatar); // owner character (13.1.1)
  const devLook = useStore((s) => s.devLook); // developer options (top, logo, glasses, beard, ...)
  const avatar = useMemo(() => getAvatar(avatarId, devLook), [avatarId, devLook]);
  const geoms = useMemo(() => avatar.build(), [avatar]);
  const tex = useMemo(() => avatarTextures(avatar, managerColor, devLook.topColor), [avatar, managerColor, devLook.topColor]);
  const handGeo = useMemo(() => { // a big blocky hand: palm, four fingers, a thumb
    const b = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const finger = (x: number) => b(0.12, 0.45, 0.12, x, -0.3, -0.04);
    return mergeGeometries([b(0.7, 0.16, 0.6), finger(-0.22), finger(-0.07), finger(0.08), finger(0.23), b(0.14, 0.35, 0.14, -0.42, -0.15, 0.06)])!;
  }, []);
  const partRefs = useRef<PartRefs>({}); // the owner's parts, posed per clip each frame
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // Hand controller: a floating hand at a ground point; the camera always centres on it.
  const controller = useStore((s) => s.controller);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const handPos = useRef(new Vector3(0, 0, 0));
  const handInit = useRef(false);
  const zoomSaved = useRef((() => { try { const v = Number(localStorage.getItem("ao.camZoomSaved")); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_ZOOM_T; } catch { return DEFAULT_ZOOM_T; } })());
  const handGroup = useRef<Group>(null);
  const clampHand = () => {
    const l = layoutRef.current;
    handPos.current.x = Math.min(l.maxX + 20, Math.max(l.minX - 20, handPos.current.x));
    handPos.current.z = Math.min(l.maxZ + 20, Math.max(l.minZ - 20, handPos.current.z));
  };
  const camFocus = useRef(new Vector3(0, 0, 0)); // what the hand-mode camera orbits; it dead-zone-follows the hand
  const clampFocus = () => {
    const l = layoutRef.current;
    camFocus.current.x = Math.min(l.maxX + 20, Math.max(l.minX - 20, camFocus.current.x));
    camFocus.current.z = Math.min(l.maxZ + 20, Math.max(l.minZ - 20, camFocus.current.z));
  };
  const raycaster = useMemo(() => new Raycaster(), []);
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const lastNdc = useRef<{ x: number; y: number } | null>(null); // cursor position (NDC) for edge-scrolling the camera
  /** Put the hand at the point under the mouse on the floor, so it follows the pointer like a cursor. */
  const handToGround = (clientX: number, clientY: number) => {
    const el = gl.domElement, r = el.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    lastNdc.current = { x: ndc.x, y: ndc.y };
    raycaster.setFromCamera(ndc, camera);
    const hit = new Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
    handPos.current.set(hit.x, 0, hit.z); clampHand();
  };
  const pos = useRef(new Vector3(0, 0, 12));
  const lastZoomPct = useRef(-1);
  const keys = useRef(new Set<string>());
  const nearbyId = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Shared geometries + materials (one material set).
  const assets = useMemo(() => {
    // Blocky pixel bot: body + four legs merged; arm bar (waves when done); two eye boxes (glow in the state color).
    const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
    const sp = sparkParts(); // shared with the owner avatar so the spark bot looks the same either way
    const { body, legsA, legsB, arms, visor: eyes } = sp;
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
    const tars = tarsParts();
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
      tarsFrameG: tars.frame, tarsSideG: tars.side, tarsFaceG: tars.face,
      mats,
    };
  }, []);

  /** Camera distance for the current zoom (0 = FPV, 1 = whole campus). */
  const zoomDist = useCallback((t = zoomT.current) => Math.exp(Math.log(DIST_IN) + (Math.log(distOut.current) - Math.log(DIST_IN)) * Math.min(1, Math.max(0, t))), []);

  /** The one camera pose for both controllers: centred on `focus`, tilted by the zoom (flat up close, top-down far out). */
  const officePose = useCallback((focus: Vector3, focusY: number) => {
    const t = Math.min(1, Math.max(0, zoomT.current));
    const D = zoomDist(t);
    const pitch = PITCH_IN + (PITCH_OUT - PITCH_IN) * Math.pow(t, 1.5); // starts rising as soon as you zoom out, eases into top-down
    const ce = Math.cos(pitch), ty = focusY * (1 - t); // pivot height: eye level up close, ground far out
    return {
      cam: new Vector3(focus.x + Math.sin(yaw.current) * ce * D, ty + Math.sin(pitch) * D, focus.z + Math.cos(yaw.current) * ce * D),
      target: new Vector3(focus.x, ty, focus.z),
    };
  }, [zoomDist]);

  /** Fly to a camera pose. Fast is fine; a jump never is. Distance-based duration, smoothstep, controls locked while flying. */
  const flyTo = useCallback((toC: Vector3, toT: Vector3, opts: { duration?: number; done?: () => void } = {}) => {
    const c = controls.current;
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    const fromT = c ? c.target.clone() : camera.position.clone().add(dir.multiplyScalar(10)); // no controls: keep the current aim
    const distance = camera.position.distanceTo(toC) + fromT.distanceTo(toT);
    const prefs = loadFlyPrefs(); // Settings > 3D office: fast flights, reduced motion
    const duration = opts.duration ?? flyDurationFor(distance, prefs);
    if (c) c.enabled = false;
    flight.current = {
      t: 0, duration: prefs.reduced ? Math.min(duration, REDUCED_MAX) : duration,
      fromC: camera.position.clone(), toC: toC.clone(), fromT, toT: toT.clone(), done: opts.done,
    };
  }, [camera]);

  useLayoutEffect(() => {
    layoutRef.current = layout;
    const r = refs;
    if (!r.desk.current || !r.ring.current || !r.body.current || !r.visor.current || !r.antenna.current || !r.legA.current || !r.legB.current || !r.beacon.current || !r.codexHead.current || !r.codexBody.current || !r.codexVisor.current || !r.codexEyes.current || !r.tarsFrame.current || !r.tarsSide.current || !r.tarsFace.current) return;
    meshesRef.current = {
      desk: r.desk.current, ring: r.ring.current, body: r.body.current, legA: r.legA.current, legB: r.legB.current,
      visor: r.visor.current, antenna: r.antenna.current, beacon: r.beacon.current,
      codexHead: r.codexHead.current, codexBody: r.codexBody.current, codexVisor: r.codexVisor.current, codexEyes: r.codexEyes.current,
      tarsFrame: r.tarsFrame.current, tarsSide: r.tarsSide.current, tarsFace: r.tarsFace.current,
    };
    // Clicks on instanced meshes are first tested against one cached bounding sphere. Robots wander, lie down and move away from
    // where they were when it was computed, so make it cover the whole campus: otherwise idle or sleeping robots cannot be clicked.
    for (const m of [r.desk.current, r.body.current, r.antenna.current]) m.boundingSphere = new Sphere(new Vector3(), 1e5);
    animatedRef.current = writeStatic(meshesRef.current, layout, chatId);
    if (!framed.current && layout.desks.length > 0) {
      framed.current = true;
      const hand = controllerRef.current === "hand";
      const focus = hand
        ? (handInit.current ? handPos.current : new Vector3((layout.minX + layout.maxX) / 2, 0, (layout.minZ + layout.maxZ) / 2))
        : pos.current;
      const pose = officePose(focus, hand ? 0.5 : avatarRef.current.focusY);
      camera.position.copy(pose.cam); look.current.copy(pose.target); camera.lookAt(pose.target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, chatId]);

  // Place the focus once: the avatar at the campus edge, or the hand at the centre. The camera follows it every frame.
  useEffect(() => {
    const l = layoutRef.current;
    if (controllerRef.current === "hand") {
      if (!handInit.current) { handInit.current = true; handPos.current.set((l.minX + l.maxX) / 2, 0, (l.minZ + l.maxZ) / 2); }
      camFocus.current.copy(handPos.current);
    } else if (!playerInit.current) {
      playerInit.current = true;
      // First visit (no saved view), or start mode "plaza": near the central plaza; otherwise the campus edge as before.
      if (startMode() === "plaza" || !loadView()) pos.current.set((l.minX + l.maxX) / 2, 0, (l.minZ + l.maxZ) / 2 + 6);
      else pos.current.set((l.minX + l.maxX) / 2, 0, l.maxZ + 3);
    }
  }, [controller]);

  // "Go there": near = walk (the click-to-move walk), far = transport like in Star Trek: dematerialize here, the camera flies, materialize there.
  const tele = useRef<{ phase: "out" | "gone" | "in"; t: number } | null>(null);
  useFrame((_, dt) => {
    const g = player.current, T = tele.current;
    if (!g || !T) return;
    T.t += Math.min(dt, 0.1);
    if (T.phase === "out") { const k = Math.min(1, T.t / 0.7); g.scale.set(Math.max(0.001, 1 - k), 1 + k * 1.2, Math.max(0.001, 1 - k)); if (k >= 1) { T.phase = "gone"; T.t = 0; } }
    else if (T.phase === "gone") { g.scale.set(0.001, 1, 0.001); if (T.t > 10) { T.phase = "in"; T.t = 0; } } // safety: never stay invisible
    else { const k = Math.min(1, T.t / 0.8); g.scale.set(Math.max(0.001, k), 1 + (1 - k) * 1.2, Math.max(0.001, k)); if (k >= 1) { g.scale.set(1, 1, 1); tele.current = null; } }
  });
  const travelTo = useCallback((target: { x: number; z: number }) => {
    const free = nearestFree(nav.flow?.grid, target.x, target.z), next = new Vector3(free.x, 0, free.z);
    if (controllerRef.current === "hand") { handPos.current.copy(next); clampHand(); camFocus.current.copy(handPos.current); clampFocus(); const pose = officePose(next, 0.5); flyTo(pose.cam, pose.target); return; }
    if (travelMode(pos.current, next) === "walk") { flight.current = null; dest.current = next; return; }
    dest.current = null;
    playBeam(pos.current.x, pos.current.z, "out"); tele.current = { phase: "out", t: 0 };
    const pose = officePose(next, avatarRef.current.focusY);
    flyTo(pose.cam, pose.target, { done: () => { pos.current.copy(next); playBeam(next.x, next.z, "in"); tele.current = { phase: "in", t: 0 }; } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo, officePose]);

  useEffect(() => {
    if (!jump) return;
    const { area } = jump;
    if (zoomT.current >= OVERVIEW_ZOOM) zoomT.current = 0.6; // picking a project from the top view dives back into the office
    if (modeRef.current === "walk") {
      const room = layoutRef.current.zones.find((z) => Math.abs(z.x - area.x) < 0.01 && Math.abs(z.z - area.z) < 0.01);
      if (room) { travelTo(roomCenter(room)); return; } // a room: its centre (beam or walk)
      const next = new Vector3(area.x, 0, area.z + area.d / 2 + 1.5);
      if (controllerRef.current === "hand") { handPos.current.copy(next); handPos.current.y = 0; clampHand(); camFocus.current.copy(handPos.current); clampFocus(); const pose = officePose(next, 0.5); flyTo(pose.cam, pose.target); return; }
      dest.current = null;
      const pose = officePose(next, avatarRef.current.focusY);
      flyTo(pose.cam, pose.target, { done: () => pos.current.copy(next) });
      return;
    }
    const tgt = new Vector3(area.x, 0, area.z);
    const h = Math.max(area.w, area.d) * 0.9 + 6;
    flyTo(new Vector3(tgt.x, h, tgt.z + h * 0.45), tgt);
  }, [jump, flyTo, officePose]);

  // Laptop close-up: freeze the follow camera, fly to a pair-programming spot beside the agent, and fly back to where we were.
  const prevView = useRef<{ cam: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const c = ctl.closeup;
    if (!c) return;
    const d = layoutRef.current.desks[c.i];
    if (!d) return;
    if (!prevView.current) prevView.current = { cam: camera.position.clone(), target: look.current.clone() };
    frozen.current = true;
    const screenAt = new Vector3(d.x, 1.36, d.z - 0.33);
    const spot = pairSpot(d, { x: camera.position.x, z: camera.position.z }); // pair-programming spot beside the agent (13.1.8)
    flyTo(new Vector3(spot.cam.x, screenAt.y + 0.25, spot.cam.z), screenAt.clone().add(new Vector3(-spot.side * 0.15, 0, 0)));
    ctl.onCloseup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.closeup, flyTo]);
  useEffect(() => {
    const p = prevView.current;
    if (!ctl.closeupExit || !p) return;
    prevView.current = null;
    flyTo(p.cam, p.target, { duration: 0.55, done: () => { frozen.current = false; } });
    ctl.onCloseup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.closeupExit, flyTo]);

  // Header controls: zoom buttons, reset, minimap click.
  useEffect(() => {
    if (!ctl.zoom || lockedRef.current) return;
    zoomT.current = Math.min(1, Math.max(0, zoomT.current + (ctl.zoom.factor - 1) * 0.5)); // factor < 1 = zoom in
  }, [ctl.zoom]);
  const turn = useCallback((dyaw: number) => { yaw.current += dyaw; }, []); // tilt now comes from the zoom
  useEffect(() => { if (ctl.angle) turn(ctl.angle.dyaw); }, [ctl.angle, turn]);
  useEffect(() => { // right mouse button drag turns the view
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { if (e.button === 2) { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); } };
    const move = (e: PointerEvent) => { if (!drag) return; yaw.current -= (e.clientX - drag.x) * 0.006; drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; };
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("contextmenu", menu);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("contextmenu", menu); };
  }, [gl]);
  // Hand mode: the hand sits where the mouse points on the floor (it replaces the cursor); two fingers turn.
  useEffect(() => {
    const el = gl.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    // Grab-the-ground drag: hold the left button on the floor and drag; the point you grabbed stays under the cursor (the camera follows).
    // Rays come from the camera as it was when the drag began, so the camera's own motion cannot feed back into the drag.
    let grab: { x: number; y: number; cam: PerspectiveCamera; at: Vector3; focus: Vector3; active: boolean } | null = null;
    let dragged = false;
    const groundAt = (cam: PerspectiveCamera, clientX: number, clientY: number, out: Vector3) => {
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), cam);
      return raycaster.ray.intersectPlane(groundPlane, out) !== null;
    };
    const swallowClick = (e: Event) => { if (dragged) { e.stopImmediatePropagation(); e.preventDefault(); dragged = false; } };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
      dragged = false;
      if (e.button !== 0 || modeRef.current !== "walk" || controllerRef.current !== "hand" || ctl.handMenuOpen.current || smashCtl.active) return;
      const cam = (camera as PerspectiveCamera).clone(), at = new Vector3();
      cam.updateMatrixWorld(); cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      if (groundAt(cam, e.clientX, e.clientY, at)) grab = { x: e.clientX, y: e.clientY, cam, at, focus: camFocus.current.clone(), active: false };
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId); if (e.pointerType !== "mouse") lastNdc.current = null;
      if (grab && !grab.active && e.button === 0) { // a plain click (no drag): the camera glides to the clicked ground point
        camFocus.current.set(grab.at.x, 0, grab.at.z); clampFocus();
        const pose = officePose(camFocus.current, 0.5); flyTo(pose.cam, pose.target);
      }
      grab = null;
    };
    const leave = () => { lastNdc.current = null; }; // stop edge-scrolling when the cursor leaves the scene
    const move = (e: PointerEvent) => {
      if (modeRef.current !== "walk" || controllerRef.current !== "hand" || smashCtl.active) return;
      if (e.pointerType === "mouse") {
        if (e.buttons & 2) return; // right-drag turns the view
        if (grab && e.buttons & 1) {
          if (!grab.active && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) > 5) grab.active = true; // below 5 px it is still a click
          if (grab.active) {
            dragged = true;
            const now = new Vector3();
            if (groundAt(grab.cam, e.clientX, e.clientY, now)) {
              camFocus.current.set(grab.focus.x + grab.at.x - now.x, 0, grab.focus.z + grab.at.z - now.z); clampFocus();
              handPos.current.set(grab.at.x, 0, grab.at.z); clampHand();
            }
            lastNdc.current = null; // no edge-scroll while dragging
            return;
          }
        }
        handToGround(e.clientX, e.clientY);
        return;
      }
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) { yaw.current -= dx * 0.01; return; } // two fingers: turn
      handToGround(e.clientX, e.clientY);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("click", swallowClick, true);
    return () => { el.removeEventListener("click", swallowClick, true); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("pointerleave", leave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera]);
  useEffect(() => {
    if (ctl.reset > 0) { // "behind it" at the default zoom: centre on the hand, or look along the avatar's back
      zoomT.current = DEFAULT_ZOOM_T;
      if (controllerRef.current === "hand") { camFocus.current.copy(handPos.current); clampFocus(); yaw.current = 0; }
      else yaw.current = player.current?.rotation.y ?? 0;
    }
  }, [ctl.reset]);

  // Save / restore the current zoom (kept in this browser).
  useEffect(() => {
    if (!ctl.handZoomCmd.save) return;
    zoomSaved.current = zoomT.current;
    try { localStorage.setItem("ao.camZoomSaved", String(zoomT.current)); } catch { /* private mode */ }
  }, [ctl.handZoomCmd.save]);
  useEffect(() => {
    if (!ctl.handZoomCmd.restore) return;
    zoomT.current = zoomSaved.current;
  }, [ctl.handZoomCmd.restore]);
  useEffect(() => { // "Save as default view": remember the current camera and zoom as the default
    if (!ctl.saveView) return;
    saveView({
      cam: [camera.position.x, camera.position.y, camera.position.z],
      target: [look.current.x, look.current.y, look.current.z],
      walk: { zoom: zoomT.current, yaw: yaw.current, pitch: 0 },
    });
  }, [ctl.saveView, camera]);
  useEffect(() => {
    if (!ctl.clearView) return;
    clearView();
    zoomT.current = DEFAULT_ZOOM_T;
    if (controllerRef.current === "hand") { camFocus.current.copy(handPos.current); clampFocus(); yaw.current = 0; }
    else yaw.current = player.current?.rotation.y ?? 0;
  }, [ctl.clearView]);
  useEffect(() => {
    const w = ctl.warp;
    if (!w) return;
    if (zoomT.current >= OVERVIEW_ZOOM) zoomT.current = 0.6; // going somewhere from the top view (a game table, the race start, a map click) dives back into the office instead of staying on the black label map
    const next = new Vector3(w.x, 0, w.z);
    if (controllerRef.current === "hand") { handPos.current.copy(next); clampHand(); camFocus.current.copy(handPos.current); clampFocus(); const pose = officePose(next, 0.5); flyTo(pose.cam, pose.target); return; }
    travelTo(next);
  }, [ctl.warp, camera, flyTo, officePose]);

  // Mouse wheel / pinch zoom: scroll down = zoom out (toward top-down), up = zoom in (toward first-person).
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (lockedRef.current) return;
      const step = Math.max(-100, Math.min(100, e.deltaY)); // normalize trackpad/mouse
      zoomT.current = Math.min(1, Math.max(0, zoomT.current + step * 0.0015));
      try { localStorage.setItem("ao.camZoom", String(zoomT.current)); } catch { /* private mode */ }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [gl]);

  // Sleepers and parked robots are skipped by the frame loop; anything that needs them to move (an action, an errand, following) adds them back.
  const ensureAnimated = (id: string) => {
    const i = layoutRef.current.desks.findIndex((d) => d.worker.id === id);
    if (i >= 0 && !animatedRef.current.includes(i)) animatedRef.current.push(i);
  };
  /** Boss is coming: wake a random few sleepers near the manager so they hop to their desk and look busy, then sleep again. */
  const wakeNearbySleepers = (count: number, radius: number) => {
    const p = pos.current;
    const pool = layoutRef.current.desks
      .filter((d) => d.worker.state === "asleep")
      .map((d) => ({ d, dist: Math.hypot(d.x - p.x, d.z - p.z) }))
      .filter((x) => x.dist <= radius);
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j]!, pool[k]!]; }
    for (const { d } of pool.slice(0, count)) {
      setLook(d.worker.id, "working", false, 18_000 + Math.random() * 30_000);
      ensureAnimated(d.worker.id);
    }
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
      talk: () => { const b = nearestBot(layoutRef.current, pos.current); if (b) selectWorker(b.worker.id); },
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
        else { const i = layoutRef.current.desks.findIndex((d) => d.worker.id === id); if (i >= 0 && !animatedRef.current.includes(i)) animatedRef.current.push(i); }
      },
      look: (id, state, sit, ms) => { if (state) { setLook(id, state, !!sit, ms); animate(id); } else clearLook(id); },
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
      else if (k === "z") { const b = nearestBot(layoutRef.current, pos.current); if (b) usePerform.getState().open(b.worker.id); } // Z: the numbered Perform picker for the nearest agent
      else if (ACTIONS.some((a) => a.key === k && (a.kind === "real" || a.key === "f"))) ctl.api.current?.act(k); // other cosmetic actions are picker / menu only
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
    const overviewNow = zoomT.current >= (labelsOnly ? OVERVIEW_EXIT : OVERVIEW_ZOOM);
    if (overviewNow !== labelsOnly) setLabelsOnly(overviewNow);
    if (labelsOnly !== wasLabelsOnly.current) {
      wasLabelsOnly.current = labelsOnly;
      aligning.current = labelsOnly;
    }
    if (labelsOnly && aligning.current) { // entering the top view: turn the map back to a straight-on angle
      yaw.current *= Math.exp(-5 * dt);
      if (Math.abs(yaw.current) < 0.002) { yaw.current = 0; aligning.current = false; }
    }
    ctl.labels.current?.update(camera, gl.domElement.clientWidth, gl.domElement.clientHeight, zoomT.current); // floating titles follow the camera
    if (!readyOnce.current) { readyOnce.current = true; ctl.onReady(); }
    sampleFrame(dt, state.clock.elapsedTime, gl.info);
    nerd.bots = roams.size;
    { // where you are on the screen, so labels behind you do not paint over you (rooms/ui.tsx RoomHtml)
      const av = avatarScreen;
      if (modeRef.current === "walk" && !labelsOnly && playerState.on) {
        const x = pos.current.x, z = pos.current.z;
        tmpAv.set(x, 0, z).project(camera); const bx = tmpAv.x, by = tmpAv.y;
        tmpAv.set(x, 2.1, z).project(camera);
        const h = Math.abs(tmpAv.y - by), halfW = Math.max(0.03, (0.4 * h) / Math.max(0.3, (camera as { aspect?: number }).aspect ?? 1)) * 1.2;
        av.on = true; av.x0 = bx - halfW; av.x1 = bx + halfW; av.y0 = Math.min(by, tmpAv.y) - 0.03; av.y1 = Math.max(by, tmpAv.y) + 0.03;
        av.dist = camera.position.distanceTo(tmpAv.set(x, 1, z));
      } else av.on = false;
    }
    ctl.view.current.mode = modeRef.current;
    const mvx = pos.current.x - playerState.x, mvz = pos.current.z - playerState.z, mv = Math.hypot(mvx, mvz);
    if (mv > 0.002) { playerState.hx = mvx / mv; playerState.hz = mvz / mv; playerState.still = 0; } else playerState.still += dt; // followers trail, then huddle
    managerAt.x = controllerRef.current === "hand" ? handPos.current.x : pos.current.x; managerAt.z = controllerRef.current === "hand" ? handPos.current.z : pos.current.z;
    playerState.on = modeRef.current === "walk"; playerState.x = pos.current.x; playerState.z = pos.current.z; playerState.fast = false;
    if (modeRef.current === "walk" && !labelsOnly && !frozen.current) {
      bossTimer.current -= dt;
      const moved = Math.hypot(pos.current.x - bossAt.current.x, pos.current.z - bossAt.current.z);
      if (bossTimer.current <= 0 && moved > 1.2) { // you walked somewhere: a couple of nearby sleepers suddenly look busy
        bossTimer.current = 6 + Math.random() * 7;
        bossAt.current.copy(pos.current);
        wakeNearbySleepers(1 + Math.floor(Math.random() * 3), 20);
      }
    }
    meeting.count = meeting.room && followerList().length && insideRoom(meeting.room, pos.current.x, pos.current.z) ? Math.min(followerList().length, MAX_SEATS) : 0;
    if (modeRef.current === "walk") { ctl.view.current.x = pos.current.x; ctl.view.current.z = pos.current.z; }
    else if (controls.current) { ctl.view.current.x = controls.current.target.x; ctl.view.current.z = controls.current.target.z; }
    const fl = flight.current;
    if (fl) {
      fl.t = advance(fl.t, fl.duration, dt);
      const e = smooth(fl.t); // smoothstep: no lurch at either end
      camera.position.lerpVectors(fl.fromC, fl.toC, e);
      look.current.lerpVectors(fl.fromT, fl.toT, e);
      const c = controls.current;
      if (c) { c.enabled = false; c.target.copy(look.current); c.update(); } else camera.lookAt(look.current);
      if (fl.t >= 1) {
        flight.current = null;
        if (c) { c.enabled = true; c.update(); }
        fl.done?.();
      }
    }
    const m = meshesRef.current;
    const anim = animatedRef.current;
    if (m && anim.length > 0 && !labelsOnly) {
      simAccum.current = Math.min(0.25, simAccum.current + dt);
      if (simAccum.current >= SIM_STEP) {
        const step = Math.min(simAccum.current, 0.1);
        simAccum.current = 0;
        rebuildRoamGrid(); // one grid for all the neighbour checks in this tick
        const t = state.clock.elapsedTime;
        const desks = layoutRef.current.desks;
        const stillActive: number[] = [];
        for (let k = 0; k < anim.length; k++) {
          const d = desks[anim[k]]!;
          const mode = modeOf(d, fetchedRef.current);
          const r = stepRoam(d, step, mode);
          poseBot(m, anim[k], d, t, true, r);
          // Back asleep and lying still: drop it from the loop so a one-off wake does not cost frames forever.
          if (!(mode === "sleep" && r.lying && !r.moving)) stillActive.push(anim[k]!);
        }
        animatedRef.current = stillActive;
        m.body.instanceMatrix.needsUpdate = true;
        m.codexHead.instanceMatrix.needsUpdate = true;
        m.codexBody.instanceMatrix.needsUpdate = true;
        m.codexVisor.instanceMatrix.needsUpdate = true;
        m.codexEyes.instanceMatrix.needsUpdate = true;
        m.tarsFrame.instanceMatrix.needsUpdate = true;
        m.tarsSide.instanceMatrix.needsUpdate = true;
        m.tarsFace.instanceMatrix.needsUpdate = true;
        m.visor.instanceMatrix.needsUpdate = true;
        m.antenna.instanceMatrix.needsUpdate = true;
        m.legA.instanceMatrix.needsUpdate = true;
        m.legB.instanceMatrix.needsUpdate = true;
        m.beacon.instanceMatrix.needsUpdate = true;
      }
    } else {
      simAccum.current = 0;
    }

    if (raceCam.active) return; // you are driving in the race: the race layer owns the camera
    if (modeRef.current !== "walk") {
      if (nearbyId.current) { nearbyId.current = null; onNearby(null); }
      return;
    }
    const p = pos.current;
    if (player.current) player.current.visible = !smashCtl.active; // anger room smash run: the weapon is you, so the avatar and the hand are parked
    if (frozen.current) { if (handGroup.current) handGroup.current.visible = false; return; } // a laptop close-up owns the camera and the focus; the hand would only cover the screen
    if (controllerRef.current === "hand") {
      // Hand: WASD pans the camera, the hand sits where the mouse points, and the camera follows the hand only when it nears the edge.
      const ks = keys.current;
      const fwd = (ks.has("w") || ks.has("arrowup") ? 1 : 0) - (ks.has("s") || ks.has("arrowdown") ? 1 : 0);
      const str = (ks.has("d") || ks.has("arrowright") ? 1 : 0) - (ks.has("a") || ks.has("arrowleft") ? 1 : 0);
      if (fwd || str) {
        const c = Math.cos(yaw.current), sn = Math.sin(yaw.current), sp = zoomDist() * 0.9 * dt;
        camFocus.current.x += (-sn * fwd + c * str) * sp;
        camFocus.current.z += (-c * fwd - sn * str) * sp;
        clampFocus();
      }
      // Edge scroll: when the cursor nears the screen edge, pan the camera that way (the hand still sits under the cursor).
      const n = ctl.handMenuOpen.current ? null : lastNdc.current;
      if (n) {
        const edge = 0.72;
        const sx = Math.abs(n.x) > edge ? (n.x - Math.sign(n.x) * edge) / (1 - edge) : 0;
        const sy = Math.abs(n.y) > edge ? (n.y - Math.sign(n.y) * edge) / (1 - edge) : 0;
        if (sx || sy) {
          const c = Math.cos(yaw.current), sn = Math.sin(yaw.current), sp = zoomDist() * 1.1 * dt;
          camFocus.current.x += (c * sx - sn * sy) * sp; // right = (cos, -sin), forward = (-sin, -cos)
          camFocus.current.z += (-sn * sx - c * sy) * sp;
          clampFocus();
        }
      }
      p.copy(handPos.current); p.y = 0;
      if (handGroup.current) { handGroup.current.visible = !smashCtl.active; handGroup.current.position.set(p.x, 0, p.z); }
    } else {
      const ks = smashCtl.active ? new Set<string>() : keys.current; // smashing: the parked avatar does not walk (zoom, orbit and the camera keep working)
      let dx = (ks.has("d") || ks.has("arrowright") ? 1 : 0) - (ks.has("a") || ks.has("arrowleft") ? 1 : 0);
      let dz = (ks.has("s") || ks.has("arrowdown") ? 1 : 0) - (ks.has("w") || ks.has("arrowup") ? 1 : 0);
      if (dx !== 0 || dz !== 0) { // keys move relative to the camera: W is always "away from the camera"
        const c = Math.cos(yaw.current), sn = Math.sin(yaw.current);
        [dx, dz] = [dx * c + dz * sn, -dx * sn + dz * c];
      }
      const g = player.current;
      if (dx !== 0 || dz !== 0) dest.current = null; // keyboard cancels click-to-move
      else if (dest.current) {
        const tx = dest.current.x - p.x, tz = dest.current.z - p.z, dist = Math.hypot(tx, tz);
        if (dist < 0.2) dest.current = null; else { dx = tx / dist; dz = tz / dist; }
      }
      // Holding Shift sprints: the speed builds up smoothly from walking pace towards a top speed, and drops back when you stop.
      const moving = dx !== 0 || dz !== 0;
      const want = moving && ks.has("shift") ? SPRINT_SPEED : WALK_SPEED;
      playerState.fast = moving && (ks.has("shift") || (dest.current ? Math.hypot(dest.current.x - p.x, dest.current.z - p.z) > 6 : false));
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
      // the owner's own walk cycle: the chosen avatar poses its parts per clip and eases back to rest when standing
      const walking = dx !== 0 || dz !== 0;
      stride.current += dt * 11 * (spd / WALK_SPEED); // faster legs when sprinting
      const clip: PoseClip = !walking ? "idle" : spd > WALK_SPEED * 1.15 ? "sprint" : "walk";
      const targets = avatarRef.current.pose({ clip, t: stride.current, speed: spd });
      const ease = 1 - Math.exp(-14 * dt);
      for (const name of Object.keys(targets)) {
        const o = partRefs.current[name], tg = targets[name]!;
        if (!o) continue;
        o.rotation.x += ((tg.rx ?? 0) - o.rotation.x) * ease;
        o.rotation.y += ((tg.ry ?? 0) - o.rotation.y) * ease;
        o.rotation.z += ((tg.rz ?? 0) - o.rotation.z) * ease;
        const baseY = avatarRef.current.layout[name]?.[1] ?? 0;
        o.position.y += (baseY + (tg.dy ?? 0) - o.position.y) * ease;
      }
      if (g) g.position.copy(p);
    }
    if (!flight.current) { // one follow camera for both controllers; a flight owns it until it lands
      const focus = labelsOnly ? overviewCenterRef.current : controllerRef.current === "hand" ? camFocus.current : p;
      const pose = officePose(focus, labelsOnly ? 0 : controllerRef.current === "hand" ? 0.5 : avatarRef.current.focusY);
      const k = 1 - Math.exp(-9 * dt);
      camera.position.lerp(pose.cam, k);
      look.current.lerp(pose.target, k);
      camera.lookAt(look.current);
    }

    const near = nearestBot(layoutRef.current, p); // the bot where it stands now, not its desk
    const id = near ? near.worker.id : null;
    if (id !== nearbyId.current) {
      nearbyId.current = id;
      onNearby(near ? { id: near.worker.id, title: near.worker.name || near.worker.title } : null);
    }
    const pct = Math.round(zoomT.current * 100); // zoom readout for the View panel (store updates only on change)
    if (pct !== lastZoomPct.current) { lastZoomPct.current = pct; useStore.getState().setViewInfo({ zoomPct: pct }); }
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
      {/* In the top-view band the 3D world is hidden so the room slabs cannot z-fight; project and room titles remain. */}
      <group visible={!labelsOnly}>
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

      <instancedMesh ref={refs.desk} args={[assets.deskG, undefined, MAX_DESKS]} frustumCulled={false} visible={showDesks} raycast={showDesks ? undefined : () => null}
        onClick={(e) => { // the desk itself calls its agent back to it; with the agent already there it opens the agent menu
          e.stopPropagation();
          const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined;
          if (!d) return;
          const r = roams.get(d.worker.id);
          if (!e.nativeEvent.shiftKey && d.worker.state !== "asleep" && r && Math.hypot(r.x - d.x, r.z - d.z) > CALL_RADIUS) { setLook(d.worker.id, "idle", true, CALL_MS); ensureAnimated(d.worker.id); return; }
          pick(d.worker.id, e.nativeEvent);
        }}>
        <meshStandardMaterial color="#3a4256" roughness={0.8} />
      </instancedMesh>
      <ZonesLayer layout={layout} onZone={(id) => { if (id === "data-room") useStore.getState().setPanel("data"); }} />
      <ConferenceLayer layout={layout} />
      <DeskScreens layout={layout} openId={chatId} onScreen={ctl.onScreen} />
      <FxLayer />
      {!labelsOnly && <Icons />}
      <Minibots layout={layout} subs={ctl.subs} />
      <CoffeeFactory layout={layout} />
      <DataCenter layout={layout} />
      <TeleportFx />
      <GamesLayer layout={layout} />
      <ClawLayer layout={layout} />
      <RaceLayer layout={layout} />
      <ServiceBots layout={layout} />
      <Cubicles layout={layout} />
      <RoomsContent layout={layout} />
      <ManagerWalls layout={layout} onOpenBoard={() => useStore.getState().setPanel("board")} onOpenNotes={() => useStore.getState().setPanel("notes")} />
      {!labelsOnly && ctl.tags && <NameTags layout={layout} getCenter={() => (modeRef.current === "walk" ? pos.current : controls.current?.target ?? pos.current)} />}
      {!labelsOnly && <SpeechBubbles layout={layout} getPos={(id) => roams.get(id)} />}
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
      {/* OpenCode TARS: white top/bottom frame, dark centre, two swinging side legs/arms that close the rectangle */}
      <instancedMesh ref={refs.tarsFrame} args={[assets.tarsFrameG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshStandardMaterial roughness={0.45} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={refs.tarsSide} args={[assets.tarsSideG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshStandardMaterial roughness={0.45} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={refs.tarsFace} args={[assets.tarsFaceG, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const d = e.instanceId !== undefined ? layoutRef.current.desks[e.instanceId] : undefined; if (d) pick(d.worker.id, e.nativeEvent); }}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.beacon} args={[assets.beaconG, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Owner (walk mode, avatar): the chosen character, tinted with your colour (13.1.1) */}
      <group ref={player} visible={mode === "walk" && controller === "avatar"}>
        {avatar.parts.map((name) => {
          const isGlow = avatar.glow.includes(name);
          const isDecal = !!avatar.decals?.some((d) => d.part === name) && tex.emoji;
          const isPlaid = avatar.pattern?.[name] === "plaid" && tex.plaid;
          return (
            <mesh key={`${avatar.id}:${name}`} ref={(el) => { partRefs.current[name] = el; }} geometry={geoms[name]} position={avatar.layout[name]}>
              {isGlow ? <meshBasicMaterial color="#7dffb0" toneMapped={false} />
                : isDecal ? <meshBasicMaterial map={tex.emoji!} transparent toneMapped={false} side={DoubleSide} />
                : isPlaid ? <meshStandardMaterial {...assets.mats.solid} map={tex.plaid!} />
                : <meshStandardMaterial {...assets.mats.solid} color={avatar.colors?.[name] ?? managerColor} />}
            </mesh>
          );
        })}
      </group>

      {/* Hand controller (walk mode, hand): a big floating hand over the ground point it holds */}
      <group ref={handGroup} visible={mode === "walk" && controller === "hand"}>
        <mesh geometry={handGeo} position={[0, 1.25, 0]} raycast={() => null}>
          <meshStandardMaterial color="#f2f2f2" roughness={0.45} metalness={0.05} emissive="#111111" emissiveIntensity={0.15} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} raycast={() => null}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial color="#7dffb0" transparent opacity={0.75} toneMapped={false} />
        </mesh>
      </group>

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

/** Opened in hand mode when you act on empty space: shows the global actions and brings the mouse back for the UI. */
function HandMenu({ x, y, onClose, items }: { x: number; y: number; onClose: () => void; items: { label: string; key?: string; run: () => void; disabled?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div className="agent-menu" ref={ref} style={{ left: x, top: y, zIndex: 30 }}>
      <header className="am-head"><strong>Hand</strong><button className="icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
      {items.map((it, i) => (
        <button key={i} className="am-item" disabled={it.disabled} onClick={() => { it.run(); onClose(); }}>{it.label}{it.key && <kbd>{it.key}</kbd>}</button>
      ))}
      <p className="muted small" style={{ margin: "4px 2px 0" }}>The mouse is back — reach the sidebar or header. Close this to hide it again.</p>
    </div>
  );
}

/** `active` = the 3D office is the panel on screen. It stays mounted while you look at other panels, so the camera, zoom,
 *  position, followers and open chats are exactly as you left them; while inactive it draws nothing and ignores keys. */
export default function World({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<Mode>("walk"); // one continuous camera now; kept for the Scene's internal branches
  const [hidden, setHidden] = useState(() => document.hidden);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const controller = useStore((st) => st.controller);
  const [handSave, setHandSave] = useState(0); // bump = save the hand zoom
  const [handRestore, setHandRestore] = useState(0); // bump = restore the saved hand zoom
  const [handMenu, setHandMenu] = useState<{ x: number; y: number } | null>(null); // hand-mode "what can I do" menu (brings the mouse back)
  const lastPtr = useRef<{ x: number; y: number } | null>(null);
  const handMenuOpenRef = useRef(false);
  handMenuOpenRef.current = !!handMenu;
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
  const liveLayout = useMemo(() => computeLayout(shownSnap, showAll), [shownSnap, showAll]);
  // While a race runs the map stays exactly as it was at the start, whatever you filter or the data does (the track is drawn on it).
  const racing = useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.running);
  const heldLayout = useRef(liveLayout);
  if (!racing) heldLayout.current = liveLayout;
  const layout = heldLayout.current;
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
  // The Scene reports when the zoom reaches the top-view band; from there on only project titles are shown.
  const [labelsOnly, setLabelsOnly] = useState(() => { try { return Number(localStorage.getItem("ao.camZoom")) >= OVERVIEW_ZOOM; } catch { return false; } });
  const shownLabels = useMemo(() => (labelsOnly ? labelItems.filter((it) => it.kind === "project" || it.kind === "room") : labelItems), [labelsOnly, labelItems]);
  const [reset, setReset] = useState(0);
  const [saveN, setSaveN] = useState(0);
  // Click a laptop screen: the camera flies right in front of it so you can read it; "Back" (or Esc) returns.
  const [closeup, setCloseup] = useState<{ i: number; n: number } | null>(null);
  const [closeupExit, setCloseupExit] = useState(0);
  const [inCloseup, setInCloseup] = useState(false);
  const skipFrame = useRef(false);
  const closeupWalk = useRef(false);
  const startCloseup = (i: number) => setCloseup((c) => ({ i, n: (c?.n ?? 0) + 1 }));
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
  const setShowKeymap = useStore((st) => st.setShowKeymap);
  const frame = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const id = menu?.id;
    if (!id) return;
    holdAgent(id);
    return () => releaseAgent(id);
  }, [menu?.id]);
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
  const toggleMode = () => setMode("walk"); // legacy: the view no longer switches to a separate overview
  const [mapOverlay, setMapOverlay] = useState(false); // Space: quick teleport map (13.1.5)
  const toggleMapOverlay = () => setMapOverlay((v) => !v);
  const openMap = () => useStore.getState().setPanel("map"); // the minimap lives in the Map tab
  const toggleLock = () => { lsSet("ao.zoomLock", !locked); setLocked(!locked); };
  const resetView = () => setReset((n) => n + 1);
  const closeOverlays = () => { if (mapOverlay) setMapOverlay(false); else if (inCloseup) setCloseupExit((n) => n + 1); else if (menu) setMenu(null); else if (chatId) openChat(undefined); };
  const toggleTags = () => { lsSet("ao.nametags", !tags); setTags(!tags); };
  // the View and Projects panels (in the dock) drive the office through this bus; the office mirrors its state back for them
  const busRef = useRef<(c: import("./viewBus").ViewCmd) => void>(() => {});
  busRef.current = (c) => {
    if (c.t === "mode") { /* no separate view mode any more: zooming out is the overview */ }
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
  // Camera distance at which the whole campus fits the 50-degree view; the zoom-out limit (DIST_OUT) must cover it.
  useEffect(() => {
    const ext = Math.max(layout.maxX - layout.minX, layout.maxZ - layout.minZ);
    useStore.getState().setViewInfo({ fitDist: Math.round(fitDistance(ext)), maxDist: maxZoomDistance(layout) });
  }, [layout]);
  const clearFollowers = useStore((st) => st.clearFollowers);
  const meetingOpen = useStore((st) => st.meetingOpen);
  const setMeetingOpen = useStore((st) => st.setMeetingOpen);
  const nFollowers = useStore((st) => st.followers.length);
  // group moves: rally every waiting agent round you, wake every sleeper, send the idle ones to lunch
  const ids = (pred: (w: BotWorker) => boolean) => layout.desks.filter((d) => pred(d.worker)).map((d) => d.worker.id);
  const rallying = useStore((st) => st.followers.length > 0 && st.followers.every((f) => layout.desks.find((d) => d.worker.id === f)?.worker.state === "waiting"));
  const rally = () => { if (rallying) clearFollowers(); else useStore.getState().setFollowers(ids((w) => w.state === "waiting")); };
  // "Boss is coming": a random few sleepers near you jump up and look busy (not the whole office — that was expensive and
  // short-lived, and 400 robots all moving at once is what made the machine hang).
  const bossComing = () => {
    const px = view.current.x, pz = view.current.z;
    const asleep = layout.desks.filter((d) => d.worker.state === "asleep");
    const near = asleep
      .map((d) => ({ d, dist: Math.hypot(d.x - px, d.z - pz) }))
      .filter((x) => x.dist <= 22)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12);
    const pool = near.length ? near : asleep.map((d) => ({ d, dist: 0 }));
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j]!, pool[k]!]; }
    for (const { d } of pool.slice(0, 2 + Math.floor(Math.random() * 4))) {
      sceneApi.current?.look(d.worker.id, "working", false, 18_000 + Math.random() * 30_000);
    }
  };
  const lunch = () => { lunchAll(ids((w) => w.state === "idle")); };
  const orderCoffee = () => { requestCoffee(MANAGER_ID); };
  // In hand mode E on empty space opens a small menu AND brings the mouse back, so you can reach the sidebar/header.
  const openHandMenu = () => {
    const w = frame.current?.clientWidth ?? 800, h = frame.current?.clientHeight ?? 600;
    const p = lastPtr.current ?? { x: w / 2, y: h / 2 };
    setHandMenu({ x: Math.max(8, Math.min(p.x, w - 258)), y: Math.max(8, Math.min(p.y, h - 260)) });
  };
  const hotkeys = { e: () => { if (nearby) sceneApi.current?.talk(); else if (consoleSpot.near) openDataRoom(); else if (controller === "hand") openHandMenu(); }, o: orderCoffee, r: rally, u: bossComing, i: lunch, x: clearFollowers, q: () => setMeetingOpen(!meetingOpen), c: resetView, m: openMap, " ": () => { try { if (localStorage.getItem("ao.spaceMap") === "0") return; } catch { /* private mode */ } toggleMapOverlay(); }, l: toggleLock, t: toggleTags, "0": resetView };
  const hotRef = useRef(hotkeys); hotRef.current = hotkeys;
  const activeRef2 = useRef(active); activeRef2.current = active;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef2.current || typing(e) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key === " ") e.preventDefault(); // Space opens the map: no page scroll / focused-button click
      (hotRef.current as Record<string, (() => void) | undefined>)[e.key.toLowerCase()]?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const walking = mode === "walk";
  // A big office at 120 Hz Retina is fill-rate bound: trade a little sharpness for a usable frame rate.
  const maxDpr = layout.desks.length > 110 ? 1.35 : layout.desks.length > 70 ? 1.6 : 2;
  const nearWhy = !walking ? "Walk mode only" : !nearby ? "No agent close by" : null;
  const entries: KeyEntry[] = KEYMAP.map((def) => {
    const act = def.id.startsWith("action:") ? def.id.slice(7) : "";
    const run: Record<string, [() => void, string | null]> = {
      camera: [resetView, null], talk: [() => sceneApi.current?.talk(), nearWhy], minimap: [openMap, null], teleport: [toggleMapOverlay, null],
      rally: [rally, ids((w) => w.state === "waiting").length || rallying ? null : "Nobody is waiting for you"],
      wake: [bossComing, ids((w) => w.state === "asleep").length ? null : "Nobody is asleep"],
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
    <div ref={frame} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); lastPtr.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }} style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
      <Canvas style={{ cursor: controller === "hand" && !handMenu && !labelsOnly && !inCloseup ? "none" : undefined }} onPointerMissed={() => { setMenu(null); setRoomMenu(null); }} frameloop={hidden || !active ? "never" : "always"} dpr={[1, maxDpr]} camera={{ position: [0, 40, 20], fov: 50, near: 0.1, far: 1000 }}>
        <SimChatBubbles />
        <Scene mode={mode} layout={layout} jump={jump} onNearby={setNearby} onEnter={enterTeam} ctl={{ onScreen: startCloseup, closeup, closeupExit, onCloseup: setInCloseup, onReady, saveView: saveN, clearView: clearN, labels: labelsApi, active, subs, tags, api: sceneApi, onPick, pan, angle, zoom, reset, locked, warp, view, skipFrame, closeupWalk, handZoomCmd: { save: handSave, restore: handRestore }, handMenuOpen: handMenuOpenRef, onOverview: setLabelsOnly }} />
      </Canvas>
      {mode === "walk" && controller === "hand" && !inCloseup && (
        <div style={{ position: "absolute", top: 10, left: "calc(10px + var(--dock-l, 0px))", display: "flex", gap: 6 }}>
          <button onClick={() => setHandSave((n) => n + 1)} style={{ padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Remember the current zoom">Save zoom</button>
          <button onClick={() => setHandRestore((n) => n + 1)} style={{ padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Go back to the saved zoom">Restore zoom</button>
          <button onClick={openHandMenu} style={{ padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Show what you can do here and bring the mouse back (E)">Actions</button>
        </div>
      )}
      {handMenu && (
        <HandMenu x={handMenu.x} y={handMenu.y} onClose={() => setHandMenu(null)} items={[
          { label: "Rally the waiting agents", key: "R", run: rally, disabled: !ids((w) => w.state === "waiting").length },
          { label: "Boss is coming: wake a few nearby", key: "U", run: bossComing, disabled: !ids((w) => w.state === "asleep").length },
          { label: "Lunch: idle agents to the rooms", key: "I", run: lunch, disabled: !ids((w) => w.state === "idle").length },
          { label: "Use the data console: open the Data room", key: "E", run: openDataRoom, disabled: !consoleSpot.near },
          { label: "Order a coffee", key: "O", run: orderCoffee },
          { label: "Meeting chat with the followers", key: "Q", run: () => setMeetingOpen(!meetingOpen), disabled: !nFollowers },
          { label: "Release the meeting: send everyone back", key: "X", run: clearFollowers, disabled: !nFollowers },
          { label: "Save zoom", run: () => setHandSave((n) => n + 1) },
          { label: "Restore zoom", run: () => setHandRestore((n) => n + 1) },
        ]} />
      )}
      <button onClick={clearBubbles} style={{ position: "absolute", top: 10, right: "calc(10px + var(--dock-r, 0px))", padding: "4px 10px", cursor: "pointer", fontSize: 12 }} title="Mark every speech bubble as read">Clear bubbles</button>
      {!ready && <p className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0, pointerEvents: "none" }}>Building the office…</p>}
      <Labels apiRef={labelsApi} items={shownLabels} onPick={(it, cx, cy) => {
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
      {mapOverlay && (
        <div style={{ position: "absolute", inset: 0, zIndex: 8, display: "grid", placeItems: "center", background: "rgba(8,10,18,0.55)" }} onClick={() => setMapOverlay(false)}>
          <div style={{ background: "#12151f", border: "1px solid #2b3145", borderRadius: 10, padding: 12 }} onClick={(e) => e.stopPropagation()}>
            <div className="muted small" style={{ marginBottom: 6 }}>Click anywhere to fly there · Space or Esc closes</div>
            <Minimap layout={layout} view={{ current: viewState }} size={Math.min(520, (frame.current?.clientHeight ?? 600) - 90)} onGo={(x, z) => { setMapOverlay(false); useStore.getState().focusPoint(x, z); }} />
          </div>
        </div>
      )}
      <FollowBar />
      <GamesHud layout={layout} />
      {meetingOpen && <div style={{ position: "absolute", right: "calc(10px + var(--dock-r, 0px))", bottom: 10, zIndex: 6 }}><MeetingChat onClose={() => setMeetingOpen(false)} /></div>}
      {showKeymap && <KeymapLegend entries={entries} onHide={() => setShowKeymap(false)} />}
      {menu && menuWorker && (
        <AgentMenu worker={menuWorker} scene={sceneApi.current ?? { talk() {}, act() {}, look() {}, sendTo() {}, archive: (_id, done) => done() }} onClose={() => setMenu(null)} />
      )}
      <Windshield />
      <PerformPicker act={(key, id) => sceneApi.current?.act(key, id)} />
      {nearby && (
        <div style={{ ...box, left: "50%", bottom: 24, transform: "translateX(-50%)", fontSize: 14 }}>
          Press <b>E</b> to talk to {nearby.title} · <b>Z</b> perform
        </div>
      )}
    </div>
    </div>
  );
}

