import { useRef } from "react";
import { CanvasTexture, type Group, type Mesh, type Sprite } from "three";
import { B, Cyl, Sph, M, mesh, textTexture, useAnim, hash, type V3 } from "./amenityKit";

/**
 * The busy-room amenities: they only appear when a room has more than 32 people (one more per 4 extra people, in this order).
 * Same rules as the first sixteen (see amenities.tsx): original, cosmetic, front on +z, animation only while you are near.
 */

// ---- 17. aquarium
export function Aquarium() {
  const fish = useRef<(Group | null)[]>([]), bubbles = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    fish.current.forEach((f, i) => {
      if (!f) return;
      const sp = (0.35 + i * 0.09) * (1 + e), ph = i * 1.7, x = Math.sin(t * sp + ph) * 1.15;
      f.position.set(x, 1.25 + Math.sin(t * 0.7 + i) * 0.28 + (i % 3) * 0.12, Math.sin(i * 2.3) * 0.25);
      f.rotation.y = Math.cos(t * sp + ph) > 0 ? 0 : Math.PI; // swims the way it is going
    });
    bubbles.current.forEach((b, i) => { if (!b) return; const k = (t * 0.4 + i * 0.25) % 1; b.position.set(-1.1 + i * 0.5, 0.95 + k * 1.2, 0.3); b.scale.setScalar(0.5 + 0.5 * Math.sin(k * Math.PI)); });
  });
  const colors = ["#fb923c", "#facc15", "#f472b6", "#38bdf8", "#a3e635"];
  return (
    <group>
      <B s={[3.2, 0.8, 1.3]} p={[0, 0.4, 0]} c="#1e293b" r={0.5} />
      <B s={[3.0, 1.5, 1.1]} p={[0, 1.55, 0]} c="#38bdf8" o={0.25} r={0.1} />
      <B s={[3.1, 0.08, 1.2]} p={[0, 2.34, 0]} c="#e0f2fe" e={0.9} />
      <B s={[2.9, 0.06, 1.0]} p={[0, 0.84, 0]} c="#fde68a" r={0.9} />
      {[-1.0, 0.2, 1.1].map((x, i) => <Cyl key={i} a={[0.05, 0.08, 0.5 + i * 0.12, 6]} p={[x, 1.1 + i * 0.05, -0.3]} c="#16a34a" />)}
      {colors.map((c, i) => (
        <group key={i} ref={(g) => { fish.current[i] = g; }}>
          <Sph rad={0.16} p={[0, 0, 0]} s={[1.5, 0.9, 0.5]} c={c} e={0.2} />
          <mesh position={[-0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.12, 0.2, 4]} /><M c={c} /></mesh>
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => <mesh key={i} ref={mesh(bubbles.current, i)}><sphereGeometry args={[0.04, 8, 6]} /><meshBasicMaterial color="#e0f2fe" transparent opacity={0.7} /></mesh>)}
    </group>
  );
}

// ---- 18. lava lamp pillar
export function LavaLamp() {
  const blobs = useRef<(Mesh | null)[]>([]), glow = useRef<Mesh>(null);
  useAnim((t, _dt, e) => {
    blobs.current.forEach((b, i) => {
      if (!b) return;
      const k = 0.5 + 0.5 * Math.sin(t * (0.35 + i * 0.11) * (1 + e) + i * 2);
      b.position.set(Math.sin(t * 0.3 + i) * 0.12, 0.9 + k * 1.9, Math.cos(t * 0.25 + i * 2) * 0.1);
      b.scale.set(1, 1 + 0.35 * Math.sin(t + i), 1);
    });
    const g = glow.current?.material as unknown as { opacity: number } | undefined; if (g) g.opacity = 0.18 + 0.06 * Math.sin(t * 1.3);
  });
  return (
    <group>
      <Cyl a={[0.7, 0.9, 0.7, 20]} p={[0, 0.35, 0]} c="#1f2937" m={0.4} />
      <Cyl a={[0.55, 0.62, 3.0, 20]} p={[0, 2.2, 0]} c="#fda4af" o={0.28} r={0.1} />
      <Cyl a={[0.2, 0.55, 0.5, 20]} p={[0, 3.95, 0]} c="#1f2937" m={0.4} />
      {[0, 1, 2, 3, 4].map((i) => <mesh key={i} ref={mesh(blobs.current, i)}><sphereGeometry args={[0.26 - (i % 3) * 0.04, 14, 10]} /><meshStandardMaterial color={i % 2 ? "#f97316" : "#ec4899"} emissive={i % 2 ? "#f97316" : "#ec4899"} emissiveIntensity={1.1} toneMapped={false} /></mesh>)}
      <mesh ref={glow} position={[0, 2.2, 0]}><cylinderGeometry args={[1.0, 1.0, 3.2, 20, 1, true]} /><meshBasicMaterial color="#fb7185" transparent opacity={0.2} depthWrite={false} toneMapped={false} /></mesh>
      <pointLight position={[0, 2.2, 0.5]} color="#fb7185" intensity={1.2} distance={7} />
    </group>
  );
}

// ---- 19. "Hello, World" neon sign
export function NeonSign() {
  const sign = useRef<Mesh>(null);
  const tex = textTexture("neon", 512, 160, (g) => {
    g.fillStyle = "#050510"; g.fillRect(0, 0, 512, 160);
    g.font = "bold 78px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#f472b6"; g.shadowBlur = 24; g.fillStyle = "#fbcfe8"; g.fillText("Hello,", 256, 52); g.fillStyle = "#a7f3d0"; g.shadowColor = "#34d399"; g.fillText("World", 256, 118);
  });
  useAnim((t, _dt, e) => { const m = sign.current?.material as unknown as { color: { setScalar: (n: number) => void } } | undefined; m?.color.setScalar(Math.sin(t * 30) > 0.97 || (e > 0 && Math.sin(t * 25) > 0) ? 0.35 : 0.9 + 0.1 * Math.sin(t * 2)); });
  return (
    <group>
      <B s={[0.14, 2.6, 0.14]} p={[-1.8, 1.3, -0.1]} c="#1f2937" /><B s={[0.14, 2.6, 0.14]} p={[1.8, 1.3, -0.1]} c="#1f2937" />
      <B s={[4.0, 1.4, 0.12]} p={[0, 2.5, 0]} c="#0b0b18" />
      <mesh ref={sign} position={[0, 2.5, 0.07]}><planeGeometry args={[3.8, 1.2]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      <pointLight position={[0, 2.5, 1.5]} color="#f9a8d4" intensity={1.2} distance={8} />
    </group>
  );
}

// ---- 20. trophy case
export function TrophyCase() {
  const cups = useRef<(Group | null)[]>([]);
  useAnim((t, _dt, e) => cups.current.forEach((c, i) => { if (c) c.rotation.y = t * (0.4 + e * 1.5) + i; }));
  return (
    <group>
      <B s={[2.8, 0.5, 1.0]} p={[0, 0.25, 0]} c="#5b3d20" r={0.7} />
      <B s={[2.8, 0.12, 1.0]} p={[0, 2.55, 0]} c="#5b3d20" r={0.7} />
      <B s={[2.6, 1.95, 0.9]} p={[0, 1.5, 0]} c="#bae6fd" o={0.18} r={0.1} />
      {[0.95, 1.55, 2.15].map((y, r) => <B key={r} s={[2.5, 0.05, 0.8]} p={[0, y, 0]} c="#8b5e34" />)}
      {[0, 1, 2].flatMap((r) => [-0.8, 0, 0.8].map((x, c) => (
        <group key={`${r}${c}`} ref={(g) => { cups.current[r * 3 + c] = g; }} position={[x, 1.0 + r * 0.6, 0]}>
          <Cyl a={[0.16, 0.09, 0.28, 10]} p={[0, 0.3, 0]} c="#f5c542" m={0.5} e={0.4} />
          <Cyl a={[0.04, 0.04, 0.16, 8]} p={[0, 0.12, 0]} c="#f5c542" e={0.4} />
          <Cyl a={[0.14, 0.14, 0.05, 10]} p={[0, 0.02, 0]} c="#f5c542" e={0.4} />
        </group>
      )))}
      <pointLight position={[0, 2.3, 0.8]} color="#fde68a" intensity={1} distance={6} />
    </group>
  );
}

// ---- 21. bug lottery: three reels of bugs
const BUGS = ["🐛", "🐞", "🪲", "🦟"];
const bugTex = (i: number) => textTexture(`bug${i}`, 128, 128, (g) => { g.fillStyle = "#fff7ed"; g.fillRect(0, 0, 128, 128); g.font = "84px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(BUGS[i]!, 64, 70); });
export function BugLottery() {
  const reels = useRef<(Mesh | null)[]>([]), lever = useRef<Group>(null), lamps = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => {
    const T = 7, c = (t * (1 + e * 0.8)) % T, round = Math.floor((t * (1 + e * 0.8)) / T);
    const win = hash(round) < 0.4, base = Math.floor(hash(round + 5) * 4);
    reels.current.forEach((r, i) => {
      if (!r) return;
      const stopAt = 2.0 + i * 0.5, spinning = c < stopAt;
      const idx = spinning ? Math.floor(t * 14 + i * 3) % 4 : win ? base : Math.floor(hash(round * 3 + i + 9) * 4);
      const m = r.material as unknown as { map: CanvasTexture };
      m.map = bugTex(idx);
    });
    if (lever.current) lever.current.rotation.x = c < 0.4 ? (c / 0.4) * 0.9 : c < 0.9 ? 0.9 - ((c - 0.4) / 0.5) * 0.9 : 0; // pull
    lamps.current.forEach((l, i) => { if (l) l.visible = Math.sin(t * 8 + i * 1.5) > -0.3; });
  });
  return (
    <group>
      <B s={[1.4, 2.3, 0.9]} p={[0, 1.15, 0]} c="#b91c1c" r={0.4} />
      <B s={[1.2, 0.7, 0.05]} p={[0, 1.45, 0.46]} c="#111827" />
      {[-0.38, 0, 0.38].map((x, i) => <mesh key={i} ref={mesh(reels.current, i)} position={[x, 1.45, 0.5]}><planeGeometry args={[0.34, 0.5]} /><meshBasicMaterial map={bugTex(0)} toneMapped={false} /></mesh>)}
      <B s={[1.3, 0.28, 0.1]} p={[0, 2.1, 0.46]} c="#fde047" e={0.8} />
      {[-0.5, -0.25, 0, 0.25, 0.5].map((x, i) => <mesh key={i} ref={mesh(lamps.current, i)} position={[x, 2.1, 0.53]}><sphereGeometry args={[0.04, 8, 6]} /><meshBasicMaterial color={i % 2 ? "#ef4444" : "#ffffff"} toneMapped={false} /></mesh>)}
      <group ref={lever} position={[0.78, 1.3, 0]}>
        <Cyl a={[0.04, 0.04, 0.8, 8]} p={[0.05, 0.4, 0]} c="#9ca3af" m={0.8} />
        <Sph rad={0.1} p={[0.05, 0.82, 0]} c="#ef4444" />
      </group>
      <B s={[0.9, 0.18, 0.1]} p={[0, 0.6, 0.46]} c="#020617" />
    </group>
  );
}

// ---- 22. snack table
export function SnackTable() {
  const steam = useRef<(Mesh | null)[]>([]);
  useAnim((t, _dt, e) => steam.current.forEach((s, i) => { if (!s) return; const k = (t * (0.4 + e * 0.6) + i * 0.33) % 1; s.position.set(-0.5 + Math.sin(t + i) * 0.04, 1.3 + k * 0.6, 0.1); s.scale.setScalar(0.4 + k); (s.material as unknown as { opacity: number }).opacity = 0.4 * (1 - k); }));
  return (
    <group>
      <B s={[2.8, 0.1, 1.4]} p={[0, 1.0, 0]} c="#fef3c7" r={0.9} />
      {[[-1.3, -0.6], [-1.3, 0.6], [1.3, -0.6], [1.3, 0.6]].map(([x, z], i) => <B key={i} s={[0.1, 0.95, 0.1]} p={[x!, 0.475, z!]} c="#78350f" />)}
      <B s={[0.8, 0.08, 0.8]} p={[-0.5, 1.09, 0.1]} c="#b45309" /><Cyl a={[0.34, 0.34, 0.04, 20]} p={[-0.5, 1.15, 0.1]} c="#fbbf24" />
      {[[0.1, 0.1], [-0.3, -0.1], [-0.7, 0.2], [-0.5, 0.3], [-0.2, 0.3]].map(([x, z], i) => <Cyl key={i} a={[0.05, 0.05, 0.02, 10]} p={[-0.5 + x!, 1.18, 0.1 + z!]} c="#b91c1c" />)}
      <Sph rad={0.32} p={[0.5, 1.1, 0.2]} s={[1, 0.55, 1]} c="#f8fafc" /><Sph rad={0.27} p={[0.5, 1.2, 0.2]} s={[1, 0.4, 1]} c="#fde047" />
      {["#ef4444", "#22c55e", "#3b82f6"].map((c, i) => <Cyl key={i} a={[0.07, 0.07, 0.22, 10]} p={[0.95 + i * 0.12, 1.16, -0.3]} c={c} m={0.5} />)}
      {[0, 1, 2].map((i) => <mesh key={i} ref={mesh(steam.current, i)}><sphereGeometry args={[0.07, 8, 6]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} /></mesh>)}
    </group>
  );
}

// ---- 23. hammock
export function Hammock() {
  const cloth = useRef<Group>(null), zs = useRef<(Sprite | null)[]>([]);
  const z = textTexture("zzz", 64, 64, (g) => { g.font = "bold 50px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#bfdbfe"; g.fillText("Z", 32, 34); });
  useAnim((t, _dt, e) => {
    if (cloth.current) cloth.current.rotation.z = Math.sin(t * (0.8 + e)) * (0.06 + e * 0.1);
    zs.current.forEach((s, i) => { if (!s) return; const k = (t * 0.3 + i * 0.33) % 1; s.position.set(0.2 + k * 0.6, 1.5 + k * 1.1, 0); s.scale.setScalar(0.2 + 0.35 * k); (s.material as unknown as { opacity: number }).opacity = 1 - k; });
  });
  return (
    <group>
      <Cyl a={[0.1, 0.13, 2.4, 10]} p={[-1.9, 1.2, 0]} c="#78350f" /><Cyl a={[0.1, 0.13, 2.4, 10]} p={[1.9, 1.2, 0]} c="#78350f" />
      <group ref={cloth} position={[0, 2.0, 0]}>
        <Sph rad={1} p={[0, -0.75, 0]} s={[1.75, 0.16, 0.62]} c="#fb7185" />
        <Sph rad={1} p={[0, -0.7, 0]} s={[1.6, 0.17, 0.35]} c="#fde68a" />
        <B s={[0.05, 0.05, 0.05]} p={[-1.7, -0.15, 0]} c="#e5e7eb" /><B s={[0.9, 0.025, 0.025]} p={[-1.45, -0.45, 0]} rot={[0, 0, -0.55]} c="#e5e7eb" /><B s={[0.9, 0.025, 0.025]} p={[1.45, -0.45, 0]} rot={[0, 0, 0.55]} c="#e5e7eb" />
      </group>
      {[0, 1, 2].map((i) => <sprite key={i} ref={(s) => { zs.current[i] = s; }}><spriteMaterial map={z} transparent depthWrite={false} /></sprite>)}
    </group>
  );
}

// ---- 24. git tree sculpture: main line, two feature branches, a merge
const Seg = ({ a, b, c }: { a: [number, number]; b: [number, number]; c: string }) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  return <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]} rotation={[0, 0, -Math.atan2(dx, dy)]}><cylinderGeometry args={[0.05, 0.05, len, 6]} /><M c={c} e={0.7} /></mesh>;
};
export function GitTree() {
  const tree = useRef<Group>(null), head = useRef<Mesh>(null);
  useAnim((t, _dt, e) => { if (tree.current) tree.current.rotation.y = t * (0.25 + e * 1.2); const h = head.current; if (h) h.scale.setScalar(1 + 0.25 * Math.sin(t * 3)); });
  const main: [number, number][] = [[0, 0.6], [0, 1.3], [0, 2.0], [0, 2.7], [0, 3.4], [0, 4.1]];
  const fa: [number, number][] = [[0.9, 1.7], [1.0, 2.4], [0.7, 3.0]], fb: [number, number][] = [[-0.9, 2.1], [-1.0, 2.8]];
  return (
    <group>
      <Cyl a={[0.9, 1.1, 0.4, 16]} p={[0, 0.2, 0]} c="#1f2937" />
      <group ref={tree}>
        {main.slice(1).map((p, i) => <Seg key={i} a={main[i]!} b={p} c="#4ade80" />)}
        <Seg a={main[1]!} b={fa[0]!} c="#60a5fa" /><Seg a={fa[0]!} b={fa[1]!} c="#60a5fa" /><Seg a={fa[1]!} b={fa[2]!} c="#60a5fa" /><Seg a={fa[2]!} b={main[3]!} c="#60a5fa" />
        <Seg a={main[2]!} b={fb[0]!} c="#f472b6" /><Seg a={fb[0]!} b={fb[1]!} c="#f472b6" /><Seg a={fb[1]!} b={main[4]!} c="#f472b6" />
        {[...main, ...fa, ...fb].map((p, i) => <Sph key={i} rad={0.12} p={[p[0], p[1], 0]} c="#ecfdf5" e={0.8} />)}
        <mesh ref={head} position={[0, 4.35, 0]}><sphereGeometry args={[0.2, 14, 10]} /><meshBasicMaterial color="#fde047" toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

// ---- 25. telescope, looking for a clean merge
export function Telescope() {
  const tube = useRef<Group>(null);
  useAnim((t, _dt, e) => { if (tube.current) { tube.current.rotation.y = Math.sin(t * (0.3 + e * 1.5)) * 0.7; tube.current.rotation.x = -0.75 + Math.sin(t * 0.21 + 1) * 0.12; } });
  const legs: V3[] = [[0.5, 0, 0.3], [-0.5, 0, 0.3], [0, 0, -0.55]];
  return (
    <group>
      {legs.map((l, i) => <Cyl key={i} a={[0.04, 0.05, 1.6, 6]} p={[l[0] * 0.55, 0.75, l[2] * 0.55]} rot={[l[2] * 0.4, 0, -l[0] * 0.4]} c="#78350f" />)}
      <Cyl a={[0.1, 0.1, 0.2, 10]} p={[0, 1.55, 0]} c="#9ca3af" m={0.8} />
      <group ref={tube} position={[0, 1.7, 0]} rotation={[-0.75, 0, 0]}>
        <Cyl a={[0.15, 0.22, 2.0, 16]} p={[0, 0, -0.9]} rot={[Math.PI / 2, 0, 0]} c="#1e3a8a" m={0.5} r={0.4} />
        <Cyl a={[0.24, 0.24, 0.12, 16]} p={[0, 0, -1.85]} rot={[Math.PI / 2, 0, 0]} c="#d4a017" m={0.8} />
        <Cyl a={[0.1, 0.1, 0.3, 10]} p={[0, 0, 0.3]} rot={[Math.PI / 2, 0, 0]} c="#0b1220" />
      </group>
    </group>
  );
}
