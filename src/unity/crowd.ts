import { live, useUnity } from "./store";
import { UNITY_MAX_PEERS, emptyRoom, type GhostKind, type UGhost, type UPeer } from "../shared/unity";
import { LOGO_EMOJIS, TOP_STYLES } from "../world/devLook";

/**
 * `?unitycrowd=N` (like `?fixture=N` for the office): a made-up crowd of N players and some ghosts, walking about and chatting, to
 * check layout and performance of the Unity space without other people. Client-only: no relay, no network, nothing is sent.
 */
const NAMES = ["Ada", "Linus", "Grace", "Alan", "Margaret", "Dennis", "Barbara", "Ken", "Radia", "Tim", "Hedy", "Guido", "Anita", "Bjarne", "Sophie", "Yukihiro"];
const SAYS = ["hello!", "anyone seen the shredder?", "nice statue", "fax came in again", "ping-pong later?", "coffee break", "it works on my machine", "who left the duck on?", "gm", "brb"];
const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");

export function startCrowd(count: number): () => void {
  const n = Math.max(1, Math.min(UNITY_MAX_PEERS, Math.floor(count)));
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const color = () => `#${hex(Math.floor(rnd() * 0xffffff), 6)}`;
  const look = () => ({ top: TOP_STYLES[Math.floor(rnd() * TOP_STYLES.length)]!.id, topColor: color(), logo: LOGO_EMOJIS[Math.floor(rnd() * LOGO_EMOJIS.length)]!, glasses: rnd() > 0.5, beard: rnd() > 0.5, overweight: rnd() > 0.5 });
  const avatar = (): UPeer["avatar"] => (["developer", "developer", "raptor", "spark"] as const)[Math.floor(rnd() * 4)]!;

  const peers: Record<string, UPeer> = {};
  const goal = new Map<string, { x: number; z: number; v: number }>();
  for (let i = 0; i < n; i++) {
    const id = hex(i + 1, 16);
    const a = rnd() * Math.PI * 2, d = 3 + rnd() * 14;
    peers[id] = { id, avatar: avatar(), look: look(), name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ""}`, color: color(), x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, r: 0 };
    live.set(id, { x: peers[id].x, y: 0, z: peers[id].z, r: 0 });
    goal.set(id, { x: peers[id].x, z: peers[id].z, v: 1.5 + rnd() * 3 });
  }
  const kinds: GhostKind[] = ["message", "plain", "broken"];
  const ghosts: UGhost[] = Array.from({ length: Math.min(12, n) }, (_, i) => {
    const a = rnd() * Math.PI * 2, d = 4 + rnd() * 18, kind = kinds[i % 3]!;
    return { id: hex(1000 + i, 16), avatar: avatar(), look: look(), name: `Ghost${i}`, color: color(), x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, r: rnd() * 6, kind, text: kind === "message" ? "back soon" : "", leftAt: Date.now() - (i + 1) * 3_600_000 };
  });
  useUnity.setState({ inside: true, status: "online", note: "", reported: [], room: { ...emptyRoom(), me: hex(999999, 16), peers, ghosts } });

  const tick = setInterval(() => {
    if (!useUnity.getState().inside) { stop(); return; }
    const dt = 0.1, now = Date.now();
    const bubbles = { ...useUnity.getState().room.bubbles };
    let changed = false;
    for (const id of Object.keys(peers)) {
      const p = live.get(id), g = goal.get(id);
      if (!p || !g) continue;
      const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { const a = rnd() * Math.PI * 2, r = 2 + rnd() * 20; g.x = Math.cos(a) * r; g.z = Math.sin(a) * r; }
      else { p.x += (dx / d) * g.v * dt; p.z += (dz / d) * g.v * dt; p.r = Math.atan2(-dx, -dz); }
      if (rnd() < 0.004) { bubbles[id] = { text: SAYS[Math.floor(rnd() * SAYS.length)]!, until: now + 6000 }; changed = true; }
    }
    if (changed) useUnity.setState((s) => ({ room: { ...s.room, bubbles } }));
  }, 100);
  const stop = () => { clearInterval(tick); live.clear(); };
  return stop;
}
