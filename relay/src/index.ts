// Entry Worker: validates the request and hands the WebSocket to the room's Durable Object.
// The relay only forwards presence (position) and short text bubbles, and keeps ghosts (see room.ts).
export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string; // extra exact origins (e.g. a hosted SparkBots), comma-separated
}

const ROOM_CODE = /^[A-Za-z0-9_-]{4,32}$/;

// SparkBots runs on the user's own machine, on whatever port their config uses, so any local
// origin is accepted. Other websites are rejected (browsers always send Origin).
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") return new Response("ok");

    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m || !ROOM_CODE.test(m[1])) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

    const origin = req.headers.get("Origin");
    if (origin) {
      const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!LOCAL_ORIGIN.test(origin) && !extra.includes(origin)) return new Response("forbidden origin", { status: 403 });
    }

    const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
    return stub.fetch(req);
  },
};
