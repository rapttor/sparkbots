import { GAMES, GAME_IDS } from "./registry";
import type { GameId } from "./types";

/** The slice of the game hub this needs (kept structural so tests can fake it and the registry can grow without edits here). */
export interface PlayHub { canOpen(g: GameId): boolean; inGame(a: string): unknown; open(g: GameId, agents: string[], manual?: boolean): unknown }
export interface PlayChoice { game: GameId; label: string }

/** "Play while limited" (13.4.8): the games an agent could start right now. Only offered while the service is rate limited and
 *  the agent is not already in a game. Read defensively: a game def without a name/icon is skipped, a throwing hub yields nothing. */
export function playChoices(hub: PlayHub, agent: string, limited: boolean): PlayChoice[] {
  if (!limited) return [];
  try {
    if (hub.inGame(agent)) return [];
    return GAME_IDS.filter((g) => GAMES[g] && typeof GAMES[g].name === "string" && hub.canOpen(g)).map((g) => ({ game: g, label: `${GAMES[g].icon ?? "🎮"} ${GAMES[g].name}` }));
  } catch { return []; }
}

/** Start the chosen game for this agent (it waits at the table for an opponent). True when a table was opened. */
export function startGame(hub: PlayHub, game: GameId, agent: string): boolean {
  try { return !!hub.open(game, [agent], true); } catch { return false; }
}
