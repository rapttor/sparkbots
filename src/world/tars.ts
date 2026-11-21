import { BoxGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Local height of the TARS monolith. The spark agent is ~0.8 units tall, so this is 1.5x. */
export const TARS_HEIGHT = 1.2;

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): BufferGeometry => {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

/**
 * TARS from Interstellar, simplified: two swinging side legs/arms close the rectangle, with white top/bottom
 * frame bars and a dark centre window between them. There are no separate left/right bars in the centre part —
 * the legs are the sides.
 */
export function tarsParts(): { frame: BufferGeometry; side: BufferGeometry; face: BufferGeometry } {
  const bar = 0.14, inner = 0.48, sideW = 0.12; // outer width = 0.72 = 0.6 x TARS_HEIGHT
  return {
    frame: mergeGeometries([
      box(inner, bar, 0.26, 0, TARS_HEIGHT / 2 - bar / 2, 0),
      box(inner, bar, 0.26, 0, -TARS_HEIGHT / 2 + bar / 2, 0),
    ])!,
    side: mergeGeometries([
      box(sideW, TARS_HEIGHT, 0.32, -(inner / 2 + sideW / 2), 0, 0),
      box(sideW, TARS_HEIGHT, 0.32, inner / 2 + sideW / 2, 0, 0),
    ])!,
    face: box(inner - 0.04, TARS_HEIGHT - 2 * bar - 0.02, 0.04, 0, 0, -0.145),
  };
}
