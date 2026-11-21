// The developer owner's look (Settings > 3D office). Kept in its own module, free of three.js, so the
// store and the settings panel can import it without pulling in the renderer.
export type TopStyle = "turtleneck" | "tshirt" | "hoodie" | "plaid";

export interface DevLook {
  top: TopStyle;
  topColor: string; // shirt / hoodie colour
  logo: string; // emoji on the back, "" = none
  glasses: boolean;
  beard: boolean;
  overweight: boolean;
}

export const TOP_STYLES: { id: TopStyle; name: string }[] = [
  { id: "turtleneck", name: "Turtleneck" },
  { id: "tshirt", name: "T-shirt" },
  { id: "hoodie", name: "Hoodie" },
  { id: "plaid", name: "Squared lines shirt" },
];

export const LOGO_EMOJIS = ["", "🦖", "🤖", "👾", "🚀", "🔥", "⚡", "🧠", "💾", "🎮", "☕", "🍕", "🐱", "🐶", "🦄", "👑", "🌈", "💡"];

export const DEFAULT_DEV_LOOK: DevLook = { top: "turtleneck", topColor: "#1c1c20", logo: "", glasses: true, beard: true, overweight: true };

const KEY = "ao.devLook";

export function loadDevLook(): DevLook {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DevLook> | null;
    if (!o || typeof o !== "object") return { ...DEFAULT_DEV_LOOK };
    return {
      top: TOP_STYLES.some((t) => t.id === o.top) ? (o.top as TopStyle) : DEFAULT_DEV_LOOK.top,
      topColor: typeof o.topColor === "string" ? o.topColor : DEFAULT_DEV_LOOK.topColor,
      logo: typeof o.logo === "string" ? o.logo : DEFAULT_DEV_LOOK.logo,
      glasses: typeof o.glasses === "boolean" ? o.glasses : DEFAULT_DEV_LOOK.glasses,
      beard: typeof o.beard === "boolean" ? o.beard : DEFAULT_DEV_LOOK.beard,
      overweight: typeof o.overweight === "boolean" ? o.overweight : DEFAULT_DEV_LOOK.overweight,
    };
  } catch { return { ...DEFAULT_DEV_LOOK }; }
}

export function saveDevLook(l: DevLook): void {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ }
}
