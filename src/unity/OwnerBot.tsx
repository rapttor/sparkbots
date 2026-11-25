import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Color, DoubleSide, type BufferGeometry, type Mesh, type MeshBasicMaterial } from "three";
import { getAvatar, type Avatar, type PoseClip } from "../world/avatar";
import { avatarTextures, type AvatarTextures } from "../world/avatarTextures";
import type { UAvatar, ULook } from "../shared/unity";

/**
 * Draws a player as the owner character they chose in their own Settings (developer, raptor or spark bot, with the developer
 * options and their colour): the same avatar parts, layout and walk cycle as the office. Used for you, for everybody else, and
 * (as a faint figure or a heap of broken parts) for ghosts. The parent places and turns the group; the avatars face -z at
 * rotation 0, like the walking owner in the office.
 */
export interface Motion { clip: PoseClip; t: number; speed: number }
const IDLE: Motion = { clip: "idle", t: 0, speed: 0 };

interface Built { avatar: Avatar; geoms: Record<string, BufferGeometry>; height: number }
const built = new Map<string, Built>();
const texes = new Map<string, AvatarTextures>();

function build(id: UAvatar, look: ULook): Built {
  const key = `${id}|${JSON.stringify(look)}`;
  let b = built.get(key);
  if (!b) {
    if (built.size > 48) built.clear();
    const avatar = getAvatar(id, look);
    const geoms = avatar.build();
    const box = new Box3();
    let top = 0;
    for (const p of avatar.parts) {
      const g = geoms[p]; if (!g) continue;
      g.computeBoundingBox();
      box.copy(g.boundingBox!);
      top = Math.max(top, (avatar.layout[p]?.[1] ?? 0) + box.max.y);
    }
    b = { avatar, geoms, height: top };
    built.set(key, b);
  }
  return b;
}

/** Height of a character, for placing name tags above its head. */
export const ownerHeight = (id: UAvatar, look: ULook): number => build(id, look).height;

function textures(avatar: Avatar, color: string, look: ULook): AvatarTextures {
  const key = `${avatar.id}|${color}|${look.top}|${look.topColor}|${look.logo}`;
  let t = texes.get(key);
  if (!t) { if (texes.size > 64) texes.clear(); t = avatarTextures(avatar, color, look.topColor); texes.set(key, t); }
  return t;
}

/** Deterministic 0..1 from a string (so a broken figure lies the same way for everybody). */
function rnd(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

export function OwnerBot({ avatar: id, look, color, mode = "live", motion, seed = "" }: {
  avatar: UAvatar; look: ULook; color: string; mode?: "live" | "ghost" | "broken"; motion?: () => Motion; seed?: string;
}) {
  const lookKey = JSON.stringify(look);
  const b = useMemo(() => build(id, look), [id, lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tex = useMemo(() => textures(b.avatar, color, look), [b, color, lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = useRef<Record<string, Mesh | null>>({});
  const dull = useMemo(() => new Color(color).lerp(new Color("#4b5563"), 0.55).getStyle(), [color]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    if (mode === "broken") { // the visor of a broken bot flickers
      const t = clock.elapsedTime, on = Math.sin(t * 23 + rnd(seed) * 6) > 0.5;
      for (const name of b.avatar.glow) { const m = refs.current[name]; if (m) (m.material as MeshBasicMaterial).color.set(on ? "#7dffb0" : "#1f2d26"); }
      return;
    }
    const m = (mode === "live" ? motion?.() : null) ?? IDLE;
    const targets = b.avatar.pose(m);
    const ease = 1 - Math.exp(-14 * dt);
    for (const name of Object.keys(targets)) {
      const o = refs.current[name], tg = targets[name]!;
      if (!o) continue;
      o.rotation.x += ((tg.rx ?? 0) - o.rotation.x) * ease;
      o.rotation.y += ((tg.ry ?? 0) - o.rotation.y) * ease;
      o.rotation.z += ((tg.rz ?? 0) - o.rotation.z) * ease;
      const baseY = b.avatar.layout[name]?.[1] ?? 0;
      o.position.y += (baseY + (tg.dy ?? 0) - o.position.y) * ease;
    }
  });

  const ghost = mode === "ghost";
  return (
    <group>
      {b.avatar.parts.map((name) => {
        const isGlow = b.avatar.glow.includes(name);
        const isDecal = !!b.avatar.decals?.some((d) => d.part === name) && !!tex.emoji;
        const isPlaid = b.avatar.pattern?.[name] === "plaid" && !!tex.plaid;
        const base = b.avatar.colors?.[name] ?? color;
        let position: [number, number, number] = b.avatar.layout[name]!;
        let rotation: [number, number, number] | undefined;
        if (mode === "broken") { // parts lie scattered on the floor
          const k = `${seed}|${name}`;
          position = [(rnd(k + "x") - 0.5) * 2.4, 0.09 + rnd(k + "y") * 0.06, (rnd(k + "z") - 0.5) * 2.4];
          rotation = [rnd(k + "a") * 3.1, rnd(k + "b") * 6.3, rnd(k + "c") * 3.1];
        }
        const common = { transparent: ghost, opacity: ghost ? 0.3 : 1, depthWrite: !ghost } as const;
        return (
          <mesh key={`${b.avatar.id}:${name}`} ref={(el) => { refs.current[name] = el; }} geometry={b.geoms[name]} position={position} rotation={rotation}>
            {isGlow ? <meshBasicMaterial color={mode === "broken" ? "#1f2d26" : "#7dffb0"} toneMapped={false} transparent={ghost} opacity={ghost ? 0.5 : 1} />
              : isDecal ? <meshBasicMaterial map={tex.emoji!} transparent toneMapped={false} side={DoubleSide} opacity={ghost ? 0.4 : 1} />
              : isPlaid ? <meshStandardMaterial map={tex.plaid!} roughness={0.7} {...common} />
              : mode === "broken" ? <meshStandardMaterial color={name === "legL" || name === "legR" ? dull : new Color(base).lerp(new Color("#4b5563"), 0.45).getStyle()} roughness={0.8} />
              : <meshStandardMaterial color={base} roughness={0.7} emissive={ghost ? base : "#000000"} emissiveIntensity={ghost ? 0.4 : 0} {...common} />}
          </mesh>
        );
      })}
    </group>
  );
}
