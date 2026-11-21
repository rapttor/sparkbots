import { Color, InstancedMesh, Matrix4, Object3D } from "three";
import type { WorkerState } from "../../server/adapters/types";
import type { DeskSlot, Layout } from "./layout";
import { STATE_COLORS } from "./colors";
import { nav } from "./nav";
import { followerIndex, followerList, followTarget, poiExists, pickVisit, releaseVisit, slotPos, conductors } from "./roam";
import { roams, looks, effectiveState, occupiedAt, steerAround, separate, type BotMode, type Roam } from "./roam";
import { fxPose } from "./fx";
import { IDLE_CLIPS, STATE_ICON, clipById, statusClip, type Clip } from "./clips";

export const WHITE = new Color("#ffffff");
export const STATE_THREE = Object.fromEntries(
  (Object.keys(STATE_COLORS) as WorkerState[]).map((k) => [k, new Color(STATE_COLORS[k])]),
) as Record<WorkerState, Color>;
const VISOR_GAIN: Record<WorkerState, number> = { asleep: 0.6, idle: 0.8, working: 1.4, waiting: 1.1, done: 1.2, error: 1.3 };
const BODY_TINT: Record<WorkerState, number> = { asleep: 0.12, idle: 0.22, working: 0.28, waiting: 0.28, done: 0.28, error: 0.3 };

// Reused temporaries (no per-frame allocation).
export const dummy = new Object3D();
const grp = new Object3D();
const tmp = new Matrix4();
const col = new Color();

const visorColor = (state: WorkerState): Color => col.copy(STATE_THREE[state]).multiplyScalar(VISOR_GAIN[state]);
const bodyColor = (state: WorkerState): Color => col.copy(WHITE).lerp(STATE_THREE[state], BODY_TINT[state]);

/** Sets instance i of `mesh` to grp.matrix * local(pos, rotZ, scale). */
function put(mesh: InstancedMesh, i: number, lx: number, ly: number, lz: number, rz = 0, s = 1, rx = 0): void {
  dummy.position.set(lx, ly, lz);
  dummy.rotation.set(rx, 0, rz);
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

export interface Meshes { desk: InstancedMesh; ring: InstancedMesh; body: InstancedMesh; legA: InstancedMesh; legB: InstancedMesh; visor: InstancedMesh; antenna: InstancedMesh; beacon: InstancedMesh; codexHead: InstancedMesh; codexBody: InstancedMesh; codexVisor: InstancedMesh; codexEyes: InstancedMesh }

/** Where a bot currently is. Bots leave their chair when idle (wander), lie down when asleep, and run back to the
 *  desk when they are working or when you open their chat. */
/** Where a bot currently is (see roam.ts). */
const tints = new Map<string, Color>();
const tintColor = (hex: string): Color => { let c = tints.get(hex); if (!c) tints.set(hex, c = new Color(hex)); return c; };
export const chairOf = (d: DeskSlot) => ({ x: d.x, z: d.z + 0.95 });
const bedOf = (d: DeskSlot) => ({ x: d.x + 1.45, z: d.z + 1.1 }); // on the floor beside the desk
const speedOf: Record<BotMode, number> = { desk: 3, wander: 0.7, sleep: 1.4, rush: 6, circle: 1.6, follow: 3.8 };

export function roamOf(d: DeskSlot): Roam {
  let r = roams.get(d.worker.id);
  if (!r) {
    const c = d.worker.state === "asleep" ? bedOf(d) : chairOf(d);
    r = { x: c.x, z: c.z, tx: c.x, tz: c.z, wait: 0, ry: 0, lying: d.worker.state === "asleep", moving: false, mode: "desk", awakeUntil: 0, flash: false, angle: 0, clip: null, icon: "", visit: null, errand: null };
    roams.set(d.worker.id, r);
  }
  return r;
}

export function modeOf(d: DeskSlot, fetchedId: string | undefined): BotMode {
  if (d.worker.id === fetchedId || roams.get(d.worker.id)?.errand) return "rush";
  if (followerIndex(d.worker.id) >= 0) return "follow";
  switch (effectiveState(d.worker.id, d.worker.state)) {
    case "asleep": return (roams.get(d.worker.id)?.awakeUntil ?? 0) > performance.now() ? "wander" : "sleep"; // a zapped sleeper stays up for a while
    case "idle": return looks.get(d.worker.id)?.sit ? "desk" : "wander";
    case "error": return "circle";
    default: return "desk";
  }
}

/** Advances one bot toward its goal. Wander targets stay in the open floor in front of its own desk, clear of desks. */
export function stepRoam(d: DeskSlot, dt: number, mode: BotMode): Roam {
  const r = roamOf(d);
  r.mode = mode;
  const id = d.worker.id, nowMs = performance.now();
  if (r.visit && (mode !== "wander" || !poiExists(r.visit.poi.id))) { releaseVisit(id, r.visit.poi, r.visit.slot); r.visit = null; r.clip = null; } // work calls, or the layout changed
  if (mode === "wander") {
    if (r.visit) { // on a trip to a zone: walk there, stay a while (playing the spot's clip), then head back
      const v = r.visit, sp = slotPos(v.poi, v.slot);
      r.tx = sp.x; r.tz = sp.z;
      if (Math.hypot(sp.x - r.x, sp.z - r.z) < 0.15) {
        if (!v.arrived) {
          v.arrived = true; v.until = nowMs + 20_000 + Math.random() * 50_000;
          if (v.poi.clip) r.clip = { id: v.poi.clip, t0: nowMs / 1000, until: v.until / 1000 };
        }
        r.ry = v.poi.face;
        if (nowMs > v.until) { releaseVisit(id, v.poi, v.slot); r.visit = null; r.clip = null; r.wait = 0; const c = chairOf(d); r.tx = c.x; r.tz = c.z + 0.6; }
      }
    } else if (Math.hypot(r.tx - r.x, r.tz - r.z) < 0.05) {
      r.wait -= dt;
      if (r.wait <= 0) {
        const trip = Math.random() < 0.3 ? pickVisit(id) : null; // now and then an idle robot goes to the water cooler, the cafe, ...
        if (trip) r.visit = { poi: trip.poi, slot: trip.slot, arrived: false, until: 0 };
        const c = chairOf(d);
        r.tx = c.x + (Math.random() * 2.8 - 1.4); r.tz = c.z + 0.3 + Math.random() * 1.6; r.wait = 1 + Math.random() * 4;
      }
    }
  } else if (mode === "follow") { // walking with the manager
    const list = followerList(), t = followTarget(Math.max(0, list.indexOf(id)), list.length);
    r.tx = t.x; r.tz = t.z; r.followFace = t.face;
  } else if (r.errand) { // walking somewhere on purpose
    r.tx = r.errand.x; r.tz = r.errand.z;
    if (Math.hypot(r.tx - r.x, r.tz - r.z) < 0.4) { // arrived: do the errand's thing, then (after an optional stay) carry on
      if (r.errand.arrivedAt === undefined) { r.errand.arrivedAt = nowMs; r.errand.done(); }
      if (!r.errand.hold || nowMs - r.errand.arrivedAt > r.errand.hold) r.errand = null;
    }
  } else if (mode === "circle") { // problem: walk an ellipse around the desk
    const o = statusClip("error")?.orbit ?? { rx: 1.9, rz: 1.2, speed: 0.55 };
    if (Math.hypot(r.tx - r.x, r.tz - r.z) < 0.6) r.angle += o.speed * Math.max(dt, 0.016) * 3; // lead the robot along the loop
    r.tx = d.x + Math.cos(r.angle) * o.rx; r.tz = d.z + Math.sin(r.angle) * o.rz;
  } else {
    const g = mode === "sleep" ? bedOf(d) : chairOf(d);
    r.tx = g.x; r.tz = g.z;
  }
  const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
  // Someone (the manager, another robot) is standing on the spot we want: wait a step away instead of pushing against them.
  const blocked = (mode === "desk" || mode === "rush") && dist > 0.05 && dist < 1.8 && occupiedAt(d.worker.id, r.tx, r.tz, 0.85);
  r.moving = dist > 0.05 && !blocked;
  if (blocked) r.ry = Math.atan2(-dx, -dz);
  if (r.moving) {
    const speed = r.visit && !r.visit.arrived ? 1.6 : mode === "follow" && dist > 4 ? 6 : speedOf[mode]; // followers hurry to catch up // walking to a zone is a stroll, not a wander
    const step = Math.min(dist, speed * dt);
    let ux = dx / dist, uz = dz / dist;
    if (dist > 1.5 && nav.flow) { // far away: follow the shared flow field around desks and furniture
      const dir = nav.flow.dir(r.x, r.z, nav.flow.field(r.tx, r.tz));
      if (dir) { ux = dir.dx; uz = dir.dz; }
    }
    [ux, uz] = steerAround(d.worker.id, r, ux, uz); // go around whoever is in the way
    r.x += ux * step; r.z += uz * step;
    r.ry = Math.atan2(-ux, -uz);
  } else if (mode === "follow") {
    r.ry = r.followFace ?? r.ry; // arrived: face where the target says (the table, the huddle centre, or the way the manager walks)
  } else if (r.visit?.arrived) {
    r.ry = r.visit.poi.face;
  } else {
    r.ry = mode === "wander" ? r.ry : 0; // sitting bots face their desk
  }
  separate(d.worker.id, r);
  r.lying = mode === "sleep" && !r.moving;
  return r;
}

/** A bot that has arrived and has nothing to animate can be skipped by the frame loop (asleep or error, parked). */
const settled = (d: DeskSlot, r: Roam, mode: BotMode) => !r.moving && mode !== "rush" && mode === "sleep" && !looks.has(d.worker.id);

export function poseBot(m: Meshes, i: number, d: DeskSlot, t: number, animate: boolean, r: Roam): void {
  const { activity } = d.worker;
  const real = effectiveState(d.worker.id, d.worker.state);
  const state = real === "asleep" && !r.lying && animate ? "idle" : real;
  const ph = i * 0.7;
  let bob = 0, sway = 0, wave = 0, beacon = 0, swing = 0, hop0 = 0;
  if (r.lying) { /* asleep on the floor: no animation */ }
  else if (r.moving) {
    // walking: diagonal leg pairs swing opposite ways, the arm bar seesaws like swinging hands, the body bobs with each step
    const f = r.mode === "rush" ? 16 : 11, p = t * f + ph;
    bob = Math.abs(Math.sin(p)) * 0.07;
    swing = Math.sin(p) * 0.85;
    wave = -Math.sin(p) * 0.6;
    sway = Math.sin(p) * 0.05;
  }
  else if (animate) {
    if (state === "idle") bob = Math.sin(t * 1.2 + ph) * 0.03;
    else if (state === "working") {
      if (activity === "coding") bob = Math.sin(t * 8 + ph) * 0.04;
      else if (activity === "researching") { bob = Math.sin(t * 1.5 + ph) * 0.03; sway = Math.sin(t * 1.2 + ph) * 0.12; }
      else bob = Math.sin(t * 3.5 + ph) * 0.05;
    } else if (state === "done") wave = Math.sin(t * 12) * 0.7;
    else if (state === "waiting") bob = Math.sin(t * 1.2 + ph) * 0.02;
  }
  // Clips: a status clip plays as long as the status lasts; an idle robot standing still picks a random idle clip now and then.
  const now = performance.now() / 1000;
  let clip: Clip | undefined = statusClip(real) ?? (real === "working" && conductors.has(d.worker.id) ? clipById("conduct") : undefined);
  if (!clip && animate && real === "idle" && !r.moving && !r.lying && IDLE_CLIPS.length) {
    if (r.clip && now > r.clip.until) r.clip = null;
    if (!r.clip && Math.random() < 0.012) { // about once every 5 s per robot at 60 fps
      const pick = IDLE_CLIPS[Math.floor(Math.random() * IDLE_CLIPS.length)]!;
      const [lo, hi] = pick.seconds ?? [3, 5];
      r.clip = { id: pick.id, t0: now, until: now + lo + Math.random() * (hi - lo) };
    }
    clip = r.clip ? IDLE_CLIPS.find((x) => x.id === r.clip!.id) : undefined;
  } else if (r.moving && r.clip) r.clip = null;
  let lean = 0, cspin = 0;
  if (clip && animate && !r.lying) {
    const cp = clip.pose(clip.kind === "idle" && r.clip ? now - r.clip.t0 : now, ph);
    bob += cp.bob ?? 0; sway += cp.sway ?? 0; wave += cp.wave ?? 0; swing += cp.swing ?? 0; lean = cp.lean ?? 0; cspin = cp.spin ?? 0;
    hop0 = cp.hop ?? 0;
  }
  r.icon = r.mode === "follow" ? "👥" : r.lying ? (STATE_ICON.asleep ?? "") : (clip?.icon ?? STATE_ICON[real] ?? "");
  const c = chairOf(d);
  if (real === "waiting") beacon = animate ? 0.8 + 0.4 * Math.sin(t * 5 + ph) : 1;
  // Effects (zap, pat, ...): shake, hop, spin, sway, raised arm and a color tint; the tint is restored when the effect ends.
  const fp = fxPose(d.worker.id);
  let jx = 0, jz = 0, hop = hop0, spin = cspin, arm = 0;
  if (fp) {
    jx = fp.jx; jz = fp.jz; hop += fp.hop; spin += fp.spin; sway += fp.sway; arm = fp.arm;
    if (fp.tint) {
      const c = col.set(d.worker.color).lerp(tintColor(fp.tint), fp.tintAmt);
      m.body.setColorAt(i, c); m.codexHead.setColorAt(i, c); m.codexBody.setColorAt(i, c); m.antenna.setColorAt(i, c); m.legA.setColorAt(i, c); m.legB.setColorAt(i, c);
      r.flash = true;
    }
  } else if (r.flash) {
    const c = col.set(d.worker.color);
    m.body.setColorAt(i, c); m.codexHead.setColorAt(i, c); m.codexBody.setColorAt(i, c); m.antenna.setColorAt(i, c); m.legA.setColorAt(i, c); m.legB.setColorAt(i, c);
    r.flash = false;
  }
  if (r.flash || fp) for (const k of [m.body, m.codexHead, m.codexBody, m.antenna, m.legA, m.legB]) if (k.instanceColor) k.instanceColor.needsUpdate = true;
  wave += arm;
  grp.position.set(r.x + jx, (r.lying ? 0.45 : 0.6 + bob) + hop, r.z + jz);
  grp.rotation.order = "YXZ";
  grp.rotation.set(r.lying ? 0 : lean, r.ry + spin, r.lying ? Math.PI / 2 : sway);
  grp.updateMatrix();
  const codex = d.worker.source === "codex";
  if (codex) {
    put(m.codexHead, i, 0, 0.14, 0, 0, 1);
    put(m.codexBody, i, 0, -0.22, 0, 0, 1);
    put(m.codexVisor, i, 0, 0.14, -0.306, 0, 1);
    put(m.codexEyes, i, 0, 0.14, -0.332, 0, 1);
  } else {
    put(m.body, i, 0, 0, 0, 0, 1);
    put(m.visor, i, 0, 0.07, -0.255, 0, 1);
  }
  put(m.legA, i, 0, -0.29, 0, 0, 1, swing);
  put(m.legB, i, 0, -0.29, 0, 0, 1, -swing);
  put(m.antenna, i, 0, -0.07, 0, wave);
  putWorld(m.beacon, i, c.x, 1.9, c.z, beacon);
}

export function writeStatic(m: Meshes, layout: Layout, fetchedId: string | undefined): number[] {
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
    m.codexHead.setColorAt(i, body); m.codexBody.setColorAt(i, body);
    m.antenna.setColorAt(i, body);
    m.legA.setColorAt(i, body); m.legB.setColorAt(i, body);
    m.visor.setColorAt(i, visorColor(st));
    m.codexVisor.setColorAt(i, new Color("#111a46"));
    m.codexEyes.setColorAt(i, new Color("#55f6f2"));
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
