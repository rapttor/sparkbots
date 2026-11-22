/** `rateLimited{until}`: the server sets `snapshot.rateLimitedUntil` while the model service is limiting us (or Settings says so). */
export const rateLimitedAt = (until: number | undefined, now = Date.now()): boolean => !!until && until > now;

/** Which robots twitch this tick: a rotating handful of the visible ones, so the whole office looks on edge without 150 effects. */
export function nervousPicks(ids: string[], tick: number, max = 5): string[] {
  if (ids.length <= max) return ids.slice();
  const start = (tick * max) % ids.length;
  return Array.from({ length: max }, (_, k) => ids[(start + k) % ids.length]!);
}
