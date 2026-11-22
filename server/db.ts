import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as Db } from "node:sqlite";
import { aoHome } from "./config";

// node:sqlite is loaded through require so bundlers/test runners that do not know this newer built-in leave it alone
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** One row = the tokens one session used with one model in one hour. Kept forever, even after the tool deletes the transcript. */
export interface UsageHour { session: string; hour: number; model: string; source: string; project: string; input: number; output: number; cacheRead: number; cacheWrite: number; n: number }

/** Numbered migrations: append new steps, never edit old ones. */
const MIGRATIONS = [
  `CREATE TABLE usage_hour (session TEXT NOT NULL, hour INTEGER NOT NULL, model TEXT NOT NULL, source TEXT NOT NULL, project TEXT NOT NULL,
     input INTEGER NOT NULL, output INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, n INTEGER NOT NULL,
     PRIMARY KEY (session, hour, model));
   CREATE INDEX usage_hour_hour ON usage_hour(hour);`,
];

/** SparkBots' own database (`~/.agent-office/app.db`): data we generate and want to keep for good (analytics, later games/rewards). */
export class AppDb {
  readonly db: Db;
  constructor(file = join(aoHome(), "app.db")) {
    if (file !== ":memory:") mkdirSync(aoHome(), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    const v = Number((this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    for (let i = v; i < MIGRATIONS.length; i++) {
      this.db.exec("BEGIN");
      try { this.db.exec(MIGRATIONS[i]!); this.db.exec(`PRAGMA user_version = ${i + 1}`); this.db.exec("COMMIT"); }
      catch (e) { this.db.exec("ROLLBACK"); throw e; }
    }
  }

  usageSessions(): Set<string> {
    return new Set((this.db.prepare("SELECT DISTINCT session FROM usage_hour").all() as { session: string }[]).map((r) => r.session));
  }

  /** Replace everything stored for one session with these rows (the transcript was re-read, so its totals may have changed). */
  replaceSession(session: string, rows: UsageHour[]) {
    const ins = this.db.prepare("INSERT OR REPLACE INTO usage_hour VALUES (?,?,?,?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM usage_hour WHERE session = ?").run(session);
      for (const r of rows) ins.run(r.session, r.hour, r.model, r.source, r.project, r.input, r.output, r.cacheRead, r.cacheWrite, r.n);
      this.db.exec("COMMIT");
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  allUsage(): UsageHour[] {
    return (this.db.prepare("SELECT session, hour, model, source, project, input, output, cache_read AS cacheRead, cache_write AS cacheWrite, n FROM usage_hour").all() as unknown) as UsageHour[];
  }

  close() { this.db.close(); }
}

const HOUR = 3_600_000;
/** Group raw usage rows [at, model, in, out, cacheRead, cacheWrite] into hourly rows. */
export function hourly(session: string, source: string, project: string, rows: [number, string, number, number, number, number][]): UsageHour[] {
  const m = new Map<string, UsageHour>();
  for (const [at, model, input, output, cacheRead, cacheWrite] of rows) {
    const hour = Math.floor(at / HOUR) * HOUR, k = `${hour}|${model}`;
    const r = m.get(k) ?? { session, hour, model, source, project, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, n: 0 };
    r.input += input; r.output += output; r.cacheRead += cacheRead; r.cacheWrite += cacheWrite; r.n++;
    m.set(k, r);
  }
  return [...m.values()];
}
