import { createContext, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, type Mesh } from "three";

/** Shared building blocks of the Unity amenities: small mesh helpers, the per-amenity context and the "only animate while near" hook. */
export type V3 = [number, number, number];
/** Amenities are drawn smaller than life: the ring around each one is a place for people to stand and talk, so the thing itself must leave room. */
export const AMENITY_SCALE = 0.62;

// ---- small building blocks

export function M({ c, e = 0, o = 1, r = 0.6, m = 0 }: { c: string; e?: number; o?: number; r?: number; m?: number }) {
  return <meshStandardMaterial color={c} emissive={e ? c : "#000000"} emissiveIntensity={e} transparent={o < 1} opacity={o} depthWrite={o >= 1} roughness={r} metalness={m} toneMapped={e === 0} />;
}
type Mat = { c: string; e?: number; o?: number; r?: number; m?: number };
export const B = ({ s, p, rot, ...m }: { s: V3; p: V3; rot?: V3 } & Mat) => <mesh position={p} rotation={rot}><boxGeometry args={s} /><M {...m} /></mesh>;
export const Cyl = ({ a, p, rot, ...m }: { a: [number, number, number, number?]; p: V3; rot?: V3 } & Mat) => <mesh position={p} rotation={rot}><cylinderGeometry args={a} /><M {...m} /></mesh>;
export const Sph = ({ rad, p, s, ...m }: { rad: number; p: V3; s?: V3 } & Mat) => <mesh position={p} scale={s}><sphereGeometry args={[rad, 16, 12]} /><M {...m} /></mesh>;

export interface Ctx { id: string; near: { current: boolean }; energy: () => number }
export const AmenityCtx = createContext<Ctx>({ id: "", near: { current: true }, energy: () => 0 });
/** A frame callback that only runs while the amenity is near you. `e` is 0..1 right after you used it (E). */
export function useAnim(fn: (t: number, dt: number, e: number) => void) {
  const c = useContext(AmenityCtx);
  useFrame(({ clock }, dt) => { if (c.near.current) fn(clock.elapsedTime, Math.min(dt, 0.1), c.energy()); });
}
export const hash = (n: number): number => { let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const mesh = (a: (Mesh | null)[], i: number) => (m: Mesh | null) => { a[i] = m; };

const texCache: Record<string, CanvasTexture> = {};
export function textTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  let t = texCache[key];
  if (!t) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!); t = new CanvasTexture(c); texCache[key] = t; }
  return t;
}

