import { create } from "zustand";
import { api } from "../api";

/** Data center client state: user-given labels (stored in SQLite on the server; key "" = the room itself) and the project the Data room search is pointed at. */
interface DataCenterState {
  aliases: Record<string, string>;
  team: string;                     // search filter requested by a rack click / deep link ("" = all projects)
  loadAliases: () => void;
  setAlias: (project: string, alias: string) => Promise<void>;
  openFor: (team: string) => void;  // open the Data room panel filtered to one project
}

export const ROOM = "";
export const useDataCenter = create<DataCenterState>((set) => ({
  aliases: {},
  team: "",
  loadAliases: () => { api.rackAliases().then((aliases) => set({ aliases })).catch(() => {}); },
  setAlias: async (project, alias) => { set({ aliases: await api.setRackAlias(project, alias) }); },
  openFor: (team) => set({ team }),
}));

/** Label shown for a rack: the alias if set, else the project name. */
export const rackLabel = (aliases: Record<string, string>, project: string) => aliases[project] || project;
export const roomLabel = (aliases: Record<string, string>) => aliases[ROOM] || "Data center";
