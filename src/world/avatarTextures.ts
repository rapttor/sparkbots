// Generated canvas textures for the developer avatar: a two-colour plaid and the back-logo emoji.
// Browser-only (uses <canvas>); World.tsx is the only caller.
import { CanvasTexture, type Texture } from "three";
import type { Avatar } from "./avatar";

export interface AvatarTextures { plaid?: Texture; emoji?: Texture }

export function avatarTextures(avatar: Avatar, pantsColor: string, topColor: string): AvatarTextures {
  const out: AvatarTextures = {};
  if (avatar.pattern && Object.values(avatar.pattern).includes("plaid")) out.plaid = plaidTexture(topColor, pantsColor);
  const emoji = avatar.decals?.[0]?.emoji;
  if (emoji) out.emoji = emojiTexture(emoji);
  return out;
}

/** Squared-lines shirt: the top colour with the pants colour woven through it. */
function plaidTexture(top: string, other: string): Texture {
  const s = 64, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = top;
  g.fillRect(0, 0, s, s);
  g.fillStyle = other;
  g.globalAlpha = 0.6;
  for (let i = 8; i < s; i += 16) { g.fillRect(i, 0, 6, s); g.fillRect(0, i, s, 6); }
  g.globalAlpha = 0.22;
  g.fillStyle = "#000";
  for (let i = 0; i < s; i += 16) { g.fillRect(i, 0, 3, s); g.fillRect(0, i, s, 3); }
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** An emoji drawn on a transparent square, for the logo on the back of the shirt. */
function emojiTexture(emoji: string): Texture {
  const s = 128, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, s, s);
  g.font = "96px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, s / 2, s / 2 + 4);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
