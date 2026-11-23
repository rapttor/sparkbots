import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { Instance } from "./hub";
import { BALL_R, BilliardsSim, VARIANTS, shotSpeed, type BBall } from "./billiards";
import { HOOP_Y, HoopsSim, RIM_R, SHOOT_DIST, SWEET_ANGLE_METER, SWEET_POWER_METER } from "./hoops";
import { TABLE } from "./rally";

const TOP = 0.76;
const BALL_COLORS = ["#f5f2e8", "#f2c230", "#2956c9", "#d63a2e", "#6a3aa8", "#f0802a", "#2e9a4a", "#8a2a2a"];
const ballColor = (id: number): string => (id === 0 ? BALL_COLORS[0]! : id === 8 ? "#111" : BALL_COLORS[((id - 1) % 7) + 1]!);

/** Billiards table: cloth colour follows the variant; the balls are plain meshes moved once per frame from `sim.balls` (no React state). */
export function BilliardsView({ inst }: { inst: Instance }) {
  const sim = inst.sim instanceof BilliardsSim ? inst.sim : null;
  const refs = useRef<(Group | null)[]>([]), stick = useRef<Group>(null), guide = useRef<Mesh>(null);
  const cloth = VARIANTS[sim?.variant ?? "eight"].cloth;
  useFrame(() => {
    if (!sim) return;
    sim.balls.forEach((b: BBall, i) => { const g = refs.current[i]; if (g) { g.visible = !b.out; g.position.set(b.x, TOP + BALL_R, b.z); } });
    const s = stick.current, cue = sim.balls[0];
    if (s && cue) {
      s.visible = sim.phase === "aim" && !sim.over;
      s.position.set(cue.x, TOP + BALL_R, cue.z);
      s.rotation.y = -sim.aim.angle;
      s.children[0]?.position.set(-(0.08 + shotSpeed(sim.aim.strength) * 0.045 + 0.55), 0, 0);
      if (guide.current) guide.current.visible = sim.yourTurn; // your aim line: it shows where the cue ball is going
    }
  });
  const n = sim ? sim.balls.length : 0;
  return (
    <>
      <mesh position={[0, 0.34, 0]}><boxGeometry args={[TABLE.L + 0.3, 0.68, TABLE.W + 0.3]} /><meshStandardMaterial color="#4a2e1d" /></mesh>
      <mesh position={[0, TOP - 0.01, 0]}><boxGeometry args={[TABLE.L, 0.04, TABLE.W]} /><meshStandardMaterial color={cloth} /></mesh>
      {[[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} position={[x! * TABLE.L / 2, TOP + 0.005, z! * TABLE.W / 2]}><cylinderGeometry args={[0.1, 0.1, 0.02, 14]} /><meshStandardMaterial color="#0b0b0b" /></mesh>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }}>
          <mesh><sphereGeometry args={[BALL_R, 12, 8]} /><meshStandardMaterial color={ballColor(sim!.balls[i]!.id)} /></mesh>
          {sim!.balls[i]!.id > 8 && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[BALL_R * 0.99, BALL_R * 0.28, 6, 14]} /><meshStandardMaterial color="#f5f2e8" /></mesh>}
        </group>
      ))}
      <group ref={stick} visible={false}><mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.012, 0.02, 1.1, 8]} /><meshStandardMaterial color="#d9b27a" /></mesh><mesh ref={guide} position={[0.9, 0, 0]} visible={false}><boxGeometry args={[1.8, 0.004, 0.006]} /><meshBasicMaterial color="#ffe66d" transparent opacity={0.8} /></mesh></group>
    </>
  );
}

const METER_Y0 = 0.9, METER_H = 0.8;
/** Mini hoop between the two players: a ring on an arm, a meter bar (angle, then power) and the ball with its fetch drone. */
export function HoopsView({ inst, colorOf }: { inst: Instance; colorOf: (id: string | null) => string }) {
  const sim = inst.sim instanceof HoopsSim ? inst.sim : null;
  const ball = useRef<Mesh>(null), drone = useRef<Group>(null), mark = useRef<Mesh>(null), rot = useRef<Group>(null);
  useFrame((s) => {
    if (!sim) return;
    const b = sim.ballPos(), d = sim.dronePos();
    ball.current?.position.set(0, b.y, b.z);
    drone.current?.position.set(0, d.y, d.z);
    if (rot.current) rot.current.rotation.y = s.clock.elapsedTime * 14;
    const m = mark.current;
    if (m) {
      m.visible = sim.phase === "angle" || sim.phase === "power";
      m.position.y = METER_Y0 + sim.meter() * METER_H;
      (m.material as MeshStandardMaterial).color.set(sim.phase === "angle" ? "#4cc9f0" : "#ffb020");
    }
  });
  return (
    <>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[SHOOT_DIST - 0.05, SHOOT_DIST - 0.02, 28]} /><meshStandardMaterial color="#c0392b" /></mesh>
      <mesh position={[0.8, 0.9, 0]}><cylinderGeometry args={[0.03, 0.04, 1.8, 8]} /><meshStandardMaterial color="#888" /></mesh>
      <mesh position={[0.4, HOOP_Y + 0.02, 0]}><boxGeometry args={[0.8, 0.03, 0.03]} /><meshStandardMaterial color="#888" /></mesh>
      <mesh position={[0, HOOP_Y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[RIM_R, 0.015, 6, 20]} /><meshStandardMaterial color="#e8590c" /></mesh>
      <mesh position={[0, HOOP_Y - 0.12, 0]}><cylinderGeometry args={[RIM_R, RIM_R * 0.6, 0.24, 10, 1, true]} /><meshStandardMaterial color="#eee" wireframe /></mesh>
      <mesh position={[0.7, METER_Y0 + METER_H / 2, 0]}><boxGeometry args={[0.04, METER_H + 0.1, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
      {[SWEET_ANGLE_METER, SWEET_POWER_METER].map((v, i) => <mesh key={i} position={[0.7, METER_Y0 + v * METER_H, 0.045]}><boxGeometry args={[0.06, 0.02, 0.01]} /><meshStandardMaterial color="#2ecc71" emissive="#2ecc71" /></mesh>)}
      <mesh ref={mark} position={[0.7, METER_Y0, 0.07]} visible={false}><sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#4cc9f0" emissive="#4cc9f0" /></mesh>
      {sim && (
        <>
          <mesh ref={ball}><sphereGeometry args={[0.07, 12, 8]} /><meshStandardMaterial color={colorOf(inst.seats[sim.shooter].agent)} /></mesh>
          <group ref={drone}>
            <mesh><boxGeometry args={[0.14, 0.04, 0.14]} /><meshStandardMaterial color="#333" /></mesh>
            <group ref={rot}>{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => <mesh key={i} position={[x! * 0.09, 0.03, z! * 0.09]}><cylinderGeometry args={[0.05, 0.05, 0.005, 8]} /><meshStandardMaterial color="#66ccff" /></mesh>)}</group>
          </group>
        </>
      )}
    </>
  );
}
