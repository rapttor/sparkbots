// Entry Worker: validates the request and hands the WebSocket to the room's Durable Object.
// The relay never stores anything and only forwards presence (position) and short text bubbles.
export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

const ROOM_CODE = /^[A-Za-z0-9_-]{4,32}$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") return new Response("ok");

    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m || !ROOM_CODE.test(m[1])) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });

    // Browsers always send Origin; reject foreign sites. Non-browser clients send none.
    const origin = req.headers.get("Origin");
    if (origin) {
      const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
      if (!allowed.includes(origin)) return new Response("forbidden origin", { status: 403 });
    }

    const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
    return stub.fetch(req);
  },
};
