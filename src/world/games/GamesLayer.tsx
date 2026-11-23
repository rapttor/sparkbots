import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { call } from "../../api";
import { displayName } from "../../util";
import { effectiveState, isHeld, releaseVisit, roams } from "../roam";
import type { Layout } from "../layout";
import type { HubEnv, Instance } from "./hub";
import { hub, none } from "./instance";
import { RallySim, TABLE } from "./rally";
import { GAMES } from "./registry";
import { placeSlots } from "./tables";
import { GamesOverlay } from "./GamesOverlay";
import { BilliardsView, HoopsView } from "./GameScenes";
import { mulberry32, type GameResult } from "./types";

const TOP = 0.76;           // table top height
/** Agent names can be a whole prompt; keep them short above tables, in the chips and in the rankings. */
const short = (n: string) => (n.length > 22 ? `${n.slice(0, 21)}…` : n);

/**
 * The game room's games: tables that appear when idle agents (or you) start a match, the ball and score above them, and the
 * header chips / rankings overlay. All rules live in the pure modules next to this file; this only draws them and connects
 * the hub to the roaming bots. Purely cosmetic: a game never keeps an agent from real work (see `bots.ts`: work drops `r.game`).
 */
export function GamesLayer({ layout }: { layout: Layout }) {
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const ver = useSyncExternalStore((cb) => hub.subscribe(cb), () => hub.version);

  const room = useMemo(() => layout.zones.find((z) => z.zone.id === "game-room"), [layout]);
  useEffect(() => { hub.setSlots(room ? placeSlots(room.x, room.z) : []); }, [room]);

  useEffect(() => {
    const desk = (id: string) => layoutRef.current.desks.find((d) => d.worker.id === id);
    const free = (a: string): boolean => {
      const d = desk(a), r = roams.get(a);
      if (!d || !r || r.visit || r.errand || r.game || isHeld(a)) return false;
      const st = effectiveState(a, d.worker.state);
      return (st === "idle" && r.mode === "wander" && !r.lying) || st === "asleep"; // a sleeper is woken when it is sent to a table
    };
    const env: HubEnv = {
      rng: mulberry32((Math.random() * 2 ** 32) >>> 0),
      idle: () => layoutRef.current.desks.map((d) => d.worker.id).filter((a) => free(a) && effectiveState(a, desk(a)!.worker.state) === "idle"),
      sleeping: () => layoutRef.current.desks.map((d) => d.worker.id).filter((a) => free(a) && effectiveState(a, desk(a)!.worker.state) === "asleep"),
      free,
      alive: (a, inst) => !!desk(a) && roams.get(a)?.game?.instance === inst,
      send: (a, spot, inst) => {
        const r = roams.get(a);
        if (!r) return;
        if (!spot) {
          if (r.game?.instance === inst) { r.game = null; r.tx = r.x; r.tz = r.z; r.wait = 0; }
          return;
        }
        if (r.visit) { releaseVisit(a, r.visit.poi, r.visit.slot); r.visit = null; r.clip = null; }
        r.awakeUntil = performance.now() + 10 * 60_000; // a sleeper stays up while it plays (refreshed on every call; real work still wins)
        const was = r.game?.instance === inst ? r.game : null;
        r.game = { instance: inst, x: spot.x, z: spot.z, face: spot.face, arrived: !!was?.arrived && Math.hypot(r.x - spot.x, r.z - spot.z) < 0.25 };
      },
      arrived: (a) => roams.get(a)?.game?.arrived === true,
      name: (a) => { const d = desk(a); return short(d ? displayName(d.worker) : a); },
      record: (r: GameResult) => { void call("POST", "/api/games/result", r).catch(() => { /* the match was only for show; losing its score is harmless */ }); },
    };
    hub.setEnv(env);
    return () => { hub.stopAll(); hub.setEnv(none); };
  }, []);

  useFrame((_, dt) => { if (room) hub.tick(Math.min(dt, 0.1)); });

  const nameOf = (id: string | null) => { const d = layout.desks.find((x) => x.worker.id === id); return d ? short(displayName(d.worker)) : "?"; };
  const colorOf = (id: string | null) => layout.desks.find((x) => x.worker.id === id)?.worker.color ?? "#ffb020";
  void ver;
  return (
    <>
      {hub.instances.map((i) => <Table key={i.id} inst={i} nameOf={nameOf} colorOf={colorOf} />)}
    </>
  );
}

/** One table: the furniture (unless the room already has one there), the ball/puck, the paddles and the score above it. */
function Table({ inst, nameOf, colorOf }: { inst: Instance; nameOf: (id: string | null) => string; colorOf: (id: string | null) => string }) {
  const ball = useRef<Group>(null), p0 = useRef<Group>(null), p1 = useRef<Group>(null);
  const def = GAMES[inst.game], { x, z } = inst.slot, rally = def.size === "large";
  useFrame(() => {
    const s = inst.sim;
    if (!(s instanceof RallySim)) return;
    if (ball.current) ball.current.position.set(s.ball.x, TOP + (s.mode === "hockey" ? 0.03 : 0.05), s.ball.z);
    [p0.current, p1.current].forEach((g, i) => {
      const p = s.paddles[i]!, dir = i === 0 ? -1 : 1;
      if (!g) return;
      if (s.mode === "pong") g.position.set(dir * (TABLE.L / 2 + 0.02), TOP + 0.1, p.z); else g.position.set(p.x, TOP + 0.04, p.z);
      g.scale.setScalar(1 + p.swing * 0.35);
    });
  });
  const a = inst.seats[0].agent, b = inst.seats[1].agent;
  const status = inst.phase === "gathering" ? (b ? "Taking seats…" : "Waiting for an opponent") : inst.phase === "over" && inst.winner !== null ? `🏆 ${nameOf(inst.seats[inst.winner].agent)}` : "";
  return (
    <group position={[x, 0, z]}>
      {inst.game === "billiards" ? <BilliardsView inst={inst} /> : inst.game === "hoops" ? <HoopsView inst={inst} colorOf={colorOf} /> : rally ? (
        <>
          {!inst.slot.builtFor && (
            <>
              <mesh position={[0, 0.35, 0]}><boxGeometry args={[TABLE.L, 0.7, TABLE.W]} /><meshStandardMaterial color="#24314d" /></mesh>
              <mesh position={[0, 0.73, 0]}><boxGeometry args={[TABLE.L, 0.06, TABLE.W]} /><meshStandardMaterial color={inst.game === "hockey" ? "#c9d6e8" : "#1d4fb3"} /></mesh>
            </>
          )}
          {inst.game === "pong" && <mesh position={[0, TOP + 0.08, 0]}><boxGeometry args={[0.03, 0.16, TABLE.W + 0.08]} /><meshStandardMaterial color="#f5f5f5" /></mesh>}
          {inst.game === "hockey" && [-1, 1].map((d) => <mesh key={d} position={[d * (TABLE.L / 2 - 0.02), TOP + 0.005, 0]}><boxGeometry args={[0.05, 0.01, 0.56]} /><meshStandardMaterial color="#e53935" /></mesh>)}
          {inst.phase !== "gathering" && (
            <>
              <group ref={ball}>{inst.game === "pong"
                ? <mesh><sphereGeometry args={[0.04, 12, 8]} /><meshStandardMaterial color="#fff6d6" /></mesh>
                : <mesh><cylinderGeometry args={[0.07, 0.07, 0.04, 16]} /><meshStandardMaterial color="#111" /></mesh>}</group>
              <group ref={p0}>{inst.game === "pong" ? <mesh><boxGeometry args={[0.04, 0.16, 0.2]} /><meshStandardMaterial color={colorOf(a)} /></mesh> : <mesh><cylinderGeometry args={[0.1, 0.1, 0.05, 16]} /><meshStandardMaterial color={colorOf(a)} /></mesh>}</group>
              <group ref={p1}>{inst.game === "pong" ? <mesh><boxGeometry args={[0.04, 0.16, 0.2]} /><meshStandardMaterial color={colorOf(b)} /></mesh> : <mesh><cylinderGeometry args={[0.1, 0.1, 0.05, 16]} /><meshStandardMaterial color={colorOf(b)} /></mesh>}</group>
            </>
          )}
        </>
      ) : (
        <>
          <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.55, 0.45, 0.72, 20]} /><meshStandardMaterial color={inst.game === "dice" ? "#7a2d2d" : "#2d5a7a"} /></mesh>
        </>
      )}
      <Html position={[0, 1.9, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="game-score">
          <div className="game-score-line">{def.icon} <b>{nameOf(a)}</b> {inst.sim ? inst.line : "–"} <b>{b ? nameOf(b) : "…"}</b></div>
          {inst.detail && <div className="game-score-detail">{inst.detail}</div>}
          {status && <div className="game-score-status">{status}</div>}
        </div>
      </Html>
    </group>
  );
}

/** The header chips / rankings popover. Plain DOM next to the canvas (not a drei `Html fullscreen`, which drifted off screen with the camera). */
export function GamesHud({ layout }: { layout: Layout }) {
  if (!layout.zones.some((z) => z.zone.id === "game-room")) return null;
  const nameOf = (id: string | null) => { const d = layout.desks.find((x) => x.worker.id === id); return d ? short(displayName(d.worker)) : "?"; };
  return <GamesOverlay nameOf={nameOf} />;
}
