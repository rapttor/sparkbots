// Abuse-limit test: per-IP bubble budget, text/name hygiene, per-IP socket cap, flood cutoff,
// reports and bans (needs ADMIN_TOKEN), and the per-IP connect rate (last, it blocks this IP for a minute).
//
//   pnpm dev                                   (ADMIN_TOKEN comes from relay/.dev.vars)
//   ADMIN_TOKEN=dev-admin-token-local-only node test/abuse.mjs
//   ADMIN_TOKEN=<real> node test/abuse.mjs wss://sparkbots-relay.rapttor.workers.dev
//
// Wait about a minute after test/smoke.mjs: both count against the same per-IP connect rate.
const base = process.argv[2] ?? "ws://127.0.0.1:8787";
const token = process.env.ADMIN_TOKEN;
const room = "ABUSE" + Math.floor(Math.random() * 1e6);
const http = base.replace(/^ws/, "http");
const mk = () => crypto.randomUUID().replaceAll("-", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(key = mk(), name = "T", extra = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base}/room/${room}`);
    const c = { ws, inbox: [], closeCode: null, blocked: false, opened: false };
    ws.onmessage = (e) => c.inbox.push(JSON.parse(e.data));
    ws.onclose = (e) => {
      c.closeCode = e.code;
      if (!c.opened) { c.blocked = true; resolve(c); }
    };
    ws.onerror = () => {};
    ws.onopen = () => {
      c.opened = true;
      ws.send(JSON.stringify({ t: "hello", key, name, color: "#44aa88", ...extra }));
      resolve(c);
    };
    c.send = (m) => ws.send(JSON.stringify(m));
  });
}

const waitFor = async (c, pred, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const i = c.inbox.findIndex(pred);
    if (i >= 0) return c.inbox.splice(i, 1)[0];
    await sleep(25);
  }
  return null;
};
const welcome = (c) => waitFor(c, (m) => m.t === "welcome");
const closeAll = async (list) => { for (const c of list) try { c.ws.close(); } catch {} await sleep(400); };

const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const adm = async (path, body, auth = `Bearer ${token}`) => {
  const r = await fetch(`${http}/admin/${room}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// ---- 1. per-IP bubble budget: new secrets must not be a way around the limit (budget is 8 per 10 s)
{
  const obs = await open(mk(), "Obs");
  await welcome(obs);
  const senders = [];
  for (let i = 0; i < 4; i++) { const s = await open(mk(), "S" + i); await welcome(s); senders.push(s); }
  for (let round = 0; round < 3; round++) {
    senders.forEach((s, i) => s.send({ t: "say", text: `r${round} s${i}` }));
    await sleep(1100);
  }
  await sleep(300);
  const got = obs.inbox.filter((m) => m.t === "say").length;
  check(`12 bubbles from 4 secrets on one IP: only 8 delivered (got ${got})`, got === 8);
  await closeAll([obs, ...senders]);
}

// ---- 2. text and name hygiene (the 10 s bubble budget has to expire first)
await sleep(10500);
{
  const obs = await open(mk(), "Obs");
  await welcome(obs);
  const names = ["‮Admin", "SparkBots", "visit www.spam.com", "Zoë​", "x".repeat(60)];
  const hs = [];
  for (const n of names) { const h = await open(mk(), n); await welcome(h); hs.push(h); }
  const joined = [];
  for (let i = 0; i < names.length; i++) joined.push((await waitFor(obs, (m) => m.t === "join"))?.peer.name);
  check("reserved names (even with bidi tricks) become Guest", joined[0] === "Guest" && joined[1] === "Guest");
  check("a link in a name becomes Guest", joined[2] === "Guest");
  check("invisible characters are stripped from names", joined[3] === "Zoë");
  check("names are capped at 24 chars", joined[4]?.length === 24);

  hs[0].send({ t: "say", text: "buy at https://spam.example now" });
  check("a bubble with a link is dropped", (await waitFor(obs, (m) => m.t === "say", 500)) === null);
  hs[0].send({ t: "say", text: "he​llo ‮  there\n\nfriend" });
  const say = await waitFor(obs, (m) => m.t === "say");
  check("bubbles lose invisible chars and extra whitespace", say?.text === "hello there friend");
  await closeAll([obs, ...hs]);
}

// ---- 3. per-IP socket cap (8)
{
  const socks = [];
  for (let i = 0; i < 8; i++) socks.push(await open(mk(), "C" + i));
  check("8 sockets from one IP are accepted", socks.every((s) => !s.blocked));
  const ninth = await open(mk(), "C9");
  check("the 9th socket from one IP is refused", ninth.blocked === true);
  await closeAll(socks);
}

// ---- 4. frame flood
{
  const f = await open(mk(), "Flood");
  await welcome(f);
  for (let i = 0; i < 300; i++) f.send({ t: "pos", x: i, y: 0, z: 0, r: 0 });
  await sleep(600);
  check("a burst of 300 frames in under a second closes the socket (4004)", f.closeCode === 4004);
}

// ---- 5. reports and bans
if (!token) {
  console.log("SKIP  reports and bans (set ADMIN_TOKEN)");
} else {
  check("admin API refuses a wrong token (401)", (await adm("peers", null, "Bearer nope")).status === 401);
  check("admin API refuses a missing token (401)", (await adm("peers", null, "")).status === 401);

  const keyV = mk();
  const victim = await open(keyV, "Victim");
  const wV = await welcome(victim);
  const obs = await open(mk(), "Obs");
  await welcome(obs);

  const peers = await adm("peers");
  const me = peers.body?.find((p) => p.id === wV.id);
  check("admin lists live peers with an IP hash, never a secret", !!me && /^[0-9a-f]{12}$/.test(me.ip) && !("key" in me));

  obs.send({ t: "report", id: wV.id });
  await sleep(400);
  const reps = await adm("reports");
  check("a report is stored against the reported id", !!reps.body?.find((r) => r.id === wV.id && r.count === 1 && r.name === "Victim"));

  obs.inbox.length = 0;
  const ban = await adm("ban", { id: wV.id, minutes: 5 });
  await sleep(500);
  check("ban closes the victim's socket (4003)", ban.body?.ok === true && victim.closeCode === 4003);
  const leave = obs.inbox.find((m) => m.t === "leave" && m.id === wV.id);
  check("the room sees a leave without a ghost", !!leave && leave.ghost === undefined);

  const again = await open(keyV, "Victim");
  await sleep(600);
  check("a banned id cannot rejoin (4003)", again.closeCode === 4003);
  check("the ban is listed", !!(await adm("bans")).body?.find((b) => b.kind === "id" && b.key === wV.id));

  await adm("unban", { key: wV.id });
  const back = await open(keyV, "Victim");
  check("after unban the id can rejoin", !!(await welcome(back)));

  const ipBan = await adm("ban", { id: wV.id, minutes: 5, ip: true });
  await sleep(500);
  check("ban with ip returns the IP hash", /^[0-9a-f]{12}$/.test(ipBan.body?.ip ?? ""));
  const fresh = await open(mk(), "NewSecret");
  check("a banned IP is refused even with a new secret", fresh.blocked === true);
  await adm("unban", { key: ipBan.body.ip });
  await adm("unban", { key: wV.id });
  const ok = await open(mk(), "AfterUnban");
  check("after unbanning the IP a new secret can join", !!(await welcome(ok)));
  await closeAll([ok, obs, back, victim]);
}

// ---- 6. connect rate (last: it blocks this IP for up to a minute)
{
  let blockedAt = 0;
  for (let i = 1; i <= 70 && !blockedAt; i++) {
    const c = await open(mk(), "R" + i);
    if (c.blocked) blockedAt = i;
    else { c.ws.close(); await sleep(60); }
  }
  check(`connects per minute are limited (blocked at attempt ${blockedAt})`, blockedAt > 0);
}

console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
process.exit();
