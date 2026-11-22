import { GameHub, type HubEnv } from "./hub";

/** The one hub of the page. Its world (`HubEnv`) is wired up by <GamesLayer>; until then nobody is free to play. */
export const none: HubEnv = { rng: Math.random, idle: () => [], free: () => false, alive: () => false, send: () => {}, arrived: () => false, name: (a) => a, record: () => {} };
export const hub = new GameHub(none);
const AUTO_KEY = "sparkbots.games.auto";
try { hub.auto = localStorage.getItem(AUTO_KEY) !== "0"; } catch { /* storage blocked: default on */ }
export const setAuto = (on: boolean) => { hub.auto = on; try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* ignore */ } };

