import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "./config";

export interface LabelDef { id: string; name: string; color: string; onMap: boolean }
interface LabelFile { schemaVersion: 1; defs: LabelDef[]; teams: Record<string, string[]> }

/** `onMap:false` labels hide a project from the 3D map (unless "show all" is on). */
export const DEFAULT_LABELS: LabelDef[] = [
  { id: "current", name: "Current", color: "#4ade80", onMap: true },
  { id: "waiting-decision", name: "Waiting on decision", color: "#ffb020", onMap: true },
  { id: "finished", name: "Finished", color: "#4fd1c5", onMap: false },
  { id: "abandoned", name: "Abandoned", color: "#8591a5", onMap: false },
];

const HEX = /^#[0-9a-f]{6}$/i;
export class LabelError extends Error { constructor(public status: number, m: string) { super(m); } }

export class LabelStore {
  defs: LabelDef[]; teams: Record<string, string[]>;
  constructor() {
    const f = loadJson<LabelFile>("labels.json", { schemaVersion: 1, defs: DEFAULT_LABELS, teams: {} });
    this.defs = Array.isArray(f.defs) && f.defs.length ? f.defs : DEFAULT_LABELS; this.teams = f.teams ?? {};
  }
  private save() { saveJson("labels.json", { defs: this.defs, teams: this.teams }); }
  forTeam(team: string): string[] { return (this.teams[team] ?? []).filter((id) => this.defs.some((d) => d.id === id)); }

  setTeam(team: string, ids: unknown) {
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) throw new LabelError(400, "labels must be a string array");
    const known = [...new Set(ids)].filter((id) => this.defs.some((d) => d.id === id));
    if (known.length) this.teams[team] = known; else delete this.teams[team];
    this.save();
  }
  create(name: unknown, color: unknown, onMap: unknown): LabelDef {
    const n = typeof name === "string" ? name.trim().slice(0, 40) : "";
    if (!n) throw new LabelError(400, "name required");
    if (this.defs.some((d) => d.name.toLowerCase() === n.toLowerCase())) throw new LabelError(409, "label exists");
    const def: LabelDef = { id: randomUUID().slice(0, 8), name: n, color: typeof color === "string" && HEX.test(color) ? color : "#60a5fa", onMap: onMap !== false };
    this.defs.push(def); this.save(); return def;
  }
  remove(id: string) {
    this.defs = this.defs.filter((d) => d.id !== id);
    for (const t of Object.keys(this.teams)) { this.teams[t] = this.teams[t].filter((x) => x !== id); if (!this.teams[t].length) delete this.teams[t]; }
    this.save();
  }
}
