import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Layout } from "./layout";
import { zoneIcon } from "./zones";
import { useStore } from "../state/store";

/** What the 3D scene shares with the header controls and the minimap. */
export interface ViewState { x: number; z: number; mode: "overview" | "walk" }
/** Where the camera / manager is right now; written by the 3D scene, read by every minimap. */
export const viewState: ViewState = { x: 0, z: 0, mode: "overview" };
export interface Warp { x: number; z: number; n: number }
export interface ZoomReq { factor: number; n: number } // factor < 1 zooms in

export interface PanReq { right: number; forward: number; n: number } // fractions of the camera distance

interface ViewControlsProps {
  mode: "overview" | "walk"; onMode: () => void;
  onAngle: (dyaw: number, dpitch: number) => void; onPan: (right: number, forward: number) => void;
  onZoom: (factor: number) => void; onReset: () => void;
  hasDefault: boolean; onSaveDefault: () => void; onClearDefault: () => void;
  locked: boolean; onLock: () => void;
}

/** One "View" button in the app header; it opens the panel with mode, zoom, pan, angle, zoom lock. */
export function ViewControls(p: ViewControlsProps) {
  const showKeymap = useStore((s) => s.showKeymap);
  const showCounts = useStore((s) => s.showStatusCounts);
  const setShowCounts = useStore((s) => s.setShowStatusCounts);
  const setShowKeymap = useStore((s) => s.setShowKeymap);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const walk = p.mode === "walk";
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="vp-row"><span className="muted small vp-label">{label}</span><span className="vc-group">{children}</span></div>
  );
  const ui = (
    <div className="view-controls" ref={wrap}>
      <button className="small" onClick={p.onMode} title="Switch between overview and walking (V)">{walk ? "🗺 Overview (V)" : "🚶 Walk (V)"}</button>
      <button className={`small ${open || p.locked ? "fb-on" : ""}`} onClick={() => setOpen(!open)} title="Zoom, pan and view options">🎥 View ▾</button>
      {open && (
        <div className="view-panel">
          <Row label="Zoom">
            <button className="small" onClick={() => p.onZoom(0.8)} disabled={p.locked} aria-label="Zoom in">＋</button>
            <button className="small" onClick={() => p.onZoom(1.25)} disabled={p.locked} aria-label="Zoom out">−</button>
            <button className={`small ${p.locked ? "fb-on" : ""}`} onClick={p.onLock} title="The mouse wheel and the zoom buttons stop changing the distance">
              {p.locked ? "🔒 Locked" : "🔓 Lock"}
            </button>
          </Row>
          <Row label="Pan">
            <button className="small" disabled={walk} onClick={() => p.onPan(0, 0.15)} aria-label="Pan forward">↑</button>
            <button className="small" disabled={walk} onClick={() => p.onPan(0, -0.15)} aria-label="Pan back">↓</button>
            <button className="small" disabled={walk} onClick={() => p.onPan(-0.15, 0)} aria-label="Pan left">←</button>
            <button className="small" disabled={walk} onClick={() => p.onPan(0.15, 0)} aria-label="Pan right">→</button>
            {walk && <span className="muted small">follows you</span>}
          </Row>
          <Row label="Angle">
            <button className="small" onClick={() => p.onAngle(0.2, 0)} aria-label="Turn view left">↶</button>
            <button className="small" onClick={() => p.onAngle(-0.2, 0)} aria-label="Turn view right">↷</button>
            <button className="small" onClick={() => p.onAngle(0, 0.1)} aria-label="Camera higher">⤒</button>
            <button className="small" onClick={() => p.onAngle(0, -0.1)} aria-label="Camera lower">⤓</button>
          </Row>
          <Row label="View">
            <button className="small" onClick={p.onReset}>⟲ Reset view</button>
            <button className="small" onClick={p.onSaveDefault} title="Remember this camera (and the walk zoom and angle) as the default for opening and resetting the view">⭐ Save as default</button>
            {p.hasDefault && <button className="small" onClick={p.onClearDefault} title="Go back to the built-in default view">Clear default</button>}
            <button className={`small ${showCounts ? "fb-on" : ""}`} onClick={() => setShowCounts(!showCounts)} title="The Waiting / Working / Error ... counts in the corner">📊 Counts</button>
            <button className={`small ${showKeymap ? "fb-on" : ""}`} onClick={() => setShowKeymap(!showKeymap)}>⌨ Keymap</button>
          </Row>
          <div className="muted small">{walk ? "Right-drag turns the view." : "Drag to orbit, right-drag to pan, wheel to zoom."}</div>
        </div>
      )}
    </div>
  );
  const slot = document.getElementById("topbar-slot");
  return slot ? createPortal(ui, slot) : ui;
}

const DEFAULT_SIZE = 170;
/** Top-down map of the office: one box per project with its name and number of agents (and how many are working),
 *  plus where the camera/player is. Click to go there. */
export function Minimap({ layout, view, onGo, size = DEFAULT_SIZE }: {
  layout: Layout; view: { current: ViewState }; onGo: (x: number, z: number) => void; size?: number;
}) {
  const SIZE = size;
  const cv = useRef<HTMLCanvasElement>(null);
  const pad = 4;
  const w = Math.max(1, layout.maxX - layout.minX + 8), d = Math.max(1, layout.maxZ - layout.minZ + 8);
  const s = (SIZE - pad * 2) / Math.max(w, d);
  const ox = pad + (SIZE - pad * 2 - w * s) / 2 - (layout.minX - 4) * s;
  const oz = pad + (SIZE - pad * 2 - d * s) / 2 - (layout.minZ - 4) * s;
  const counts = useMemo(() => {
    const m = new Map<string, { n: number; working: number }>();
    for (const k of layout.desks) {
      const c = m.get(k.worker.team) ?? { n: 0, working: 0 };
      c.n++; if (k.worker.state === "working" || k.worker.state === "waiting") c.working++;
      m.set(k.worker.team, c);
    }
    return m;
  }, [layout]);

  useEffect(() => {
    const c = cv.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); // crisp text on retina screens
    c.width = SIZE * dpr; c.height = SIZE * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fit = (text: string, max: number) => {
      if (g.measureText(text).width <= max) return text;
      let t = text;
      while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
      return `${t}…`;
    };
    const drawMap = () => {
      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = "rgba(10,12,20,0.88)";
      g.fillRect(0, 0, SIZE, SIZE);
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const z of layout.zones) { // rooms and outdoor areas: soft grey boxes with their names
        const x = ox + (z.x - z.w / 2) * s, y = oz + (z.z - z.d / 2) * s, bw = z.w * s, bh = z.d * s;
        g.fillStyle = "rgba(170,187,214,0.16)"; g.fillRect(x, y, bw, bh);
        g.strokeStyle = "rgba(170,187,214,0.45)"; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
        // an icon for the room (bigger when the box is), and its name underneath when there is space
        const icon = Math.max(9, Math.min(22, Math.min(bw, bh) * 0.6));
        g.font = `${icon}px system-ui, "Apple Color Emoji", sans-serif`; g.fillStyle = "#fff";
        g.fillText(zoneIcon(z.zone), x + bw / 2, y + bh / 2 - (bh > icon + 14 ? 4 : 0));
        if (bw > 44 && bh > icon + 14) { g.fillStyle = "#aebbd6"; g.font = `${Math.max(8, size / 20)}px system-ui, sans-serif`; g.fillText(fit(z.zone.name, bw - 4), x + bw / 2, y + bh / 2 + icon / 2 + 2); }
      }
      for (const a of layout.areas) {
        const x = ox + (a.x - a.w / 2) * s, y = oz + (a.z - a.d / 2) * s, bw = a.w * s, bh = a.d * s;
        const hex = `#${a.color.getHexString()}`;
        g.fillStyle = `${hex}44`; g.fillRect(x, y, bw, bh);
        g.strokeStyle = hex; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
        const c2 = counts.get(a.name) ?? { n: 0, working: 0 };
        const cx = x + bw / 2, cy = y + bh / 2;
        g.fillStyle = "#e8ecf8";
        if (bw > 46 && bh > 30) {
          g.font = "bold 9px system-ui, sans-serif"; g.fillText(fit(a.name, bw - 6), cx, cy - 5);
          g.font = "9px system-ui, sans-serif"; g.fillStyle = c2.working ? "#7dffb0" : "#aab4c5";
          g.fillText(`${c2.n} agent${c2.n === 1 ? "" : "s"}${c2.working ? ` · ${c2.working}↯` : ""}`, cx, cy + 6);
        } else { g.font = "bold 11px system-ui, sans-serif"; g.fillText(String(c2.n), cx, cy); }
      }
    };
    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 100) return; // ~10 fps is plenty
      last = t;
      drawMap();
      const v = view.current;
      g.strokeStyle = "#fff"; g.fillStyle = v.mode === "walk" ? "#7dffb0" : "transparent"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ox + v.x * s, oz + v.z * s, v.mode === "walk" ? 4 : 7, 0, Math.PI * 2); g.fill(); g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, counts, view, ox, oz, s]);

  const slot = null as HTMLElement | null; // the minimap lives in the Map tab; this copy floats in the 3D view
  const canvas = (
    <canvas ref={cv} width={SIZE} height={SIZE} className={size === DEFAULT_SIZE ? "minimap" : "minimap-big"} title="Click to go there"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const k = SIZE / r.width; // canvas px per css px
        onGo(((e.clientX - r.left) * k - ox) / s, ((e.clientY - r.top) * k - oz) / s);
      }} />
  );
  return slot ? createPortal(canvas, slot) : canvas;
}
