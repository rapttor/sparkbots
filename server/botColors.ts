import { loadJson, saveJson } from "./config";

const HEX = /^#[0-9a-f]{6}$/i;
/** Every bot starts out Claude-Code orange until the user picks a color. */
export const DEFAULT_BOT_COLOR = "#d97757";
export class BotColorError extends Error { constructor(public status: number, m: string) { super(m); } }

/** User-chosen per-worker colors, persisted in ~/.agent-office/bots.json. */
export class BotColors {
  colors: Record<string, string>; // per worker (session id)
  names: Record<string, string>;  // per worker: custom display name
  teams: Record<string, string>;  // per project: applies to every bot in it unless the worker has its own
  constructor() {
    const f = loadJson<{ schemaVersion: 1; colors: Record<string, string>; teams?: Record<string, string>; names?: Record<string, string> }>("bots.json", { schemaVersion: 1, colors: {}, teams: {} });
    this.colors = f.colors ?? {}; this.teams = f.teams ?? {}; this.names = f.names ?? {};
  }
  private save() { saveJson("bots.json", { colors: this.colors, teams: this.teams, names: this.names }); }
  /** Project bot color (default orange). */
  forTeam(team: string): string { return this.teams[team] ?? DEFAULT_BOT_COLOR; }
  /** Color a worker's bot is drawn in: its own choice, else its project's. */
  resolve(id: string, team: string): string { return this.colors[id] ?? this.forTeam(team); }
  /** Custom display name for a worker; empty/null removes it (the session title shows again). */
  setName(id: string, name: unknown) {
    const n = typeof name === "string" ? name.trim() : "";
    if (name !== null && typeof name !== "string") throw new BotColorError(400, "name must be a string or null");
    if (n.length > 80) throw new BotColorError(400, "name is too long (max 80)");
    if (!n) delete this.names[id]; else this.names[id] = n;
    this.save();
  }
  setTeam(team: string, color: unknown) {
    if (color === null) delete this.teams[team];
    else if (typeof color === "string" && HEX.test(color)) this.teams[team] = color.toLowerCase();
    else throw new BotColorError(400, "color must be #rrggbb or null");
    this.save();
  }
  set(id: string, color: unknown) {
    if (color === null) delete this.colors[id];
    else if (typeof color === "string" && HEX.test(color)) this.colors[id] = color.toLowerCase();
    else throw new BotColorError(400, "color must be #rrggbb or null");
    this.save();
  }
}
