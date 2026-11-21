import { useEffect, useRef } from "react";
import { Vector3, type Camera } from "three";
import type { TeamArea } from "./layout";

/** A floating title: a project or a room/leisure area. Click = go there. */
export interface LabelItem { id: string; name: string; x: number; z: number; y: number; color: string; kind: "project" | "room"; area: TeamArea; poiId?: string }
export interface LabelsApi { update: (camera: Camera, width: number, height: number, zoom?: number) => void }

const v = new Vector3();
const LINE = 24;
const ZOOM_HIDE = 0.34, ZOOM_SHOW = 0.58; // titles stay out of the way up close and arrive as you zoom out // how far a label is lifted when another one is in its way

/**
 * Titles floating above the projects and rooms, drawn as HTML so they are crisp and clickable at any distance. Every frame
 * they are placed on screen nearest first; one that would land on top of a nearer one is lifted above it, so labels in
 * a row stack upwards with the closest at the bottom.
 */
export function Labels({ items, onPick, apiRef }: { items: LabelItem[]; onPick: (it: LabelItem, clientX: number, clientY: number) => void; apiRef: { current: LabelsApi | null } }) {
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const widths = useRef<number[]>([]);
  useEffect(() => { widths.current = []; }, [items]);

  useEffect(() => {
    apiRef.current = {
      update: (camera, width, height, zoom = 1) => {
        const zoomFade = Math.max(0, Math.min(1, (zoom - ZOOM_HIDE) / (ZOOM_SHOW - ZOOM_HIDE)));
        const vis: { i: number; sx: number; sy: number; depth: number }[] = [];
        items.forEach((it, i) => {
          const el = els.current[i];
          if (!el) return;
          v.set(it.x, it.y, it.z);
          const depth = camera.position.distanceTo(v);
          v.project(camera);
          if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) { el.style.display = "none"; return; }
          el.style.display = "";
          if (!widths.current[i]) widths.current[i] = el.offsetWidth || it.name.length * 8 + 20;
          vis.push({ i, sx: (v.x * 0.5 + 0.5) * width, sy: (-v.y * 0.5 + 0.5) * height, depth });
        });
        vis.sort((a, b) => a.depth - b.depth);
        const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
        for (const p of vis) {
          const w = widths.current[p.i] ?? 80, h = 22;
          let y = p.sy;
          for (let k = 0; k < 14; k++) {
            const r = { x0: p.sx - w / 2, x1: p.sx + w / 2, y0: y - h, y1: y };
            if (!placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) { placed.push(r); break; }
            y -= LINE;
          }
          const el = els.current[p.i]!;
          // Fade far away, but also fade + lift when you are right up close so the title does not fill the view.
          const far = p.depth <= 55 ? 1 : Math.max(0.28, 1 - (p.depth - 55) / 90); // distant titles fade, but never vanish
          const near = Math.max(0, Math.min(1, (p.depth - 6) / 12)); // 0 very close .. 1 from ~18 units out
          const opacity = near * far * zoomFade;
          const lift = (1 - near) * 22; // slide up as you approach
          el.style.transform = `translate(${Math.round(p.sx - w / 2)}px, ${Math.round(y - h - lift)}px)`;
          el.style.opacity = String(opacity);
          el.style.pointerEvents = opacity < 0.25 ? "none" : "";
          el.style.zIndex = String(1000 - Math.round(p.depth));
        }
      },
    };
    return () => { apiRef.current = null; };
  }, [items, apiRef]);

  return (
    <div className="labels-layer">
      {items.map((it, i) => (
        <button key={it.id} ref={(el) => { els.current[i] = el; }} className={`room-label ${it.kind}`} style={{ borderColor: it.color, display: "none" }} /* shown by the first update, so they never pile up in a corner */
          title={`${it.name}: click for actions`} onClick={(e) => onPick(it, e.clientX, e.clientY)}>
          {it.name}
        </button>
      ))}
    </div>
  );
}
