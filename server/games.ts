import type { FastifyInstance } from "fastify";
import type { AppDb, GameResult } from "./db";
import { awardTrophy } from "./rewards";

const GAMES = new Set(["pong", "hockey", "rps", "dice", "billiards", "hoops"]);
const id = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null);
const score = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 999 ? (v as number) : null);

/** Validates a posted match; null = reject. Winner must be one of the two players (or null for a draw). */
export function parseGameResult(b: Record<string, unknown> | undefined): GameResult | null {
  if (!b) return null;
  const uuid = id(b.uuid), a = id(b.a), c = id(b.b), aName = id(b.aName) ?? a, bName = id(b.bName) ?? c;
  const sa = score(b.scoreA), sb = score(b.scoreB), at = typeof b.at === "number" && Number.isFinite(b.at) ? b.at : Date.now();
  if (!uuid || !a || !c || a === c || !aName || !bName || sa === null || sb === null || typeof b.game !== "string" || !GAMES.has(b.game)) return null;
  const winner = b.winner === null || b.winner === undefined ? null : id(b.winner);
  if (winner !== null && winner !== a && winner !== c) return null;
  return { uuid, at, game: b.game, a, b: c, aName: aName.slice(0, 80), bName: bName.slice(0, 80), scoreA: sa, scoreB: sb, winner };
}

/** Game rankings: `GET /api/games/rankings[?game=pong]`, `POST /api/games/result` (the browser simulates the match, the server keeps the score). */
export function registerGames(app: FastifyInstance, db: () => AppDb): void {
  app.get<{ Querystring: { game?: string } }>("/api/games/rankings", async (r) => {
    const g = r.query.game;
    if (g !== undefined && !GAMES.has(g)) throw Object.assign(new Error("unknown game"), { statusCode: 400 });
    return { rankings: db().gameRankings(g) };
  });
  app.post<{ Body: Record<string, unknown> }>("/api/games/result", async (r) => {
    const res = parseGameResult(r.body);
    if (!res) throw Object.assign(new Error("bad result"), { statusCode: 400 });
    const stored = db().recordGame(res);
    if (stored) awardTrophy(db(), res.uuid, res.game, res.winner);
    return { stored };
  });
}
