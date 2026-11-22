import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentSource } from "./adapters/types";

export function aoHome(): string {
  return process.env.AO_HOME ?? path.join(os.homedir(), ".agent-office");
}

/** Load a versioned JSON file from aoHome(). Missing/corrupt -> defaults. Never throws. */
export function loadJson<T extends object>(name: string, defaults: T): T {
  try {
    const raw = fs.readFileSync(path.join(aoHome(), name), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ...defaults };
    return { ...defaults, ...(parsed as object), schemaVersion: 1 } as T;
  } catch {
    return { ...defaults };
  }
}

/** Atomically write a JSON file (tmp + rename) into aoHome(), stamping schemaVersion 1. */
export function saveJson(name: string, data: object): void {
  const dir = aoHome();
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...data, schemaVersion: 1 }, null, name.startsWith("cache/") ? 0 : 2));
  fs.renameSync(tmp, file);
}

export interface Config {
  schemaVersion: 1;
  port: number;
  idleThresholdSec: number;
  asleepAfterMin: number;
  historyDays: number;
  streamingMode: boolean;
  doneWaveSec: number;
  errorSec: number;
  runModel: string;      // model for Claude runs started from SparkBots ("" = Claude Code default)
  opencodeModel: string; // model for OpenCode runs ("" = the session's own model, then OpenCode's default)
  cleanEnv: boolean;     // start runs without ANTHROPIC_* variables inherited from the server's shell
  liveApproval: boolean; // experimental: one long-lived claude process per chat, so tool permissions can be answered in the chat (default off)
}

export const defaultConfig: Config = {
  schemaVersion: 1,
  port: 4317,
  idleThresholdSec: 15,
  asleepAfterMin: 10,
  historyDays: 14,
  streamingMode: false,
  doneWaveSec: 5,
  errorSec: 120,
  runModel: "",
  opencodeModel: "",
  cleanEnv: false,
  liveApproval: false,
};

export function loadConfig(): Config {
  const cfg = loadJson<Config>("config.json", defaultConfig);
  const port = Number(process.env.AO_PORT); // lets a second dev server run beside the main one (vite.config.ts proxies to the same variable)
  return Number.isInteger(port) && port > 0 && port < 65536 ? { ...cfg, port } : cfg;
}

export interface TeamOverride {
  allowedTools?: string[];
  permissionMode?: string;
  model?: string;       // provider/model or Claude alias; wins over the global model for this project
  source?: AgentSource; // default agent for hires in this project
  cwd?: string;         // explicit working directory for hires (otherwise the newest known session dir)
}

export interface Teams {
  schemaVersion: 1;
  merges: Record<string, string[]>;
  colors: Record<string, string>;
  overrides: Record<string, TeamOverride>;
}

export const defaultTeams: Teams = { schemaVersion: 1, merges: {}, colors: {}, overrides: {} };

export function loadTeams(): Teams {
  return loadJson<Teams>("teams.json", defaultTeams);
}
