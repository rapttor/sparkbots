// Owner (manager) avatars — 13.1.1. The player is one of a small set of original, procedurally
// built low-poly characters (no external models, no pixelation pass). Each avatar declares its
// part names, geometry, layout and a pure `pose()` that maps a motion clip to per-part rotations,
// so the renderer stays generic and a new character is just a new entry here.
import { BoxGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, type BufferGeometry, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DEFAULT_DEV_LOOK, type DevLook } from "./devLook";

export type AvatarId = "developer" | "raptor" | "spark";
export type PoseClip = "idle" | "walk" | "sprint" | "jump";

export interface PoseInput { clip: PoseClip; t: number; speed: number }
/** Target transform for one part, relative to its layout position. Absent fields mean "rest" (0). */
export interface PoseTarget { rx?: number; ry?: number; rz?: number; dy?: number }

export interface Avatar {
  id: AvatarId;
  name: string;
  parts: string[]; // geometry + layout keys, all rendered as meshes
  glow: string[]; // parts drawn with an emissive (unlit) material
  colors?: Record<string, string>; // fixed part colours; parts not listed use the manager tint
  pattern?: Record<string, "plaid">; // parts drawn with a generated pattern (plaid uses top + pants colour)
  decals?: { part: string; emoji: string }[]; // parts drawn with an emoji texture (shirt logos)
  focusY: number; // camera look-at height (chest/eye level) for the follow camera
  clips: PoseClip[];
  build(): Record<string, BufferGeometry>;
  layout: Record<string, [number, number, number]>;
  /** Pure: clip + phase -> target rotations per part. The renderer eases toward these. */
  pose(inp: PoseInput): Record<string, PoseTarget>;
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): BufferGeometry => {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

/** The blocky spark bot, shared with the desk workers so the owner matches the office. */
export function sparkParts(): Record<string, BufferGeometry> {
  const leg = (x: number) => box(0.09, 0.22, 0.09, x, -0.11); // pivot at the top so it can swing
  return {
    body: box(0.86, 0.58, 0.5),
    legsA: mergeGeometries([leg(-0.33), leg(0.18)])!,
    legsB: mergeGeometries([leg(-0.18), leg(0.32)])!,
    arms: box(1.15, 0.15, 0.2),
    visor: mergeGeometries([box(0.07, 0.14, 0.04, -0.255), box(0.07, 0.14, 0.04, 0.255)])!,
  };
}

const spark: Avatar = {
  id: "spark",
  name: "Spark bot",
  parts: ["body", "legsA", "legsB", "arms", "visor"],
  glow: ["visor"],
  focusY: 0.65,
  clips: ["idle", "walk", "sprint", "jump"],
  build: sparkParts,
  layout: { body: [0, 0.6, 0], legsA: [0, 0.31, 0], legsB: [0, 0.31, 0], arms: [0, 0.53, 0], visor: [0, 0.67, -0.255] },
  pose: ({ clip, t }) => {
    const amp = clip === "sprint" ? 1.15 : clip === "walk" ? 0.85 : 0;
    const sw = Math.sin(t) * amp;
    return {
      body: { rx: clip === "sprint" ? -0.14 : 0, dy: clip === "jump" ? 0.12 : 0 },
      legsA: { rx: sw }, legsB: { rx: -sw },
      arms: { rz: -Math.sin(t) * amp * 0.7 },
    };
  },
};

/** Low-poly raptor (default owner): sharp faceted shapes — tapered prisms and pointed claws, like an
 *  origami dinosaur. Flat faces everywhere, no curves: a 4-sided prism with a square (not diamond) section. */
const raptor: Avatar = {
  id: "raptor",
  name: "Raptor",
  parts: ["body", "neck", "head", "eyeL", "eyeR", "tail", "armL", "armR", "legL", "legR"],
  glow: ["eyeL", "eyeR"],
  focusY: 0.7,
  clips: ["idle", "walk", "sprint", "jump"],
  build: () => {
    // A square-section prism along Z, tapering from rFront (at -Z) to rBack (at +Z), flat faces up/down/sides.
    const prismZ = (rFront: number, rBack: number, len: number) => {
      const g = new CylinderGeometry(rBack, rFront, len, 4);
      g.rotateY(Math.PI / 4); // turn the diamond section into a square with flat faces
      g.rotateX(Math.PI / 2); // lie it along Z: front (-Z) = rFront, back (+Z) = rBack
      return g;
    };
    const prismY = (rTop: number, rBottom: number, len: number) => {
      const g = new CylinderGeometry(rTop, rBottom, len, 4);
      g.rotateY(Math.PI / 4);
      return g;
    };
    const leg = () => {
      const thigh = prismY(0.085, 0.07, 0.26); thigh.translate(0, -0.13, 0);
      const shin = prismY(0.06, 0.05, 0.24); shin.translate(0, -0.37, 0);
      const claw = (x: number) => { const c = new ConeGeometry(0.045, 0.17, 4); c.rotateX(-Math.PI / 2); c.translate(x, -0.455, -0.08); return c; };
      return mergeGeometries([thigh, shin, claw(-0.055), claw(0.055)])!;
    };
    const arm = () => { const g = prismY(0.05, 0.03, 0.22); g.translate(0, -0.11, 0); return g; };
    const body = prismZ(0.22, 0.28, 0.8); // narrower chest, wider hips
    const neck = prismZ(0.11, 0.16, 0.34); neck.translate(0, 0.04, 0);
    const snout = prismZ(0.02, 0.14, 0.3); snout.translate(0, -0.04, -0.24); // pointed snout merged into the head
    const head = mergeGeometries([prismZ(0.16, 0.2, 0.28), snout])!;
    const tail = prismZ(0.16, 0.02, 0.8); tail.translate(0, 0, 0.4); // pivot at the hip, point at +Z
    const eye = () => box(0.06, 0.08, 0.05); // centred; the layout places it on the head side
    return {
      body, neck, head,
      eyeL: eye(), eyeR: eye(),
      tail, armL: arm(), armR: arm(), legL: leg(), legR: leg(),
    };
  },
  layout: {
    body: [0, 0.5, 0.05],
    neck: [0, 0.64, -0.3],
    head: [0, 0.78, -0.48],
    eyeL: [0.1, 0.8, -0.6],
    eyeR: [-0.1, 0.8, -0.6],
    tail: [0, 0.55, 0.42],
    armL: [0.18, 0.62, -0.16],
    armR: [-0.18, 0.62, -0.16],
    legL: [0.15, 0.5, 0.02],
    legR: [-0.15, 0.5, 0.02],
  },
  pose: ({ clip, t }) => {
    if (clip === "jump") return { body: {}, head: {}, legL: { rx: 0.7 }, legR: { rx: 0.5 }, armL: { rx: -0.6 }, armR: { rx: -0.6 }, tail: { rx: -0.5 } };
    const amp = clip === "sprint" ? 0.9 : clip === "walk" ? 0.6 : 0;
    const sw = Math.sin(t) * amp;
    const sway = Math.sin(t * 0.5) * (clip === "idle" ? 0.12 : 0.18);
    return {
      body: { rx: clip === "sprint" ? -0.16 : 0 },
      legL: { rx: sw }, legR: { rx: -sw },
      armL: { rx: -sw * 0.6 }, armR: { rx: sw * 0.6 },
      tail: { ry: sway, rx: clip === "sprint" ? -0.2 : 0 },
      head: { rx: clip === "idle" ? Math.sin(t * 0.7) * 0.04 : 0.04 },
    };
  },
};

const SKIN = "#e6b48a", HAIR = "#2b2119", SHOE = "#17171a";

/** The cliché developer owner (default), configurable from Settings: jeans (manager colour), a top
 *  (turtleneck / t-shirt / hoodie / plaid in the top colour), optional back-logo emoji, square glasses,
 *  full beard and a bit of a belly, ~2.4x an agent's height. Arms are upper + forearm + hand so a
 *  t-shirt shows bare forearms while long sleeves cover them. */
export function developerAvatar(look: DevLook = DEFAULT_DEV_LOOK): Avatar {
  const skin = SKIN, longSleeve = look.top !== "tshirt";
  const parts = ["legL", "legR", "shoeL", "shoeR", "body", "upperL", "upperR", "foreL", "foreR", "handL", "handR", "head", "hair"];
  if (look.beard) parts.push("beard");
  if (look.glasses) parts.push("glasses");
  if (look.logo) parts.push("logoFront", "logoBack");

  const colors: Record<string, string> = {
    shoeL: SHOE, shoeR: SHOE,
    body: look.topColor, upperL: look.topColor, upperR: look.topColor,
    foreL: longSleeve ? look.topColor : skin, foreR: longSleeve ? look.topColor : skin,
    handL: skin, handR: skin, head: skin, hair: HAIR,
    // legL / legR are deliberately absent: the jeans take the manager colour
  };
  if (look.beard) colors.beard = HAIR;
  if (look.glasses) colors.glasses = "#0b0b0d";

  const pattern: Record<string, "plaid"> = {};
  if (look.top === "plaid") for (const p of ["body", "upperL", "upperR", "foreL", "foreR"]) pattern[p] = "plaid";

  const layout: Record<string, [number, number, number]> = {
    legL: [0.22, 0.9, 0], legR: [-0.22, 0.9, 0],
    shoeL: [0.22, 0.9, 0], shoeR: [-0.22, 0.9, 0],
    body: [0, 1.3, 0],
    upperL: [0.56, 1.55, 0], upperR: [-0.56, 1.55, 0],
    foreL: [0.56, 1.55, 0], foreR: [-0.56, 1.55, 0],
    handL: [0.56, 1.55, 0], handR: [-0.56, 1.55, 0],
    head: [0, 1.9, -0.02], hair: [0, 2.14, -0.02],
  };
  if (look.beard) layout.beard = [0, 1.78, -0.08];
  if (look.glasses) layout.glasses = [0, 1.98, -0.23];
  if (look.logo) {
    layout.logoFront = [-0.22, 1.52, -0.26]; // his top right (wearer's right), facing forward (-Z)
    layout.logoBack = [0, 1.3, 0.26]; // back, facing the follow camera (+Z), bigger
  }

  return {
    id: "developer",
    name: "Developer",
    parts,
    glow: [],
    colors,
    pattern: Object.keys(pattern).length ? pattern : undefined,
    decals: look.logo ? [{ part: "logoFront", emoji: look.logo }, { part: "logoBack", emoji: look.logo }] : undefined,
    focusY: 1.35,
    clips: ["idle", "walk", "sprint", "jump"],
    build: () => {
      const torso = [box(0.9, 0.82, 0.5)]; // torso
      if (look.overweight) torso.push(box(1.0, 0.5, 0.56, 0, -0.18, -0.06)); // belly, bulging forward (-Z)
      if (look.top === "turtleneck") torso.push(box(0.34, 0.2, 0.34, 0, 0.46, 0)); // collar
      if (look.top === "hoodie") { torso.push(box(0.5, 0.3, 0.32, 0, 0.44, 0.18)); torso.push(box(0.5, 0.2, 0.06, 0, -0.2, -0.27)); } // hood behind, pocket front
      const g: Record<string, BufferGeometry> = {
        legL: box(0.26, 0.9, 0.3, 0, -0.45, 0), // pivot at the hip
        legR: box(0.26, 0.9, 0.3, 0, -0.45, 0),
        shoeL: box(0.28, 0.16, 0.44, 0, -0.82, -0.08), // pivots at the hip too, swings with the leg
        shoeR: box(0.28, 0.16, 0.44, 0, -0.82, -0.08),
        body: mergeGeometries(torso)!,
        upperL: box(0.2, 0.34, 0.24, 0, -0.17, 0), upperR: box(0.2, 0.34, 0.24, 0, -0.17, 0), // pivot at the shoulder
        foreL: box(0.18, 0.32, 0.22, 0, -0.49, 0), foreR: box(0.18, 0.32, 0.22, 0, -0.49, 0),
        handL: box(0.18, 0.16, 0.22, 0, -0.72, 0), handR: box(0.18, 0.16, 0.22, 0, -0.72, 0),
        head: mergeGeometries([box(0.44, 0.44, 0.4), box(0.1, 0.1, 0.1, 0, 0, -0.22)])!, // + nose
        hair: box(0.46, 0.16, 0.44),
      };
      if (look.beard) g.beard = box(0.46, 0.26, 0.34, 0, -0.1, -0.06); // full beard on the lower face
      if (look.glasses) g.glasses = mergeGeometries([box(0.17, 0.17, 0.04, -0.12), box(0.17, 0.17, 0.04, 0.12), box(0.1, 0.03, 0.04, 0, 0.02)])!; // square frames + bridge
      if (look.logo) {
        const front = new PlaneGeometry(0.36, 0.36); front.rotateY(Math.PI); // face forward (-Z)
        g.logoFront = front;
        g.logoBack = new PlaneGeometry(0.72, 0.72); // at least 2x the front logo
      }
      return g;
    },
    layout,
    pose: ({ clip, t }) => {
      if (clip === "jump") return { body: {}, legL: { rx: 0.6 }, legR: { rx: 0.4 }, shoeL: { rx: 0.6 }, shoeR: { rx: 0.4 }, upperL: { rx: -0.7 }, upperR: { rx: -0.7 }, foreL: { rx: -0.7 }, foreR: { rx: -0.7 }, handL: { rx: -0.7 }, handR: { rx: -0.7 } };
      const amp = clip === "sprint" ? 0.7 : clip === "walk" ? 0.5 : 0;
      const sw = Math.sin(t) * amp;
      return {
        body: { rx: clip === "sprint" ? -0.12 : 0 },
        legL: { rx: sw }, legR: { rx: -sw }, shoeL: { rx: sw }, shoeR: { rx: -sw },
        upperL: { rx: -sw * 0.8 }, upperR: { rx: sw * 0.8 },
        foreL: { rx: -sw * 0.8 }, foreR: { rx: sw * 0.8 },
        handL: { rx: -sw * 0.8 }, handR: { rx: sw * 0.8 },
      };
    },
  };
}

const IDS: { id: AvatarId; name: string }[] = [
  { id: "developer", name: "Developer" },
  { id: "raptor", name: "Raptor" },
  { id: "spark", name: "Spark bot" },
];
export const DEFAULT_AVATAR: AvatarId = "developer";

export function listAvatars(): { id: AvatarId; name: string }[] {
  return IDS.map((a) => ({ ...a }));
}

export function getAvatar(id: string | undefined, look: DevLook = DEFAULT_DEV_LOOK): Avatar {
  if (id === "raptor") return raptor;
  if (id === "spark") return spark;
  return developerAvatar(look); // "developer" and any unknown id
}

function checkAvatar(a: Avatar, errs: string[]): void {
  if (!a.parts.length) errs.push(`${a.id}: no parts`);
  if (!a.clips.length) errs.push(`${a.id}: no clips`);
  if (!(a.focusY > 0)) errs.push(`${a.id}: focusY must be positive`);
  for (const g of a.glow) if (!a.parts.includes(g)) errs.push(`${a.id}: glow part "${g}" is not a part`);
  for (const c of Object.keys(a.colors ?? {})) if (!a.parts.includes(c)) errs.push(`${a.id}: colour for unknown part "${c}"`);
  for (const p of Object.keys(a.pattern ?? {})) if (!a.parts.includes(p)) errs.push(`${a.id}: pattern for unknown part "${p}"`);
  for (const d of a.decals ?? []) if (!a.parts.includes(d.part)) errs.push(`${a.id}: decal on unknown part "${d.part}"`);
  const layout = a.build();
  for (const p of a.parts) {
    if (!(p in layout)) errs.push(`${a.id}: part "${p}" has no geometry`);
    if (!(p in a.layout)) errs.push(`${a.id}: part "${p}" has no layout`);
  }
  for (const clip of a.clips) {
    const targets = a.pose({ clip, t: 1.7, speed: 3 });
    for (const key of Object.keys(targets)) if (!a.parts.includes(key)) errs.push(`${a.id}/${clip}: pose targets unknown part "${key}"`);
  }
}

/** Contract checks, used by the test and safe to call at runtime. Covers every avatar and every
 *  developer option combination (all top styles, with and without each toggle). */
export function validateAvatars(): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const v of IDS) { if (ids.has(v.id)) errs.push(`duplicate avatar id ${v.id}`); ids.add(v.id); }
  checkAvatar(raptor, errs);
  checkAvatar(spark, errs);
  for (const top of ["turtleneck", "tshirt", "hoodie", "plaid"] as const) {
    checkAvatar(developerAvatar({ ...DEFAULT_DEV_LOOK, top, beard: true, glasses: true, overweight: true, logo: "🦖" }), errs);
    checkAvatar(developerAvatar({ ...DEFAULT_DEV_LOOK, top, beard: false, glasses: false, overweight: false, logo: "" }), errs);
  }
  return errs;
}

export type PartRefs = Record<string, Object3D | null>;
