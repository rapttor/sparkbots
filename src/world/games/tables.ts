import { TABLE } from "./rally";
import type { GameId } from "./types";
import type { RallySim } from "./rally";

/** A place in the game room where a table can stand. `rel` is relative to the room's centre. `builtFor`: the room already
 *  has a real table here (the ping-pong table), so only that game uses the spot and nothing extra is drawn. */
export interface TableSlot { id: string; rel: [number, number]; size: "large" | "small"; builtFor?: GameId }

/** Free floor in the game room (see zones/game-room.ts): three table-tennis-sized spots and two small round tables. */
export const SLOTS: TableSlot[] = [
  { id: "pp", rel: [-3, 1.6], size: "large", builtFor: "pong" },
  { id: "L1", rel: [0.3, -2.8], size: "large" },
  { id: "L2", rel: [0.5, 2.7], size: "large" },
  { id: "L3", rel: [-0.2, 0], size: "large" },
  { id: "S1", rel: [5.5, -0.9], size: "small" },
  { id: "S2", rel: [-6, 0.5], size: "small" },
];

export interface PlacedSlot extends TableSlot { x: number; z: number }
export const placeSlots = (cx: number, cz: number, slots: TableSlot[] = SLOTS): PlacedSlot[] => slots.map((s) => ({ ...s, x: cx + s.rel[0], z: cz + s.rel[1] }));

/** Where an agent stands (world x/z) and which way it faces (the `ry` the bots use: atan2(-dx, -dz) of the look direction). */
export interface Spot { x: number; z: number; face: number }
const FACE_PX = -Math.PI / 2, FACE_NX = Math.PI / 2, FACE_PZ = Math.PI, FACE_NZ = 0;

/** The resting seats of a table: the ends of a large table, the two sides of a small one. */
export function seatSpots(size: "large" | "small", cx: number, cz: number): [Spot, Spot] {
  if (size === "large") return [{ x: cx - (TABLE.L / 2 + 0.7), z: cz, face: FACE_PX }, { x: cx + (TABLE.L / 2 + 0.7), z: cz, face: FACE_NX }];
  return [{ x: cx, z: cz - 0.95, face: FACE_PZ }, { x: cx, z: cz + 0.95, face: FACE_NZ }];
}

/** Where agent `side` should be while a rally game runs: behind its end of the table, following its paddle sideways (pong: also back and forth). */
export function playSpot(game: GameId, side: 0 | 1, cx: number, cz: number, sim: RallySim): Spot {
  const dir = side === 0 ? -1 : 1, p = sim.paddles[side];
  const back = game === "pong" ? 0.35 + p.depth : 0.6;
  return { x: cx + dir * (TABLE.L / 2 + back), z: cz + Math.max(-TABLE.W / 2, Math.min(TABLE.W / 2, p.z)), face: dir < 0 ? FACE_PX : FACE_NX };
}
