import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppDb } from "./db";
import { USER, itemDef } from "../src/shared/rewards";

const id = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });

/** Rewards: `GET /api/rewards`, `POST /api/rewards/prize` (claw prize into your inventory), `POST /api/rewards/:id/give` (to an agent).
 *  Trophies for won matches are added by `awardTrophy` from the games route. All cosmetic; nothing touches a session. */
export function registerRewards(app: FastifyInstance, db: () => AppDb): void {
  app.get("/api/rewards", async () => ({ rewards: db().rewardsAll() }));
  app.post<{ Body: Record<string, unknown> }>("/api/rewards/prize", async (r) => {
    const item = id(r.body?.item), uuid = id(r.body?.uuid) ?? randomUUID();
    if (!item || !itemDef(item)) throw bad("unknown item");
    return { stored: db().rewardAdd({ id: uuid, owner: USER, item, at: Date.now(), from: "claw", note: "" }), id: uuid };
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/rewards/:id/give", async (r) => {
    const to = id(r.body?.to), from = id(r.body?.from) ?? USER;
    if (!to || to === from) throw bad("bad target");
    if (!db().rewardGive(r.params.id, from, to, Date.now())) throw Object.assign(new Error("not yours to give"), { statusCode: 404 });
    return { ok: true };
  });
}

/** The winner of a stored match gets a trophy for that game (one row per match uuid, so a double post adds nothing). */
export function awardTrophy(db: AppDb, matchUuid: string, game: string, winner: string | null): void {
  if (winner && itemDef(`trophy-${game}`)) db.rewardAdd({ id: `trophy-${matchUuid}`, owner: winner, item: `trophy-${game}`, at: Date.now(), from: "match", note: "" });
}
