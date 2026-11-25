// Entry Worker: validates the request and hands the WebSocket to the room's Durable Object.
// The relay only forwards presence (position) and short text bubbles, keeps ghosts and a ban list (see room.ts).
import type { Room } from "./room";
export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string; // extra exact origins (e.g. a hosted SparkBots), comma-separated
  ADMIN_TOKEN?: string; // secret (`wrangler secret put ADMIN_TOKEN`); admin API is off (404) without it
}

const ROOM_CODE = /^[A-Za-z0-9_-]{4,32}$/;

// SparkBots runs on the user's own machine, on whatever port their config uses, so any local
// origin is accepted. Other websites are rejected (browsers always send Origin).
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;

// Compare through a hash so the comparison time does not depend on where the strings differ.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

// The Workers edge cache (the DOM lib typings do not know `caches.default`).
const edge = (): Cache => (caches as unknown as { default: Cache }).default;

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

async function admin(req: Request, env: Env, room: string, action: string): Promise<Response> {
  if (!env.ADMIN_TOKEN) return new Response("not found", { status: 404 });
  if (req.headers.get("Origin")) return new Response("forbidden", { status: 403 }); // CLI only, never from a web page
  if (!(await sameSecret(req.headers.get("Authorization") ?? "", `Bearer ${env.ADMIN_TOKEN}`))) return new Response("unauthorized", { status: 401 });

  const stub = env.ROOM.get(env.ROOM.idFromName(room));
  if (req.method === "GET" && action === "peers") return json(await stub.adminPeers());
  if (req.method === "GET" && action === "reports") return json(await stub.adminReports());
  if (req.method === "GET" && action === "bans") return json(await stub.adminBans());

  if (req.method === "POST" && (action === "ban" || action === "unban")) {
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
    if (action === "ban") return json(await stub.adminBan(String(body?.id ?? ""), Math.max(0, Number(body?.minutes) || 0), body?.ip === true));
    return json(await stub.adminUnban(String(body?.key ?? "")));
  }
  return new Response("not found", { status: 404 });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") return new Response("ok");

    const am = url.pathname.match(/^\/admin\/([A-Za-z0-9_-]{4,32})\/(peers|reports|bans|ban|unban)$/);
    if (am) return admin(req, env, am[1], am[2]);

    // How many people are in a room, for the pod in the office. Only a number; cached for 15 s at the edge so polling never wakes the room
    // more than a few times a minute. Same Origin rule as the sockets (browsers send Origin; other websites get 403).
    const cm = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{4,32})\/count$/);
    if (cm) {
      const origin = req.headers.get("Origin");
      const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (origin && !LOCAL_ORIGIN.test(origin) && !extra.includes(origin)) return new Response("forbidden origin", { status: 403 });
      const cors: Record<string, string> = origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET", Vary: "Origin" } : {};
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
      const key = new Request(`${url.origin}/__count/${cm[1]}`);
      let res = await edge().match(key);
      if (!res) {
        // A room object that is still running the previous code (it has connections open, so it is not restarted on deploy) cannot
        // answer yet: report "no count" for a few seconds instead of failing.
        let n: number | null = null;
        try { n = await env.ROOM.get(env.ROOM.idFromName(cm[1]!)).count(); } catch { /* not available yet */ }
        res = new Response(JSON.stringify({ n }), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${n === null ? 5 : 15}` } });
        ctx.waitUntil(edge().put(key, res.clone()));
      }
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    }

    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m || !ROOM_CODE.test(m[1])) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

    const origin = req.headers.get("Origin");
    if (origin) {
      const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!LOCAL_ORIGIN.test(origin) && !extra.includes(origin)) return new Response("forbidden origin", { status: 403 });
    }

    // The room limits connections per IP; pass the real client IP in a header only the Worker can set.
    const headers = new Headers(req.headers);
    headers.set("X-Client-IP", req.headers.get("CF-Connecting-IP") ?? "local");
    const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
    return stub.fetch(new Request(req, { headers }));
  },
};
