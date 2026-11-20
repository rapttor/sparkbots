import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CanvasTexture, PlaneGeometry, SRGBColorSpace, type Group } from "three";
import { displayName } from "../util";
import type { Layout } from "./layout";
import { roams } from "./roam";

const POOL = 16, CW = 320, CH = 64, W = 1.9, H = 0.38;

/** Floating name labels over the closest agents (toggle with T). Pooled canvas textures. */
export function NameTags({ layout, getCenter }: { layout: Layout; getCenter: () => { x: number; z: number } }) {
  const plane = useMemo(() => new PlaneGeometry(W, H), []);
  const slots = useRef<{ ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string; id: string }[]>([]);
  const groups = useRef<(Group | null)[]>([]);
  const last = useRef(0);
  if (slots.current.length === 0 && typeof document !== "undefined") {
    for (let i = 0; i < POOL; i++) {
      const c = document.createElement("canvas"); c.width = CW; c.height = CH;
      const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
      slots.current.push({ ctx: c.getContext("2d")!, tex, key: "", id: "" });
    }
  }
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - last.current > 0.3) {
      last.current = t;
      const c = getCenter();
      const near = layout.desks.map((d) => ({ d, r: roams.get(d.worker.id) }))
        .map(({ d, r }) => ({ w: d.worker, dist: Math.hypot((r?.x ?? d.x) - c.x, (r?.z ?? d.z) - c.z) }))
        .sort((a, b) => a.dist - b.dist).slice(0, POOL);
      slots.current.forEach((s, k) => {
        const n = near[k];
        if (!n) { s.id = ""; return; }
        s.id = n.w.id;
        const name = displayName(n.w), key = `${name}|${n.w.color}`;
        if (key === s.key) return;
        s.key = key;
        const g = s.ctx;
        g.clearRect(0, 0, CW, CH);
        g.fillStyle = "rgba(10,12,20,0.85)"; g.beginPath(); g.roundRect(2, 2, CW - 4, CH - 4, 14); g.fill();
        g.strokeStyle = n.w.color; g.lineWidth = 3; g.stroke();
        g.fillStyle = "#e8ecf8"; g.font = "bold 26px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        let txt = name; while (txt.length > 3 && g.measureText(txt).width > CW - 28) txt = txt.slice(0, -2);
        g.fillText(txt === name ? txt : `${txt}…`, CW / 2, CH / 2 + 1);
        s.tex.needsUpdate = true;
      });
    }
    slots.current.forEach((s, k) => {
      const g = groups.current[k], r = s.id ? roams.get(s.id) : undefined;
      if (!g) return;
      g.visible = !!r;
      if (r) g.position.set(r.x, 1.25, r.z);
    });
  });
  return (
    <>
      {slots.current.map((s, k) => (
        <group key={k} ref={(g) => { groups.current[k] = g; }} visible={false}>
          <Billboard><mesh geometry={plane} renderOrder={12}><meshBasicMaterial map={s.tex} transparent depthTest={false} toneMapped={false} /></mesh></Billboard>
        </group>
      ))}
    </>
  );
}
