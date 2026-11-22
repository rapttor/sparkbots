// Generates the press-kit artwork that features the three robots SparkBots draws for Claude, Codex and OpenCode sessions.
// The bots use the same tiny isometric "voxel" renderer as landing.html, so they match the robots in the app.
// Usage: node presskit/artwork/generate.mjs      (writes the SVG files next to this script; logo*.svg and favicon.svg are kept as they are)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const OUT = fileURLToPath(new URL("./", import.meta.url));
mkdirSync(join(OUT, "bots"), { recursive: true });
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/* ---------- isometric renderer (a port of the one in landing.html) ---------- */
const K = 96, C = Math.cos(Math.PI / 6), OX = 110, OY = 236;
const P = (x, y, z) => [OX + (x - z) * C * K, OY + (x + z) * 0.5 * K - y * K];
const pts = (a) => a.map((p) => P(...p).map((n) => n.toFixed(1)).join(",")).join(" ");
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, t = f < 0 ? 0 : 255, k = Math.abs(f);
  return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
}
function box(x, y, z, w, h, d, col, decals = []) {
  let s = `<polygon points="${pts([[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]])}" fill="${shade(col, 0.22)}"/>`;
  s += `<polygon points="${pts([[x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]])}" fill="${col}"/>`;
  s += `<polygon points="${pts([[x + w, y, z], [x + w, y, z + d], [x + w, y + h, z + d], [x + w, y + h, z]])}" fill="${shade(col, -0.28)}"/>`;
  for (const q of decals) s += `<polygon points="${pts([[x + q[0], y + q[1], z + d + 0.005], [x + q[2], y + q[1], z + d + 0.005], [x + q[2], y + q[3], z + d + 0.005], [x + q[0], y + q[3], z + d + 0.005]])}" fill="${q[4]}"${q[5] ? ` opacity="${q[5]}"` : ""}/>`;
  return { key: x + z + w / 2 + d / 2 + y * 0.01, svg: s };
}
const draw = (list) => list.sort((a, b) => a.key - b.key).map((b) => b.svg).join("");

const BOTS = {
  claude: { name: "Claude", color: "#d97757", parts: () => {
    const o = "#d97757";
    return [
      box(-0.34, 0, -0.2, 0.26, 0.32, 0.4, "#b4553a"), box(0.08, 0, -0.2, 0.26, 0.32, 0.4, "#b4553a"),
      box(-0.46, 0.32, -0.42, 0.92, 0.82, 0.84, o, [[0.1, 0.3, 0.82, 0.58, "#10242a"], [0.16, 0.34, 0.76, 0.54, "#4fd1c5"], [0.26, 0.4, 0.34, 0.48, "#0e3a3a"], [0.58, 0.4, 0.66, 0.48, "#0e3a3a"]]),
      box(-0.64, 0.6, -0.16, 0.18, 0.42, 0.32, "#b4553a"), box(0.46, 0.6, -0.16, 0.18, 0.42, 0.32, "#b4553a"),
      box(-0.03, 1.14, -0.03, 0.06, 0.28, 0.06, "#9aa6bb"), box(-0.09, 1.42, -0.09, 0.18, 0.18, 0.18, "#ffb020"),
    ];
  } },
  codex: { name: "Codex", color: "#4fb8d0", parts: () => [
    box(-0.3, 0, -0.18, 0.2, 0.28, 0.36, "#2a7f94"), box(0.1, 0, -0.18, 0.2, 0.28, 0.36, "#2a7f94"),
    box(-0.42, 0.28, -0.36, 0.84, 0.56, 0.72, "#3aa8c1", [[0.3, 0.14, 0.54, 0.22, "#bfeaf3", 0.9]]),
    box(-0.5, 0.86, -0.42, 1.0, 0.66, 0.84, "#5cc3da", [[0.08, 0.16, 0.92, 0.5, "#0c1a22"], [0.2, 0.22, 0.34, 0.42, "#9ff3ff"], [0.66, 0.22, 0.8, 0.42, "#9ff3ff"]]),
    box(-0.58, 1.06, -0.12, 0.08, 0.24, 0.24, "#2a7f94"), box(0.5, 1.06, -0.12, 0.08, 0.24, 0.24, "#2a7f94"),
  ] },
  opencode: { name: "OpenCode", color: "#aeb6c3", parts: () => [
    box(-0.52, 0, -0.26, 0.17, 1.55, 0.52, "#8d96a6"), box(0.35, 0, -0.26, 0.17, 1.55, 0.52, "#8d96a6"),
    box(-0.35, 0.02, -0.2, 0.7, 1.5, 0.3, "#0b0f17", [[0.1, 0.34, 0.6, 0.4, "#4fd1c5", 0.9], [0.1, 0.62, 0.45, 0.68, "#4fd1c5", 0.6], [0.1, 0.9, 0.52, 0.96, "#4fd1c5", 0.45], [0.1, 1.18, 0.38, 1.24, "#4fd1c5", 0.3]]),
    box(-0.35, 1.32, -0.24, 0.7, 0.22, 0.4, "#aeb6c3", [[0.55, 0.08, 0.62, 0.14, "#ffb020"]]),
    box(-0.35, 0, -0.24, 0.7, 0.2, 0.4, "#aeb6c3"),
  ] },
};
const botBody = (id) => draw(BOTS[id].parts());
/** A bot with a soft floor shadow, placed so its feet stand at (x, y) and scaled by s. */
const placed = (id, x, y, s) => `<g transform="translate(${x - 110 * s},${y - 236 * s}) scale(${s})"><ellipse cx="110" cy="240" rx="78" ry="13" fill="#000" opacity=".4"/>${botBody(id)}</g>`;
const caption = (id, x, y, size) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="700" font-family="${FONT}" fill="${BOTS[id].color}">${BOTS[id].name}</text>`;

/* ---------- the SparkBots logo mark (same as logo-mark.svg) ---------- */
const DEFS = `<defs>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4fd1c5" stop-opacity="0.5"/><stop offset="1" stop-color="#4fd1c5" stop-opacity="0"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#303a4b"/><stop offset="1" stop-color="#1e2531"/></linearGradient>
</defs>`;
const MARK = `<g>
<line x1="60" y1="14" x2="60" y2="26" stroke="#8a96a8" stroke-width="5" stroke-linecap="round"/>
<circle cx="60" cy="10" r="8" fill="#4fd1c5"/>
<rect x="10" y="26" width="100" height="84" rx="30" fill="url(#body)" stroke="#44516a" stroke-width="3"/>
<rect x="24" y="46" width="72" height="42" rx="21" fill="#0b0e13"/>
<rect x="28" y="50" width="64" height="34" rx="17" fill="#4fd1c5"/>
<ellipse cx="46" cy="66" rx="5" ry="7" fill="#0b0e13"/><ellipse cx="74" cy="66" rx="5" ry="7" fill="#0b0e13"/>
<circle cx="48" cy="63" r="1.8" fill="#fff" opacity=".85"/><circle cx="76" cy="63" r="1.8" fill="#fff" opacity=".85"/>
</g>`;
const wordmark = (x, y, size) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="800" font-family="${FONT}" fill="#e3e8f0" letter-spacing="-${size * 0.02}">Spark<tspan fill="#4fd1c5">Bots</tspan></text>`;
const grid = (w, h) => `<g stroke="#e3e8f0" stroke-opacity="0.045" stroke-width="1">${Array.from({ length: Math.ceil(w / 40) + 1 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="${h}"/>`).join("")}${Array.from({ length: Math.ceil(h / 40) + 1 }, (_, i) => `<line x1="0" y1="${i * 40}" x2="${w}" y2="${i * 40}"/>`).join("")}</g>`;
const svg = (w, h, label, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">\n<title>${label}</title>\n${DEFS}\n<rect width="${w}" height="${h}" fill="#0f1218"/>${grid(w, h)}\n${body}\n</svg>\n`;
const write = (name, text) => writeFileSync(join(OUT, name), text);
const trio = (cx, baseY, s, gap, nameSize) => ["claude", "codex", "opencode"].map((id, i) => {
  const x = cx + (i - 1) * gap;
  return placed(id, x, baseY, s) + caption(id, x, baseY + nameSize * 2.7, nameSize);
}).join("");

/* ---------- single bots ---------- */
for (const id of Object.keys(BOTS)) {
  write(`bots/${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="540" viewBox="0 0 220 270" role="img" aria-label="${BOTS[id].name} robot">\n<title>${BOTS[id].name} robot</title>\n<ellipse cx="110" cy="240" rx="78" ry="13" fill="#000" opacity=".25"/>${botBody(id)}\n</svg>\n`);
}
write("bots-trio.svg", svg(1200, 520, "Claude, Codex and OpenCode robots",
  `<ellipse cx="600" cy="230" rx="520" ry="230" fill="url(#glow)"/>${trio(600, 380, 1.5, 380, 30)}`));

/* ---------- banner, social images ---------- */
write("banner-github-1280x640.svg", svg(1280, 640, "SparkBots GitHub banner",
  `<ellipse cx="860" cy="330" rx="520" ry="340" fill="url(#glow)"/>
<g transform="translate(90,120) scale(1.25)">${MARK}</g>
${wordmark(250, 214, 92)}
<text x="256" y="270" font-size="30" font-family="${FONT}" fill="#c3cbd9">Your AI coding agents, working in a tiny 3D office.</text>
<text x="256" y="316" font-size="22" font-family="${FONT}" fill="#8591a5">Local, private, open source (MIT)</text>
${trio(940, 520, 1.0, 215, 22)}`));

write("og-image-1200x630.svg", svg(1200, 630, "SparkBots Open Graph image",
  `<ellipse cx="600" cy="420" rx="600" ry="300" fill="url(#glow)"/>
<g transform="translate(70,60) scale(0.78)">${MARK}</g>
${wordmark(170, 130, 64)}
<text x="76" y="212" font-size="44" font-weight="700" font-family="${FONT}" fill="#e3e8f0">Your AI coding agents, working</text>
<text x="76" y="266" font-size="44" font-weight="700" font-family="${FONT}" fill="#e3e8f0">in a tiny 3D office.</text>
${trio(600, 525, 1.0, 330, 24)}`));

write("social-square-1080.svg", svg(1080, 1080, "SparkBots square social image",
  `<ellipse cx="540" cy="620" rx="560" ry="420" fill="url(#glow)"/>
<g transform="translate(375,70) scale(1.1)">${MARK}</g>
<text x="540" y="320" text-anchor="middle" font-size="112" font-weight="800" font-family="${FONT}" fill="#e3e8f0" letter-spacing="-2">Spark<tspan fill="#4fd1c5">Bots</tspan></text>
<text x="540" y="380" text-anchor="middle" font-size="34" font-family="${FONT}" fill="#c3cbd9">Your AI coding agents, at their desks.</text>
${trio(540, 800, 1.2, 330, 32)}
<text x="540" y="1010" text-anchor="middle" font-size="26" font-family="${FONT}" fill="#8591a5">Local, private, open source</text>`));

write("x-header-1500x500.svg", svg(1500, 500, "SparkBots X header",
  `<ellipse cx="1050" cy="260" rx="620" ry="300" fill="url(#glow)"/>
<g transform="translate(80,140) scale(0.95)">${MARK}</g>
${wordmark(210, 230, 84)}
<text x="214" y="285" font-size="28" font-family="${FONT}" fill="#c3cbd9">Your AI coding agents, in a tiny 3D office.</text>
${trio(1130, 420, 0.95, 250, 20)}`));

console.log("artwork written to", OUT);
