import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { OWNER } from "../src/shared/owner";
import { PANEL_TITLES } from "../src/state/dock";

describe("rapttor branding", () => {
  it("the logo and the logotype are bundled with the app (no remote images)", () => {
    for (const f of ["rapttor_logo-green.png", "rapttor_logo-text-green.png"]) {
      const p = `src/assets/rapttor/${f}`;
      expect(existsSync(p), f).toBe(true);
      expect([...readFileSync(p).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // a real PNG
    }
    for (const f of ["src/App.tsx", "src/panels/About.tsx", "src/world/rooms/SponsorRoom.tsx"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/src=["']https?:\/\/rapttor/);
  });
  it("the About panel exists, opens from the header logo, and has no icon in the header's panel menu", () => {
    expect(PANEL_TITLES.about).toMatch(/rapttor/i);
    expect(OWNER.site).toBe("https://rapttor.com");
    expect(readFileSync("src/App.tsx", "utf8")).toMatch(/setPanel\("about"\)/);
    expect(readFileSync("src/dock/PanelMenu.tsx", "utf8")).not.toMatch(/id: "about"/);
  });
});
