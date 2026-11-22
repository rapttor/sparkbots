import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aoHome } from "./config";

/** Persisted token (0600) for monitor/dev mode so open browser tabs survive server restarts. */
export function stableToken(): string {
  const f = join(aoHome(), "dev-token");
  if (existsSync(f)) { const t = readFileSync(f, "utf8").trim(); if (t) return t; }
  mkdirSync(aoHome(), { recursive: true });
  const t = makeToken(); writeFileSync(f, t, { mode: 0o600 }); return t;
}

export function makeToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export type CheckResult = { ok: true } | { ok: false; status: number; reason: string };

/** Dev client port; AO_DEV_PORT lets a second dev client run beside the main one. */
const DEV_PORT = Number(process.env.AO_DEV_PORT ?? 5173);

export function checkRequest(
  req: { host?: string; origin?: string; token?: string },
  expected: { port: number; token: string },
): CheckResult {
  const { port } = expected;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!req.host || !hosts.includes(req.host)) return { ok: false, status: 403, reason: "bad host" };

  if (req.origin !== undefined && req.origin !== "") {
    const origins = [
      `http://127.0.0.1:${port}`, `http://localhost:${port}`,
      `http://127.0.0.1:${DEV_PORT}`, `http://localhost:${DEV_PORT}`,
    ];
    if (!origins.includes(req.origin)) return { ok: false, status: 403, reason: "bad origin" };
  }

  const a = Buffer.from(req.token ?? "");
  const b = Buffer.from(expected.token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, reason: "bad token" };
  }
  return { ok: true };
}
