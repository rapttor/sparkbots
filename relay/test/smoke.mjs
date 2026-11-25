// Smoke test: two clients join a room, move, talk, and one leaves.
// Run `pnpm dev` in another terminal first, then `pnpm smoke` (or pass a URL: node test/smoke.mjs wss://host).
const base = process.argv[2] ?? "ws://127.0.0.1:8787";
const room = "SMOKE" + Math.floor(Math.random() * 1e6);

const open = (name) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/room/${room}?name=${name}&color=%23ff8800`);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.pred(m));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else inbox.push(m);
    };
    ws.onopen = () =>
      resolve({
        ws,
        next: (pred) =>
          new Promise((res, rej) => {
            const i = inbox.findIndex(pred);
            if (i >= 0) return res(inbox.splice(i, 1)[0]);
            const t = setTimeout(() => rej(new Error("timeout")), 4000);
            waiters.push({ pred, resolve: (m) => { clearTimeout(t); res(m); } });
          }),
      });
    ws.onerror = () => reject(new Error("connect failed"));
  });

const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const a = await open("Alice");
const wa = await a.next((m) => m.t === "welcome");
check("A gets welcome with empty peer list", wa.peers.length === 0);

const b = await open("Bob");
const wb = await b.next((m) => m.t === "welcome");
check("B welcome lists Alice", wb.peers.length === 1 && wb.peers[0].name === "Alice");
const ja = await a.next((m) => m.t === "join");
check("A is told Bob joined", ja.peer.name === "Bob");

b.ws.send(JSON.stringify({ t: "pos", x: 3, y: 0, z: -2, r: 1.5 }));
const pos = await a.next((m) => m.t === "pos");
check("A receives Bob's position", pos.id === wb.id && pos.x === 3 && pos.z === -2);

b.ws.send(JSON.stringify({ t: "say", text: "hello <b>team</b>" }));
const say = await a.next((m) => m.t === "say");
check("A receives Bob's bubble text", say.text === "hello <b>team</b>"); // plain text; clients must not render as HTML

b.ws.send(JSON.stringify({ t: "say", text: "spam" })); // within 1 s: rate limited, must be dropped
await new Promise((r) => setTimeout(r, 300));
b.ws.send(JSON.stringify({ t: "say", text: "x".repeat(300) })); // oversized message: dropped
await new Promise((r) => setTimeout(r, 300));

b.ws.close();
const left = await a.next((m) => m.t === "leave");
check("A is told Bob left", left.id === wb.id);

a.ws.close();
console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
