import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { STATE_COLORS } from "./colors";
import type { Layout } from "./layout";

/** What the 3D scene shares with the header controls and the minimap. */
export interface ViewState { x: number; z: number; mode: "overview" | "walk" }
export interface Warp { x: number; z: number; n: number }
export interface ZoomReq { factor: number; n: number } // factor < 1 zooms in

/** 3D controls, rendered in the app header: view mode, zoom in/out/reset, zoom lock, minimap. */
export function ViewControls({ mode, onMode, onZoom, onReset, locked, onLock, minimap, onMinimap }: {
  mode: "overview" | "walk"; onMode: () => void; onZoom: (factor: number) => void; onReset: () => void;
  locked: boolean; onLock: () => void; minimap: boolean; onMinimap: () => void;
}) {
  const ui = (
    <div className="view-controls">
      <button className="small" onClick={onMode} title="Switch between overview and walking (V)">{mode === "overview" ? "🚶 Walk (V)" : "🗺 Overview (V)"}</button>
      <span className="vc-group">
        <button className="small" onClick={() => onZoom(0.8)} disabled={locked} title="Zoom in" aria-label="Zoom in">＋</button>
        <button className="small" onClick={() => onZoom(1.25)} disabled={locked} title="Zoom out" aria-label="Zoom out">−</button>
        <button className="small" onClick={onReset} title="Reset the view">⟲</button>
      </span>
      <button className={`small ${locked ? "fb-on" : ""}`} onClick={onLock} title="Lock zoom: the mouse wheel and the zoom buttons stop changing the distance">
        {locked ? "🔒 Zoom locked" : "🔓 Lock zoom"}
      </button>
      <button className={`small ${minimap ? "fb-on" : ""}`} onClick={onMinimap} title="Show or hide the minimap">🧭 Minimap</button>
    </div>
  );
  const slot = document.getElementById("topbar-slot");
  return slot ? createPortal(ui, slot) : ui;
}

const SIZE = 180;
/** Top-down map of the office: project areas, bots (status colors), and where the camera/player is. Click to go there. */
export function Minimap({ layout, view, getBots, onGo }: {
  layout: Layout; view: { current: ViewState };
  getBots: () => { x: number; z: number; color: string }[]; onGo: (x: number, z: number) => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pad = 4;
  const w = Math.max(1, layout.maxX - layout.minX + 8), d = Math.max(1, layout.maxZ - layout.minZ + 8);
  const s = (SIZE - pad * 2) / Math.max(w, d);
  const ox = pad + (SIZE - pad * 2 - w * s) / 2 - (layout.minX - 4) * s;
  const oz = pad + (SIZE - pad * 2 - d * s) / 2 - (layout.minZ - 4) * s;

  useEffect(() => {
    const c = cv.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 100) return; // ~10 fps is plenty
      last = t;
      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = "rgba(10,12,20,0.85)";
      g.fillRect(0, 0, SIZE, SIZE);
      for (const a of layout.areas) {
        g.fillStyle = `#${a.color.getHexString()}55`;
        g.fillRect(ox + (a.x - a.w / 2) * s, oz + (a.z - a.d / 2) * s, a.w * s, a.d * s);
      }
      for (const b of getBots()) {
        g.fillStyle = b.color;
        g.fillRect(ox + b.x * s - 1.5, oz + b.z * s - 1.5, 3, 3);
      }
      const v = view.current;
      g.strokeStyle = "#fff"; g.fillStyle = v.mode === "walk" ? "#7dffb0" : "transparent"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ox + v.x * s, oz + v.z * s, v.mode === "walk" ? 4 : 7, 0, Math.PI * 2); g.fill(); g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, getBots, view, ox, oz, s]);

  return (
    <canvas ref={cv} width={SIZE} height={SIZE} className="minimap" title="Click to go there"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onGo((e.clientX - r.left - ox) / s, (e.clientY - r.top - oz) / s);
      }} />
  );
}

export const stateColor = (s: keyof typeof STATE_COLORS) => STATE_COLORS[s];
