import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CanvasTexture, type Group, type Mesh, type PointLight, type Sprite } from "three";
import { OwnerBot } from "./OwnerBot";
import { POD_GREEN } from "./PodModel";
import { fx, live } from "./store";
import { DEFAULT_DEV_LOOK } from "../world/devLook";
import { CATALOGUE, type Placed } from "../shared/unityLayout";

/**
 * The amenities of the Unity space: original, mostly animated office things people can gather around. Everything here is cosmetic and
 * client-side (no network), and built from primitives. Each model has its front on +z and stands on the floor at the origin; the
 * wrapper turns it towards the booth. Only amenities near you animate. Press E next to one to use it.
 */
type V3 = [number, number, number];
const GATHER = 4.2; // how close you must be to use or read one

// ---- small building blocks

function M({ c, e = 0, o = 1, r = 0.6, m = 0 }: { c: string; e?: number; o?: number; r?: number; m?: number }) {
  return <meshStandardMaterial color={c} emissive={e ? c : "#000000"} emissiveIntensity={e} transparent={o < 1} opacity={o} depthWrite={o >= 1} roughness={r} metalness={m} toneMapped={e === 0} />;
}
type Mat = { c: string; e?: number; o?: number; r?: number; m?: number };
const B = ({ s, p, rot, ...m }: { s: V3; p: V3; rot?: V3 } & Mat) => <mesh position={p} rotation={rot}><boxGeometry args={s} /><M {...m} /></mesh>;
const Cyl = ({ a, p, rot, ...m }: { a: [number, number, number, number?]; p: V3; rot?: V3 } & Mat) => <mesh position={p} rotation={rot}><cylinderGeometry args={a} /><M {...m} /></mesh>;
const Sph = ({ rad, p, s, ...m }: { rad: number; p: V3; s?: V3 } & Mat) => <mesh position={p} scale={s}><sphereGeometry args={[rad, 16, 12]} /><M {...m} /></mesh>;

interface Ctx { id: string; near: { current: boolean }; energy: () => number }
const AmenityCtx = createContext<Ctx>({ id: "", near: { current: true }, energy: () => 0 });
/** A frame callback that only runs while the amenity is near you. `e` is 0..1 right after you used it (E). */
function useAnim(fn: (t: number, dt: number, e: number) => void) {
  const c = useContext(AmenityCtx);
  useFrame(({ clock }, dt) => { if (c.near.current) fn(clock.elapsedTime, Math.min(dt, 0.1), c.energy()); });
}
const hash = (n: number): number => { let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mesh = (a: (Mesh | null)[], i: number) => (m: Mesh | null) => { a[i] = m; };

const texCache: Record<string, CanvasTexture> = {};
function textTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  let t = texCache[key];
  if (!t) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!); t = new CanvasTexture(c); texCache[key] = t; }
  return t;
}

// ---- 1. water cooler
function WaterCooler() {
  const bubbles = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    bubbles.current.forEach((b, i) => {
      if (!b) return;
      const k = (t * (0.35 + e * 0.9) + i * 0.23) % 1;
      b.position.set(Math.sin(i * 2.1 + t) * 0.12, 1.15 + k * 0.75, Math.cos(i * 1.7) * 0.1);
      b.scale.setScalar(0.4 + 0.6 * Math.sin(k * Math.PI));
    });
  });
  return (
    <group>
      <B s={[0.8, 1.1, 0.8]} p={[0, 0.55, 0]} c="#e5eef6" />
      <B s={[0.5, 0.2, 0.05]} p={[0, 0.9, 0.41]} c="#94a3b8" m={0.4} />
      <B s={[0.1, 0.1, 0.1]} p={[-0.12, 0.9, 0.46]} c="#2563eb" e={0.7} />
      <B s={[0.1, 0.1, 0.1]} p={[0.12, 0.9, 0.46]} c="#dc2626" e={0.7} />
      <Cyl a={[0.34, 0.34, 0.8, 20]} p={[0, 1.6, 0]} c="#7dd3fc" o={0.35} r={0.15} />
      <Cyl a={[0.3, 0.3, 0.55, 20]} p={[0, 1.5, 0]} c="#38bdf8" o={0.6} r={0.2} />
      {[0, 1, 2, 3, 4].map((i) => <mesh key={i} ref={mesh(bubbles.current, i)} position={[0, 1.2, 0]}><sphereGeometry args={[0.045, 8, 6]} /><meshBasicMaterial color="#e0f2fe" transparent opacity={0.8} /></mesh>)}
      {[0, 1, 2].map((i) => <Cyl key={i} a={[0.07, 0.05, 0.1, 10]} p={[0.62, 0.15 + i * 0.12, 0.1]} c="#f8fafc" />)}
    </group>
  );
}

// ---- 2. fax on a desk, every few seconds a fax drops straight into the shredder
function FaxShredder() {
  const paper = useRef<Mesh>(null), shred = useRef<Group>(null), lamp = useRef<Mesh>(null);
  const strips = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    const tt = (t * (1 + e * 1.5)) % 5;
    const p = paper.current;
    if (p) {
      if (tt < 0.5) { p.visible = true; p.position.set(0.5 + (tt / 0.5) * 0.7, 1.22, 0.05); p.scale.set(1, 1, 1); }
      else if (tt < 1.0) { const k = (tt - 0.5) / 0.5; p.visible = true; p.position.set(1.2, 1.22 - k * 0.3, 0.05); p.scale.set(1 - 0.7 * k, 1, 1); }
      else p.visible = false;
    }
    const sh = shred.current;
    if (sh) sh.position.x = tt > 0.6 && tt < 1.7 ? 1.25 + Math.sin(t * 60) * 0.012 : 1.25; // the shredder shudders
    strips.current.forEach((s, i) => { if (!s) return; const k = Math.min(1, Math.max(0, (tt - 0.8 - i * 0.12) / 0.6)); s.visible = k > 0 && k < 1; s.position.y = 0.85 - k * 0.5; });
    const l = lamp.current; if (l) l.visible = tt < 0.5 || Math.sin(t * 6) > 0.6; // blinks while receiving
  });
  return (
    <group>
      <B s={[2.2, 0.1, 1.1]} p={[-0.3, 1.0, 0]} c="#8b5e34" r={0.8} />
      {[[-1.3, -0.45], [-1.3, 0.45], [0.7, -0.45], [0.7, 0.45]].map(([x, z], i) => <B key={i} s={[0.1, 0.95, 0.1]} p={[x!, 0.475, z!]} c="#5b3d20" />)}
      <B s={[0.95, 0.24, 0.62]} p={[0.1, 1.17, 0]} c="#cbd5e1" m={0.2} />
      <B s={[0.5, 0.05, 0.3]} p={[0.0, 1.31, -0.1]} rot={[-0.35, 0, 0]} c="#f8fafc" />
      <B s={[0.3, 0.02, 0.14]} p={[-0.2, 1.3, 0.2]} c="#0f172a" e={0.3} />
      <mesh ref={lamp} position={[0.4, 1.3, 0.22]}><sphereGeometry args={[0.03, 8, 6]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh>
      <mesh ref={paper} position={[0.5, 1.22, 0.05]} visible={false}><boxGeometry args={[0.5, 0.012, 0.36]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <group ref={shred} position={[1.25, 0, 0]}>
        <B s={[0.8, 0.9, 0.7]} p={[0, 0.45, 0]} c="#334155" m={0.3} />
        <B s={[0.6, 0.04, 0.08]} p={[0, 0.92, 0]} c="#020617" />
        <B s={[0.5, 0.3, 0.02]} p={[0, 0.5, 0.36]} c="#7dd3fc" o={0.3} />
        {[0, 1, 2, 3].map((i) => <mesh key={i} ref={mesh(strips.current, i)} position={[-0.15 + i * 0.1, 0.8, 0.3]} visible={false}><boxGeometry args={[0.03, 0.18, 0.01]} /><meshBasicMaterial color="#ffffff" /></mesh>)}
      </group>
    </group>
  );
}

// ---- 3. the big copier: always working, every copy straight into a shredder bin
function Copier() {
  const body = useRef<Group>(null), bar = useRef<Mesh>(null);
  const sheets = useRef<(Mesh | null)[]>([]);
  const lights = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    const sp = 1 + e * 1.5;
    if (body.current) body.current.position.y = Math.sin(t * 38) * 0.004;
    if (bar.current) bar.current.position.z = Math.sin(t * 2.6 * sp) * 0.38;
    sheets.current.forEach((s, i) => {
      if (!s) return;
      const tt = (t * sp + i * 0.6) % 1.8;
      if (tt < 0.6) { s.visible = true; s.position.set(1.25 + (tt / 0.6) * 0.9, 0.97, 0); s.scale.set(1, 1, 1); }
      else if (tt < 1.0) { const k = (tt - 0.6) / 0.4; s.visible = true; s.position.set(2.15, 0.97 - k * 0.2, 0); s.scale.set(1 - 0.75 * k, 1, 1); }
      else s.visible = false;
    });
    lights.current.forEach((l, i) => { if (l) l.visible = Math.sin(t * (3 + i) + i) > -0.2; });
  });
  return (
    <group position={[-0.75, 0, 0]}>
      <group ref={body}>
        <B s={[2.4, 1.5, 1.2]} p={[0, 0.75, 0]} c="#d9dee5" r={0.5} />
        <B s={[2.4, 0.14, 1.2]} p={[0, 1.57, 0]} c="#334155" />
        <B s={[2.0, 0.03, 0.95]} p={[0, 1.66, 0]} c="#9ff5c7" o={0.35} r={0.1} />
        <mesh ref={bar} position={[0, 1.67, 0]}><boxGeometry args={[1.9, 0.02, 0.05]} /><meshBasicMaterial color="#86efac" toneMapped={false} /></mesh>
        <B s={[0.8, 0.28, 0.06]} p={[-0.6, 1.2, 0.62]} c="#0f172a" />
        {[0, 1, 2].map((i) => <mesh key={i} ref={mesh(lights.current, i)} position={[-0.9 + i * 0.3, 1.2, 0.66]}><sphereGeometry args={[0.04, 8, 6]} /><meshBasicMaterial color={["#4ade80", "#fbbf24", "#60a5fa"][i]} toneMapped={false} /></mesh>)}
        <B s={[0.5, 0.06, 0.8]} p={[1.3, 0.9, 0]} c="#94a3b8" m={0.3} />
      </group>
      {[0, 1, 2].map((i) => <mesh key={i} ref={mesh(sheets.current, i)} position={[1.25, 0.97, 0]} visible={false}><boxGeometry args={[0.5, 0.012, 0.36]} /><meshStandardMaterial color="#ffffff" /></mesh>)}
      <group position={[2.15, 0, 0]}>
        <B s={[0.9, 0.85, 0.8]} p={[0, 0.425, 0]} c="#334155" m={0.3} />
        <B s={[0.6, 0.04, 0.08]} p={[0, 0.87, 0]} c="#020617" />
      </group>
    </group>
  );
}

// ---- 4. the statue of the maker: gold, twice the size of a player
function Statue() {
  return (
    <group>
      <B s={[2.4, 0.9, 2.4]} p={[0, 0.45, 0]} c="#2b2f36" r={0.5} />
      <B s={[1.2, 0.22, 0.04]} p={[0, 0.5, 1.21]} c="#f2c14e" e={0.5} m={0.9} />
      <group position={[0, 0.9, 0]} rotation={[0, Math.PI, 0]} scale={2}><OwnerBot avatar="developer" look={DEFAULT_DEV_LOOK} color="#f2c14e" mode="gold" /></group>
      <pointLight position={[0, 6, 2.5]} color="#ffd27a" intensity={2} distance={14} />
    </group>
  );
}

// ---- 5. boxing ring: two random agent types throw bytes at each other
type Kind = "spark" | "codex" | "tars";
const KINDS: Kind[] = ["spark", "codex", "tars"];
function bitSprite(bit: "0" | "1") {
  return textTexture(`bit${bit}`, 64, 64, (g) => { g.font = "bold 52px monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = bit === "0" ? "#7cffb2" : "#67e8f9"; g.fillText(bit, 32, 36); });
}
function Fighter({ kind }: { kind: Kind }) {
  return (
    <group>
      {kind === "spark" && <><B s={[0.62, 0.42, 0.4]} p={[0, 0.55, 0]} c="#4ade80" /><B s={[0.44, 0.08, 0.04]} p={[0, 0.62, 0.21]} c="#e0fff0" e={1.2} /><B s={[0.1, 0.2, 0.1]} p={[-0.18, 0.2, 0]} c="#16a34a" /><B s={[0.1, 0.2, 0.1]} p={[0.18, 0.2, 0]} c="#16a34a" /></>}
      {kind === "codex" && <><Sph rad={0.3} p={[0, 0.5, 0]} s={[1, 1.1, 0.9]} c="#e2e8f0" /><Sph rad={0.22} p={[0, 0.95, 0]} c="#f8fafc" /><B s={[0.28, 0.07, 0.04]} p={[0, 0.97, 0.19]} c="#0f172a" e={0.4} /></>}
      {kind === "tars" && <><B s={[0.34, 1.0, 0.2]} p={[0, 0.55, 0]} c="#cbd5e1" m={0.4} /><B s={[0.2, 0.7, 0.02]} p={[0, 0.6, 0.11]} c="#020617" /></>}
      <Sph rad={0.11} p={[-0.38, 0.55, 0.15]} c="#dc2626" /><Sph rad={0.11} p={[0.38, 0.55, 0.15]} c="#dc2626" />
    </group>
  );
}
function BoxingRing() {
  const [pair, setPair] = useState<[Kind, Kind]>(["spark", "tars"]);
  const cycle = useRef(-1);
  const fighters = useRef<(Group | null)[]>([]);
  const bits = useRef<(Sprite | null)[]>([]);
  const recoil = useRef([0, 0]);
  const texes = useMemo(() => [bitSprite("0"), bitSprite("1")], []);
  useAnim((t, dt) => {
    const c = Math.floor(t / 14);
    if (c !== cycle.current) { cycle.current = c; const a = Math.floor(hash(c) * 3), b = (a + 1 + Math.floor(hash(c + 99) * 2)) % 3; setPair([KINDS[a]!, KINDS[b]!]); }
    const R = recoil.current;
    bits.current.forEach((s, j) => {
      if (!s) return;
      const n = Math.floor((t + j * 0.3) / 0.9), k = ((t + j * 0.3) % 0.9) / 0.9;
      const from = n % 2 === 0 ? -1 : 1;
      s.position.set(from * (1.1 - 2.2 * k), 1.0 + Math.sin(k * Math.PI) * 0.7, 0);
      (s.material as { map: CanvasTexture | null }).map = texes[hash(n) > 0.5 ? 1 : 0]!;
      if (k > 0.92) R[from === -1 ? 1 : 0] = 1; // the one it hits recoils
    });
    fighters.current.forEach((f, i) => { if (!f) return; R[i] = Math.max(0, (R[i] ?? 0) - dt * 5); f.rotation.z = (i === 0 ? 1 : -1) * (R[i] ?? 0) * 0.35; f.position.y = 0.4 + Math.sin(t * 6 + i) * 0.03; });
  });
  return (
    <group>
      <B s={[5, 0.4, 5]} p={[0, 0.2, 0]} c="#1e3a8a" />
      {[[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]].map(([x, z], i) => <Cyl key={i} a={[0.1, 0.1, 1.7, 8]} p={[x!, 1.25, z!]} c="#e5e7eb" m={0.3} />)}
      {[0.9, 1.3, 1.7].map((y, i) => (
        <group key={i}>
          <B s={[4.8, 0.05, 0.05]} p={[0, y, -2.4]} c={i === 1 ? "#f8fafc" : "#dc2626"} /><B s={[4.8, 0.05, 0.05]} p={[0, y, 2.4]} c={i === 1 ? "#f8fafc" : "#dc2626"} />
          <B s={[0.05, 0.05, 4.8]} p={[-2.4, y, 0]} c={i === 1 ? "#f8fafc" : "#dc2626"} /><B s={[0.05, 0.05, 4.8]} p={[2.4, y, 0]} c={i === 1 ? "#f8fafc" : "#dc2626"} />
        </group>
      ))}
      <group ref={(g) => { fighters.current[0] = g; }} position={[-1.1, 0.4, 0]} rotation={[0, Math.PI / 2, 0]}><Fighter kind={pair[0]} /></group>
      <group ref={(g) => { fighters.current[1] = g; }} position={[1.1, 0.4, 0]} rotation={[0, -Math.PI / 2, 0]}><Fighter kind={pair[1]} /></group>
      <group position={[0, 0.4, 0]}>
        {[0, 1, 2].map((j) => <sprite key={j} ref={(s) => { bits.current[j] = s; }} scale={[0.4, 0.4, 0.4]}><spriteMaterial map={texes[0]} toneMapped={false} transparent depthWrite={false} /></sprite>)}
      </group>
    </group>
  );
}

// ---- 6. office plant
function Plant() {
  const leaves = useRef<(Group | null)[]>([]);
  useAnim((t, _dt, e) => leaves.current.forEach((l, i) => { if (l) l.rotation.z = Math.sin(t * 0.9 + i * 1.3) * (0.05 + e * 0.12) + (l.userData.tilt as number); }));
  return (
    <group>
      <Cyl a={[0.6, 0.45, 0.8, 16]} p={[0, 0.4, 0]} c="#b45309" r={0.8} />
      <Cyl a={[0.55, 0.55, 0.04, 16]} p={[0, 0.8, 0]} c="#3f2a14" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2, tilt = 0.35 + (i % 3) * 0.18;
        return (
          <group key={i} rotation={[0, a, 0]} position={[0, 0.8, 0]}>
            <group ref={(g) => { leaves.current[i] = g; if (g) g.userData.tilt = tilt; }} rotation={[0, 0, tilt]}>
              <Sph rad={0.22} p={[0.1, 0.9 + (i % 2) * 0.35, 0]} s={[0.5, 3.4 + (i % 3) * 0.5, 0.9]} c={i % 2 ? "#15803d" : "#166534"} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

// ---- 7. the stapler monument
function Stapler() {
  const arm = useRef<Group>(null), staple = useRef<Mesh>(null);
  useAnim((t, _dt, e) => {
    const tt = (t * (1 + e * 2)) % 6, k = tt < 0.18 ? tt / 0.18 : tt < 0.5 ? 1 - (tt - 0.18) / 0.32 : 0; // ka-chunk
    if (arm.current) arm.current.rotation.x = k * 0.22;
    if (staple.current) staple.current.visible = tt > 0.18 && tt < 5.5;
  });
  return (
    <group>
      <B s={[3.6, 0.3, 1.5]} p={[0, 0.15, 0]} c="#1f2937" r={0.5} />
      <B s={[3.0, 0.42, 0.8]} p={[0, 0.51, -0.1]} c="#b91c1c" r={0.4} />
      <B s={[0.9, 0.012, 0.6]} p={[0.6, 0.31, 0.5]} c="#ffffff" />
      <mesh ref={staple} position={[0.9, 0.32, 0.5]} visible={false}><boxGeometry args={[0.18, 0.02, 0.025]} /><meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.3} /></mesh>
      <group ref={arm} position={[0, 0.72, -0.5]}>
        <B s={[3.0, 0.36, 0.78]} p={[0, 0.2, 0.4]} c="#dc2626" r={0.35} />
        <B s={[2.9, 0.05, 0.7]} p={[0, 0.39, 0.4]} c="#fecaca" r={0.3} />
      </group>
      <Cyl a={[0.1, 0.1, 3.0, 12]} p={[0, 0.72, -0.5]} rot={[0, 0, Math.PI / 2]} c="#9ca3af" m={0.8} />
    </group>
  );
}

// ---- 8. coffee machine
function Coffee() {
  const steam = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => steam.current.forEach((s, i) => { if (!s) return; const k = (t * (0.5 + e) + i * 0.33) % 1; s.position.set(Math.sin(t + i) * 0.05, 1.05 + k * 0.7, 0.45); s.scale.setScalar(0.5 + k); (s.material as { opacity: number }).opacity = 0.5 * (1 - k); }));
  return (
    <group>
      <B s={[1.1, 1.9, 0.8]} p={[0, 0.95, 0]} c="#1f2937" m={0.4} r={0.35} />
      <B s={[0.9, 0.5, 0.05]} p={[0, 1.45, 0.41]} c="#0f172a" />
      <B s={[0.6, 0.14, 0.02]} p={[0, 1.55, 0.44]} c="#4ade80" e={0.8} />
      <Cyl a={[0.08, 0.08, 0.3, 10]} p={[0, 1.15, 0.45]} c="#9ca3af" m={0.8} />
      <B s={[0.8, 0.06, 0.5]} p={[0, 0.7, 0.45]} c="#9ca3af" m={0.8} />
      <Cyl a={[0.14, 0.1, 0.22, 14]} p={[0, 0.84, 0.45]} c="#f8fafc" />
      {[0, 1, 2].map((i) => <mesh key={i} ref={mesh(steam.current, i)} position={[0, 1.1, 0.45]}><sphereGeometry args={[0.07, 8, 6]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} /></mesh>)}
    </group>
  );
}

// ---- 9. vending machine
function Vending() {
  const glow = useRef<Mesh>(null);
  useAnim((t) => { const g = glow.current?.material as { emissiveIntensity: number } | undefined; if (g) g.emissiveIntensity = 0.7 + Math.sin(t * 7) * 0.06 + (Math.sin(t * 0.7) > 0.97 ? -0.5 : 0); });
  const cols = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
  return (
    <group>
      <B s={[1.3, 2.3, 0.9]} p={[0, 1.15, 0]} c="#1d4ed8" r={0.4} />
      <mesh ref={glow} position={[-0.12, 1.35, 0.46]}><boxGeometry args={[0.85, 1.5, 0.02]} /><meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={0.7} toneMapped={false} /></mesh>
      {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <B key={`${r}${c}`} s={[0.14, 0.2, 0.1]} p={[-0.42 + c * 0.22, 1.85 - r * 0.45, 0.48]} c={cols[(r * 4 + c) % cols.length]!} />))}
      <B s={[0.25, 1.5, 0.04]} p={[0.5, 1.3, 0.46]} c="#0b1220" />
      <B s={[0.6, 0.22, 0.05]} p={[-0.12, 0.3, 0.46]} c="#020617" />
    </group>
  );
}

// ---- 10. rubber duck shrine
function Duck() {
  const g = useRef<Group>(null), head = useRef<Group>(null), ring = useRef<Mesh>(null);
  useAnim((t, _dt, e) => {
    if (g.current) g.current.position.y = 1.0 + Math.sin(t * 1.4) * 0.08;
    if (head.current) head.current.rotation.z = Math.sin(t * 0.8) * (0.12 + e * 0.35);
    if (ring.current) ring.current.rotation.z = t * 0.5;
  });
  return (
    <group>
      <Cyl a={[1.1, 1.3, 0.8, 24]} p={[0, 0.4, 0]} c="#334155" />
      <mesh ref={ring} position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.95, 1.05, 32]} /><meshBasicMaterial color="#fde047" toneMapped={false} /></mesh>
      <group ref={g} position={[0, 1.0, 0]}>
        <Sph rad={0.8} p={[0, 0.7, 0]} s={[1, 0.8, 1.35]} c="#facc15" />
        <group ref={head} position={[0, 1.55, 0.55]}>
          <Sph rad={0.45} p={[0, 0, 0]} c="#facc15" />
          <B s={[0.4, 0.12, 0.35]} p={[0, -0.05, 0.5]} c="#f97316" />
          <Sph rad={0.06} p={[-0.18, 0.1, 0.36]} c="#020617" /><Sph rad={0.06} p={[0.18, 0.1, 0.36]} c="#020617" />
        </group>
        <Sph rad={0.28} p={[-0.85, 0.85, -0.1]} s={[0.4, 0.8, 1.1]} c="#eab308" /><Sph rad={0.28} p={[0.85, 0.85, -0.1]} s={[0.4, 0.8, 1.1]} c="#eab308" />
      </group>
    </group>
  );
}

// ---- 11. whiteboard with today's commits
const COMMITS = ["fix: the spiral no longer eats the booth", "feat: more ducks", "chore: delete the fax (it came back)", "fix: off-by-one in the shredder", "feat: gold statue, now 2x", "refactor: rename everything", "docs: explain the docs", "perf: stop animating far things", "fix: works on my machine", "feat: boxing, with bytes", "test: add the missing test", "chore: coffee"];
function Whiteboard() {
  const draw = (n: number) => { // a fresh texture each time (not cached): the old one is disposed when the next one arrives
    const c = document.createElement("canvas"); c.width = 512; c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f8fafc"; g.fillRect(0, 0, 512, 320); g.fillStyle = "#0f766e"; g.font = "bold 26px monospace"; g.fillText("TODAY'S COMMITS", 20, 38);
    g.font = "20px monospace";
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#334155" : "#1e293b"; g.fillText(`${(Math.floor(hash(n * 7 + i) * 4000) + 1000).toString(16)}  ${COMMITS[(n * 5 + i * 3) % COMMITS.length]}`, 20, 80 + i * 38); }
    return new CanvasTexture(c);
  };
  const [tex, setTex] = useState(() => draw(0));
  const last = useRef(0);
  useAnim((t) => { const n = Math.floor(t / 8); if (n !== last.current) { last.current = n; setTex((o) => { o.dispose(); return draw(n); }); } });
  return (
    <group>
      <B s={[3.6, 2.2, 0.12]} p={[0, 2.1, 0]} c="#64748b" m={0.3} />
      <mesh position={[0, 2.1, 0.07]}><planeGeometry args={[3.4, 2.0]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      <B s={[0.1, 2.0, 0.1]} p={[-1.4, 1.0, -0.2]} c="#475569" /><B s={[0.1, 2.0, 0.1]} p={[1.4, 1.0, -0.2]} c="#475569" />
      <B s={[3.0, 0.08, 0.2]} p={[0, 1.0, 0.1]} c="#94a3b8" />
    </group>
  );
}

// ---- 12. ping-pong
function PingPong() {
  const ball = useRef<Mesh>(null), p = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    const sp = 1 + e * 1.2, k = (t * 1.3 * sp) % 2, dir = k < 1 ? k : 2 - k;
    if (ball.current) ball.current.position.set(-1.1 + dir * 2.2, 1.12 + Math.abs(Math.sin(dir * Math.PI)) * 0.55, 0.1 * Math.sin(t * 3));
    if (p.current[0]) p.current[0].position.set(-1.45, 1.35 + Math.sin(t * 5 * sp) * 0.05, 0);
    if (p.current[1]) p.current[1].position.set(1.45, 1.35 + Math.sin(t * 5 * sp + 1) * 0.05, 0);
  });
  return (
    <group>
      <B s={[2.9, 0.12, 1.6]} p={[0, 1.0, 0]} c="#1d4ed8" r={0.5} />
      <B s={[0.03, 0.12, 1.6]} p={[0, 1.07, 0]} c="#f8fafc" /><B s={[2.9, 0.012, 0.03]} p={[0, 1.065, 0]} c="#f8fafc" />
      <B s={[0.04, 0.32, 1.7]} p={[0, 1.22, 0]} c="#e5e7eb" o={0.8} />
      {[[-1.3, -0.7], [-1.3, 0.7], [1.3, -0.7], [1.3, 0.7]].map(([x, z], i) => <B key={i} s={[0.1, 0.95, 0.1]} p={[x!, 0.475, z!]} c="#334155" />)}
      <mesh ref={ball} position={[0, 1.2, 0]}><sphereGeometry args={[0.06, 10, 8]} /><meshBasicMaterial color="#fff7ed" toneMapped={false} /></mesh>
      {[0, 1].map((i) => <mesh key={i} ref={mesh(p.current, i)} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.16, 0.16, 0.03, 14]} /><meshStandardMaterial color={i ? "#ef4444" : "#111827"} /></mesh>)}
    </group>
  );
}

// ---- 13. arcade cabinet
function Arcade() {
  const screen = useRef<Mesh>(null);
  useAnim((t) => { const m = screen.current?.material as { color: { setHSL: (h: number, s: number, l: number) => void } } | undefined; m?.color.setHSL((t * 0.3) % 1, 0.8, 0.5 + 0.1 * Math.sin(t * 9)); });
  return (
    <group>
      <B s={[1.1, 2.2, 1.0]} p={[0, 1.1, -0.05]} c="#3b0764" r={0.5} />
      <B s={[1.1, 0.3, 0.6]} p={[0, 1.2, 0.5]} c="#4c1d95" />
      <mesh ref={screen} position={[0, 1.65, 0.46]} rotation={[-0.25, 0, 0]}><planeGeometry args={[0.8, 0.6]} /><meshBasicMaterial color="#22d3ee" toneMapped={false} /></mesh>
      <B s={[1.0, 0.25, 0.1]} p={[0, 2.15, 0.45]} c="#f0abfc" e={0.9} />
      <Cyl a={[0.025, 0.025, 0.2, 8]} p={[-0.25, 1.4, 0.65]} c="#e5e7eb" /><Sph rad={0.06} p={[-0.25, 1.52, 0.65]} c="#ef4444" />
      <Sph rad={0.05} p={[0.15, 1.36, 0.65]} c="#22c55e" /><Sph rad={0.05} p={[0.3, 1.36, 0.65]} c="#3b82f6" />
    </group>
  );
}

// ---- 14. campfire with bean bags
function Campfire() {
  const flames = useRef<(Mesh | null)[]>([]), sparks = useRef<(Mesh | null)[]>([]), light = useRef<PointLight>(null);
  useAnim((t, _dt, e) => {
    flames.current.forEach((f, i) => { if (f) { f.scale.set(1, 0.8 + 0.35 * Math.sin(t * 9 + i * 2) + e * 0.5, 1); f.rotation.y = t + i; } });
    sparks.current.forEach((s, i) => { if (!s) return; const k = (t * (0.4 + e * 0.5) + i * 0.17) % 1; s.position.set(Math.sin(i * 3 + t) * 0.25, 0.7 + k * 1.6, Math.cos(i * 2) * 0.25); s.visible = k < 0.9; });
    if (light.current) light.current.intensity = 1.8 + Math.sin(t * 13) * 0.4 + e;
  });
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => <B key={i} s={[0.3, 0.22, 0.3]} p={[Math.cos(i / 8 * Math.PI * 2) * 0.85, 0.11, Math.sin(i / 8 * Math.PI * 2) * 0.85]} c="#6b7280" />)}
      {[0, 1, 2].map((i) => <Cyl key={i} a={[0.07, 0.07, 1.0, 8]} p={[0, 0.25, 0]} rot={[Math.PI / 2 - 0.2, (i * Math.PI) / 3, 0]} c="#5b3d20" />)}
      {[0, 1, 2].map((i) => <mesh key={i} ref={mesh(flames.current, i)} position={[Math.cos(i * 2.1) * 0.12, 0.55, Math.sin(i * 2.1) * 0.12]}><coneGeometry args={[0.28 - i * 0.04, 0.9 - i * 0.12, 8]} /><meshBasicMaterial color={["#fb923c", "#facc15", "#fef08a"][i]} transparent opacity={0.9} toneMapped={false} /></mesh>)}
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} ref={mesh(sparks.current, i)}><boxGeometry args={[0.04, 0.04, 0.04]} /><meshBasicMaterial color="#fde68a" toneMapped={false} /></mesh>)}
      <pointLight ref={light} position={[0, 1.0, 0]} color="#fb923c" intensity={1.8} distance={9} />
      {[["#ef4444", 0.4], ["#3b82f6", 2.5], ["#22c55e", 4.6]].map(([c, a], i) => <Sph key={i} rad={0.55} p={[Math.cos(a as number) * 2.4, 0.3, Math.sin(a as number) * 2.4]} s={[1.2, 0.6, 1.2]} c={c as string} />)}
    </group>
  );
}

// ---- 15. jukebox
function Jukebox() {
  const notes = useRef<(Mesh | null)[]>([]), arcs = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    notes.current.forEach((n, i) => { if (!n) return; const k = (t * (0.3 + e * 0.5) + i * 0.25) % 1; n.position.set(0.8 + Math.sin(i * 2 + t) * 0.35, 1.3 + k * 1.6, 0.4); n.scale.setScalar(0.8 * (1 - k) + 0.2); n.visible = true; });
    arcs.current.forEach((a, i) => { if (a) a.scale.setScalar(0.92 + 0.1 * Math.sin(t * (4 + i) + e * 3)); });
  });
  return (
    <group>
      <B s={[1.3, 1.6, 0.8]} p={[0, 0.8, 0]} c="#7c2d12" r={0.4} />
      <Cyl a={[0.65, 0.65, 0.8, 24]} p={[0, 1.6, 0]} rot={[Math.PI / 2, 0, 0]} c="#9a3412" />
      {[0.5, 0.38, 0.26].map((r, i) => <mesh key={i} ref={mesh(arcs.current, i)} position={[0, 1.5, 0.41]}><torusGeometry args={[r, 0.03, 8, 24, Math.PI]} /><meshBasicMaterial color={["#f472b6", "#fbbf24", "#34d399"][i]} toneMapped={false} /></mesh>)}
      <B s={[0.8, 0.5, 0.04]} p={[0, 0.7, 0.42]} c="#fde68a" e={0.5} />
      {[0, 1, 2, 3].map((i) => <mesh key={i} ref={mesh(notes.current, i)}><sphereGeometry args={[0.08, 8, 6]} /><meshBasicMaterial color="#f9a8d4" toneMapped={false} /></mesh>)}
    </group>
  );
}

// ---- 16. giant keyboard: keys light up where somebody stands
const KEY_ROWS = 4, KEY_COLS = 8;
function Keyboard({ item }: { item: Placed }) {
  const keys = useRef<(Mesh | null)[]>([]);
  useAnim(() => {
    const f = item.facing, cs = Math.cos(f), sn = Math.sin(f);
    const walkers: { x: number; z: number }[] = [{ x: fx.me.x, z: fx.me.z }];
    live.forEach((p) => walkers.push({ x: p.x, z: p.z }));
    keys.current.forEach((k, i) => {
      if (!k) return;
      const kx = (i % KEY_COLS - (KEY_COLS - 1) / 2) * 0.62, kz = (Math.floor(i / KEY_COLS) - (KEY_ROWS - 1) / 2) * 0.62;
      let lit = 0;
      for (const w of walkers) { const dx = w.x - item.x, dz = w.z - item.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; if (Math.hypot(lx - kx, lz - kz) < 0.55) { lit = 1; break; } }
      k.position.y = 0.12 - lit * 0.05;
      const m = k.material as unknown as { emissiveIntensity: number };
      m.emissiveIntensity += (lit * 1.6 - m.emissiveIntensity) * 0.3;
    });
  });
  return (
    <group>
      <B s={[KEY_COLS * 0.62 + 0.3, 0.1, KEY_ROWS * 0.62 + 0.3]} p={[0, 0.05, 0]} c="#111827" />
      {Array.from({ length: KEY_ROWS * KEY_COLS }, (_, i) => {
        const x = (i % KEY_COLS - (KEY_COLS - 1) / 2) * 0.62, z = (Math.floor(i / KEY_COLS) - (KEY_ROWS - 1) / 2) * 0.62;
        return <mesh key={i} ref={mesh(keys.current, i)} position={[x, 0.12, z]}><boxGeometry args={[0.52, 0.14, 0.52]} /><meshStandardMaterial color={i % 5 === 0 ? "#a78bfa" : "#e5e7eb"} emissive="#4ade80" emissiveIntensity={0} roughness={0.5} /></mesh>;
      })}
    </group>
  );
}

const MODELS: Record<string, ComponentType<{ item: Placed }>> = {
  "water-cooler": WaterCooler, fax: FaxShredder, copier: Copier, statue: Statue, boxing: BoxingRing, plant: Plant, stapler: Stapler,
  coffee: Coffee, vending: Vending, duck: Duck, whiteboard: Whiteboard, pingpong: PingPong, arcade: Arcade, campfire: Campfire, jukebox: Jukebox, keyboard: Keyboard,
};
/** How many catalogue entries (from the start) have a model; layoutFor() never places more than this. */
export const IMPLEMENTED = (() => { const i = CATALOGUE.findIndex((c) => !MODELS[c.id]); return i < 0 ? CATALOGUE.length : i; })();

const pill: React.CSSProperties = { whiteSpace: "nowrap", padding: "3px 10px", borderRadius: 999, background: "rgba(8,16,12,.88)", border: "1px solid #2f6f4d", color: "#d1fae5", fontSize: 12, pointerEvents: "none" };

function AmenityWrap({ item }: { item: Placed }) {
  const g = useRef<Group>(null);
  const near = useRef(true);
  const [label, setLabel] = useState<"" | "name" | "quip">("");
  const ctx = useMemo<Ctx>(() => ({ id: item.id, near, energy: () => Math.max(0, 1 - (performance.now() - (fx.pulse[item.id] ?? -1e9)) / 2500) }), [item.id]);
  useFrame(() => {
    const d = Math.hypot(fx.me.x - item.x, fx.me.z - item.z);
    near.current = d < 45;
    if (g.current) g.current.visible = d < 95;
    const used = performance.now() - (fx.pulse[item.id] ?? -1e9) < 5000;
    const want = d < GATHER ? (used ? "quip" : "name") : "";
    setLabel((p) => (p === want ? p : want));
  });
  const Model = MODELS[item.id];
  return (
    <group position={[item.x, 0, item.z]} rotation={[0, item.facing, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}><circleGeometry args={[3.5, 40]} /><meshBasicMaterial color="#0f2a1f" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[GATHER - 0.1, GATHER, 48]} /><meshBasicMaterial color={POD_GREEN} transparent opacity={label ? 0.8 : 0.25} toneMapped={false} /></mesh>
      <AmenityCtx.Provider value={ctx}><group ref={g}>{Model ? <Model item={item} /> : null}</group></AmenityCtx.Provider>
      {label && (
        <Html position={[0, 4.2, 0]} center distanceFactor={13} zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
          <div style={pill}>{label === "quip" ? item.quip : <>{item.name} <span style={{ opacity: 0.65 }}>· press E</span></>}</div>
        </Html>
      )}
    </group>
  );
}

/** All the amenities of the room, plus the E key to use the nearest one. */
export function Amenities({ items }: { items: Placed[] }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e" || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
      let best: Placed | null = null, bd = GATHER;
      for (const it of items) { const d = Math.hypot(fx.me.x - it.x, fx.me.z - it.z); if (d < bd) { bd = d; best = it; } }
      if (best) fx.pulse[best.id] = performance.now();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [items]);
  return <>{items.map((it) => <AmenityWrap key={it.id} item={it} />)}</>;
}
