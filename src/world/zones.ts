/**
 * Rooms and outdoor areas of the campus. One file per zone in `zones/`, picked up automatically. A zone is DATA:
 * a floor, blocky furniture made of boxes, and points of interest (POIs) that idle robots walk to and use.
 * Coordinates inside a zone are relative to its center (x to the right, z towards the viewer), in world units.
 */
export type Place = "center" | "north" | "south" | "east" | "west";

/** A box: `at` = center on the floor plane, `size` = [width, height, depth], `y` = height of its underside. */
export interface Prop { at: [number, number]; size: [number, number, number]; y?: number; color: string; solid?: boolean; ghost?: boolean }
// ghost = a "force field": drawn see-through and never blocks anyone (glass walls, fences)

/** A spot robots can use. `slots` robots at once (they stand in a small ring around `at`). `clip` = idle clip played there. */
export interface Poi { id: string; at: [number, number]; face?: number; clip?: string; slots: number; label?: string }

export interface Zone {
  id: string;
  name: string;
  place: Place;
  size: [number, number];       // width, depth
  floor: string;                // floor color (only drawn when outdoor)
  outdoor?: boolean;            // outdoor areas (yard, veranda) get a colored ground; rooms are just furniture and a title
  props: Prop[];
  pois: Poi[];
  idle?: boolean;               // idle robots may visit it on their own (default true)
  weight?: number;              // how popular it is when idle robots choose (default 1)
  icon?: string;                // emoji for the minimap and titles (a default exists for the built-in rooms)
}

const mods = import.meta.glob("./zones/*.ts", { eager: true }) as Record<string, { default: Zone }>;

export function zoneProblems(z: Zone): string[] {
  const p: string[] = [];
  if (!z.id || !z.name) p.push("id and name are required");
  if (!["center", "north", "south", "east", "west"].includes(z.place)) p.push("bad place");
  if (!(z.size?.[0] > 2 && z.size?.[1] > 2)) p.push("size must be at least 2 x 2");
  const hw = (z.size?.[0] ?? 0) / 2, hd = (z.size?.[1] ?? 0) / 2;
  for (const pr of z.props ?? []) {
    if (!pr.size || pr.size.some((n) => !(n > 0))) p.push("a prop has a non-positive size");
    if (Math.abs(pr.at[0]) - pr.size[0] / 2 > hw + 0.01 || Math.abs(pr.at[1]) - pr.size[2] / 2 > hd + 0.01) p.push(`prop at ${pr.at} sticks out of the zone`);
  }
  const ids = new Set<string>();
  for (const q of z.pois ?? []) {
    if (!q.id || ids.has(q.id)) p.push(`poi id "${q.id}" missing or repeated`);
    ids.add(q.id);
    if (!(q.slots >= 1)) p.push(`poi ${q.id}: slots must be >= 1`);
    if (Math.abs(q.at[0]) > hw || Math.abs(q.at[1]) > hd) p.push(`poi ${q.id} is outside the zone`);
  }
  return p;
}

const all = Object.values(mods).map((m) => m.default).filter((z) => {
  const bad = zoneProblems(z);
  for (const b of bad) console.warn(`[zones] ${z?.id}: ${b}`);
  return bad.length === 0;
});
/** Icon of a room on the minimap and in titles: the zone's own `icon`, else a default by id. */
const ZONE_ICONS: Record<string, string> = {
  "coffee-station": "☕", "water-cooler": "💧", cafe: "🍰", kitchen: "🍳", restroom: "🚻", "conference-room": "👥", "manager-room": "📋",
  "data-room": "🗄", "game-room": "🎱", gym: "🏋", veranda: "🍖", yard: "🐕",
};
export const zoneIcon = (z: Zone): string => z.icon ?? ZONE_ICONS[z.id] ?? "📍";
export const ZONES: Zone[] = all.sort((a, b) => a.id.localeCompare(b.id));

/** A zone placed on the campus: absolute coordinates. */
export interface PlacedProp { x: number; z: number; w: number; h: number; d: number; y: number; color: string; solid: boolean; ghost: boolean }
export interface PlacedPoi { id: string; zone: string; x: number; z: number; face: number; clip?: string; slots: number; label: string; weight: number; idle: boolean }
export interface PlacedZone { zone: Zone; x: number; z: number; w: number; d: number; props: PlacedProp[]; pois: PlacedPoi[] }

export function placeZone(zone: Zone, x: number, z: number): PlacedZone {
  return {
    zone, x, z, w: zone.size[0], d: zone.size[1],
    props: zone.props.map((p) => ({ x: x + p.at[0], z: z + p.at[1], w: p.size[0], h: p.size[1], d: p.size[2], y: p.y ?? 0, color: p.color, ghost: p.ghost === true, solid: p.solid !== false && p.ghost !== true })),
    pois: zone.pois.map((q) => ({ id: `${zone.id}:${q.id}`, zone: zone.id, x: x + q.at[0], z: z + q.at[1], face: q.face ?? 0, clip: q.clip, slots: q.slots, label: q.label ?? zone.name, weight: zone.weight ?? 1, idle: zone.idle !== false })),
  };
}
