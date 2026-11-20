import Fastify from "fastify";
import { WebSocketServer, type WebSocket } from "ws";
import chokidar from "chokidar";
import { join, dirname, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig, loadTeams } from "./config";
import { checkRequest, makeToken, stableToken } from "./security";
import { execFile } from "node:child_process";
import { Company } from "./model/company";
import { claudeDir } from "./adapters/claude-code/discover";
import { registerRoutes } from "./routes";
import { sync as syncBoard } from "./board/routes";

import { runCli } from "./cli";
import { hookToken } from "./adapters/claude-code/hooks";
if (await runCli(process.argv.slice(2))) process.exit(0);

const cfg = loadConfig();
const argv = process.argv.slice(2);
const token = process.env.AO_TOKEN ?? (argv.includes("--stable-token") ? stableToken() : makeToken());
const company = new Company(cfg, loadTeams());
const app = Fastify();
const guard = (req: { headers: Record<string, string | string[] | undefined>; url?: string }) => {
  const url = new URL(req.url ?? "/", "http://x");
  const h = (k: string) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
  return checkRequest({ host: h("host"), origin: h("origin"), token: url.searchParams.get("t") ?? h("x-ao-token") }, { port: cfg.port, token });
};

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
app.addHook("onRequest", async (req, reply) => {
  const isApi = req.url.startsWith("/api") || req.url.startsWith("/hook");
  // Static shell may load without a token (it holds none); every API call needs it. Host check applies to all.
  if (req.url.startsWith("/hook")) { // hooks use their own stable token; Host/Origin still enforced
    const h = req.headers; const r = checkRequest({ host: h.host, origin: h.origin, token: h["x-ao-token"] as string | undefined }, { port: cfg.port, token: hookToken() });
    if (!r.ok) return reply.code(r.status).send({ error: r.reason });
    return;
  }
  const r = guard(req as never);
  if (!r.ok && (isApi || r.status === 403)) return reply.code(r.status).send({ error: r.reason });
});
app.get("/api/snapshot", async () => company.snapshot());
app.get("/api/stats", async () => company.stats.snapshot());
const runs = registerRoutes(app, company, () => push());
setInterval(() => syncBoard(runs), 3000);
app.get("/*", async (req, reply) => {
  const p = req.url.split("?")[0]; const f = join(dist, p === "/" ? "index.html" : p);
  try { if (!f.startsWith(dist)) throw 0; await stat(f); } catch { return reply.type("text/html").send(await readFile(join(dist, "index.html")).catch(() => "run vite build")); }
  return reply.type(f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html").send(await readFile(f));
});

const wss = new WebSocketServer({ noServer: true });
app.server.on("upgrade", (req, sock, head) => {
  const r = guard(req as never);
  if (!r.ok) { sock.write(`HTTP/1.1 ${r.status} ${r.reason}\r\n\r\n`); return sock.destroy(); }
  wss.handleUpgrade(req, sock, head, (ws: WebSocket) => ws.send(JSON.stringify(company.snapshot())));
});
let last = "";
const push = () => {
  const s = company.snapshot(); const body = JSON.stringify({ ...s, at: 0 });
  if (body === last) return; last = body;
  const msg = JSON.stringify(s);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};

await company.refreshSessions(); await company.refreshLiveness();
for (const id of company.sessions.keys()) await company.ingest(id, true);
company.buildStats().catch(() => {});
chokidar.watch(join(claudeDir(), "projects"), { depth: 1, ignoreInitial: true, ignored: /observer-sessions/ })
  .on("add", async () => { await company.refreshSessions(); })
  .on("change", async (f) => {
    if (!f.endsWith(".jsonl")) return;
    await company.refreshSessions(); // updates mtime
    const id = f.split("/").pop()!.replace(".jsonl", ""); await company.ingest(id);
    company.tickAll(); push();
  });
setInterval(async () => { await company.refreshLiveness(); company.tickAll(); push(); }, 2000);

await app.listen({ host: "127.0.0.1", port: cfg.port });
const url = `http://127.0.0.1:${cfg.port}/?t=${token}`;
console.log(`SparkBots: ${url}`);
if (argv.includes("--open")) { // argv array, no shell; URL is our own loopback address
  const [bin, args]: [string, string[]] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(bin, args, (err) => { if (err) console.log(`(could not open a browser: ${err.message})`); });
}
