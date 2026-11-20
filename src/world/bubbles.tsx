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
const W = 2.6, H = 1.3;
const CW = 520, CH = 260;

const LABEL: Record<string, string> = { waiting: "NEEDS YOU", done: "FINISHED", error: "ERROR", working: "UPDATE", idle: "MESSAGE", asleep: "MESSAGE" };

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] => {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = word;
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  if (out.length === lines && (cur || text.length > out.join(" ").length)) out[lines - 1] = `${out[lines - 1]!.replace(/…$/, "")}…`;
  return out;
};

export function drawBubble(ctx: CanvasRenderingContext2D, w: Worker): void {
  const accent = STATE_COLORS[w.state];
  ctx.clearRect(0, 0, CW, CH);
  const bw = CW - 8, bh = CH - 48, r = 26;
  ctx.fillStyle = "#0e1424"; ctx.strokeStyle = accent; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(4, 4, bw, bh, r);
  ctx.fill(); ctx.stroke();
  // tail pointing down at the bot
  ctx.beginPath(); ctx.moveTo(CW / 2 - 26, bh); ctx.lineTo(CW / 2, CH - 4); ctx.lineTo(CW / 2 + 26, bh);
  ctx.fillStyle = "#0e1424"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(CW / 2 - 26, bh + 2); ctx.lineTo(CW / 2, CH - 4); ctx.lineTo(CW / 2 + 26, bh + 2); ctx.stroke();
  ctx.fillStyle = "#0e1424"; ctx.fillRect(CW / 2 - 24, bh - 6, 48, 10);

  ctx.fillStyle = accent; ctx.font = "bold 24px system-ui, sans-serif"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.beginPath(); ctx.arc(40, 44, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillText(LABEL[w.state] ?? "MESSAGE", 60, 53);
  ctx.fillStyle = "#e8ecf8"; ctx.font = "24px system-ui, sans-serif";
  wrap(ctx, w.said?.text ?? "", bw - 56, 3).forEach((line, i) => ctx.fillText(line, 28, 96 + i * 32));
}

export function SpeechBubbles({ layout, getPos }: { layout: Layout; getPos: (id: string) => { x: number; z: number } | undefined }) {
  const openChat = useStore((s) => s.openChat);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const plane = useMemo(() => new PlaneGeometry(W, H), []);
  const slots = useRef<{ ctx: CanvasRenderingContext2D; tex: CanvasTexture; id: string; key: string; at: number }[]>([]);
  const groups = useRef<(Group | null)[]>([]);
  const last = useRef(0);

  if (slots.current.length === 0 && typeof document !== "undefined") {
    for (let i = 0; i < POOL; i++) {
      const c = document.createElement("canvas"); c.width = CW; c.height = CH;
      const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
      slots.current.push({ ctx: c.getContext("2d")!, tex, id: "", key: "", at: 0 });
    }
  }
  useEffect(() => () => { for (const s of slots.current) s.tex.dispose(); }, []);

  useFrame((state) => {
    const now = Date.now();
    if (now - last.current >= 500) { // choose who gets a bubble
      last.current = now;
      const { seen, chatId } = useStore.getState();
      const unseen = layoutRef.current.desks
        .map((d) => d.worker)
        .filter((w) => w.said && w.id !== chatId && w.said.at > (seen[w.id] ?? 0) && now - w.said.at < FRESH_MS)
        .sort((a, b) => Number(b.state === "waiting") - Number(a.state === "waiting") || b.said!.at - a.said!.at)
        .slice(0, POOL);
      slots.current.forEach((s, k) => {
        const w = unseen[k];
        if (!w) { s.id = ""; return; }
        const key = `${w.id}|${w.state}|${w.said!.at}`;
        s.id = w.id;
        if (key !== s.key) { s.key = key; drawBubble(s.ctx, w); s.tex.needsUpdate = true; }
      });
    }
    const t = state.clock.elapsedTime;
    slots.current.forEach((s, k) => {
      const g = groups.current[k];
      if (!g) return;
      const p = s.id ? getPos(s.id) : undefined;
      g.visible = !!p;
      if (p) g.position.set(p.x, 2.35 + Math.sin(t * 2 + k) * 0.06, p.z);
    });
  });

  return (
    <>
      {slots.current.map((s, k) => (
        <group key={k} ref={(g) => { groups.current[k] = g; }} visible={false}>
          <Billboard>
            <mesh geometry={plane} renderOrder={20} onClick={(e) => { e.stopPropagation(); if (s.id) openChat(s.id); }}>
              <meshBasicMaterial map={s.tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
          </Billboard>
        </group>
      ))}
    </>
  );
}
