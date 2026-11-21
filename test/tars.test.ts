import { describe, expect, it } from "vitest";
import { tarsParts, TARS_HEIGHT } from "../src/world/tars";

describe("TARS bot", () => {
  it("is a 1.5x Claude-height monolith with side slabs and a dark face", () => {
    const p = tarsParts();
    for (const g of Object.values(p)) g.computeBoundingBox();
    expect(TARS_HEIGHT).toBeCloseTo(1.2);
    expect(p.side.boundingBox!.max.y - p.side.boundingBox!.min.y).toBeCloseTo(TARS_HEIGHT);
    expect(p.frame.boundingBox!.max.z).toBeGreaterThan(p.face.boundingBox!.max.z); // dark face sits in front
    const outer = p.side.boundingBox!.max.x - p.side.boundingBox!.min.x;
    expect(outer / TARS_HEIGHT).toBeCloseTo(0.6, 2); // width = 0.6 x height
    expect(outer).toBeGreaterThan(p.frame.boundingBox!.max.x - p.frame.boundingBox!.min.x);
    expect(p.frame.boundingBox!.min.y).toBeCloseTo(-TARS_HEIGHT / 2); // top/bottom bars, not a full slab
    expect(p.frame.boundingBox!.max.y).toBeCloseTo(TARS_HEIGHT / 2);
  });
});
