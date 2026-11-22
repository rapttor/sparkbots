import { useSyncExternalStore } from "react";
import { call } from "../../api";
import { USER, byOwner, type Reward } from "../../shared/rewards";

/** Client copy of the `reward` table. Refetched on demand; cosmetic, so every failure is silent. */
let rewards: Reward[] = [];
let grouped = new Map<string, Reward[]>();
let version = 0;
const subs = new Set<() => void>();
const set = (r: Reward[]) => { rewards = r; grouped = byOwner(r); version++; subs.forEach((f) => f()); };

export async function refreshRewards(): Promise<void> {
  try { set((await call<{ rewards: Reward[] }>("GET", "/api/rewards")).rewards); } catch { /* keep what we have */ }
}
export async function winPrize(item: string, uuid: string): Promise<void> {
  try { await call("POST", "/api/rewards/prize", { item, uuid }); } catch { /* lost prize is harmless */ }
  await refreshRewards();
}
export async function giveReward(id: string, to: string, from = USER): Promise<string | null> {
  try { await call("POST", `/api/rewards/${encodeURIComponent(id)}/give`, { to, from }); await refreshRewards(); return null; }
  catch (e) { return (e as Error).message; }
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** Rewards grouped by owner (agent id or USER). Fetches once on first use. */
export function useRewards(): Map<string, Reward[]> {
  useSyncExternalStore(subscribe, () => version);
  if (version === 0 && !loading) { loading = true; void refreshRewards().finally(() => { loading = false; if (version === 0) set([]); }); }
  return grouped;
}
let loading = false;
