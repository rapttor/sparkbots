// Captures the Unity (and pod) screenshots for the README from an ISOLATED sandbox: an empty HOME and AO_HOME (so no real session,
// project or chat can appear), its own ports (4398 / 5398) and a fixed token. The office uses `?fixture=40` (demo projects) and Unity
// uses the client-only demo crowd `?unitycrowd=N` (made-up players and ghosts, no network). Nothing is sent anywhere.
//
//   node presskit/screenshots/capture-unity.mjs            (needs Google Chrome; set CHROME=/path/to/chrome elsewhere)
//
// Writes presskit/screenshots/unity-*.jpg. Look at every image before publishing it.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./", import.meta.url));
const TOKEN = "5a17e5d0c0ffee00112233445566778899aabbcc";
const API = 4398, DEV = 5398, CDP = 9334, W = 1600, H = 1000;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2]; // optional: run one scene (pod | panel | lobby | town | front | boxing | goodbye)

const sandbox = mkdtempSync(join(tmpdir(), "sb-readme-"));
const kids = [];
const stopAll = () => { for (const k of kids) { try { k.kill(); } catch { /* gone */ } } };
process.on("exit", stopAll);
process.on("SIGINT", () => { stopAll(); process.exit(1); });

// 1. the isolated app
kids.push(spawn(process.execPath, ["scripts/monitor.mjs", "--no-open"], {
  cwd: ROOT, stdio: "ignore",
  env: { ...process.env, HOME: sandbox, AO_HOME: join(sandbox, "ao"), AO_PORT: String(API), AO_DEV_PORT: String(DEV), AO_TOKEN: TOKEN },
}));
for (let i = 0; ; i++) {
  if (i > 120) throw new Error("the sandbox app did not start");
  try { if ((await fetch(`http://127.0.0.1:${DEV}/api/config?t=${TOKEN}`)).ok) break; } catch { /* not up yet */ }
  await sleep(1000);
}

// 2. headless Chrome over the DevTools protocol
kids.push(spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "sb-chrome-"))}`,
  `--window-size=${W},${H}`, "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank",
], { stdio: "ignore" }));
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
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

// helpers
const waitFor = async (js, ms = 90_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await run(js)) return true; await sleep(700); } return false; };
const load = async (query, ready) => { await send("Page.navigate", { url: `http://127.0.0.1:${DEV}/?t=${TOKEN}${query}` }); await waitFor(ready); await sleep(7000); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 }); writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(r.result.data, "base64")); console.log("saved", name); };
const headerButton = (title) => run(`(()=>{const b=[...document.querySelectorAll('header button')].find(b=>(b.title||'').startsWith(${JSON.stringify(title)}));b&&b.click();return !!b})()`);
const wheel = async (dy, n = 1) => { for (let i = 0; i < n; i++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 800, y: 430, deltaX: 0, deltaY: dy }); await sleep(80); } };
const hold = async (key, ms) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key }); await sleep(ms); await send("Input.dispatchKeyEvent", { type: "keyUp", key }); };
const goto = (x, z) => run(`window.dispatchEvent(new CustomEvent("unity-goto",{detail:{x:${x},z:${z}}}))`);
const inLobby = "document.body.innerText.includes('public lobby')";
const want = (name) => !only || only === name;

// A. the office: the pod, and the Unity panel with its opt-in text (demo projects only)
if (want("pod") || want("panel")) {
  await load("&fixture=40", "document.body.innerText.includes('Connected')");
  await wheel(120, 3); await sleep(4000); // pull back from the owner so the office shows behind the panel (more flips to the label-only overview)
  if (want("panel")) { await headerButton("Unity"); await sleep(2500); await shot("unity-panel"); await headerButton("Unity"); await sleep(800); }
  if (want("pod")) {
    await headerButton("Map"); await sleep(1200);
    const found = await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Unity')&&!b.closest('header'));b&&b.click();return !!b})()`);
    await sleep(700);
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Go there'))?.click()`); await sleep(7000);
    await wheel(120, 2); await sleep(4000); // the camera lands on the pod: back off a little to see it from outside
    await headerButton("Map"); await sleep(900);
    if (found) await shot("unity-pod"); else console.warn("pod: the Unity room was not in the map list");
  }
}

// B. the lobby: a small crowd around the phone booth
if (want("lobby")) { await load("&unitycrowd=14", inLobby); await shot("unity-lobby"); }

// C. the town from above (a busy room): rings with two or more people turn gold
if (want("town") || want("front") || want("boxing") || want("goodbye")) {
  await load("&unitycrowd=40", inLobby);
  await wheel(100, 9); await sleep(6000);
  if (want("town")) {
    await waitFor("document.body.innerText.includes('chatting')", 45_000); await sleep(1500);
    await shot("unity-town");
  }
  // the front of the amenities on the south side: turn the view round and stand between the booth and the copier
  if (want("front")) {
    await goto(0, 6.2); await sleep(9000);
    await hold("]", 3300); await sleep(500); await wheel(-100, 4); await sleep(6000);
    await shot("unity-front");
  }
  if (only === "boxing") {
    await goto(-6.8, 3.2); await sleep(9000);
    await shot("unity-boxing");
  }
  if (want("goodbye")) {
    await run(`window.dispatchEvent(new Event("unity-exit"))`); await sleep(1500);
    await run(`(()=>{const i=document.querySelector('input[aria-label="Message to leave"]');if(!i)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Gone for lunch, back soon');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await sleep(900);
    await shot("unity-goodbye");
  }
}

ws.close();
stopAll();
process.exit(0);
