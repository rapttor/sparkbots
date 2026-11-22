import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Layout } from "../layout";
import { insideRoom, player } from "../roam";
import { SESSION_S, WEAPONS, isOver, smash, startSession, timeLeft, type Session } from "./anger";
import { bubble, btn, panel, pointer } from "./ui";

/** Anger room: the weapon pick opens when you walk in (or click the rack); then 60 s of breakable office junk. When time is up or everything is smashed the room resets. Points are local to this visit. */
export function AngerRoom({ layout }: { layout: Layout }) {
  const az = layout.zones.find((z) => z.zone.id === "anger-room");
  const [pick, setPick] = useState(false);
  const [sess, setSess] = useState<Session | null>(null);
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(0);
  const inside = useRef(false);
  const sessRef = useRef<Session | null>(null); sessRef.current = sess;

  useFrame(() => {
    if (!az) return;
    const was = inside.current;
    inside.current = player.on && insideRoom({ x: az.x, z: az.z, w: az.w, d: az.d }, player.x, player.z);
    if (inside.current && !was && !sessRef.current) setPick(true);
    const s = sessRef.current;
    if (s) {
      const now = Date.now();
      const l = Math.ceil(timeLeft(s, now));
      setLeft((p) => (p === l ? p : l));
      if (isOver(s, now)) { setTotal((n) => n + s.points); setSess(null); }
    }
  });
  useEffect(() => { if (!az) setSess(null); }, [az]);
  if (!az) return null;

  const begin = (weapon: string) => { setSess(startSession(weapon, Date.now(), az.w, az.d)); setLeft(SESSION_S); setPick(false); };
  const rack = az.pois.find((p) => p.id === "anger-room:rack");
  return (
    <group position={[az.x, 0, az.z]}>
      <mesh position={[-3.7, 0.9, 2.3]} onClick={(e) => { e.stopPropagation(); if (!sess) setPick(true); }} {...pointer}>
        <boxGeometry args={[1.5, 1.8, 0.8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {sess?.targets.filter((t) => t.alive).map((t) => (
        <group key={t.id} position={[t.x, 0, t.z]} onClick={(e) => { e.stopPropagation(); setSess((s) => (s ? smash(s, t.id, Date.now()) : s)); }} {...pointer}>
          <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.7, 0.8, 0.6]} /><meshStandardMaterial color={t.hp > 1 ? "#94a3b8" : "#f59e0b"} /></mesh>
          <Html position={[0, 0.5, 0.31]} center style={{ pointerEvents: "none" }}><span style={{ fontSize: 22 }}>{t.icon}</span></Html>
        </group>
      ))}
      {pick && !sess && (
        <Html position={[-3.7, 2.4, 2.3]} center zIndexRange={[30, 0]}>
          <div style={panel}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💢 Pick a weapon</div>
            {WEAPONS.map((w) => <button key={w.id} style={btn} onClick={() => begin(w.id)}>{w.icon} {w.name}</button>)}
            <button style={btn} onClick={() => setPick(false)}>Not today</button>
          </div>
        </Html>
      )}
      {sess && <Html position={[0, 2.6, -2.5]} center style={{ pointerEvents: "none" }}><div style={bubble}>{WEAPONS.find((w) => w.id === sess.weapon)?.icon} {left}s · {sess.points} pts</div></Html>}
      {!sess && total > 0 && rack && <Html position={[0, 2.6, -2.5]} center style={{ pointerEvents: "none" }}><div style={bubble}>Feeling better? {total} pts of frustration released</div></Html>}
    </group>
  );
}
