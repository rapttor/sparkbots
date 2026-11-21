import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CanvasTexture, PlaneGeometry, SRGBColorSpace, type Group } from "three";
import type { Worker } from "../../server/adapters/types";
import { useStore } from "../state/store";
import type { Layout } from "./layout";
import { STATE_COLORS } from "./colors";

/** Speech bubbles above bots that said something the user has not seen yet. The bubble is drawn in the bot's
 *  status color (amber = needs you, teal = finished, red = error, blue/green = information). Click opens the chat. */
const POOL = 14;
const FRESH_MS = 12 * 3_600_000; // older messages are history, not news
const LINES = 6; // up to six lines of the message; the full text is one click away (chat, scrollable)
const W = 2.6, H = 1.8;
const CW = 520, CH = 360;
const TYPE_CHARS_PER_SEC = 42;

const LABEL: Record<string, string> = { waiting: "NEEDS YOU", done: "FINISHED", error: "ERROR", working: "UPDATE", idle: "MESSAGE", asleep: "MESSAGE" };

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = word;
  }
  if (cur) out.push(cur);
  return out;
};

/** The bubble grows with its text (1 to LINES lines): the tail stays put at the bottom, the body grows upward. */
export function drawBubble(ctx: CanvasRenderingContext2D, w: Worker): number {
  const accent = STATE_COLORS[w.state];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  const bw = CW - 8, r = 26;
  ctx.font = "24px system-ui, sans-serif";
  const all = wrap(ctx, w.said?.text ?? "", bw - 56);
  const clipped = all.length > LINES;
  const lines = all.slice(-LINES); // live-reading window: follow the newest part as the assistant keeps talking
  if (clipped && lines.length) lines[0] = `…${lines[0]}`;
  const bh = 76 + Math.max(1, lines.length) * 32 + 14; // header + text + padding
  const top = CH - 48 - bh;
  ctx.translate(0, top);                                // bottom-align: tip of the tail always at the canvas bottom
  ctx.fillStyle = "#0e1424"; ctx.strokeStyle = accent; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(4, 4, bw, bh, r);
  ctx.fill(); ctx.stroke();
  const tip = bh + 44;
  ctx.beginPath(); ctx.moveTo(CW / 2 - 26, bh); ctx.lineTo(CW / 2, tip); ctx.lineTo(CW / 2 + 26, bh);
  ctx.fillStyle = "#0e1424"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(CW / 2 - 26, bh + 2); ctx.lineTo(CW / 2, tip); ctx.lineTo(CW / 2 + 26, bh + 2); ctx.stroke();
  ctx.fillStyle = "#0e1424"; ctx.fillRect(CW / 2 - 24, bh - 6, 48, 10);

  ctx.fillStyle = accent; ctx.font = "bold 24px system-ui, sans-serif"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.beginPath(); ctx.arc(40, 44, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillText(LABEL[w.state] ?? "MESSAGE", 60, 53);
  // Local visual dismiss button. Its click handling lives on the bubble mesh and never mutates message/read data.
  ctx.beginPath(); ctx.arc(bw - 30, 34, 19, 0, Math.PI * 2); ctx.fillStyle = "#202a40"; ctx.fill();
  ctx.strokeStyle = "#aeb9cf"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(bw - 37, 27); ctx.lineTo(bw - 23, 41); ctx.moveTo(bw - 23, 27); ctx.lineTo(bw - 37, 41); ctx.stroke();
  ctx.fillStyle = "#e8ecf8"; ctx.font = "24px system-ui, sans-serif";
  lines.forEach((line, i) => ctx.fillText(line, 28, 96 + i * 32));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return top;
}

export function SpeechBubbles({ layout, getPos }: { layout: Layout; getPos: (id: string) => { x: number; z: number } | undefined }) {
  const openChat = useStore((s) => s.openChat);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const plane = useMemo(() => new PlaneGeometry(W, H), []);
  const slots = useRef<{ ctx: CanvasRenderingContext2D; tex: CanvasTexture; id: string; full: string; reveal: number; drawn: number; closeY: number; worker: Worker | null }[]>([]);
  const dismissed = useRef(new Map<string, number>()); // visual-only: worker id -> dismissed message timestamp
  const groups = useRef<(Group | null)[]>([]);
  const last = useRef(0);

  if (slots.current.length === 0 && typeof document !== "undefined") {
    for (let i = 0; i < POOL; i++) {
      const c = document.createElement("canvas"); c.width = CW; c.height = CH;
      const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
      slots.current.push({ ctx: c.getContext("2d")!, tex, id: "", full: "", reveal: 0, drawn: -1, closeY: 0, worker: null });
    }
  }
  useEffect(() => () => { for (const s of slots.current) s.tex.dispose(); }, []);

  useFrame((state, delta) => {
    const now = Date.now();
    if (now - last.current >= 500) { // choose who gets a bubble
      last.current = now;
      const { seen } = useStore.getState();
      const unseen = layoutRef.current.desks
        .map((d) => d.worker)
        // An open chat does not suppress its bot's bubble: the bot should visibly speak while the reply is also
        // appended to the auto-scrolling chat. Only the explicit Clear bubbles action dismisses it.
        .filter((w) => w.said && w.said.at > (seen[w.id] ?? 0) && w.said.at > (dismissed.current.get(w.id) ?? 0) && now - w.said.at < FRESH_MS)
        .sort((a, b) => Number(b.state === "waiting") - Number(a.state === "waiting") || b.said!.at - a.said!.at)
        .slice(0, POOL);
      slots.current.forEach((s, k) => {
        const w = unseen[k];
        if (!w) { s.id = ""; s.worker = null; return; }
        const text = w.said!.text;
        const sameMessage = s.id === w.id && (text === s.full || text.startsWith(s.full));
        if (!sameMessage) { s.reveal = 0; s.drawn = -1; }
        s.id = w.id;
        s.full = text;
        s.worker = w;
      });
    }
    // Typewriter simulation: start at the beginning, then let the six-line viewport advance naturally as text is revealed.
    for (const s of slots.current) {
      if (!s.id || !s.worker) continue;
      s.reveal = Math.min(s.full.length, s.reveal + TYPE_CHARS_PER_SEC * Math.min(delta, 0.1));
      const shown = Math.max(1, Math.floor(s.reveal));
      if (shown !== s.drawn) {
        s.drawn = shown;
        s.closeY = drawBubble(s.ctx, { ...s.worker, said: { ...s.worker.said!, text: s.full.slice(0, shown) } });
        s.tex.needsUpdate = true;
      }
    }
    const t = state.clock.elapsedTime;
    slots.current.forEach((s, k) => {
      const g = groups.current[k];
      if (!g) return;
      const p = s.id ? getPos(s.id) : undefined;
      g.visible = !!p;
      if (p) g.position.set(p.x, 2.6 + Math.sin(t * 2 + k) * 0.06, p.z);
    });
  });

  return (
    <>
      {slots.current.map((s, k) => (
        <group key={k} ref={(g) => { groups.current[k] = g; }} visible={false}>
          <Billboard>
            <mesh geometry={plane} renderOrder={20} onClick={(e) => {
              e.stopPropagation();
              if (!s.id) return;
              const px = (e.uv?.x ?? 0) * CW, py = (1 - (e.uv?.y ?? 0)) * CH;
              if (px >= CW - 76 && py >= s.closeY + 8 && py <= s.closeY + 62) {
                if (s.worker?.said) dismissed.current.set(s.id, s.worker.said.at);
                s.id = ""; s.worker = null;
                return;
              }
              openChat(s.id);
            }}>
              <meshBasicMaterial map={s.tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
          </Billboard>
        </group>
      ))}
    </>
  );
}
