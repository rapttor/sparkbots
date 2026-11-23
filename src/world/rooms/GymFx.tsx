import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Layout } from "../layout";
import { roams } from "../roam";
import { BLOW_S, PUMP_LIMIT_S, boredLine, pumpPhase, pumpScale } from "./gymLogic";
import { bubble } from "./ui";

/** Gym extras: a gleam sweeping across the mirror wall, a balloon-style over-pump effect around anyone who lifts too long (then they are back to normal), and boredom thoughts on the treadmill. Cosmetic only; no agent state is touched. */
export function GymFx({ layout }: { layout: Layout }) {
  const gz = layout.zones.find((z) => z.zone.id === "gym");
  const glint = useRef<Mesh>(null), balloon = useRef<Mesh>(null);
  const lift = useRef(new Map<string, number>());      // agent id -> seconds at the bench
  const run = useRef({ id: "", t: 0, next: 9 });       // the treadmill user and when the next thought comes
  const [thought, setThought] = useState("");
  const [pop, setPop] = useState(false);
  const poppedFor = useRef("");

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (glint.current) glint.current.position.x = -5.2 + ((t * 1.2) % 10.4);
    if (!gz) return;
    let lifter = "", treadmill = "";
    for (const [id, r] of roams) {
      const v = r.visit;
      if (!v || !v.arrived) continue;
      if (v.poi.id === "gym:bench") lifter = id;
      else if (v.poi.id === "gym:treadmill") treadmill = id;
    }
    // over-pump
    const m = lift.current;
    for (const k of [...m.keys()]) if (k !== lifter) m.delete(k);
    if (lifter) {
      const s = (m.get(lifter) ?? 0) + Math.min(dt, 0.1);
      m.set(lifter, s);
      const r = roams.get(lifter)!;
      const ph = pumpPhase(s);
      if (balloon.current) {
        balloon.current.visible = ph === "swelling";
        balloon.current.position.set(r.x, 0.5, r.z); balloon.current.scale.setScalar(0.7 * pumpScale(s));
      }
      if (ph === "blown" && poppedFor.current !== lifter) { poppedFor.current = lifter; setPop(true); setTimeout(() => setPop(false), BLOW_S * 1000); }
      if (s > PUMP_LIMIT_S + BLOW_S) { m.set(lifter, 0); poppedFor.current = ""; }
    } else if (balloon.current) balloon.current.visible = false;
    // boredom
    const rr = run.current;
    if (treadmill !== rr.id) { rr.id = treadmill; rr.t = 0; rr.next = 9; setThought(""); }
    else if (treadmill) {
      rr.t += Math.min(dt, 0.1);
      if (rr.t >= rr.next) { rr.next = rr.t + 10; setThought(boredLine()); setTimeout(() => setThought(""), 5000); }
    }
  });

  if (!gz) return null;
  const tm = gz.pois.find((p) => p.id === "gym:treadmill"), bn = gz.pois.find((p) => p.id === "gym:bench");
  return (
    <>
      <group position={[gz.x, 0, gz.z - 4.36]}>
        <mesh ref={glint} position={[-5, 1.3, 0]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.35, 2.1, 0.02]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.35} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={balloon} visible={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#fca5a5" transparent opacity={0.55} /></mesh>
      {thought && tm && <Html position={[tm.x, 2.2, tm.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={bubble}>💭 {thought}</div></Html>}
      {pop && bn && <Html position={[bn.x, 2.0, bn.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={bubble}>💥 POP! …just kidding, re-forming</div></Html>}
    </>
  );
}
