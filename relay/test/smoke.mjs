// Smoke test: identity, presence, bubbles, ghosts, tab replacement and abuse limits.
// Run `pnpm dev` in another terminal first, then `pnpm smoke` (or: node test/smoke.mjs wss://host).
const base = process.argv[2] ?? "ws://127.0.0.1:8787";
const room = "SMOKE" + Math.floor(Math.random() * 1e6);
const mk = () => crypto.randomUUID().replaceAll("-", ""); // 32 chars, like the app's random secret
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(name, key, extra = {}, sendHello = true) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/room/${room}`);
    const inbox = [];
    const waiters = [];
    const c = { ws, inbox, closeCode: null };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.pred(m));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else inbox.push(m);
    };
    ws.onclose = (e) => (c.closeCode = e.code);
    ws.onerror = () => reject(new Error("connect failed"));
    ws.onopen = () => {
      if (sendHello) ws.send(JSON.stringify({ t: "hello", key, name, color: "#ff8800", ...extra }));
      resolve(c);
    };
    c.send = (m) => ws.send(JSON.stringify(m));
    c.next = (pred) =>
      new Promise((res, rej) => {
        const i = inbox.findIndex(pred);
        if (i >= 0) return res(inbox.splice(i, 1)[0]);
        const t = setTimeout(() => rej(new Error("timeout waiting for message")), 4000);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); res(m); } });
      });
    c.quiet = async (pred, ms = 500) => { await sleep(ms); return !inbox.some(pred); };
  });
}

const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const keyA = mk(), keyB = mk(), keyC = mk(), keyD = mk(), keyE = mk();

// --- join, identity
const a = await open("Alice", keyA);
const wa = await a.next((m) => m.t === "welcome");
check("A welcome: no peers, no ghosts", wa.peers.length === 0 && wa.ghosts.length === 0);
check("peer id is a hash, not the secret", wa.id.length === 16 && !keyA.includes(wa.id));

const b = await open("Bob", keyB, { avatar: "raptor", look: { top: "hoodie", topColor: "#102030", logo: "🚀", glasses: false, beard: true, overweight: false } });
const wb = await b.next((m) => m.t === "welcome");
check("B welcome lists Alice, ids differ", wb.peers.length === 1 && wb.peers[0].name === "Alice" && wb.id !== wa.id);
const ja = await a.next((m) => m.t === "join");
check("A is told Bob joined", ja.peer.id === wb.id);
// --- the count behind the pod in the office: a number only, same Origin rule as the sockets, CORS for local pages
const httpBase = base.replace(/^ws/, "http");
const cnt = await fetch(`${httpBase}/room/${room}/count`, { headers: { Origin: "http://127.0.0.1:4317" } });
check("the room count says 2 (Alice and Bob)", cnt.status === 200 && (await cnt.json()).n === 2);
check("the count allows local pages (CORS) and is cached for a short time", cnt.headers.get("access-control-allow-origin") === "http://127.0.0.1:4317" && /max-age=\d+/.test(cnt.headers.get("cache-control") ?? ""));
const foreign = await fetch(`${httpBase}/room/${room}/count`, { headers: { Origin: "https://evil.example" } });
check("the count refuses other websites (403)", foreign.status === 403);
check("the count shows only a number", Object.keys(await (await fetch(`${httpBase}/room/${room}/count`)).json()).join() === "n");

check("the join carries Bob's chosen character", ja.peer.avatar === "raptor" && ja.peer.look.top === "hoodie" && ja.peer.look.logo === "🚀" && ja.peer.look.glasses === false);

// --- before hello nothing is accepted; no hello means the socket is closed
const raw = await open("x", "x", {}, false);
raw.send({ t: "pos", x: 9, y: 9, z: 9, r: 0 });
check("pos before hello is ignored", await a.quiet((m) => m.t === "pos" && m.x === 9, 400));

const bad = await open("Bad", "short");
await sleep(500);
check("hello with a bad key closes the socket (4002)", bad.closeCode === 4002);

// --- presence and bubbles
b.send({ t: "pos", x: 3, y: 0, z: -2, r: 1.5 });
const pos = await a.next((m) => m.t === "pos");
check("A receives Bob's position", pos.id === wb.id && pos.x === 3 && pos.z === -2);

b.send({ t: "say", text: "hello <b>team</b>" });
check("A receives Bob's bubble as plain text", (await a.next((m) => m.t === "say")).text === "hello <b>team</b>");

b.send({ t: "say", text: "spam" }); // within 1 s of the last bubble
check("a second bubble within 1 s is dropped", await a.quiet((m) => m.t === "say", 400));
await sleep(700);
b.send({ t: "say", text: "x".repeat(600) }); // oversized frame, rate window is open
check("an oversized frame is dropped", await a.quiet((m) => m.t === "say", 400));

// --- same secret in a second tab replaces the first, no leave, no ghost
const b2 = await open("Bob", keyB);
const wb2 = await b2.next((m) => m.t === "welcome");
check("same secret gives the same id", wb2.id === wb.id);
await b.next((m) => m.t === "replaced");
check("old tab is told it was replaced", true);
check("replacing a tab sends no leave to the room", await a.quiet((m) => m.t === "leave", 500));
check("welcome does not list myself", wb2.peers.every((p) => p.id !== wb2.id));

// --- ghosts: how you leave decides the kind
await sleep(1000);
b2.send({ t: "say", text: "just a bubble" });
await a.next((m) => m.t === "say");
b2.send({ t: "bye", text: "see you tomorrow" });
await sleep(150);
b2.ws.close();
const left = await a.next((m) => m.t === "leave");
check("a goodbye message becomes the ghost's message, not the last bubble", left.id === wb.id && left.ghost?.kind === "message" && left.ghost.text === "see you tomorrow" && left.ghost.name === "Bob");

const c = await open("Carol", keyC, { avatar: "<script>", look: { top: "cape", topColor: "red; evil", logo: "not an emoji at all", glasses: "yes" } });
const wc = await c.next((m) => m.t === "welcome");
check("a newcomer sees Bob's ghost, not as a live peer", wc.ghosts.some((g) => g.id === wb.id && g.kind === "message" && g.text === "see you tomorrow") && wc.peers.every((p) => p.id !== wb.id));

const b3 = await open("Bob", keyB);
const wb3 = await b3.next((m) => m.t === "welcome");
check("Bob returning sees no ghost of himself", wb3.ghosts.every((g) => g.id !== wb.id));
check("the room is told Bob is back", (await c.next((m) => m.t === "join" && m.peer.id === wb.id)).peer.name === "Bob");

const d = await open("Dave", keyD, { avatar: "spark" });
const wd = await d.next((m) => m.t === "welcome");
check("Bob's ghost is gone once he is back", wd.ghosts.every((g) => g.id !== wb.id));
const carol = wd.peers.find((p) => p.name === "Carol");
check("hostile avatar/look values are replaced by safe defaults", carol?.avatar === "developer" && carol.look.top === "tshirt" && carol.look.topColor === "#f4f6fa" && carol.look.logo === "🦖" && carol.look.glasses === true);

// closing without a goodbye (the window was closed): broken ghost, no text, even after chatting
d.send({ t: "say", text: "my last words" });
await a.next((m) => m.t === "say" && m.id === wd.id);
d.ws.close();
const dLeft = await a.next((m) => m.t === "leave" && m.id === wd.id);
check("closing without a goodbye leaves a broken ghost with no text", dLeft.ghost?.kind === "broken" && dLeft.ghost.text === "" && dLeft.ghost.avatar === "spark");

// a goodbye without text: plain ghost
const g1 = await open("Gina", mk());
const wg = await g1.next((m) => m.t === "welcome");
check("a newcomer sees the broken ghost", wg.ghosts.some((g) => g.id === wd.id && g.kind === "broken" && g.text === ""));
g1.send({ t: "bye" });
await sleep(150);
g1.ws.close();
const gLeft = await a.next((m) => m.t === "leave" && m.id === wg.id);
check("a goodbye without text leaves a plain ghost", gLeft.ghost?.kind === "plain" && gLeft.ghost.text === "");

// a link or an oversized text in the goodbye is dropped (plain ghost), the person still leaves
const h = await open("Hank", mk());
const wh = await h.next((m) => m.t === "welcome");
h.send({ t: "bye", text: "see https://spam.example" });
await sleep(150);
h.ws.close();
check("a goodbye with a link leaves a plain ghost without the link", (await a.next((m) => m.t === "leave" && m.id === wh.id)).ghost?.kind === "plain");

// opt out of ghosts
const e = await open("Eve", keyE, { ghost: false });
await e.next((m) => m.t === "welcome");
e.send({ t: "bye", text: "no ghost please" });
await sleep(150);
e.ws.close();
const eLeft = await a.next((m) => m.t === "leave" && m.ghost === undefined);
check("ghost:false leaves no ghost, even with a goodbye", !!eLeft);
const f = await open("Frank", mk());
check("opted-out peer has no ghost for newcomers", (await f.next((m) => m.t === "welcome")).ghosts.every((g) => g.name !== "Eve"));

// --- pending socket without hello is closed by the relay
await sleep(5500);
check("a socket that never says hello is closed (4001)", raw.closeCode === 4001);

for (const x of [a, b3, c, f]) x.ws.close();
console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
