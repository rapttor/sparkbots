import type { SimNode, SimThread } from "./schema";

/** Pick a thread the agent has not had yet (fresh ones first; once everything was seen, the oldest-seen is reused). `rng` returns [0,1). */
export function pickThread(pool: SimThread[], seen: string[], rng: () => number = Math.random, topic?: string): SimThread | null {
  const scoped = topic ? pool.filter((t) => t.topic === topic) : pool;
  const list = scoped.length ? scoped : pool;
  if (!list.length) return null;
  const fresh = list.filter((t) => !seen.includes(t.id));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
  const oldest = [...list].sort((a, b) => seen.lastIndexOf(a.id) - seen.lastIndexOf(b.id));
  return oldest[0];
}

/** Resolve a node's `chain` into the next thread to start (or null). "random" prefers the same topic. */
export function chainTarget(node: SimNode, from: SimThread, pool: SimThread[], seen: string[], rng: () => number = Math.random): SimThread | null {
  if (!node.chain) return null;
  if (node.chain === "random") return pickThread(pool.filter((t) => t.id !== from.id), seen, rng, from.topic);
  return pool.find((t) => t.id === node.chain) ?? null;
}

/** Follow an option: returns the next node, or null if the option does not belong to the node. */
export function follow(thread: SimThread, nodeId: string, optionId: string): { id: string; node: SimNode } | null {
  const opt = thread.nodes[nodeId]?.options?.find((o) => o.id === optionId);
  const node = opt ? thread.nodes[opt.next] : undefined;
  return opt && node ? { id: opt.next, node } : null;
}

/** An idle agent may start a thread: decide from the elapsed quiet time. Pure so it is testable. */
export function shouldInitiate(opts: { idleMs: number; sinceLastMs: number; minIdleMs?: number; cooldownMs?: number; roll: number; chance?: number }): boolean {
  const { idleMs, sinceLastMs, minIdleMs = 90_000, cooldownMs = 600_000, roll, chance = 0.25 } = opts;
  return idleMs >= minIdleMs && sinceLastMs >= cooldownMs && roll < chance;
}
