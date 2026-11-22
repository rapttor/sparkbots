import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as Db } from "node:sqlite";
import { aoHome } from "./config";

// node:sqlite is loaded through require so bundlers/test runners that do not know this newer built-in leave it alone
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** One row = the tokens one session used with one model in one hour. Kept forever, even after the tool deletes the transcript. */
export interface UsageHour { session: string; hour: number; model: string; source: string; project: string; input: number; output: number; cacheRead: number; cacheWrite: number; n: number }

/** One finished match (see src/world/games). */
export interface GameResult { uuid: string; at: number; game: string; a: string; b: string; aName: string; bName: string; scoreA: number; scoreB: number; winner: string | null }
export interface GameRank { agent: string; name: string; game: string; wins: number; losses: number; plays: number }

/** Numbered migrations: append new steps, never edit old ones. */
const MIGRATIONS = [
  `CREATE TABLE usage_hour (session TEXT NOT NULL, hour INTEGER NOT NULL, model TEXT NOT NULL, source TEXT NOT NULL, project TEXT NOT NULL,
     input INTEGER NOT NULL, output INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, n INTEGER NOT NULL,
     PRIMARY KEY (session, hour, model));
   CREATE INDEX usage_hour_hour ON usage_hour(hour);`,
  // 2: Data center labels. project "" holds the name of the room itself.
  `CREATE TABLE rack_alias (project TEXT PRIMARY KEY, alias TEXT NOT NULL);`,
  // caffeine level per agent (13.4.5): value as of `at`; the current level is derived by decay (server/caffeine.ts)
  `CREATE TABLE caffeine (session TEXT PRIMARY KEY, value REAL NOT NULL, at INTEGER NOT NULL);`,
  // games: one row per finished match (agent ids are session ids; names are kept so rankings survive deleted sessions)
  `CREATE TABLE game_result (uuid TEXT PRIMARY KEY, at INTEGER NOT NULL, game TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL,
     a_name TEXT NOT NULL, b_name TEXT NOT NULL, score_a INTEGER NOT NULL, score_b INTEGER NOT NULL, winner TEXT);
   CREATE INDEX game_result_game ON game_result(game);`,
  // rewards (13.4.3 / 13.7.9): one row per owned item; owner = agent session id or 'user' (your own inventory)
  `CREATE TABLE reward (id TEXT PRIMARY KEY, owner TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, from_owner TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
   CREATE INDEX reward_owner ON reward(owner);`,
];

/** The schema version a fully migrated database reports in `PRAGMA user_version`. */
export const SCHEMA_VERSION = MIGRATIONS.length;
export const ROOM_KEY = "";
export const MAX_ALIAS = 40;

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

  /** Data center labels: project name -> alias; ROOM_KEY ("") is the room's own name. */
  rackAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.db.prepare("SELECT project, alias FROM rack_alias").all() as { project: string; alias: string }[]) out[r.project] = r.alias;
    return out;
  }

  /** Set (or clear, with an empty/null alias) one label. Returns the stored alias or null. */
  setRackAlias(project: string, alias: string | null | undefined): string | null {
    const a = (alias ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ALIAS);
    if (!a) { this.db.prepare("DELETE FROM rack_alias WHERE project = ?").run(project); return null; }
    this.db.prepare("INSERT OR REPLACE INTO rack_alias (project, alias) VALUES (?, ?)").run(project, a);
    return a;
  }

  caffeineRow(session: string): { value: number; at: number } | undefined {
    return this.db.prepare("SELECT value, at FROM caffeine WHERE session = ?").get(session) as { value: number; at: number } | undefined;
  }
  caffeineAll(): { session: string; value: number; at: number }[] {
    return this.db.prepare("SELECT session, value, at FROM caffeine").all() as { session: string; value: number; at: number }[];
  }
  caffeineSet(session: string, value: number, at: number) {
    this.db.prepare("INSERT OR REPLACE INTO caffeine VALUES (?,?,?)").run(session, value, at);
  }

  /** Store a finished match. Returns false when this uuid was already stored (a second browser tab simulated the same match). */
  recordGame(r: GameResult): boolean {
    const res = this.db.prepare("INSERT OR IGNORE INTO game_result VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(r.uuid, r.at, r.game, r.a, r.b, r.aName, r.bName, r.scoreA, r.scoreB, r.winner);
    return Number(res.changes) > 0;
  }

  /** Per agent and game: wins, losses, matches (best first). `game` = one game only; omit it for the totals over all games. */
  gameRankings(game?: string): GameRank[] {
    const sides = `SELECT a AS agent, a_name AS name, game, (winner = a) AS win, (winner IS NOT NULL AND winner <> a) AS loss, at FROM game_result
                   UNION ALL SELECT b, b_name, game, (winner = b), (winner IS NOT NULL AND winner <> b), at FROM game_result`;
    const rows = this.db.prepare(
      `SELECT agent, name, ${game ? "game" : "'all'"} AS game, SUM(win) AS wins, SUM(loss) AS losses, COUNT(*) AS plays,
              (SELECT s2.name FROM (${sides}) s2 WHERE s2.agent = s.agent ORDER BY s2.at DESC LIMIT 1) AS latest
       FROM (${sides}) s ${game ? "WHERE game = ?" : ""} GROUP BY agent ORDER BY wins DESC, plays ASC, agent ASC LIMIT 200`,
    ).all(...(game ? [game] : [])) as unknown as (GameRank & { latest: string })[];
    return rows.map(({ latest, ...r }) => ({ ...r, name: latest ?? r.name, wins: Number(r.wins), losses: Number(r.losses), plays: Number(r.plays) }));
  }

  /** Rewards (src/shared/rewards.ts). `rewardAdd` is idempotent per id. */
  rewardAdd(r: { id: string; owner: string; item: string; at: number; from: string; note: string }): boolean {
    return Number(this.db.prepare("INSERT OR IGNORE INTO reward VALUES (?,?,?,?,?,?)").run(r.id, r.owner, r.item, r.at, r.from, r.note).changes) > 0;
  }
  rewardsAll(): { id: string; owner: string; item: string; at: number; from: string; note: string }[] {
    return this.db.prepare("SELECT id, owner, item, at, from_owner AS \"from\", note FROM reward ORDER BY at DESC, id DESC LIMIT 5000").all() as never;
  }
  /** Moves an item from `from` to `to`; false when `from` does not own it. */
  rewardGive(id: string, from: string, to: string, at: number): boolean {
    return Number(this.db.prepare("UPDATE reward SET owner = ?, from_owner = ?, at = ? WHERE id = ? AND owner = ?").run(to, from, at, id, from).changes) > 0;
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
