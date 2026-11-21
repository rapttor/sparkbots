import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, CanvasTexture, Color, InstancedMesh, Matrix4, Object3D, PlaneGeometry, SRGBColorSpace, type Group, type Mesh } from "three";
import type { Worker } from "../../server/adapters/types";
import { fmtDuration, fmtNum, relTime } from "../util";
import { MAX_DESKS, type DeskSlot, type Layout } from "./layout";
import { STATE_COLORS } from "./colors";

/** A laptop on every desk facing the robot. Open while its worker is busy (or being talked to), closed otherwise;
 *  a closed laptop glows its status color. Far away the open screen is a flat status panel; the nearest few
 *  open laptops get a canvas texture with the worker's numbers. */
export const SCREEN_W = 1.5;
export const SCREEN_H = 0.9;
const LID_H = SCREEN_H + 0.1;
const HINGE_Y = 0.875;
const HINGE_DZ = -0.45;       // hinge sits at the back edge of the desk
const OPEN_ANGLE = -0.25;     // lid leans back a little
const CLOSED_ANGLE = Math.PI / 2;
const POOL = 10;              // detailed screens at once
const NEAR = 28;              // only desks closer than this to the camera get one
const CW = 480, CH = 288;
const SPEED = 4;              // lid open/close speed (1 = full swing per second)

const grp = new Object3D();
const child = new Object3D();
const M = new Matrix4();
const o = new Object3D();
const tint = new Color();
const DARK = new Color("#141a28");

/** Busy workers keep their laptop open; so does the one being chatted with. */
export const laptopOpen = (w: Worker, openId?: string) =>
  w.id === openId || w.state === "working" || w.state === "waiting" || w.state === "done" || w.state === "error";

function lidMatrix(d: DeskSlot, angle: number, ly: number, lz: number, scale = 1): Matrix4 {
  grp.position.set(d.x, HINGE_Y, d.z + HINGE_DZ);
  grp.rotation.set(angle, 0, 0);
  grp.updateMatrix();
  child.position.set(0, ly, lz);
  child.scale.setScalar(scale);
  child.updateMatrix();
  return M.multiplyMatrices(grp.matrix, child.matrix);
}

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
};

/** Paints one worker's status screen. Pure canvas drawing, no state. */
export function drawScreen(ctx: CanvasRenderingContext2D, w: Worker, now: number): void {
  const accent = STATE_COLORS[w.state];
  ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = accent; ctx.globalAlpha = 0.22; ctx.fillRect(0, 0, CW, 52); ctx.globalAlpha = 1;
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 8, CH);
  ctx.beginPath(); ctx.arc(34, 26, 10, 0, Math.PI * 2); ctx.fill();
  ctx.font = "bold 26px system-ui, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(w.state.toUpperCase(), 54, 27);
  ctx.fillStyle = "#c9d3ea"; ctx.font = "22px system-ui, sans-serif"; ctx.textAlign = "right";
  ctx.fillText(w.activity, CW - 16, 27);

  ctx.textAlign = "left"; ctx.fillStyle = "#ffffff"; ctx.font = "bold 25px system-ui, sans-serif";
  ctx.fillText(fit(ctx, w.name || w.title || "(untitled)", CW - 40), 24, 80);

  const s = w.stats;
  const cells: [string, string][] = s
    ? [["WORKED", fmtDuration(s.workMs)], ["TOKENS", fmtNum(s.tokens)], ["PROMPTS", fmtNum(s.turns)], ["TOOL CALLS", fmtNum(s.tools)]]
    : [["WORKED", "…"], ["TOKENS", "…"], ["PROMPTS", "…"], ["TOOL CALLS", "…"]];
  cells.forEach(([label, value], i) => {
    const x = 24 + (i % 2) * 220, y = 120 + Math.floor(i / 2) * 62;
    ctx.fillStyle = "#7f8aa3"; ctx.font = "16px system-ui, sans-serif"; ctx.fillText(label, x, y);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 32px system-ui, sans-serif"; ctx.fillText(value, x, y + 28);
  });

  ctx.fillStyle = "#7f8aa3"; ctx.font = "17px system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
  const bits = [`active ${relTime(w.lastEventAt, now)}`];
  if (s?.ctx) bits.push(`context ${fmtNum(s.ctx)}`);
  if (w.helpers > 0) bits.push(`${w.helpers} helper${w.helpers > 1 ? "s" : ""}`);
  ctx.fillText(fit(ctx, bits.join("  ·  "), w.liveInTerminal ? 300 : CW - 40), 24, CH - 16);
  if (w.liveInTerminal) {
    ctx.fillStyle = "#ffb020"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.textAlign = "right";
    ctx.fillText("LIVE IN TERMINAL", CW - 16, CH - 16);
  }
}

const keyOf = (w: Worker, now: number) =>
  [w.id, w.state, w.activity, w.title, w.name, w.helpers, w.liveInTerminal, w.stats?.workMs, w.stats?.tokens, w.stats?.turns, w.stats?.tools, w.stats?.ctx, Math.floor(now / 10_000)].join("|");

export function DeskScreens({ layout, openId, onScreen }: { layout: Layout; openId?: string; onScreen?: (deskIndex: number) => void }) {
  const { camera } = useThree();
  const base = useRef<InstancedMesh>(null);
  const lid = useRef<InstancedMesh>(null);
  const screen = useRef<InstancedMesh>(null);
  const layoutRef = useRef(layout);
  const openRef = useRef(openId);
  const closed = useRef<number[]>([]);   // current closed amount per desk: 0 open .. 1 shut
  const slots = useRef<{ ctx: CanvasRenderingContext2D; tex: CanvasTexture; desk: number; key: string }[]>([]);
  const geo = useMemo(() => ({
    plane: new PlaneGeometry(SCREEN_W, SCREEN_H),
    lid: new BoxGeometry(SCREEN_W + 0.1, LID_H, 0.05),
    base: new BoxGeometry(SCREEN_W + 0.1, 0.05, 0.95),
  }), []);
  const poolRefs = useRef<(Group | null)[]>([]);
  const last = useRef(0);

  if (slots.current.length === 0 && typeof document !== "undefined") {
    for (let i = 0; i < POOL; i++) {
      const c = document.createElement("canvas"); c.width = CW; c.height = CH;
      const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
      slots.current.push({ ctx: c.getContext("2d")!, tex, desk: -1, key: "" });
    }
  }
  useEffect(() => () => { for (const s of slots.current) s.tex.dispose(); }, []);

  /** Writes one desk's lid, screen panel and tint for the given closed amount. */
  const pose = (i: number, d: DeskSlot, c: number) => {
    const angle = OPEN_ANGLE + (CLOSED_ANGLE - OPEN_ANGLE) * c;
    lid.current!.setMatrixAt(i, lidMatrix(d, angle, LID_H / 2, 0).clone());
    screen.current!.setMatrixAt(i, lidMatrix(d, angle, LID_H / 2, 0.028, c > 0.4 ? 0 : 1).clone());
  };

  useLayoutEffect(() => {
    layoutRef.current = layout; openRef.current = openId;
    const b = base.current, l = lid.current, sc = screen.current;
    if (!b || !l || !sc) return;
    b.count = l.count = sc.count = layout.desks.length;
    layout.desks.forEach((d, i) => {
      if (closed.current[i] === undefined || closed.current.length !== layout.desks.length) closed.current[i] = laptopOpen(d.worker, openId) ? 0 : 1;
      grp.position.set(d.x, 0.825, d.z + 0.025); grp.rotation.set(0, 0, 0); grp.updateMatrix();
      b.setMatrixAt(i, grp.matrix);
      b.setColorAt(i, DARK);
      pose(i, d, closed.current[i]!);
      sc.setColorAt(i, tint.set(STATE_COLORS[d.worker.state]).multiplyScalar(0.45));
      // a shut laptop glows its status color; an open one has a dark frame
      l.setColorAt(i, laptopOpen(d.worker, openId) ? DARK : tint.set(STATE_COLORS[d.worker.state]).multiplyScalar(0.55));
    });
    b.instanceMatrix.needsUpdate = l.instanceMatrix.needsUpdate = sc.instanceMatrix.needsUpdate = true;
    for (const m of [b, l, sc]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    for (const s of slots.current) s.key = ""; // worker data may have changed
  }, [layout, openId]);

  useFrame((_, dt) => {
    const desks = layoutRef.current.desks;
    // animate lids that are still swinging
    let moved = false;
    desks.forEach((d, i) => {
      const target = laptopOpen(d.worker, openRef.current) ? 0 : 1;
      const cur = closed.current[i] ?? target;
      if (cur === target) return;
      const next = cur < target ? Math.min(target, cur + dt * SPEED) : Math.max(target, cur - dt * SPEED);
      closed.current[i] = next; pose(i, d, next); moved = true;
    });
    if (moved && lid.current && screen.current) { lid.current.instanceMatrix.needsUpdate = screen.current.instanceMatrix.needsUpdate = true; }

    const now = Date.now();
    if (now - last.current < 400) return;
    last.current = now;
    const near = desks
      .filter((d) => (closed.current[d.index] ?? 1) < 0.02)
      .map((d) => ({ i: d.index, dist: camera.position.distanceTo(o.position.set(d.x, 1, d.z)) }))
      .filter((c) => c.dist < NEAR).sort((a, b) => a.dist - b.dist).slice(0, POOL);
    slots.current.forEach((s, k) => {
      const g = poolRefs.current[k];
      const pick = near[k];
      if (!g || !pick) { if (g) g.visible = false; s.desk = -1; return; }
      const d = desks[pick.i]!;
      if (s.desk !== d.index) { s.desk = d.index; s.key = ""; }
      g.visible = true;
      g.position.set(d.x, HINGE_Y, d.z + HINGE_DZ);
      g.rotation.set(OPEN_ANGLE, 0, 0);
      const key = keyOf(d.worker, now);
      if (key !== s.key) { s.key = key; drawScreen(s.ctx, d.worker, now); s.tex.needsUpdate = true; }
    });
  });

  return (
    <>
      <instancedMesh ref={base} args={[geo.base, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={lid} args={[geo.lid, undefined, MAX_DESKS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={screen} args={[geo.plane, undefined, MAX_DESKS]} frustumCulled={false}
        onClick={onScreen ? (e) => { e.stopPropagation(); if (e.instanceId !== undefined) onScreen(e.instanceId); } : undefined}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {slots.current.map((s, k) => (
        <group key={k} ref={(g) => { poolRefs.current[k] = g; }} visible={false}>
          <mesh geometry={geo.plane} position={[0, LID_H / 2, 0.03]} onClick={onScreen ? (e) => { e.stopPropagation(); if (s.desk >= 0) onScreen(s.desk); } : undefined}>
            <meshBasicMaterial map={s.tex} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
