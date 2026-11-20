#!/usr/bin/env node
// pnpm monitor — server restarts on code changes (tsx watch) + client HMR (vite dev); opens the browser once.
// Uses a persisted token (~/.agent-office/dev-token) so the open tab keeps working across server restarts.
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";

const noOpen = process.argv.includes("--no-open");
const port = process.env.AO_PORT ?? "4317";
const env = { ...process.env, AO_PORT: port };
const bin = (n) => new URL(`../node_modules/.bin/${n}`, import.meta.url).pathname;

const server = spawn(bin("tsx"), ["watch", "--clear-screen=false", "server/index.ts", "--stable-token"], { env, stdio: ["ignore", "pipe", "inherit"] });
const client = spawn(bin("vite"), ["--strictPort"], { env, stdio: "inherit" });

let opened = false;
createInterface({ input: server.stdout }).on("line", (line) => {
  console.log(line);
  const m = /SparkBots: http:\/\/127\.0\.0\.1:\d+\/\?t=([0-9a-f]+)/.exec(line);
  if (m && !opened) {
    opened = true;
    const url = `http://127.0.0.1:5173/?t=${m[1]}`;
    console.log(`\nMonitor: open ${url}  (client HMR; server restarts on change)\n`);
    if (!noOpen) {
      const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
      execFile(cmd, args, () => {});
    }
  }
});

const stop = () => { server.kill("SIGTERM"); client.kill("SIGTERM"); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
for (const c of [server, client]) c.on("exit", () => { stop(); process.exit(0); });
