import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CanvasTexture, PlaneGeometry, SRGBColorSpace, type Group, type MeshBasicMaterial } from "three";
import { roams } from "./roam";

const POOL = 28;
const textures = new Map<string, CanvasTexture>();
/** One small texture per emoji, created on first use. */
function textureFor(emoji: string): CanvasTexture {
  let t = textures.get(emoji);
  if (!t) {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96;
    const g = c.getContext("2d")!;
    g.font = "64px system-ui, 'Apple Color Emoji', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(emoji, 48, 54);
    t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
    textures.set(emoji, t);
  }
  return t;
}
const PRIORITY: Record<string, number> = { "❗": 0, "❓": 1 };

/** Floating emoji above robots that have one (a problem, waiting for you, asleep, a celebration...). Pooled billboards. */
export function Icons() {
  const plane = useMemo(() => new PlaneGeometry(0.62, 0.62), []);
  const groups = useRef<(Group | null)[]>([]);
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const shown = useRef<string[]>([]);
  const last = useRef(0);
  const picked = useRef<{ x: number; z: number; icon: string }[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - last.current > 0.2) { // choose who gets an icon (5 times a second is plenty)
      last.current = t;
      picked.current = [...roams.values()].filter((r) => r.icon).sort((a, b) => (PRIORITY[a.icon] ?? 5) - (PRIORITY[b.icon] ?? 5)).slice(0, POOL);
    }
    for (let k = 0; k < POOL; k++) {
      const g = groups.current[k], r = picked.current[k];
      if (!g) continue;
      g.visible = !!r;
      if (!r) continue;
      g.position.set(r.x, 1.5 + Math.sin(t * 3 + k) * 0.06, r.z);
      if (shown.current[k] !== r.icon && mats.current[k]) { shown.current[k] = r.icon; mats.current[k]!.map = textureFor(r.icon); mats.current[k]!.needsUpdate = true; }
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, k) => (
        <group key={k} ref={(g) => { groups.current[k] = g; }} visible={false}>
          <Billboard><mesh geometry={plane} renderOrder={15}><meshBasicMaterial ref={(m) => { mats.current[k] = m; }} transparent depthTest={false} toneMapped={false} /></mesh></Billboard>
        </group>
      ))}
    </>
  );
}
