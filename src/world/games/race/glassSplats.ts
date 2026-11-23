import { create } from "zustand";

/** Splashes on the windshield after you run over an agent (carmageddon, driver view). Agents are robots, so it is green coolant, semi-transparent so you can still drive. */
export interface Splat { id: number; x: number; y: number; size: number; rot: number; at: number }
export const SPLAT_LIFE_MS = 7000;
let n = 0;
export const useWindshield = create<{ splats: Splat[]; hit: (count?: number) => void; clear: () => void }>((set) => ({
  splats: [],
  hit: (count = 3) => set((s) => {
    const now = Date.now();
    const fresh: Splat[] = Array.from({ length: count }, () => ({ id: ++n, x: 8 + Math.random() * 84, y: 6 + Math.random() * 62, size: 60 + Math.random() * 150, rot: Math.random() * 360, at: now }));
    return { splats: [...s.splats.filter((p) => now - p.at < SPLAT_LIFE_MS), ...fresh].slice(-14) }; // old ones have faded; never more than 14 on the glass
  }),
  clear: () => set({ splats: [] }),
}));
