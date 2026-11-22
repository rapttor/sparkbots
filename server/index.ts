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
import { codexDir } from "./adapters/codex/discover";
import { registerRoutes, tasks as taskSig } from "./routes";
import { Hub } from "./sync";
import { nerdSnapshot, startLagSampler } from "./nerd";
import { cleanOldUploads } from "./uploads";
import { listSubagents } from "./adapters/claude-code/subagents";
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
const ping: Hub["changed"] = (k, id) => hub?.changed(k, id);
const runs = registerRoutes(app, company, () => push(), ping);
startLagSampler();
cleanOldUploads();
app.get("/api/nerd", async () => nerdSnapshot({ company, runs, clients: () => wss.clients.size, rev: () => hub?.rev ?? 0 }));
setInterval(() => { if (syncBoard(runs)) ping("board"); }, 3000);
app.get("/*", async (req, reply) => {
  const p = req.url.split("?")[0]; const f = join(dist, p === "/" ? "index.html" : p);
  try { if (!f.startsWith(dist)) throw 0; await stat(f); } catch { return reply.type("text/html").send(await readFile(join(dist, "index.html")).catch(() => "run vite build")); }
  return reply.type(f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html").send(await readFile(f));
});

const wss = new WebSocketServer({ noServer: true });
app.server.on("upgrade", (req, sock, head) => {
  const r = guard(req as never);
  if (!r.ok) { sock.write(`HTTP/1.1 ${r.status} ${r.reason}\r\n\r\n`); return sock.destroy(); }
  wss.handleUpgrade(req, sock, head, (ws: WebSocket) => hub?.hello(ws));
});
let hub: Hub | undefined; // created once the first sessions are loaded
const push = () => { hub?.flush(); };
await company.refreshSessions(); await company.refreshLiveness();
for (const id of company.sessions.keys()) await company.ingest(id, true);
hub = new Hub(wss, company);
company.indexSessions().catch((e) => console.log(`(search index: ${(e as Error).message})`));
setInterval(() => { company.indexSessions().catch(() => {}); }, 60_000);
// Stats are rebuilt every 30 s (unchanged transcripts come from the per-file cache, so only changed sessions are re-read).
let building: Promise<void> | null = null;
const rebuildStats = (): Promise<void> => building ??= company.buildStats()
  .then(() => { push(); ping("stats"); }).catch(() => {}).finally(() => { building = null; }); // a call during a rebuild joins it
app.post("/api/stats/refresh", async () => { await rebuildStats(); return company.stats.snapshot(); }); // the Stats panel's Refresh button
void rebuildStats(); setInterval(() => void rebuildStats(), 30_000);
chokidar.watch(join(claudeDir(), "projects"), { depth: 1, ignoreInitial: true, ignored: /observer-sessions/ })
  .on("add", async () => { await company.refreshSessions(); })
  .on("change", async (f) => {
    if (!f.endsWith(".jsonl")) return;
    await company.refreshSessions(); // updates mtime
    const id = f.split("/").pop()!.replace(".jsonl", ""); await company.ingest(id);
    company.tickAll(); push(); ping("messages", id);
  });
chokidar.watch(join(codexDir(), "sessions"), { depth: 4, ignoreInitial: true })
  .on("add", async (f) => {
    if (!f.endsWith(".jsonl")) return;
    await company.refreshSessions();
    const s = [...company.sessions.values()].find((x) => x.file === f); if (!s) return;
    await company.ingest(s.id); company.tickAll(); push(); ping("messages", s.id);
  })
  .on("change", async (f) => {
    if (!f.endsWith(".jsonl")) return;
    await company.refreshSessions();
    const s = [...company.sessions.values()].find((x) => x.file === f); if (!s) return;
    await company.ingest(s.id); company.tickAll(); push(); ping("messages", s.id);
  });
// OpenCode is a live local database rather than files: poll it a few times a minute and ingest only what changed.
setInterval(async () => {
  try {
    const changed = await company.refreshOpenCodeSessions();
    if (!changed.length) return;
    for (const id of changed) await company.ingest(id);
    company.tickAll(); push(); for (const id of changed) ping("messages", id);
  } catch { /* database busy or half-written: try again next tick */ }
}, 3000);

// Slices browsers fetch themselves: ping when a cheap signature changes.
const sigs = { history: -1, live: "", tasks: "", stats: "", subs: "" };
setInterval(async () => {
  await company.refreshLiveness(); company.tickAll(); push();
  if (company.history.version !== sigs.history) { sigs.history = company.history.version; ping("history"); }
  const live = JSON.stringify([...company.live.entries()].map(([k, i]) => [k, i.pid, i.kind]));
  if (live !== sigs.live) { sigs.live = live; ping("processes"); }
}, 2000);
setInterval(() => {
  const t = taskSig.fn(); if (t !== sigs.tasks) { sigs.tasks = t; ping("tasks"); }
  const st = JSON.stringify(company.stats.snapshot()); if (st !== sigs.stats) { sigs.stats = st; ping("stats"); }
  const subs = JSON.stringify([...company.sessions.values()].filter((s) => s.source === "claude" && s.mtimeMs > Date.now() - 24 * 3_600_000).map((s) => [s.id, listSubagents(s.file).map((x) => [x.id, x.finished, Math.floor(x.mtimeMs / 15_000)])]));
  if (subs !== sigs.subs) { sigs.subs = subs; ping("subagents"); }
}, 10_000);

await app.listen({ host: "127.0.0.1", port: cfg.port });
const url = `http://127.0.0.1:${cfg.port}/?t=${token}`;
console.log(`SparkBots: ${url}`);
if (argv.includes("--open")) { // argv array, no shell; URL is our own loopback address
  const [bin, args]: [string, string[]] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(bin, args, (err) => { if (err) console.log(`(could not open a browser: ${err.message})`); });
}
