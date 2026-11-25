import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { PodModel, POD_GREEN } from "./PodModel";
import { OwnerBot, ownerHeight, type Motion } from "./OwnerBot";
import { fx, live, useUnity } from "./store";
import { useStore } from "../state/store";
import { getAvatar, type PoseClip } from "../world/avatar";
import { UNITY_RADIUS, ago, avatarOf, clampToFloor, type UGhost, type UPeer } from "../shared/unity";

/**
 * The Unity space: a floating green platform with a starry sky and the phone booth in the middle, where everybody arrives.
 * Players are drawn as the owner character they chose in their own Settings (avatar, look, colour) and walk like the owner
 * does in the office (walk mode, never the hand). Plain React Three Fiber.
 */
const BOOTH = { x: 0, z: 0 };
const BOOTH_SCALE = 1.35; // the owner is tall: the booth is built for them
const OUT = { x: 0, z: 4.6 };  // just outside the booth door (towards +z)
const SPEED = 4.2, SPRINT = 7;
const arrivalEnergy = (): number => Math.max(0, 1 - (performance.now() - fx.arrival) / 1400);
const clipFor = (speed: number): PoseClip => (speed < 0.4 ? "idle" : speed > SPEED * 1.3 ? "sprint" : "walk");

const pill: React.CSSProperties = { whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 999, background: "rgba(8,16,12,.82)", border: "1px solid #2f6f4d", color: "#d1fae5", fontSize: 11, pointerEvents: "none" };
const talk: React.CSSProperties = { width: "max-content", maxWidth: 220, padding: "5px 10px", borderRadius: 12, background: "#f0fdf4", color: "#052e16", fontSize: 12, lineHeight: 1.25, pointerEvents: "none", boxShadow: "0 2px 10px #0006", wordBreak: "break-word", textAlign: "center" };

/** Name tag and speech bubble above a player. Text is rendered by React as plain text, never as HTML. */
function Tag({ id, name, height, sub, ghost = false, last = "" }: { id: string; name: string; height: number; sub?: string; ghost?: boolean; last?: string }) {
  const bubble = useUnity((s) => s.room.bubbles[id]);
  const muted = useUnity((s) => s.muted.includes(id));
  return (
    <Html position={[0, height + 0.35, 0]} center distanceFactor={13} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: ghost ? 0.75 : 1 }}>
        {!ghost && bubble && !muted && <div style={talk}>{bubble.text}</div>}
        {ghost && last && !muted && <div style={{ ...talk, background: "rgba(240,253,244,.6)", fontStyle: "italic" }}>“{last}”</div>}
        <div style={pill}>{name}{muted ? " (muted)" : ""}{sub ? <span style={{ opacity: 0.7 }}> · {sub}</span> : null}</div>
      </div>
    </Html>
  );
}

/** Another player: eases towards the position the relay last reported and walks, runs or stands depending on how fast that is. */
function Peer({ p }: { p: UPeer }) {
  const g = useRef<Group>(null);
  const cur = useRef({ x: NaN, z: NaN, r: 0 });
  const motion = useRef<Motion>({ clip: "idle", t: 0, speed: 0 });
  const height = useMemo(() => ownerHeight(p.avatar, p.look), [p.avatar, p.look]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1), t = live.get(p.id), node = g.current;
    if (!t || !node) return;
    const c = cur.current;
    if (Number.isNaN(c.x)) { c.x = t.x; c.z = t.z; c.r = t.r; }
    const k = 1 - Math.exp(-10 * dt), px = c.x, pz = c.z;
    c.x += (t.x - c.x) * k; c.z += (t.z - c.z) * k;
    let dr = t.r - c.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.r += dr * k;
    const speed = dt > 0 ? Math.hypot(c.x - px, c.z - pz) / dt : 0;
    const m = motion.current;
    m.speed += (speed - m.speed) * (1 - Math.exp(-8 * dt));
    m.clip = clipFor(m.speed);
    m.t += dt * 11 * (m.speed / SPEED);
    node.position.set(c.x, 0, c.z);
    node.rotation.y = c.r;
  });
  return (
    <group ref={g}>
      <OwnerBot avatar={p.avatar} look={p.look} color={p.color} motion={() => motion.current} />
      <Tag id={p.id} name={p.name} height={height} />
    </group>
  );
}

/** A few flickering sparks over a broken figure. */
function Sparks() {
  const sparks = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    sparks.current.forEach((s, i) => {
      if (!s) return;
      const ph = t * 3 + i * 2.1;
      s.visible = Math.sin(ph * 5) > 0.2;
      s.position.set(Math.sin(ph) * 0.6, 0.3 + Math.abs(Math.sin(ph * 1.7)) * 0.6, Math.cos(ph * 0.8) * 0.5);
    });
  });
  return <>{[0, 1, 2, 3].map((i) => <mesh key={i} ref={(m) => { sparks.current[i] = m; }}><boxGeometry args={[0.06, 0.06, 0.06]} /><meshBasicMaterial color="#ffd166" toneMapped={false} /></mesh>)}</>;
}

/** Somebody who left. Said goodbye (with or without a message): a faint figure. Connection just dropped: a broken heap with sparks. */
function GhostFigure({ g }: { g: UGhost }) {
  const p = clampToFloor(g.x, g.z);
  const ref = useRef<Group>(null);
  const broken = g.kind === "broken";
  const height = useMemo(() => ownerHeight(g.avatar, g.look), [g.avatar, g.look]);
  useFrame(({ clock }) => { if (ref.current && !broken) ref.current.position.y = 0.1 + Math.sin(clock.elapsedTime * 1.2 + p.x) * 0.07; });
  return (
    <group ref={ref} position={[p.x, 0, p.z]} rotation={[0, g.r, 0]}>
      <OwnerBot avatar={g.avatar} look={g.look} color={g.color} mode={broken ? "broken" : "ghost"} seed={g.id} />
      {broken && <Sparks />}
      <Tag id={g.id} name={g.name} height={broken ? 0.9 : height} sub={`${broken ? "connection lost" : "was here"} ${ago(g.leftAt)}`} ghost last={g.kind === "message" ? g.text : ""} />
    </group>
  );
}

/** You, as the owner character from your Settings: WASD / arrows (Shift to sprint) or click the floor. You step out of the booth on arrival; the camera follows. */
function Me() {
  const g = useRef<Group>(null);
  const color = useStore((s) => s.managerColor);
  const avatarId = useStore((s) => s.avatar);
  const look = useStore((s) => s.devLook);
  const avatar = avatarOf(avatarId);
  const focusY = useMemo(() => getAvatar(avatar, look).focusY, [avatar, look]);
  const height = useMemo(() => ownerHeight(avatar, look), [avatar, look]);
  const pos = useRef({ x: BOOTH.x, z: BOOTH.z, r: Math.PI }); // facing the door
  const target = useRef<{ x: number; z: number } | null>({ ...OUT });
  const keys = useRef(new Set<string>());
  const motion = useRef<Motion>({ clip: "idle", t: 0, speed: 0 });
  const me = useUnity((s) => s.room.me);
  const status = useUnity((s) => s.status);

  useEffect(() => {
    const typing = () => { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"); };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { keys.current.add(k); if (k !== "shift") target.current = null; if (k.startsWith("arrow")) e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  // clicks on the floor arrive through a window event so the floor mesh stays dumb
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ x: number; z: number }>).detail; target.current = clampToFloor(d.x, d.z); };
    window.addEventListener("unity-goto", h);
    return () => window.removeEventListener("unity-goto", h);
  }, []);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const k = keys.current;
    let dx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    let dz = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const t = target.current;
    if (!dx && !dz && t) {
      const ex = t.x - pos.current.x, ez = t.z - pos.current.z, d = Math.hypot(ex, ez);
      if (d < 0.15) target.current = null; else { dx = ex / d; dz = ez / d; }
    }
    const moving = dx !== 0 || dz !== 0;
    const spd = moving ? (k.has("shift") ? SPRINT : SPEED) : 0;
    if (moving) {
      const len = Math.hypot(dx, dz); dx /= len; dz /= len;
      const c = clampToFloor(pos.current.x + dx * spd * dt, pos.current.z + dz * spd * dt);
      pos.current.x = c.x; pos.current.z = c.z; pos.current.r = Math.atan2(-dx, -dz); // the owner faces -z at rotation 0, like in the office
    }
    const m = motion.current;
    m.speed = spd; m.clip = clipFor(spd); m.t += dt * 11 * (spd / SPEED);
    const node = g.current;
    if (node) { node.position.set(pos.current.x, 0, pos.current.z); node.rotation.y = pos.current.r; }
    // follow camera, looking at chest height like the office camera
    const f = 1 - Math.exp(-4 * dt);
    camera.position.x += (pos.current.x - camera.position.x) * f;
    camera.position.y += (9.5 - camera.position.y) * f;
    camera.position.z += (pos.current.z + 12.5 - camera.position.z) * f;
    camera.lookAt(pos.current.x, focusY, pos.current.z);
    if (status === "online") useUnity.getState().move(pos.current.x, pos.current.z, pos.current.r);
  });

  return (
    <group ref={g} position={[BOOTH.x, 0, BOOTH.z]}>
      <OwnerBot avatar={avatar} look={look} color={color} motion={() => motion.current} />
      {me ? <Tag id={me} name="You" height={height} /> : null}
    </group>
  );
}

function Stars() {
  const geo = useMemo(() => {
    const n = 420, a = new Float32Array(n * 3);
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; // deterministic
    for (let i = 0; i < n; i++) {
      const r = 70 + rnd() * 60, th = rnd() * Math.PI * 2, ph = Math.acos(0.15 + rnd() * 0.85); // upper hemisphere only
      a[i * 3] = r * Math.sin(ph) * Math.cos(th); a[i * 3 + 1] = r * Math.cos(ph) * 0.8 + 5; a[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new BufferGeometry(); geo.setAttribute("position", new BufferAttribute(a, 3)); return geo;
  }, []);
  return <points geometry={geo}><pointsMaterial color="#bbf7d0" size={0.45} sizeAttenuation transparent opacity={0.8} toneMapped={false} /></points>;
}

/** A column of light in the booth whenever somebody arrives. */
function ArrivalBeam() {
  const m = useRef<Mesh>(null);
  useFrame(() => {
    const e = arrivalEnergy(), mesh = m.current;
    if (!mesh) return;
    mesh.visible = e > 0.01;
    (mesh.material as MeshBasicMaterial).opacity = e * 0.55;
    mesh.scale.set(1 + (1 - e) * 0.25, 1, 1 + (1 - e) * 0.25);
  });
  return <mesh ref={m} position={[0, 1.8, 0]} visible={false}><cylinderGeometry args={[0.8, 0.8, 3.6, 18, 1, true]} /><meshBasicMaterial color="#86efac" transparent opacity={0} depthWrite={false} toneMapped={false} /></mesh>;
}

function Floor() {
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("unity-goto", { detail: { x: e.point.x, z: e.point.z } })); };
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={click}><circleGeometry args={[UNITY_RADIUS, 72]} /><meshStandardMaterial color="#0e1f18" roughness={0.85} /></mesh>
      {[4, 8, 12].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[r - 0.04, r, 72]} /><meshBasicMaterial color={POD_GREEN} transparent opacity={0.18} toneMapped={false} /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[UNITY_RADIUS - 0.25, UNITY_RADIUS, 96]} /><meshBasicMaterial color={POD_GREEN} toneMapped={false} /></mesh>
      <mesh position={[0, -0.6, 0]}><cylinderGeometry args={[UNITY_RADIUS, UNITY_RADIUS * 0.55, 1.2, 48]} /><meshStandardMaterial color="#08140f" roughness={0.9} /></mesh>
      {/* the phone booth: everybody arrives here. Click it, press Esc or use the button to leave (the HUD opens the goodbye menu). */}
      <group position={[BOOTH.x, 0, BOOTH.z]} scale={BOOTH_SCALE} onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new Event("unity-exit")); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <PodModel glow={0.2} energy={arrivalEnergy} />
        <ArrivalBeam />
        <Html position={[0, 3.4, 0]} center distanceFactor={13} style={{ pointerEvents: "none" }}><div style={pill}>Phone booth · leave</div></Html>
      </group>
    </group>
  );
}

export default function UnityScene() {
  const peers = useUnity((s) => s.room.peers);
  const ghosts = useUnity((s) => s.room.ghosts);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [BOOTH.x, 9.5, BOOTH.z + 12.5], fov: 50, near: 0.1, far: 400 }} style={{ position: "absolute", inset: 0 }}>
      <color attach="background" args={["#040a07"]} />
      <fog attach="fog" args={["#040a07", 40, 150]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 14, 8]} intensity={0.95} color="#e8fff2" />
      <Stars />
      <Floor />
      {ghosts.map((g) => <GhostFigure key={g.id} g={g} />)}
      {Object.values(peers).map((p) => <Peer key={p.id} p={p} />)}
      <Me />
    </Canvas>
  );
}
