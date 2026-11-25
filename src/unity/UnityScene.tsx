import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, type Group } from "three";
import { PodModel, POD_GREEN } from "./PodModel";
import { live, useUnity } from "./store";
import { useStore } from "../state/store";
import { UNITY_RADIUS, ago, clampToFloor, type UGhost } from "../shared/unity";

/** The Unity space: a floating green platform with a starry sky, the exit pod at the back, live avatars and ghosts. Plain React Three Fiber. */
const SPAWN = { x: 0, z: 7 };
const POD = { x: 0, z: -10.5 };
const SPEED = 4.2, SPRINT = 7;

/** A small original "spark bot": rounded body, glowing visor, antenna. `ghost` draws it see-through. */
function SparkBot({ color, ghost = false }: { color: string; ghost?: boolean }) {
  const op = ghost ? 0.32 : 1;
  const mat = { color, transparent: ghost, opacity: op, depthWrite: !ghost, roughness: 0.45, metalness: 0.1 } as const;
  return (
    <group>
      <mesh position={[0, 0.62, 0]}><capsuleGeometry args={[0.3, 0.5, 4, 14]} /><meshStandardMaterial {...mat} emissive={ghost ? color : "#000000"} emissiveIntensity={ghost ? 0.5 : 0} /></mesh>
      <mesh position={[0, 0.78, 0.25]}><boxGeometry args={[0.42, 0.17, 0.12]} /><meshStandardMaterial color="#e0fff0" emissive="#9dffd0" emissiveIntensity={ghost ? 0.6 : 1.6} transparent={ghost} opacity={ghost ? 0.5 : 1} toneMapped={false} /></mesh>
      <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[0.018, 0.018, 0.3, 6]} /><meshStandardMaterial color="#cbd5e1" transparent={ghost} opacity={op} /></mesh>
      <mesh position={[0, 1.42, 0]}><sphereGeometry args={[0.055, 10, 8]} /><meshStandardMaterial color="#fff" emissive={color} emissiveIntensity={ghost ? 0.6 : 1.4} transparent={ghost} opacity={op} toneMapped={false} /></mesh>
      <mesh position={[-0.14, 0.12, 0]}><sphereGeometry args={[0.11, 10, 8]} /><meshStandardMaterial {...mat} /></mesh>
      <mesh position={[0.14, 0.12, 0]}><sphereGeometry args={[0.11, 10, 8]} /><meshStandardMaterial {...mat} /></mesh>
    </group>
  );
}

const pill: React.CSSProperties = { whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 999, background: "rgba(8,16,12,.82)", border: "1px solid #2f6f4d", color: "#d1fae5", fontSize: 11, pointerEvents: "none" };
const talk: React.CSSProperties = { width: "max-content", maxWidth: 220, padding: "5px 10px", borderRadius: 12, background: "#f0fdf4", color: "#052e16", fontSize: 12, lineHeight: 1.25, pointerEvents: "none", boxShadow: "0 2px 10px #0006", wordBreak: "break-word", textAlign: "center" };

/** Name tag and speech bubble above a bot. Text is rendered by React as plain text, never as HTML. */
function Tag({ id, name, sub, ghost = false, last = "" }: { id: string; name: string; sub?: string; ghost?: boolean; last?: string }) {
  const bubble = useUnity((s) => s.room.bubbles[id]);
  const muted = useUnity((s) => s.muted.includes(id));
  return (
    <Html position={[0, 1.85, 0]} center distanceFactor={11} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: ghost ? 0.7 : 1 }}>
        {!ghost && bubble && !muted && <div style={talk}>{bubble.text}</div>}
        {ghost && last && !muted && <div style={{ ...talk, background: "rgba(240,253,244,.55)", fontStyle: "italic" }}>“{last}”</div>}
        <div style={pill}>{name}{muted ? " (muted)" : ""}{sub ? <span style={{ opacity: 0.7 }}> · {sub}</span> : null}</div>
      </div>
    </Html>
  );
}

function Peer({ id, name, color }: { id: string; name: string; color: string }) {
  const g = useRef<Group>(null);
  const cur = useRef({ x: NaN, z: NaN, r: 0 });
  useFrame(({ clock }, dt) => {
    const t = live.get(id), node = g.current;
    if (!t || !node) return;
    const c = cur.current;
    if (Number.isNaN(c.x)) { c.x = t.x; c.z = t.z; c.r = t.r; }
    const k = 1 - Math.exp(-10 * Math.min(dt, 0.1));
    const dx = t.x - c.x, dz = t.z - c.z;
    c.x += dx * k; c.z += dz * k;
    let dr = t.r - c.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.r += dr * k;
    const moving = Math.hypot(dx, dz) > 0.05;
    node.position.set(c.x, moving ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.07 : 0, c.z);
    node.rotation.y = c.r;
  });
  return (
    <group ref={g}>
      <SparkBot color={color} />
      <Tag id={id} name={name} />
    </group>
  );
}

function GhostFigure({ g }: { g: UGhost }) {
  const p = clampToFloor(g.x, g.z);
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = 0.08 + Math.sin(clock.elapsedTime * 1.2 + p.x) * 0.06; });
  return (
    <group ref={ref} position={[p.x, 0, p.z]} rotation={[0, g.r, 0]}>
      <SparkBot color={g.color} ghost />
      <Tag id={g.id} name={g.name} sub={`was here ${ago(g.leftAt)}`} ghost last={g.text} />
    </group>
  );
}

/** Your own bot: WASD / arrows (Shift to sprint) or click the floor. The camera follows. */
function Me() {
  const g = useRef<Group>(null);
  const color = useStore((s) => s.managerColor);
  const pos = useRef({ x: SPAWN.x, z: SPAWN.z, r: Math.PI });
  const target = useRef<{ x: number; z: number } | null>(null);
  const keys = useRef(new Set<string>());
  const me = useUnity((s) => s.room.me);
  const status = useUnity((s) => s.status);

  useEffect(() => {
    const typing = () => { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"); };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { keys.current.add(k); target.current = null; if (k.startsWith("arrow")) e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  // clicks on the floor arrive here through a window event so the floor mesh stays dumb
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ x: number; z: number }>).detail; target.current = clampToFloor(d.x, d.z); };
    window.addEventListener("unity-goto", h);
    return () => window.removeEventListener("unity-goto", h);
  }, []);

  useFrame(({ camera, clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const k = keys.current;
    let dx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    let dz = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const t = target.current;
    if (!dx && !dz && t) {
      const ex = t.x - pos.current.x, ez = t.z - pos.current.z, d = Math.hypot(ex, ez);
      if (d < 0.12) target.current = null; else { dx = ex / d; dz = ez / d; }
    }
    const moving = dx !== 0 || dz !== 0;
    if (moving) {
      const len = Math.hypot(dx, dz); dx /= len; dz /= len;
      const v = (k.has("shift") ? SPRINT : SPEED) * dt;
      const c = clampToFloor(pos.current.x + dx * v, pos.current.z + dz * v);
      pos.current.x = c.x; pos.current.z = c.z; pos.current.r = Math.atan2(dx, dz);
    }
    const node = g.current;
    if (node) {
      node.position.set(pos.current.x, moving ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.07 : 0, pos.current.z);
      node.rotation.y = pos.current.r;
    }
    // follow camera
    const want = { x: pos.current.x, y: 8.5, z: pos.current.z + 10.5 };
    const f = 1 - Math.exp(-4 * dt);
    camera.position.x += (want.x - camera.position.x) * f; camera.position.y += (want.y - camera.position.y) * f; camera.position.z += (want.z - camera.position.z) * f;
    camera.lookAt(pos.current.x, 1, pos.current.z);
    if (status === "online") useUnity.getState().move(pos.current.x, pos.current.z, pos.current.r);
  });

  return (
    <group ref={g} position={[SPAWN.x, 0, SPAWN.z]}>
      <SparkBot color={color} />
      {me ? <Tag id={me} name="You" /> : null}
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

function Floor({ onLeave }: { onLeave: () => void }) {
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("unity-goto", { detail: { x: e.point.x, z: e.point.z } })); };
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={click}><circleGeometry args={[UNITY_RADIUS, 72]} /><meshStandardMaterial color="#0e1f18" roughness={0.85} /></mesh>
      {[4, 8, 12].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[r - 0.04, r, 72]} /><meshBasicMaterial color={POD_GREEN} transparent opacity={0.18} toneMapped={false} /></mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[UNITY_RADIUS - 0.25, UNITY_RADIUS, 96]} /><meshBasicMaterial color={POD_GREEN} toneMapped={false} /></mesh>
      <mesh position={[0, -0.6, 0]}><cylinderGeometry args={[UNITY_RADIUS, UNITY_RADIUS * 0.55, 1.2, 48]} /><meshStandardMaterial color="#08140f" roughness={0.9} /></mesh>
      {/* the way back: click the pod, press Esc or use the Leave button */}
      <group position={[POD.x, 0, POD.z]} onClick={(e) => { e.stopPropagation(); onLeave(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <PodModel glow={0.2} />
        <Html position={[0, 3.5, 0]} center distanceFactor={11} style={{ pointerEvents: "none" }}><div style={pill}>Back to the office</div></Html>
      </group>
    </group>
  );
}

export default function UnityScene() {
  const peers = useUnity((s) => s.room.peers);
  const ghosts = useUnity((s) => s.room.ghosts);
  const leave = useUnity((s) => s.leave);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [SPAWN.x, 8.5, SPAWN.z + 10.5], fov: 50, near: 0.1, far: 400 }} style={{ position: "absolute", inset: 0 }}>
      <color attach="background" args={["#040a07"]} />
      <fog attach="fog" args={["#040a07", 40, 150]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 14, 8]} intensity={0.9} color="#e8fff2" />
      <Stars />
      <Floor onLeave={leave} />
      {ghosts.map((g) => <GhostFigure key={g.id} g={g} />)}
      {Object.values(peers).map((p) => <Peer key={p.id} id={p.id} name={p.name} color={p.color} />)}
      <Me />
    </Canvas>
  );
}
