import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, developerAvatar, getAvatar, listAvatars, validateAvatars } from "../src/world/avatar";
import { DEFAULT_DEV_LOOK } from "../src/world/devLook";

describe("owner avatars (13.1.1)", () => {
  it("satisfies the avatar contract (parts, layout, glow, clips, pose targets)", () => {
    expect(validateAvatars()).toEqual([]);
  });

  it("defaults to the developer with the raptor and spark bot still selectable", () => {
    expect(DEFAULT_AVATAR).toBe("developer");
    const ids = listAvatars().map((a) => a.id);
    expect(ids).toContain("developer");
    expect(ids).toContain("raptor");
    expect(ids).toContain("spark");
  });

  it("falls back to the first avatar for an unknown id", () => {
    expect(getAvatar("nope").id).toBe("developer");
    expect(getAvatar(undefined).id).toBe("developer");
    expect(getAvatar("spark").id).toBe("spark");
  });

  it("the developer's manager colour tints only the jeans", () => {
    const dev = getAvatar("developer");
    // the legs are intentionally not in the fixed colour map, so they take the manager tint
    expect(dev.colors?.legL).toBeUndefined();
    expect(dev.colors?.legR).toBeUndefined();
    // everything else is fixed
    expect(dev.colors?.body).toBeTruthy();
    expect(dev.colors?.head).toBeTruthy();
  });

  it("builds every declared part with real geometry", () => {
    for (const { id } of listAvatars()) {
      const a = getAvatar(id);
      const geoms = a.build();
      for (const p of a.parts) expect(geoms[p]?.attributes.position?.count ?? 0).toBeGreaterThan(0);
    }
  });

  it("developer options toggle parts (glasses, beard) and add front + back logos", () => {
    const plain = developerAvatar({ ...DEFAULT_DEV_LOOK, glasses: false, beard: false, logo: "" });
    expect(plain.parts).not.toContain("glasses");
    expect(plain.parts).not.toContain("beard");
    expect(plain.parts).not.toContain("logoFront");
    expect(plain.parts).not.toContain("logoBack");
    expect(plain.decals).toBeUndefined();

    const full = developerAvatar({ ...DEFAULT_DEV_LOOK, glasses: true, beard: true, logo: "🦖" });
    expect(full.parts).toEqual(expect.arrayContaining(["glasses", "beard", "logoFront", "logoBack"]));
    expect(full.decals).toEqual([{ part: "logoFront", emoji: "🦖" }, { part: "logoBack", emoji: "🦖" }]);
    const g = full.build();
    expect(g.logoFront?.attributes.position?.count ?? 0).toBeGreaterThan(0);
    // the back logo is at least twice the front logo in both dimensions
    g.logoFront!.computeBoundingBox(); g.logoBack!.computeBoundingBox();
    const fw = g.logoFront!.boundingBox!.max.x - g.logoFront!.boundingBox!.min.x;
    const bw = g.logoBack!.boundingBox!.max.x - g.logoBack!.boundingBox!.min.x;
    expect(bw).toBeGreaterThanOrEqual(fw * 2);
  });

  it("developer top styles: plaid weaves two colours, t-shirt shows bare forearms, overweight adds a belly", () => {
    const plaid = developerAvatar({ ...DEFAULT_DEV_LOOK, top: "plaid" });
    expect(plaid.pattern?.body).toBe("plaid");
    expect(plaid.pattern?.upperL).toBe("plaid");

    const tee = developerAvatar({ ...DEFAULT_DEV_LOOK, top: "tshirt", topColor: "#123456" });
    // forearms take the skin colour for a t-shirt, the top colour for long sleeves
    expect(tee.colors?.foreL).not.toBe("#123456");
    const turtle = developerAvatar({ ...DEFAULT_DEV_LOOK, top: "turtleneck", topColor: "#123456" });
    expect(turtle.colors?.foreL).toBe("#123456");
    expect(turtle.colors?.body).toBe("#123456");

    const slim = developerAvatar({ ...DEFAULT_DEV_LOOK, overweight: false }).build().body;
    const fat = developerAvatar({ ...DEFAULT_DEV_LOOK, overweight: true }).build().body;
    slim.computeBoundingBox(); fat.computeBoundingBox();
    expect(fat.boundingBox!.max.z - fat.boundingBox!.min.z).toBeGreaterThan(slim.boundingBox!.max.z - slim.boundingBox!.min.z);
  });

  it("poses walk, sprint and idle deterministically", () => {
    const raptor = getAvatar("raptor");
    for (const clip of ["idle", "walk", "sprint"] as const) {
      const a = raptor.pose({ clip, t: 1.1, speed: 4 });
      const b = raptor.pose({ clip, t: 1.1, speed: 4 });
      expect(a).toEqual(b); // pure: same input, same output
      for (const key of Object.keys(a)) expect(raptor.parts).toContain(key);
    }
    // sprint steps further than a walk at the same phase
    const walk = raptor.pose({ clip: "walk", t: 0.6, speed: 4 });
    const sprint = raptor.pose({ clip: "sprint", t: 0.6, speed: 8 });
    expect(Math.abs(sprint.legL?.rx ?? 0)).toBeGreaterThan(Math.abs(walk.legL?.rx ?? 0));
  });
});

describe("the owner's default outfit", () => {
  it("is a white t-shirt with a dino, and blue denim jeans", async () => {
    expect(DEFAULT_DEV_LOOK.top).toBe("tshirt");
    expect(DEFAULT_DEV_LOOK.topColor.toLowerCase()).toBe("#f4f6fa");
    expect(DEFAULT_DEV_LOOK.logo).toBe("🦖");
    const { DEFAULT_JEANS } = await import("../src/world/devLook");
    expect(DEFAULT_JEANS).toMatch(/^#[0-9a-f]{6}$/i);
    const r = parseInt(DEFAULT_JEANS.slice(1, 3), 16), b = parseInt(DEFAULT_JEANS.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r + 30); // blue
  });
});
