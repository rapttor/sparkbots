/**
 * Where the amenities of the Unity space stand. Pure and deterministic, so every player sees the same town.
 *
 * Item i sits on a square spiral that starts at the phone booth in the middle, on a 10-unit lattice (so any two items, and any item
 * and the booth, are at least 10 units apart). Positions never change when items are added: the spiral only grows outward.
 * 16 items from the start; above 32 people one more item appears per 4 extra people.
 */
export const LATTICE = 10;
export const BASE_ITEMS = 16;
export const PEOPLE_BEFORE_MORE = 32;
export const PEOPLE_PER_EXTRA = 4;
export const MAX_ITEMS = 40;
export const MIN_FLOOR_RADIUS = 13;

export interface AmenityDef { id: string; name: string; quip: string }

/** Placement order. The first 16 are the original set; later ones only appear in busy rooms. */
export const CATALOGUE: AmenityDef[] = [
  { id: "water-cooler", name: "Water cooler", quip: "💧 Refreshing. Someone mentions the weekend." },
  { id: "fax", name: "Fax machine", quip: "📠 A fax arrives. It goes straight into the shredder." },
  { id: "copier", name: "The big copier", quip: "🖨 Copies, copies, copies. All of them shredded." },
  { id: "statue", name: "Statue of the maker", quip: "🏆 Solid gold. Twice your size." },
  { id: "boxing", name: "Byte boxing ring", quip: "🥊 Two agents, one stream of 0s and 1s." },
  { id: "plant", name: "Office plant", quip: "🌿 Thriving. Nobody knows who waters it." },
  { id: "stapler", name: "Stapler monument", quip: "📎 Ka-chunk. A very big staple." },
  { id: "coffee", name: "Coffee machine", quip: "☕ Brewing. It has been brewing since 2019." },
  { id: "vending", name: "Vending machine", quip: "🍫 B4 is stuck again." },
  { id: "duck", name: "Rubber duck shrine", quip: "🦆 You explain the bug. It already knows." },
  { id: "whiteboard", name: "Whiteboard", quip: "📝 Today's commits, hot off the press." },
  { id: "pingpong", name: "Ping-pong table", quip: "🏓 A rally that never ends." },
  { id: "arcade", name: "Arcade cabinet", quip: "👾 Insert coin. Or don't, it's free." },
  { id: "campfire", name: "Campfire and bean bags", quip: "🔥 Stories are told here." },
  { id: "jukebox", name: "Jukebox", quip: "🎵 Now playing: the sound of compiling." },
  { id: "keyboard", name: "Giant keyboard", quip: "⌨ Walk on it and it plays." },
  // Only appear in busy rooms (above 32 people), and only once they have a model (see `available` in layoutFor).
  { id: "aquarium", name: "Aquarium", quip: "🐠 The fish have opinions about your code." },
  { id: "lava", name: "Lava lamp pillar", quip: "🫧 Hypnotic." },
  { id: "neon", name: "Hello, World sign", quip: "💡 Every journey starts here." },
  { id: "trophies", name: "Trophy case", quip: "🏅 Employee of the month: everyone." },
  { id: "lottery", name: "Bug lottery", quip: "🎰 Three bugs in a row. You lose nothing." },
  { id: "snacks", name: "Snack table", quip: "🍕 Cold pizza, as tradition demands." },
  { id: "hammock", name: "Hammock", quip: "😴 Productive naps only." },
  { id: "gittree", name: "Git tree sculpture", quip: "🌳 So many branches." },
  { id: "telescope", name: "Telescope", quip: "🔭 Looking for a clean merge." },
];

/** Cell n of a square spiral around (0,0): 0 = the centre, 1..8 = the ring around it, 9..24 = the next ring ... */
export function spiralCell(n: number): [number, number] {
  if (n <= 0) return [0, 0];
  let x = 0, z = 0, dx = 1, dz = 0, len = 1, step = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    x += dx; z += dz; step++;
    if (step === len) { step = 0; [dx, dz] = [-dz, dx]; turns++; if (turns % 2 === 0) len++; }
  }
  return [x, z];
}

/** How many amenities a room with this many people has. */
export function itemCount(people: number): number {
  const p = Math.max(0, Math.floor(people));
  return p <= PEOPLE_BEFORE_MORE ? BASE_ITEMS : Math.min(MAX_ITEMS, BASE_ITEMS + Math.ceil((p - PEOPLE_BEFORE_MORE) / PEOPLE_PER_EXTRA));
}

export interface Placed extends AmenityDef { x: number; z: number; cell: [number, number]; slot: number; facing: number }

/** `available` is how many catalogue entries have a model yet (the rest are skipped, never drawn as empty slots). */
export function layoutFor(people: number, available = CATALOGUE.length): { items: Placed[]; radius: number } {
  const n = Math.min(itemCount(people), available, CATALOGUE.length);
  const items: Placed[] = [];
  let far = 0;
  for (let i = 0; i < n; i++) {
    const cell = spiralCell(i + 1);
    const x = cell[0] * LATTICE, z = cell[1] * LATTICE;
    far = Math.max(far, Math.hypot(x, z));
    // turn the front (+z of the model) towards the booth in the middle
    items.push({ ...CATALOGUE[i]!, x, z, cell, slot: i + 1, facing: Math.atan2(-x, -z) });
  }
  return { items, radius: Math.max(MIN_FLOOR_RADIUS, Math.ceil(far + 9)) };
}
