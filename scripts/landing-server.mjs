#!/usr/bin/env node
// Serves landing.html on http://127.0.0.1:<port>/ with a call-to-action added on the fly: "Open your running SparkBots" (the address of the
// server that is running now, read from ~/.agent-office/session.json) or, when nothing runs, the command to start it. landing.html itself is not
// changed (it is also the public GitHub Pages page). Loopback only; only landing.html and presskit/screenshots|artwork are served.
import { createServer, get } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1]) || 4380;
const home = process.env.AO_HOME ?? join(homedir(), ".agent-office");
const TYPES = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".css": "text/css", ".js": "text/javascript" };

/** The running SparkBots session, or null: the file exists, its address looks right, its process is alive and the server answers. */
async function currentSession() {
  try {
    const s = JSON.parse(readFileSync(join(home, "session.json"), "utf8"));
    if (typeof s.url !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+$/i.test(s.url) || typeof s.pid !== "number") return null;
    try { process.kill(s.pid, 0); } catch (e) { if (e.code !== "EPERM") return null; }
    const ok = await new Promise((res) => { const r = get(`http://127.0.0.1:${s.port}/`, { timeout: 800 }, (x) => { x.resume(); res(x.statusCode === 200); }); r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); }); });
    return ok ? s.url : null;
  } catch { return null; }
}

const CTA = `
<style>
#sb-cta{position:fixed;z-index:2147483000;right:16px;bottom:16px;max-width:min(420px,calc(100vw - 32px));display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;background:#0b1220ee;border:1px solid #c8ff0066;box-shadow:0 10px 30px #000a;color:#e8ecf8;font:14px/1.35 system-ui,sans-serif;backdrop-filter:blur(6px)}
#sb-cta b{display:block;font-size:13px;margin-bottom:2px}#sb-cta small{opacity:.7;font-size:12px}
#sb-cta a.go{flex:none;padding:9px 14px;border-radius:10px;background:#c8ff00;color:#10150a;font-weight:700;text-decoration:none;white-space:nowrap}
#sb-cta a.go:hover{filter:brightness(1.08)}
#sb-cta code{background:#ffffff14;padding:2px 6px;border-radius:6px;font-size:12px}
#sb-cta .dot{flex:none;width:10px;height:10px;border-radius:50%;background:#64748b}#sb-cta.on .dot{background:#34d399;box-shadow:0 0 8px #34d399}
</style>
<div id="sb-cta" role="status"><span class="dot"></span><div><b>Checking for a running SparkBots…</b><small>local, nothing leaves this machine</small></div></div>
<script>
(function () {
  var box = document.getElementById("sb-cta");
  function render(d) {
    if (d.running) {
      box.className = "on";
      box.innerHTML = '<span class="dot"></span><div><b>SparkBots is running on this machine</b><small>Open your current session</small></div><a class="go" href="' + d.url + '">Open SparkBots ▶</a>';
    } else {
      box.className = "";
      box.innerHTML = '<span class="dot"></span><div><b>SparkBots is not running</b><small>Start it with <code>./install.sh</code> (or <code>pnpm start --open</code>), this page notices.</small></div>';
    }
  }
  function poll() { fetch("/__cta", { cache: "no-store" }).then(function (r) { return r.json(); }).then(render).catch(function () {}); }
  poll(); setInterval(poll, 4000);
})();
</script>`;

const hostOk = (h) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;
const server = createServer(async (req, res) => {
  const deny = (code, msg) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(msg); };
  if (!hostOk(req.headers.host)) return deny(403, "bad host");       // DNS rebinding: only our own loopback name
  if (req.method !== "GET" && req.method !== "HEAD") return deny(405, "GET only");
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path === "/__cta") {                                             // no CORS headers: other sites cannot read it
    const url = await currentSession();
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(url ? { running: true, url } : { running: false }));
  }
  if (path === "/" || path === "/index.html") {
    const html = readFileSync(join(root, "landing.html"), "utf8");
    res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
    return res.end(html.includes("</body>") ? html.replace("</body>", `${CTA}</body>`) : html + CTA);
  }
  const m = /^\/presskit\/(screenshots|artwork)\/[^/]+$/.exec(path);
  if (m) {
    const file = normalize(join(root, path));
    const base = join(root, "presskit", m[1]) + sep;
    const type = TYPES[extname(file).toLowerCase()];
    if (file.startsWith(base) && type && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
      return createReadStream(file).pipe(res);
    }
  }
  deny(404, "not found");
});

server.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? `Port ${port} is busy: try  ./landing.sh --port ${port + 1}` : e.message); process.exit(1); });
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Landing page: ${url}   (Ctrl-C stops)`);
  if (argv.includes("--open")) {
    const [bin, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    execFile(bin, args, () => {});
  }
});
