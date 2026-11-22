export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export const fmtNum = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
/** A percentage of a whole; a small non-zero share reads "<1%" instead of a misleading "0%". */
export function fmtShare(part: number, whole: number): string {
  if (!(whole > 0) || part <= 0) return "0%";
  const p = (100 * part) / whole;
  return p < 1 ? "<1%" : `${Math.round(p)}%`;
}
export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 100 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** What to call a worker: the user's custom name if set, else the session title. */
export const displayName = (w: { name?: string; title: string }) => w.name || w.title || "(untitled)";
