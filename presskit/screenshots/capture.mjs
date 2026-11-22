// Captures the press-kit screenshots from the running app (pnpm monitor) with headless Chrome over the DevTools protocol.
// Usage: node presskit/screenshots/capture.mjs [baseUrl]    (default http://localhost:5173)
// The 3D shots use `?fixture=40` (fake projects "web-shop", "api-gateway"...), so no private project names appear.
// The Board and Stats shots read your real data: Board is filtered to the project "sparkbots", Stats is cropped to the chart (no cost figures, no project names).
// Nothing is sent anywhere: Chrome talks to localhost only. The token is read from ~/.agent-office/dev-token and never printed.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("./", import.meta.url));
const TOKEN = readFileSync(join(homedir(), ".agent-office", "dev-token"), "utf8").trim();
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1600, H = 1000, PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "sb-shots-"))}`,
  `--window-size=${W},${H}`, "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
}
if (!target) throw new Error("Chrome did not start");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.on("open", r));
let id = 0; const waiting = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } });
const send = (method, params = {}) => new Promise((res) => { const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const run = async (js) => (await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.setItem('ao.keymap','0');localStorage.setItem('ao.controller','avatar')}catch(e){}" });

const open = async (query) => { await send("Page.navigate", { url: `${BASE}/?t=${TOKEN}${query}` }); await sleep(9000); };
const shot = async (name, clip) => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 84, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
};
const headerButton = (title) => run(`(()=>{const b=[...document.querySelectorAll('header button')].find(b=>(b.title||'').startsWith(${JSON.stringify(title)}));b&&b.click();return !!b})()`);
const wheel = async (dy, n = 1) => { for (let i = 0; i < n; i++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 500, deltaX: 0, deltaY: dy }); await sleep(60); } };
const _unusedGoRoom = async (label) => {
  await headerButton("Map"); await sleep(900);
  await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}))?.click()`); await sleep(600);
  await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Go there'))?.click()`); await sleep(6500);
  await headerButton("Map"); await sleep(700); // close the dock again
};

const key = async (k) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k }); await sleep(400); };

// 1. the office with fake projects: a story-angle view, then the whole campus
await open("&fixture=40");
await wheel(120, 3); await sleep(3500);
await shot("office-story");
await wheel(300, 5); await sleep(4000);
await shot("campus");
await key("c"); await sleep(2500);

// 2. side panel with the project list
await headerButton("Projects"); await sleep(1500);
await shot("projects-panel");
await headerButton("Projects"); await sleep(800);

// 3. the game room: walk there (hold a movement key), put the camera behind the avatar, then pull back a little
const hold = async (k, ms) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k }); await sleep(ms); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k }); await sleep(600); };
const closeUp = async (name) => { await key("c"); await sleep(2200); await wheel(140, 2); await sleep(2500); await shot(name); };
await hold("s", 3500); await closeUp("game-room");

// 4. real data (note: presskit/screenshots/stats.jpg and map.jpg are currently hand-taken, cropped to the side panel), filtered/cropped: the Board of this project and the Stats charts
await open("");
await headerButton("Board"); await sleep(1500);
await run(`(()=>{const s=document.querySelector('.kb select');if(!s)return;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'sparkbots');s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
await sleep(3500);
await shot("board");
await run(`document.querySelector('[role=dialog] button[aria-label=Close], .dialog button')?.click()`); await sleep(800);
await headerButton("Stats"); await sleep(2500);
await shot("stats", { x: 1160, y: 48, width: 440, height: 470 });

ws.close(); chrome.kill();
