/** Where the Data center racks stand, relative to the centre of the data-room zone. One rack per project (the first N by name). */
export const RACK_SIZE: [number, number, number] = [0.9, 2.2, 0.8];
const COLS = 5, ROWS = [-2.8, -0.8, 1.2], X0 = -3.9, DX = 1.15;
export const RACKS: { x: number; z: number }[] = ROWS.flatMap((z) => Array.from({ length: COLS }, (_, i) => ({ x: X0 + i * DX, z })));
/** Aisles between the rows where the inspector robots patrol. */
export const AISLES = [-1.8, 0.2, 1.8];
export const AISLE_X: [number, number] = [-4.1, 0.9];
/** The force field around the rack block: [centre x, centre z, width, depth]. */
export const FIELD = { x: -1.6, z: -0.75, w: 5.8, d: 5.5, h: 2.7 };
