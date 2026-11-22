import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, Float32BufferAttribute, Object3D, type InstancedMesh } from "three";
import { displayName } from "../../../util";
import { mulberry32 } from "../types";
import { effectiveState } from "../../roam";
import type { Layout } from "../../layout";
import { MAX_CARS } from "./sim";
import { LAPS, RaceHub, USER_ID, type RaceEnv } from "./hub";
import { buildTrack, trackInput, type Track } from "./track";

/** The one race hub of the page. Its world is wired up by <RaceLayer>; until then nobody is idle. */
const none: RaceEnv = { rng: Math.random, idle: () => [], alive: () => false, name: (a) => a, color: () => "#ffffff" };
export const raceHub = new RaceHub(none);
const AUTO_KEY = "sparkbots.race.auto";
try { raceHub.auto = localStorage.getItem(AUTO_KEY) !== "0"; } catch { /* storage blocked: default on */ }

const DRIVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "]);

/** Flat ribbon along the centre line between lateral offsets a..b (to the right of the direction of travel). */
function ribbon(t: Track, a: number, b: number, y: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < t.n; i++) {
    const j = (i + 1) % t.n, dx = t.xs[j]! - t.xs[i]!, dz = t.zs[j]! - t.zs[i]!, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    pos.push(t.xs[i]! + nx * a, y, t.zs[i]! + nz * a, t.xs[i]! + nx * b, y, t.zs[i]! + nz * b);
    const k = i * 2, m = ((i + 1) % t.n) * 2;
    idx.push(k, m, k + 1, k + 1, m, m + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The race track (13.7.10): the road and the cars as instanced meshes, the start/join chip, and the link to the agents. Everything
 * is drawn and stepped only while a race runs; with no race the layer costs one timer tick per frame. Cosmetic: a car whose agent
 * starts working drops out, and nothing a race does ever reaches an agent.
 */
export function RaceLayer({ layout }: { layout: Layout }) {
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const ver = useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.version);
  const track = useMemo(() => buildTrack(trackInput(layout)), [layout]);
  useEffect(() => { raceHub.setTrack(track); }, [track]);

  useEffect(() => {
    const desk = (id: string) => layoutRef.current.desks.find((d) => d.worker.id === id);
    const env: RaceEnv = {
      rng: mulberry32((Math.random() * 2 ** 32) >>> 0),
      idle: () => layoutRef.current.desks.filter((d) => effectiveState(d.worker.id, d.worker.state) === "idle").map((d) => d.worker.id),
      alive: (a) => { const d = desk(a); return !!d && effectiveState(a, d.worker.state) === "idle"; },
      name: (a) => { const d = desk(a); return d ? displayName(d.worker) : a; },
      color: (a) => desk(a)?.worker.color ?? "#ffb020",
    };
    raceHub.setEnv(env);
    return () => { raceHub.stop(); raceHub.setEnv(none); };
  }, []);

  // keyboard: only while you are driving, in the capture phase so the walking controls never see these keys
  const keys = useRef(new Set<string>());
  const driving = raceHub.userRacing;
  useEffect(() => {
    if (!driving) { keys.current.clear(); return; }
    const typing = (e: KeyboardEvent) => { const el = e.target as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
    const down = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (!DRIVE_KEYS.has(k) || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); keys.current.add(k); };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (DRIVE_KEYS.has(k)) { keys.current.delete(k); } };
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", clear); keys.current.clear(); };
  }, [driving]);

  const body = useRef<InstancedMesh>(null), cabin = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const colored = useRef(-1);
  const road = useMemo(() => (track ? { asphalt: ribbon(track, -track.halfWidth, track.halfWidth, 0.03), left: ribbon(track, -track.halfWidth, -track.halfWidth + 0.25, 0.04), right: ribbon(track, track.halfWidth - 0.25, track.halfWidth, 0.04) } : null), [track]);

  useFrame((_, dt) => {
    raceHub.tick(Math.min(dt, 0.1));
    const sim = raceHub.sim, b = body.current, c = cabin.current;
    if (!sim || !b || !c) return;
    const ks = keys.current;
    if (ks.size || driving) {
      const up = ks.has("arrowup") || ks.has("w"), down = ks.has("arrowdown") || ks.has("s"), l = ks.has("arrowleft") || ks.has("a"), r = ks.has("arrowright") || ks.has("d");
      sim.setInput(USER_ID, { throttle: (up ? 1 : 0) - (down ? 1 : 0), steer: (r ? 1 : 0) - (l ? 1 : 0), drift: ks.has(" ") });
    }
    sim.racers.forEach((rc, i) => {
      if (i >= MAX_CARS) return;
      dummy.position.set(rc.car.x, rc.out ? -5 : 0.28, rc.car.z); dummy.rotation.set(0, -rc.car.h, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); b.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.34; dummy.position.x -= Math.cos(rc.car.h) * 0.1; dummy.position.z -= Math.sin(rc.car.h) * 0.1; dummy.scale.set(0.55, 0.7, 0.8);
      dummy.updateMatrix(); c.setMatrixAt(i, dummy.matrix);
    });
    b.count = c.count = sim.racers.length;
    b.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
    if (colored.current !== ver || b.instanceColor === null) {
      sim.racers.forEach((rc, i) => { b.setColorAt(i, new Color(rc.color)); c.setColorAt(i, new Color("#dfe7f3")); });
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (c.instanceColor) c.instanceColor.needsUpdate = true;
      colored.current = ver;
    }
  });

  void ver;
  if (!track || !road) return null;
  const sim = raceHub.sim;
  return (
    <>
      {sim && (
        <group>
          <mesh geometry={road.asphalt}><meshStandardMaterial color="#58607a" roughness={0.95} polygonOffset polygonOffsetFactor={-2} side={2} /></mesh>
          <mesh geometry={road.left}><meshBasicMaterial color="#e8ecf4" side={2} /></mesh>
          <mesh geometry={road.right}><meshBasicMaterial color="#e8ecf4" side={2} /></mesh>
          <mesh position={[track.xs[0]!, 0.05, track.zs[0]!]} rotation={[0, -Math.atan2(track.zs[1]! - track.zs[0]!, track.xs[1]! - track.xs[0]!), 0]}>
            <boxGeometry args={[0.6, 0.02, track.halfWidth * 2]} /><meshBasicMaterial color="#ffffff" />
          </mesh>
          <instancedMesh ref={body} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}><boxGeometry args={[1.9, 0.5, 1.0]} /><meshStandardMaterial roughness={0.5} /></instancedMesh>
          <instancedMesh ref={cabin} args={[undefined, undefined, MAX_CARS]} frustumCulled={false}><boxGeometry args={[1.9, 0.5, 1.0]} /><meshStandardMaterial roughness={0.3} /></instancedMesh>
        </group>
      )}
      <Html fullscreen zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}><RaceOverlay /></Html>
    </>
  );
}

const CSS = `
.race-bar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:flex-start;pointer-events:none}
.race-bar>*{pointer-events:auto}
.race-pop{padding:8px 10px;background:#151b27ee;border:1px solid #3a4558;border-radius:8px;color:#e7ecf5;font-size:12px;min-width:200px}
.race-pop button{margin-right:6px}.race-pop ol{margin:4px 0;padding-left:18px}
.race-lights{font-size:20px;letter-spacing:4px}
`;

/** Bottom-centre chip: start a race, take a seat (arrows or WASD, space = drift), standings while it runs. */
function RaceOverlay() {
  useSyncExternalStore((cb) => raceHub.subscribe(cb), () => raceHub.version);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const [msg, setMsg] = useState("");
  const sim = raceHub.sim;
  useEffect(() => { if (!sim) return; const h = setInterval(() => tick((n) => n + 1), 400); return () => clearInterval(h); }, [sim]);
  const lapOf = (id: string) => { const r = sim?.get(id); return r ? Math.min(LAPS, Math.max(0, r.lap) + 1) : 0; };
  return (
    <>
      <style>{CSS}</style>
      <div className="race-bar">
        <button className="games-chip" style={{ display: "flex", gap: 6, padding: "3px 8px", background: "#151b27ee", border: "1px solid #3a4558", borderRadius: 999, color: "#e7ecf5", fontSize: 12, cursor: "pointer" }} title="Race track" onClick={() => setOpen(!open)}>
          🏎 Race{sim ? (sim.phase === "countdown" ? " · get ready" : sim.phase === "over" ? " · finished" : " · live") : ""}
        </button>
        {(open || sim) && (
          <div className="race-pop" role="dialog" aria-label="Race track">
            {sim?.phase === "countdown" && <div className="race-lights">{sim.time < -2 ? "🔴🔴🔴" : sim.time < -1 ? "🔴🔴" : "🔴"}</div>}
            {sim && sim.phase !== "countdown" && (
              <ol>
                {(sim.phase === "over" ? raceHub.last.map((r, i) => <li key={i}>{r.name}{r.time !== null ? ` · ${r.time.toFixed(1)} s` : " · did not finish"}</li>) : sim.order.slice(0, 5).map((id) => <li key={id}>{sim.get(id)!.name} · lap {lapOf(id)}/{LAPS}</li>))}
              </ol>
            )}
            <div>
              {!sim && <button onClick={() => setMsg(raceHub.start(false) ? "" : "Needs at least two idle agents.")}>Start race</button>}
              {!raceHub.userRacing && (!sim || sim.phase === "countdown") && <button onClick={() => setMsg(raceHub.join() ? "" : "Could not take a seat.")}>Drive</button>}
              {raceHub.userRacing && <button onClick={() => raceHub.leave()}>Leave</button>}
              {sim && <button onClick={() => raceHub.stop()}>Stop</button>}
            </div>
            {raceHub.userRacing && <div className="muted">Arrows or WASD to drive · Space to drift</div>}
            {msg && <div role="alert">{msg}</div>}
            <label><input type="checkbox" checked={raceHub.auto} onChange={(e) => { raceHub.auto = e.target.checked; try { localStorage.setItem(AUTO_KEY, e.target.checked ? "1" : "0"); } catch { /* ignore */ } tick((n) => n + 1); }} /> Idle agents race on their own</label>
          </div>
        )}
      </div>
    </>
  );
}
