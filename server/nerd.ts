import { statSync } from "node:fs";
import { join } from "node:path";
import type { Company } from "./model/company";
import type { RunManager } from "./adapters/claude-code/command";
import { aoHome } from "./config";

/** Event-loop lag: how late a 100 ms timer fires. High numbers mean the server is busy (indexing, big parses). */
const lags: number[] = [];
let sampler: NodeJS.Timeout | undefined;
export function startLagSampler(): void {
  if (sampler) return;
  let last = performance.now();
  sampler = setInterval(() => {
    const now = performance.now();
    lags.push(Math.max(0, now - last - 100)); if (lags.length > 100) lags.shift();
    last = now;
  }, 100);
  sampler.unref();
}
export function lagStats(): { avgMs: number; maxMs: number } {
  if (!lags.length) return { avgMs: 0, maxMs: 0 };
  return { avgMs: lags.reduce((a, b) => a + b, 0) / lags.length, maxMs: Math.max(...lags) };
}

let snapCache = { at: 0, bytes: 0 };
export interface NerdDeps { company: Company; runs: RunManager; clients: () => number; rev: () => number }

/** Technical facts about the running server, for the Stats page (read-only, nothing secret). */
export function nerdSnapshot(d: NerdDeps) {
  const m = process.memoryUsage();
  if (Date.now() - snapCache.at > 5000) snapCache = { at: Date.now(), bytes: JSON.stringify(d.company.snapshot()).length };
  const byState: Record<string, number> = {};
  for (const r of d.company.runtimes.values()) byState[r.state] = (byState[r.state] ?? 0) + 1;
  let indexBytes = 0;
  try { indexBytes = statSync(join(aoHome(), "index.sqlite")).size; } catch { /* no index yet */ }
  const idx = (() => { try { return d.company.search.stats(); } catch { return { sessions: 0, messages: 0 }; } })();
  return {
    node: process.version, pid: process.pid, uptimeS: Math.round(process.uptime()),
    memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external },
    lag: lagStats(),
    sockets: { clients: d.clients(), rev: d.rev() },
    snapshotBytes: snapCache.bytes,
    sessions: { known: d.company.sessions.size, live: d.company.live.size, byState },
    index: { ...idx, building: d.company.search.building, fileBytes: indexBytes },
    stats: { sessionsWithStats: d.company.sessionStats.size, historySpans: d.company.history.list().length, skippedLines: d.company.skipped },
    runs: { total: d.runs.runs.length, running: d.runs.runs.filter((r) => r.status === "running").length },
  };
}
