#!/usr/bin/env node
// Moderation CLI for the Unity lobby relay.
//
//   ADMIN_TOKEN=... node scripts/admin.mjs peers            who is in the room (id, name, ip hash, last bubble)
//   ADMIN_TOKEN=... node scripts/admin.mjs reports          reported ids, most reported first
//   ADMIN_TOKEN=... node scripts/admin.mjs bans             active bans
//   ADMIN_TOKEN=... node scripts/admin.mjs ban <id> [minutes] [--ip]   0/omitted minutes = permanent; --ip also bans the IP hash
//   ADMIN_TOKEN=... node scripts/admin.mjs unban <id|ip-hash>
//
// RELAY_URL (default the deployed relay) and RELAY_ROOM (default "unity") can be overridden.
const url = (process.env.RELAY_URL ?? "https://sparkbots-relay.rapttor.workers.dev").replace(/\/$/, "");
const room = process.env.RELAY_ROOM ?? "unity";
const token = process.env.ADMIN_TOKEN;
const [cmd, ...args] = process.argv.slice(2);

const usage = () => {
  console.error("usage: node scripts/admin.mjs peers | reports | bans | ban <id> [minutes] [--ip] | unban <id|ip-hash>");
  process.exit(2);
};
if (!token) { console.error("Set ADMIN_TOKEN (the value you stored with `wrangler secret put ADMIN_TOKEN`)."); process.exit(2); }

let path, body;
if (["peers", "reports", "bans"].includes(cmd)) path = cmd;
else if (cmd === "ban" && args[0]) { path = "ban"; body = { id: args[0], minutes: Number(args.find((a, i) => i > 0 && /^\d+$/.test(a)) ?? 0), ip: args.includes("--ip") }; }
else if (cmd === "unban" && args[0]) { path = "unban"; body = { key: args[0] }; }
else usage();

const res = await fetch(`${url}/admin/${room}/${path}`, {
  method: body ? "POST" : "GET",
  headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const text = await res.text();
if (!res.ok) { console.error(`${res.status} ${text}`); process.exit(1); }
const data = JSON.parse(text);
if (Array.isArray(data) && data.length) console.table(data);
else console.log(Array.isArray(data) ? "(none)" : data);
