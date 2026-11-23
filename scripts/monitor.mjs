#!/usr/bin/env node
// pnpm monitor — server restarts on code changes (tsx watch) + client HMR (vite dev); opens the browser once.
// Keys in this terminal: o opens the page again (when you closed the browser), q or Ctrl-C stops.
// Uses a persisted token (~/.agent-office/dev-token) so the open tab keeps working across server restarts.
import { spawn, execFile } from "node:child_process";
import { createInterface, emitKeypressEvents } from "node:readline";

const noOpen = process.argv.includes("--no-open");
const port = process.env.AO_PORT ?? "4317";
const env = { ...process.env, AO_PORT: port };
const bin = (n) => new URL(`../node_modules/.bin/${n}`, import.meta.url).pathname;

const server = spawn(bin("tsx"), ["watch", "--clear-screen=false", "server/index.ts", "--stable-token"], { env, stdio: ["ignore", "pipe", "inherit"] });
const client = spawn(bin("vite"), ["--strictPort"], { env, stdio: ["ignore", "inherit", "inherit"] }); // stdin stays ours: the keys below are for this script, not for vite

let opened = false;
let url = null; // the page, known once the server printed its token
const openBrowser = () => {
  if (!url) { console.log("Monitor: the server is not ready yet, try again in a moment"); return; }
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd, args, () => {});
};
createInterface({ input: server.stdout }).on("line", (line) => {
  console.log(line);
  const m = /SparkBots: http:\/\/127\.0\.0\.1:\d+\/\?t=([0-9a-f]+)/.exec(line);
  if (m && !opened) {
    opened = true;
    url = `http://127.0.0.1:5173/?t=${m[1]}`;
    console.log(`\nMonitor: open ${url}  (client HMR; server restarts on change)`);
    if (process.stdin.isTTY) console.log("Monitor: press  o  to open the page again (if you closed the browser),  q  to quit\n"); else console.log("");
    if (!noOpen) openBrowser();
  }
});

// keys in this terminal: o = open the page (again), q or Ctrl-C = stop everything
if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", (str, key) => {
    if ((key && key.ctrl && key.name === "c") || str === "q" || str === "Q") { stop(); process.exit(0); }
    else if (str === "o" || str === "O") openBrowser();
  });
}

const stop = () => { server.kill("SIGTERM"); client.kill("SIGTERM"); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
for (const c of [server, client]) c.on("exit", () => { stop(); process.exit(0); });
