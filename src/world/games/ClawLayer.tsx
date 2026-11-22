import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { ClawSim, USER, itemDef } from "../../shared/rewards";
import { displayName } from "../../util";
import type { Layout } from "../layout";
import { giveReward, winPrize, useRewards } from "../rewards/store";
import { mulberry32 } from "./types";

/** Claw machine (13.7.9): a cabinet in the game room (click it, or the 🕹 chip, to play), a panel with the playfield, and your prize
 *  inventory with "give to an agent". Rules live in `shared/rewards.ts` (ClawSim); this only draws them. Cosmetic: prizes are items for shelves. */
const REL: [number, number] = [6.1, -3.2];
let isOpen = false;
const subs = new Set<() => void>();
const setOpen = (v: boolean) => { isOpen = v; subs.forEach((f) => f()); };
export const openClaw = () => setOpen(true);

const CSS = `
.claw-chip{position:absolute;top:8px;left:12px;padding:3px 8px;background:#151b27ee;border:1px solid #3a4558;border-radius:999px;font-size:12px;color:#e7ecf5;cursor:pointer;pointer-events:auto}
.claw-pop{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,94vw);padding:12px;background:#151b27;border:1px solid #3a4558;border-radius:8px;box-shadow:0 8px 24px #0009;color:#e7ecf5;font-size:12px;pointer-events:auto}
.claw-field{position:relative;height:220px;margin:8px 0;background:linear-gradient(#233, #122);border:2px solid #4fd1c5;border-radius:6px;overflow:hidden}
.claw-field>span{position:absolute;transform:translate(-50%,-50%);font-size:22px}
.claw-claw{position:absolute;transform:translate(-50%,-50%);font-size:26px;transition:font-size .3s}
.claw-claw.drop{font-size:16px}
.claw-pop select{font-size:11px;max-width:150px}
`;

export function ClawLayer({ layout }: { layout: Layout }) {
  const open = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => isOpen);
  const room = layout.zones.find((z) => z.zone.id === "game-room");
  return (
    <>
      {room && <Cabinet x={room.x + REL[0]} z={room.z + REL[1]} />}
      {room && (
        <Html fullscreen zIndexRange={[41, 31]} style={{ pointerEvents: "none" }}>
          <style>{CSS}</style>
          <button className="claw-chip" title="Claw machine in the game room: win prizes, give them to agents" onClick={() => setOpen(!open)}>🕹 Claw</button>
          {open && <ClawPanel layout={layout} />}
        </Html>
      )}
    </>
  );
}

function Cabinet({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, -Math.PI / 2, 0]} onClick={(e) => { e.stopPropagation(); openClaw(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh position={[0, 0.45, 0]}><boxGeometry args={[0.9, 0.9, 0.9]} /><meshStandardMaterial color="#c0392b" /></mesh>
      <mesh position={[0, 1.4, 0]}><boxGeometry args={[0.86, 1.0, 0.86]} /><meshStandardMaterial color="#9fd8ff" transparent opacity={0.35} /></mesh>
      <mesh position={[0, 1.95, 0]}><boxGeometry args={[0.95, 0.12, 0.95]} /><meshStandardMaterial color="#ffd166" emissive="#ffb020" emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 1.15, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5, 8]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
      {[[-0.2, -0.2], [0.2, 0.1], [0, 0.25], [-0.25, 0.2]].map(([px, pz], i) => <mesh key={i} position={[px!, 0.98, pz!]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color={["#ff8fab", "#ffd23f", "#7aa8ff", "#8fd694"][i]} /></mesh>)}
    </group>
  );
}

function ClawPanel({ layout }: { layout: Layout }) {
  const sim = useRef(new ClawSim(mulberry32((Math.random() * 2 ** 32) >>> 0)));
  const [, frame] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const all = useRewards();
  const mine = all.get(USER) ?? [];
  const [target, setTarget] = useState("");

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const s = sim.current;
      s.step(Math.min(0.1, (now - last) / 1000)); last = now;
      if (s.phase === "done" && done === null) { setDone(s.won ?? ""); if (s.won) void winPrize(s.won, crypto.randomUUID()); }
      frame((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [done]);
  const press = () => sim.current.press();
  const again = () => { sim.current = new ClawSim(mulberry32((Math.random() * 2 ** 32) >>> 0)); setDone(null); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code === "Space" && !(t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName))) { e.preventDefault(); if (sim.current.phase === "done") again(); else press(); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const s = sim.current, dropping = s.phase === "drop" || s.phase === "carry";
  const label = s.phase === "x" ? "Stop sideways" : s.phase === "z" ? "Stop and drop" : s.phase === "done" ? "Play again" : "…";
  const won = done ? itemDef(done) : null;
  return (
    <div className="claw-pop" role="dialog" aria-label="Claw machine">
      <b>🕹 Claw machine</b> <button style={{ float: "right" }} aria-label="Close" onClick={() => setOpen(false)}>×</button>
      <div className="claw-field">
        {s.plushes.map((p, i) => { const d = itemDef(p.item); return d && !(s.grabbed === p && s.phase !== "x") ? <span key={i} style={{ left: `${p.x * 100}%`, top: `${p.z * 100}%` }}>{d.icon}</span> : null; })}
        <div className={`claw-claw ${dropping ? "drop" : ""}`} style={{ left: `${s.x * 100}%`, top: `${s.z * 100}%` }}>🪝</div>
      </div>
      <div>
        <button disabled={dropping} onClick={() => (s.phase === "done" ? again() : press())}>{label} <kbd>Space</kbd></button>{" "}
        <span role="status">{s.phase === "done" ? (won ? `You won ${won.icon} ${won.name}! ${s.log}` : s.log) : s.phase === "x" ? "Stop the claw sideways, then front-to-back. Close to a prize = better odds; it may still slip on the way back." : ""}</span>
      </div>
      <hr />
      <b>🎁 Your inventory</b>
      {mine.length === 0 ? <p className="muted">Nothing yet.</p> : (
        <div>
          <p>{mine.map((r) => { const d = itemDef(r.item); return <span key={r.id} title={d?.name} style={{ marginRight: 6, fontSize: 20 }}>{d?.icon ?? "?"}</span>; })}</p>
          <select aria-label="Agent" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">give to…</option>{layout.desks.map((d) => <option key={d.worker.id} value={d.worker.id}>{displayName(d.worker)}</option>)}
          </select>{" "}
          <button disabled={!target} onClick={() => { void giveReward(mine[0]!.id, target).then((e) => setMsg(e ?? `Gave ${itemDef(mine[0]!.item)?.name ?? "it"} away.`)); }}>Give the first item</button>
          {msg && <span role="status"> {msg}</span>}
        </div>
      )}
      <p className="muted">Prizes are for shelves: they never change how an agent works.</p>
    </div>
  );
}
