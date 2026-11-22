import type { ChefLookId } from "./menu";

/** A box of the kitchen set. `at` is [x, z] relative to the restaurant centre, `y` the height of its underside above the kitchen floor. */
export interface KitchenBox { at: [number, number]; size: [number, number, number]; y?: number; color: string; glow?: boolean; glass?: boolean }

const Z = -4.6; // the back wall of the kitchen: the sets stand between the stove and the fridge

/**
 * What the kitchen turns into for each cuisine (pure data). Only the active set is shown; changing cuisine plays a short
 * transform (the old set collapses, the new one pops up) in `Restaurant.tsx`.
 */
export const KITCHEN_SETS: Record<ChefLookId, KitchenBox[]> = {
  plain: [ // salad bar
    { at: [0.4, Z], size: [3.0, 0.7, 0.5], color: "#d8dee6" },
    { at: [0.4, Z + 0.02], size: [3.0, 0.4, 0.45], y: 0.7, color: "#a7f3d0", glass: true },
    ...[-0.8, 0, 0.8, 1.6].map((x, i) => ({ at: [x, Z] as [number, number], size: [0.5, 0.18, 0.35] as [number, number, number], y: 0.7, color: ["#22c55e", "#ef4444", "#f59e0b", "#a3e635"][i]! })),
  ],
  italian: [ // brick pizza oven + tricolour banner
    { at: [0.4, Z], size: [1.8, 1.0, 0.7], color: "#b45309" },
    { at: [0.4, Z], size: [1.2, 0.7, 0.55], y: 1.0, color: "#9a3412" },
    { at: [0.4, Z + 0.3], size: [0.8, 0.45, 0.06], y: 0.25, color: "#fb923c", glow: true },
    { at: [-0.5, Z + 0.1], size: [0.5, 0.06, 0.5], y: 1.0, color: "#f5d0a0" }, // peel / pizza board
    ...["#16a34a", "#f8fafc", "#dc2626"].map((c, i) => ({ at: [-0.5 + i * 0.35, Z] as [number, number], size: [0.35, 0.5, 0.05] as [number, number, number], y: 1.75, color: c })),
  ],
  chinese: [ // sushi bar with a fish tank and red lanterns
    { at: [0.4, Z + 0.1], size: [3.0, 0.8, 0.45], color: "#7c4a2a" },
    { at: [0.4, Z + 0.1], size: [3.1, 0.06, 0.55], y: 0.8, color: "#f3e3c3" },
    { at: [1.3, Z - 0.05], size: [1.0, 0.8, 0.3], y: 0.86, color: "#38bdf8", glass: true },
    { at: [-0.6, Z + 0.1], size: [0.9, 0.12, 0.3], y: 0.86, color: "#fb7185" }, // sushi plate
    ...[-0.9, 0.2, 1.4].map((x) => ({ at: [x, Z] as [number, number], size: [0.28, 0.28, 0.28] as [number, number, number], y: 1.8, color: "#ef4444", glow: true })),
  ],
  american: [ // diner grill with a neon sign
    { at: [0.4, Z], size: [2.2, 0.85, 0.65], color: "#1f2937" },
    { at: [0.4, Z + 0.05], size: [2.0, 0.05, 0.5], y: 0.85, color: "#6b7280" },
    ...[-0.4, 0, 0.4, 0.8, 1.2].map((x) => ({ at: [x + 0.4, Z + 0.05] as [number, number], size: [0.05, 0.03, 0.5] as [number, number, number], y: 0.9, color: "#111827" })),
    { at: [0.4, Z - 0.2], size: [1.6, 0.4, 0.06], y: 1.55, color: "#f43f5e", glow: true },
    { at: [-0.8, Z + 0.1], size: [0.12, 0.3, 0.12], y: 0.85, color: "#dc2626" },  // ketchup
    { at: [-0.62, Z + 0.1], size: [0.12, 0.3, 0.12], y: 0.85, color: "#facc15" }, // mustard
  ],
  mexican: [ // taco cart with a striped awning and cacti
    { at: [0.4, Z], size: [2.4, 0.8, 0.6], color: "#d97706" },
    { at: [0.4, Z], size: [2.5, 0.06, 0.7], y: 0.8, color: "#fde68a" },
    ...Array.from({ length: 6 }, (_, i) => ({ at: [-0.65 + i * 0.4, Z + 0.05] as [number, number], size: [0.4, 0.06, 0.8] as [number, number, number], y: 1.8, color: i % 2 ? "#fef3c7" : "#dc2626" })),
    { at: [-1.1, Z + 0.2], size: [0.2, 0.7, 0.2], color: "#16a34a" }, { at: [-1.1, Z + 0.2], size: [0.5, 0.15, 0.15], y: 0.35, color: "#16a34a" },
  ],
};
