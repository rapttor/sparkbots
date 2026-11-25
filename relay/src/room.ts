import { DurableObject } from "cloudflare:workers";

// One Room instance per room code. Uses the WebSocket Hibernation API so idle rooms cost ~nothing.

interface Peer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  r: number; // facing, radians
  lastPos: number; // ms, rate limiting
  lastSay: number;
}

const MAX_PEERS = 50;
const MAX_MESSAGE_BYTES = 512;
const MAX_TEXT = 80;
const MIN_POS_INTERVAL_MS = 40; // ~25 Hz cap
const MIN_SAY_INTERVAL_MS = 1000;

// Strip control chars and trim; text is rendered as plain text by clients, never HTML.
const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1e4, Math.min(1e4, n)) : 0);

const publicPeer = ({ lastPos, lastSay, ...rest }: Peer) => rest;

export class Room extends DurableObject {
  async fetch(req: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_PEERS) return new Response("room full", { status: 403 });

    const q = new URL(req.url).searchParams;
    const peer: Peer = {
      id: crypto.randomUUID().slice(0, 8),
      name: clean(q.get("name"), 24) || "Guest",
      color: /^#[0-9a-fA-F]{6}$/.test(q.get("color") ?? "") ? (q.get("color") as string) : "#4fc3f7",
      x: 0, y: 0, z: 0, r: 0,
      lastPos: 0, lastSay: 0,
    };

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(peer);

    const others = this.ctx
      .getWebSockets()
      .filter((s) => s !== server)
      .map((s) => publicPeer(s.deserializeAttachment() as Peer));
    server.send(JSON.stringify({ t: "welcome", id: peer.id, peers: others }));
    this.broadcast({ t: "join", peer: publicPeer(peer) }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    const peer = ws.deserializeAttachment() as Peer;
    const now = Date.now();

    if (msg?.t === "pos") {
      if (now - peer.lastPos < MIN_POS_INTERVAL_MS) return;
      Object.assign(peer, { x: num(msg.x), y: num(msg.y), z: num(msg.z), r: num(msg.r), lastPos: now });
      ws.serializeAttachment(peer);
      this.broadcast({ t: "pos", id: peer.id, x: peer.x, y: peer.y, z: peer.z, r: peer.r }, ws);
    } else if (msg?.t === "say") {
      if (now - peer.lastSay < MIN_SAY_INTERVAL_MS) return;
      const text = clean(msg.text, MAX_TEXT);
      if (!text) return;
      peer.lastSay = now;
      ws.serializeAttachment(peer);
      this.broadcast({ t: "say", id: peer.id, text }, ws);
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    this.leave(ws);
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* already closed */ }
  }

  webSocketError(ws: WebSocket): void {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    const peer = ws.deserializeAttachment() as Peer | null;
    if (peer) this.broadcast({ t: "leave", id: peer.id }, ws);
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) {
      if (s !== except) {
        try { s.send(data); } catch { /* socket is closing */ }
      }
    }
  }
}
