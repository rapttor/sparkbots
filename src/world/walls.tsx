import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { api, call, type Card, type Column } from "../api";
import { useLive } from "../state/live";
import type { Layout } from "./layout";
import type { Note } from "../../server/notes";

/** Live walls of the Manager room: the kanban slab shows the board, the whiteboard shows the notes.
 *  Positions match src/world/zones/manager-room.ts (zone-relative); planes sit a hair in front of the props. */
const COLS: { id: Column; label: string; color: string }[] = [
  { id: "backlog", label: "Backlog", color: "#e76f51" },
  { id: "ready", label: "Ready", color: "#f4a261" },
  { id: "in_progress", label: "In progress", color: "#2a9d8f" },
  { id: "review", label: "Review", color: "#4d7cfe" },
  { id: "done", label: "Done", color: "#a06cd5" },
];
const KB = { w: 6.4, h: 2.0, px: 160 };  // kanban plane (units) and pixels per unit
const WB = { w: 2.3, h: 1.5, px: 300 };  // whiteboard plane

const clip = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
};

function drawKanban(canvas: HTMLCanvasElement, cards: Card[]): void {
  const ctx = canvas.getContext("2d")!, w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1e2430"; ctx.fillRect(0, 0, w, h);
  const cw = KB.px * 1.0, centers = COLS.map((_, i) => w / 2 + (-2.4 + 1.2 * i) * KB.px);
  COLS.forEach((col, i) => {
    const x = centers[i]! - cw / 2, mine = cards.filter((c) => c.column === col.id);
    ctx.fillStyle = col.color; ctx.fillRect(x, 20, cw, 6);
    ctx.fillStyle = "#e8ecf8"; ctx.font = "bold 20px system-ui, sans-serif"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillText(clip(ctx, col.label, cw - 44), x, 54);
    ctx.fillStyle = col.color; ctx.textAlign = "right"; ctx.fillText(String(mine.length), x + cw, 54);
    ctx.textAlign = "left"; ctx.font = "16px system-ui, sans-serif";
    mine.slice(0, 3).forEach((c, k) => {
      const y = 74 + k * 74;
      ctx.fillStyle = "#2b3345"; ctx.fillRect(x, y, cw, 64);
      ctx.fillStyle = col.color; ctx.fillRect(x, y, 4, 64);
      ctx.fillStyle = "#e8ecf8";
      ctx.fillText(clip(ctx, c.title, cw - 18), x + 10, y + 26);
      if (c.team) { ctx.fillStyle = "#8d97b0"; ctx.font = "13px system-ui, sans-serif"; ctx.fillText(clip(ctx, c.team, cw - 18), x + 10, y + 48); ctx.font = "16px system-ui, sans-serif"; }
    });
    if (mine.length > 3) { ctx.fillStyle = "#8d97b0"; ctx.font = "14px system-ui, sans-serif"; ctx.fillText(`+${mine.length - 3} more`, x, 74 + 3 * 74 + 8); }
  });
}

function drawNotes(canvas: HTMLCanvasElement, notes: Note[]): void {
  const ctx = canvas.getContext("2d")!, w = canvas.width, h = canvas.height, s = 110;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f5f7fa"; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  if (!notes.length) { ctx.fillStyle = "#9aa3b5"; ctx.font = "26px system-ui, sans-serif"; ctx.fillText("Whiteboard — click to add a note", 30, h / 2); return; }
  ctx.font = "17px system-ui, sans-serif";
  for (const n of notes) {
    const x = Math.min(w - s - 6, Math.max(6, n.x * w - s / 2)), y = Math.min(h - s - 6, Math.max(6, n.y * h - s / 2));
    ctx.fillStyle = "#0002"; ctx.fillRect(x + 3, y + 3, s, s);
    ctx.fillStyle = n.color; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "#222";
    const words = n.text.split(/\s+/); let line = "", row = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= s - 16) { line = next; continue; }
      if (line) { ctx.fillText(line, x + 8, y + 24 + row * 21); row++; }
      line = clip(ctx, word, s - 16);
      if (row >= 4) break;
    }
    if (row < 5 && line) ctx.fillText(line, x + 8, y + 24 + row * 21);
  }
}

/** One canvas texture that is redrawn only when `data` changes. */
function useWallTexture<T>(w: number, h: number, data: T, draw: (c: HTMLCanvasElement, d: T) => void): CanvasTexture {
  const canvas = useMemo(() => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }, [w, h]);
  const tex = useMemo(() => { const t = new CanvasTexture(canvas); t.colorSpace = SRGBColorSpace; return t; }, [canvas]);
  useEffect(() => { draw(canvas, data); tex.needsUpdate = true; }, [canvas, tex, data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

export function ManagerWalls({ layout, onOpenBoard, onOpenNotes }: { layout: Layout; onOpenBoard: () => void; onOpenNotes: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  useLive(async () => { try { setCards(await api.board()); } catch { /* keep the last picture */ } }, ["board"]);
  useLive(async () => { try { setNotes((await call<{ notes: Note[] }>("GET", "/api/notes")).notes); } catch { /* keep the last picture */ } }, ["notes"]);
  const kanban = useWallTexture(KB.w * KB.px, KB.h * KB.px, cards, drawKanban);
  const board = useWallTexture(WB.w * WB.px, WB.h * WB.px, notes, drawNotes);

  const zone = layout.zones.find((z) => z.zone.id === "manager-room");
  if (!zone) return null;
  return (
    <group position={[zone.x, 0, zone.z]}>
      <mesh position={[0, 2.0, -3.65]} onClick={(e) => { e.stopPropagation(); onOpenBoard(); }}>
        <planeGeometry args={[KB.w, KB.h]} />
        <meshBasicMaterial map={kanban} toneMapped={false} />
      </mesh>
      <mesh position={[4.6, 1.7, -3.72]} onClick={(e) => { e.stopPropagation(); onOpenNotes(); }}>
        <planeGeometry args={[WB.w, WB.h]} />
        <meshBasicMaterial map={board} toneMapped={false} />
      </mesh>
    </group>
  );
}
