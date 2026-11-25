import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { aoHome, loadJson, saveJson, type Config } from "./config";
import { cleanText, UNITY_MAX_NAME, validRelay } from "../src/shared/unity";

/**
 * Unity, the optional public lobby. The browser talks to the relay directly; this file only keeps the settings and the identity.
 *
 * Identity: a random secret in `~/.agent-office/unity.json` (mode 600). It is the only thing that proves "this is me" to the relay,
 * which stores just a hash of it. It is handed to the browser only while Unity is switched on, over the token-protected API, and is
 * never put in a URL. Nothing here touches Claude Code files.
 */
const KEY = /^[A-Za-z0-9_-]{22,128}$/;
const FILE = "unity.json";

/** The secret, created on first use. */
export function unityKey(): string {
  const cur = loadJson<{ key: string }>(FILE, { key: "" });
  if (KEY.test(cur.key)) return cur.key;
  const key = randomBytes(24).toString("base64url"); // 32 chars
  saveJson(FILE, { key });
  try { fs.chmodSync(path.join(aoHome(), FILE), 0o600); } catch { /* not supported on this file system */ }
  return key;
}

export interface UnitySettings { enabled: boolean; name: string; ghost: boolean; relay: string }
export const unitySettings = (c: Pick<Config, "unityEnabled" | "unityName" | "unityGhost" | "unityRelay">): UnitySettings =>
  ({ enabled: c.unityEnabled, name: c.unityName, ghost: c.unityGhost, relay: c.unityRelay });

const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });

export function registerUnity(app: FastifyInstance, cfg: () => Config): void {
  // The key is only included while Unity is on; the browser needs it for the relay's hello message.
  app.get("/api/unity", async () => {
    const c = cfg();
    return { ...unitySettings(c), ...(c.unityEnabled ? { key: unityKey() } : {}) };
  });

  app.put<{ Body: Record<string, unknown> }>("/api/unity", async (req) => {
    const c = cfg();
    const b = req.body ?? {};
    if (b.enabled !== undefined) { if (typeof b.enabled !== "boolean") throw bad("enabled must be boolean"); c.unityEnabled = b.enabled; }
    if (b.ghost !== undefined) { if (typeof b.ghost !== "boolean") throw bad("ghost must be boolean"); c.unityGhost = b.ghost; }
    if (b.name !== undefined) { if (typeof b.name !== "string") throw bad("name must be text"); c.unityName = cleanText(b.name, UNITY_MAX_NAME); }
    if (b.relay !== undefined) { if (!validRelay(b.relay)) throw bad("relay must be a wss:// address (ws:// only for this machine)"); c.unityRelay = b.relay.replace(/\/+$/, ""); }
    saveJson("config.json", c);
    return { ...unitySettings(c), ...(c.unityEnabled ? { key: unityKey() } : {}) };
  });
}
