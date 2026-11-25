import { DurableObject } from "cloudflare:workers";

// One Room instance per room code. Uses the WebSocket Hibernation API so idle rooms cost ~nothing.
//
// Protocol (JSON text frames):
//   client -> relay  hello {key, name, color, ghost?}   first message, within 5 s, else the socket is closed
//                    pos {x,y,z,r} | say {text} | ghost {on} | report {id} | bye {text?}   (bye = I am leaving on purpose)
//   relay -> client  welcome {id, peers[], ghosts[]} | join {peer} | pos | say | leave {id, ghost?} | replaced
//   close codes      4000 replaced, 4001 no hello, 4002 bad key, 4003 banned, 4004 flood
//
// Identity: the client keeps a random secret and sends it in `hello` (never in the URL, so it is not
// logged). The relay stores only SHA-256(secret) as the peer id, so nobody can pose as someone else
// without their secret, and there are no accounts. A second connection with the same secret replaces
// the first (two tabs). When someone leaves they may leave a "ghost" (last place, time, kind) that stays
// until they return or it expires. The kind says how they left: `message` (they said goodbye with a message,
// which is the ghost's text), `plain` (goodbye without a message), `broken` (the socket just closed, e.g. the
// window was closed: no text, drawn as a broken figure). The last chat bubble is never used as ghost text.
//
// Abuse limits (the lobby is public): per-IP sockets, per-IP connect rate, per-IP bubble budget, a frame
// flood cutoff, text/name hygiene, reports, and bans by id or IP hash. The IP is only ever kept as a short
// hash, in memory or in the ban list, and is never sent to clients.

// The look every player chose in their own SparkBots (Settings > 3D office). Only these values are accepted,
// so a hello cannot smuggle arbitrary text or huge strings into what other people render.
const AVATARS = ["developer", "raptor", "spark"];
const TOPS = ["turtleneck", "tshirt", "hoodie", "plaid"];
const LOGOS = ["", "🦖", "🤖", "👾", "🚀", "🔥", "⚡", "🧠", "💾", "🎮", "☕", "🍕", "🐱", "🐶", "🦄", "👑", "🌈", "💡"];
interface Look { top: string; topColor: string; logo: string; glasses: boolean; beard: boolean; overweight: boolean }
const DEFAULT_LOOK: Look = { top: "tshirt", topColor: "#f4f6fa", logo: "🦖", glasses: true, beard: true, overweight: true };
const cleanLook = (o: any): Look => ({
  top: TOPS.includes(o?.top) ? o.top : DEFAULT_LOOK.top,
  topColor: /^#[0-9a-fA-F]{6}$/.test(o?.topColor ?? "") ? o.topColor : DEFAULT_LOOK.topColor,
  logo: LOGOS.includes(o?.logo) ? o.logo : DEFAULT_LOOK.logo,
  glasses: typeof o?.glasses === "boolean" ? o.glasses : DEFAULT_LOOK.glasses,
  beard: typeof o?.beard === "boolean" ? o.beard : DEFAULT_LOOK.beard,
  overweight: typeof o?.overweight === "boolean" ? o.overweight : DEFAULT_LOOK.overweight,
});

interface Peer {
  id: string; // "" until hello is accepted
  avatar: string;
  look: Look;
  ip: string; // short hash of the client IP, never sent to clients
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
  lastReport: number;
  ghost: boolean; // leave a ghost behind on exit
  bye?: { text: string }; // set when the client said goodbye on purpose
  replaced?: boolean;
  gone?: boolean;
}

type GhostKind = "message" | "plain" | "broken";

interface Ghost {
  id: string;
  kind: GhostKind;
  avatar: string;
  look: Look;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  r: number;
  text: string;
  leftAt: number;
}

interface Report {
  id: string;
  name: string;
  text: string;
  ip: string;
  by: string[]; // distinct reporter ids
  first: number;
  last: number;
}

export interface RoomEnv {
  // Optional overrides (wrangler vars or --var), strings.
  MAX_PER_IP?: string;
  CONNECTS_PER_MIN?: string;
  SAYS_PER_IP_10S?: string;
  MAX_FRAMES_PER_SEC?: string;
}

const MAX_PEERS = 50;
const MAX_MESSAGE_BYTES = 512;
const MAX_TEXT = 80;
const MIN_POS_INTERVAL_MS = 40; // ~25 Hz cap
const MIN_SAY_INTERVAL_MS = 1000;
const MIN_REPORT_INTERVAL_MS = 5000;
const HELLO_TIMEOUT_MS = 5000;
const GHOST_TTL_MS = 7 * 24 * 3600 * 1000;
const BROKEN_TTL_MS = 2 * 24 * 3600 * 1000; // a broken figure fades sooner
const REPORT_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_GHOSTS = 30;
const MAX_REPORTERS = 50;
const DEFAULT_COLOR = "#4fc3f7";
const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/;
const ID_RE = /^[0-9a-f]{16}$/;
const LINK_RE = /https?:\/\/|www\./i;
const RESERVED = /^(admin|administrator|mod|moderator|system|staff|owner|support|sparkbots|rapttor|unity|claude|anthropic)$/;

const limit = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Strip control, invisible and bidi-override characters, collapse whitespace; text is rendered as plain
// text by clients, never HTML.
// Code point ranges: C0/C1 controls, zero-width and bidi marks, line/paragraph separators and bidi
// overrides/isolates, word joiner and invisible operators, BOM.
const INVISIBLE: [number, number][] = [[0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202f], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const visible = (ch: string): boolean => {
  const cp = ch.codePointAt(0) ?? 0;
  return !INVISIBLE.some(([a, b]) => cp >= a && cp <= b);
};
// Whitespace is collapsed before stripping (tabs/newlines become spaces instead of being glued together)
// and again after, because removing an invisible character can leave two spaces side by side.
const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? [...s.replace(/\s+/g, " ")].filter(visible).join("").replace(/\s+/g, " ").trim().slice(0, max) : "";

const cleanName = (s: unknown): string => {
  const n = clean(s, 24);
  if (!n || LINK_RE.test(n) || RESERVED.test(n.toLowerCase().replace(/[^a-z0-9]/g, ""))) return "Guest";
  return n;
};

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1e4, Math.min(1e4, n)) : 0);

const att = (ws: WebSocket): Peer | null => (ws.deserializeAttachment() as Peer | null) ?? null;

const publicPeer = (p: Peer) => ({ id: p.id, avatar: p.avatar, look: p.look, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, r: p.r });

const toGhost = (p: Peer): Ghost => ({
  id: p.id, avatar: p.avatar, look: p.look, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, r: p.r, leftAt: Date.now(),
  kind: p.bye ? (p.bye.text ? "message" : "plain") : "broken",
  text: p.bye?.text ?? "",
});
const ghostTtl = (g: Ghost): number => (g.kind === "broken" ? BROKEN_TTL_MS : GHOST_TTL_MS);

async function sha(s: string, bytes: number): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Room extends DurableObject<RoomEnv> {
  // In-memory counters. They reset when the object is evicted, which only happens after it has been idle
  // longer than every window below, so nothing is lost.
  private connects = new Map<string, number[]>();
  private says = new Map<string, number[]>();
  private frames = new WeakMap<WebSocket, { t: number; n: number }>();

  async fetch(req: Request): Promise<Response> {
    const now = Date.now();
    // The Worker overwrites this header from CF-Connecting-IP; clients cannot set it.
    const ip = await sha(req.headers.get("X-Client-IP") ?? "unknown", 6);

    if (await this.banned("ip", ip)) return new Response("banned", { status: 403 });

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PEERS) return new Response("room full", { status: 403 });

    const open = sockets.filter((s) => { const p = att(s); return p && p.ip === ip && !p.replaced && !p.gone; }).length;
    if (open >= limit(this.env.MAX_PER_IP, 8)) return new Response("too many connections", { status: 429 });

    const hits = (this.connects.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= limit(this.env.CONNECTS_PER_MIN, 40)) return new Response("slow down", { status: 429 });
    hits.push(now);
    this.connects.set(ip, hits);
    if (this.connects.size > 500) for (const [k, v] of this.connects) if (now - v[v.length - 1] > 60_000) this.connects.delete(k);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const pending: Peer = { id: "", avatar: "developer", look: DEFAULT_LOOK, ip, name: "Guest", color: DEFAULT_COLOR, x: 0, y: 0, z: 0, r: 0, text: "", at: now, lastPos: 0, lastSay: 0, lastReport: 0, ghost: true };
    server.serializeAttachment(pending);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + HELLO_TIMEOUT_MS);

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
    const now = Date.now();

    // Flood cutoff: far more frames per second than a client ever needs.
    const f = this.frames.get(ws) ?? { t: now, n: 0 };
    if (now - f.t >= 1000) { f.t = now; f.n = 0; }
    f.n++;
    this.frames.set(ws, f);
    if (f.n > limit(this.env.MAX_FRAMES_PER_SEC, 100)) {
      try { ws.close(4004, "flood"); } catch { /* already closed */ }
      return;
    }

    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    const peer = att(ws);
    if (!peer) return;
    if (!peer.id) {
      if (msg?.t === "hello") await this.hello(ws, peer, msg);
      return; // nothing else is accepted before hello
    }

    if (msg?.t === "pos") {
      if (now - peer.lastPos < MIN_POS_INTERVAL_MS) return;
      Object.assign(peer, { x: num(msg.x), y: num(msg.y), z: num(msg.z), r: num(msg.r), lastPos: now });
      ws.serializeAttachment(peer);
      this.broadcast({ t: "pos", id: peer.id, x: peer.x, y: peer.y, z: peer.z, r: peer.r }, ws);
    } else if (msg?.t === "say") {
      if (now - peer.lastSay < MIN_SAY_INTERVAL_MS) return;
      const text = clean(msg.text, MAX_TEXT);
      if (!text || LINK_RE.test(text)) return; // links are spam in a public lobby, and bubbles are not clickable anyway
      // A new secret per connection must not be a way around the per-peer limit.
      const recent = (this.says.get(peer.ip) ?? []).filter((t) => now - t < 10_000);
      if (recent.length >= limit(this.env.SAYS_PER_IP_10S, 8)) return;
      recent.push(now);
      this.says.set(peer.ip, recent);
      peer.lastSay = now;
      peer.text = text;
      ws.serializeAttachment(peer);
      this.broadcast({ t: "say", id: peer.id, text }, ws);
    } else if (msg?.t === "ghost") {
      peer.ghost = msg.on !== false; // "Clear my ghost": off means nothing is left behind when I leave
      ws.serializeAttachment(peer);
    } else if (msg?.t === "report") {
      await this.report(ws, peer, msg.id, now);
    } else if (msg?.t === "bye") {
      // Goodbye on purpose. The optional text follows the bubble rules (plain text, no links, per-IP budget); if it is
      // refused the person still leaves a plain ghost.
      let text = clean(msg.text, MAX_TEXT);
      if (text && LINK_RE.test(text)) text = "";
      if (text) {
        const recent = (this.says.get(peer.ip) ?? []).filter((t) => now - t < 10_000);
        if (recent.length >= limit(this.env.SAYS_PER_IP_10S, 8)) text = "";
        else { recent.push(now); this.says.set(peer.ip, recent); }
      }
      peer.bye = { text };
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
    const id = await sha(msg.key, 8);
    if (await this.banned("id", id)) {
      ws.close(4003, "banned");
      return;
    }
    peer.id = id;
    peer.avatar = AVATARS.includes(msg.avatar) ? msg.avatar : "developer";
    peer.look = cleanLook(msg.look);
    peer.name = cleanName(msg.name);
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
    for (const g of all.values()) g.kind ??= "plain"; // ghosts stored before kinds existed
    const live: Ghost[] = [];
    const drop: string[] = [];
    for (const [key, g] of all) {
      if (now - g.leftAt > ghostTtl(g)) drop.push(key);
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

  // ---- reports and bans

  private async report(ws: WebSocket, peer: Peer, target: unknown, now: number): Promise<void> {
    if (now - peer.lastReport < MIN_REPORT_INTERVAL_MS) return;
    if (typeof target !== "string" || !ID_RE.test(target) || target === peer.id) return;
    peer.lastReport = now;
    ws.serializeAttachment(peer);

    const live = this.ctx.getWebSockets().map(att).find((p) => p?.id === target);
    const key = "r:" + target;
    const r = (await this.ctx.storage.get<Report>(key)) ?? { id: target, name: "", text: "", ip: "", by: [], first: now, last: now };
    if (live) { r.name = live.name; r.text = live.text; r.ip = live.ip; }
    if (!r.by.includes(peer.id) && r.by.length < MAX_REPORTERS) r.by.push(peer.id);
    r.last = now;
    await this.ctx.storage.put(key, r);
  }

  // expiry 0 means permanent
  private async banned(kind: "id" | "ip", key: string): Promise<boolean> {
    const exp = await this.ctx.storage.get<number>(`b:${kind}:${key}`);
    if (exp === undefined) return false;
    if (exp !== 0 && exp < Date.now()) {
      await this.ctx.storage.delete(`b:${kind}:${key}`);
      return false;
    }
    return true;
  }

  // Remove a peer without a ghost and tell the room.
  private kick(ws: WebSocket, peer: Peer): void {
    peer.gone = true;
    try { ws.serializeAttachment(peer); } catch { /* closed */ }
    if (peer.id) this.broadcast({ t: "leave", id: peer.id }, ws);
    try { ws.close(4003, "banned"); } catch { /* closed */ }
  }

  // ---- admin (called by the Worker over RPC after it checked the token; not reachable from a client socket)

  async adminPeers() {
    return this.ctx
      .getWebSockets()
      .map(att)
      .filter((p): p is Peer => !!p && !!p.id && !p.replaced && !p.gone)
      .map((p) => ({ id: p.id, name: p.name, ip: p.ip, since: p.at, text: p.text }));
  }

  async adminReports() {
    const all = await this.ctx.storage.list<Report>({ prefix: "r:" });
    const now = Date.now();
    const out: (Report & { count: number })[] = [];
    for (const [key, r] of all) {
      if (now - r.last > REPORT_TTL_MS) await this.ctx.storage.delete(key);
      else out.push({ ...r, count: r.by.length });
    }
    return out.sort((a, b) => b.count - a.count || b.last - a.last).map(({ by, ...rest }) => rest);
  }

  async adminBans() {
    const all = await this.ctx.storage.list<number>({ prefix: "b:" });
    const now = Date.now();
    const out: { kind: string; key: string; expires: number }[] = [];
    for (const [key, exp] of all) {
      if (exp !== 0 && exp < now) await this.ctx.storage.delete(key);
      else { const [, kind, k] = key.split(":"); out.push({ kind, key: k, expires: exp }); }
    }
    return out;
  }

  // minutes 0 = permanent. `alsoIp` also bans the IP hash the id was last seen on (use sparingly: shared IPs).
  async adminBan(id: string, minutes: number, alsoIp: boolean) {
    if (!ID_RE.test(id)) return { ok: false, error: "bad id" };
    const expires = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
    let ip = "";
    for (const s of this.ctx.getWebSockets()) {
      const p = att(s);
      if (p?.id === id) { ip = p.ip; this.kick(s, p); }
    }
    if (!ip) ip = (await this.ctx.storage.get<Report>("r:" + id))?.ip ?? "";
    await this.ctx.storage.put(`b:id:${id}`, expires);
    await this.ctx.storage.delete("g:" + id);
    if (alsoIp && ip) {
      await this.ctx.storage.put(`b:ip:${ip}`, expires);
      for (const s of this.ctx.getWebSockets()) {
        const p = att(s);
        if (p && p.ip === ip && !p.gone) this.kick(s, p);
      }
    }
    return { ok: true, id, ip: alsoIp ? ip : undefined, expires };
  }

  // key is a peer id (16 hex) or an IP hash (12 hex)
  async adminUnban(key: string) {
    if (!/^[0-9a-f]{12,16}$/.test(key)) return { ok: false, error: "bad key" };
    await this.ctx.storage.delete([`b:id:${key}`, `b:ip:${key}`]);
    return { ok: true };
  }
}
