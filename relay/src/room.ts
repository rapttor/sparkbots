import { DurableObject } from "cloudflare:workers";

// One Room instance per room code. Uses the WebSocket Hibernation API so idle rooms cost ~nothing.
//
// Protocol (JSON text frames):
//   client -> relay  hello {key, name, color, ghost?}   first message, within 5 s, else the socket is closed
//                    pos {x,y,z,r} | say {text} | ghost {on}
//   relay -> client  welcome {id, peers[], ghosts[]} | join {peer} | pos | say | leave {id, ghost?} | replaced
//
// Identity: the client keeps a random secret and sends it in `hello` (never in the URL, so it is not
// logged). The relay stores only SHA-256(secret) as the peer id, so nobody can pose as someone else
// without their secret, and there are no accounts. A second connection with the same secret replaces
// the first (two tabs). When someone leaves they may leave a "ghost" (last place, last bubble, time)
// that stays for GHOST_TTL_MS or until they return.

interface Peer {
  id: string; // "" until hello is accepted
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  r: number; // facing, radians
  text: string; // last bubble, kept for the ghost
  at: number; // connected at (ms), for the hello timeout
  lastPos: number; // ms, rate limiting
  lastSay: number;
  ghost: boolean; // leave a ghost behind on exit
  replaced?: boolean;
  gone?: boolean;
}

interface Ghost {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  r: number;
  text: string;
  leftAt: number;
}

const MAX_PEERS = 50;
const MAX_MESSAGE_BYTES = 512;
const MAX_TEXT = 80;
const MIN_POS_INTERVAL_MS = 40; // ~25 Hz cap
const MIN_SAY_INTERVAL_MS = 1000;
const HELLO_TIMEOUT_MS = 5000;
const GHOST_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_GHOSTS = 30;
const DEFAULT_COLOR = "#4fc3f7";
const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;

// Strip control chars and trim; text is rendered as plain text by clients, never HTML.
const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1e4, Math.min(1e4, n)) : 0);

const att = (ws: WebSocket): Peer | null => (ws.deserializeAttachment() as Peer | null) ?? null;

const publicPeer = (p: Peer) => ({ id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, r: p.r });

const toGhost = (p: Peer): Ghost => ({ id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, r: p.r, text: p.text, leftAt: Date.now() });

async function idFor(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Room extends DurableObject {
  async fetch(_req: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_PEERS) return new Response("room full", { status: 403 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const pending: Peer = { id: "", name: "Guest", color: DEFAULT_COLOR, x: 0, y: 0, z: 0, r: 0, text: "", at: Date.now(), lastPos: 0, lastSay: 0, ghost: true };
    server.serializeAttachment(pending);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + HELLO_TIMEOUT_MS);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Close sockets that never sent a valid hello.
  async alarm(): Promise<void> {
    const now = Date.now();
    let stillPending = false;
    for (const s of this.ctx.getWebSockets()) {
      const p = att(s);
      if (p && !p.id) {
        if (now - p.at >= HELLO_TIMEOUT_MS) {
          try { s.close(4001, "hello timeout"); } catch { /* already closed */ }
        } else stillPending = true;
      }
    }
    if (stillPending) await this.ctx.storage.setAlarm(now + 1000);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    const peer = att(ws);
    if (!peer) return;
    if (!peer.id) {
      if (msg?.t === "hello") await this.hello(ws, peer, msg);
      return; // nothing else is accepted before hello
    }

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
      peer.text = text;
      ws.serializeAttachment(peer);
      this.broadcast({ t: "say", id: peer.id, text }, ws);
    } else if (msg?.t === "ghost") {
      peer.ghost = msg.on !== false; // "Clear my ghost": off means nothing is left behind when I leave
      ws.serializeAttachment(peer);
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.leave(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  private async hello(ws: WebSocket, peer: Peer, msg: any): Promise<void> {
    if (typeof msg.key !== "string" || !KEY_RE.test(msg.key)) {
      ws.close(4002, "bad key");
      return;
    }
    peer.id = await idFor(msg.key);
    peer.name = clean(msg.name, 24) || "Guest";
    peer.color = /^#[0-9a-fA-F]{6}$/.test(msg.color ?? "") ? msg.color : DEFAULT_COLOR;
    peer.ghost = msg.ghost !== false;

    // A second connection with the same secret (another tab) replaces the older one: no leave, no ghost.
    for (const s of this.ctx.getWebSockets()) {
      const o = s === ws ? null : att(s);
      if (o && o.id === peer.id) {
        o.replaced = true;
        s.serializeAttachment(o);
        try { s.send(JSON.stringify({ t: "replaced" })); s.close(4000, "replaced"); } catch { /* already closed */ }
      }
    }

    const ghosts = (await this.loadGhosts()).filter((g) => g.id !== peer.id);
    await this.ctx.storage.delete("g:" + peer.id); // being here again removes my own ghost
    ws.serializeAttachment(peer);

    const peers = this.ctx
      .getWebSockets()
      .filter((s) => s !== ws)
      .map(att)
      .filter((p): p is Peer => !!p && !!p.id && p.id !== peer.id && !p.replaced)
      .map(publicPeer);
    ws.send(JSON.stringify({ t: "welcome", id: peer.id, peers, ghosts }));
    this.broadcast({ t: "join", peer: publicPeer(peer) }, ws);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const peer = att(ws);
    if (!peer || !peer.id || peer.replaced || peer.gone) return;
    peer.gone = true;
    try { ws.serializeAttachment(peer); } catch { /* socket already closed */ }

    let ghost: Ghost | undefined;
    if (peer.ghost) {
      ghost = toGhost(peer);
      await this.ctx.storage.put("g:" + peer.id, ghost);
      await this.loadGhosts(); // prunes expired and surplus ghosts
    }
    this.broadcast({ t: "leave", id: peer.id, ...(ghost ? { ghost } : {}) }, ws);
  }

  // Newest first, expired and surplus ghosts deleted.
  private async loadGhosts(): Promise<Ghost[]> {
    const all = await this.ctx.storage.list<Ghost>({ prefix: "g:" });
    const now = Date.now();
    const live: Ghost[] = [];
    const drop: string[] = [];
    for (const [key, g] of all) {
      if (now - g.leftAt > GHOST_TTL_MS) drop.push(key);
      else live.push(g);
    }
    live.sort((a, b) => b.leftAt - a.leftAt);
    for (const g of live.splice(MAX_GHOSTS)) drop.push("g:" + g.id);
    for (let i = 0; i < drop.length; i += 128) await this.ctx.storage.delete(drop.slice(i, i + 128));
    return live;
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      const p = att(s);
      if (!p?.id || p.replaced) continue; // only ready peers hear the room
      try { s.send(data); } catch { /* socket is closing */ }
    }
  }
}
