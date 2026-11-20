/** Live technical numbers for the "Nerd stats" section: what the browser is doing (frames, GPU objects, socket traffic). */
export const nerd = {
  fps: 0, frameMs: 0, worstMs: 0,
  calls: 0, triangles: 0, geometries: 0, textures: 0,
  bots: 0, labels: 0,
  ws: { messages: 0, bytes: 0, hello: 0, patch: 0, changed: 0, lastHelloBytes: 0, lastPatchBytes: 0, lastPatchOps: 0, patchOps: 0, resyncs: 0, since: Date.now() },
};

/** Called once per rendered frame: keeps a smoothed frame time and, twice a second, the renderer's counters. */
let acc = 0, frames = 0, worst = 0, lastReport = 0;
export function sampleFrame(dt: number, now: number, info?: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }): void {
  acc += dt; frames++; worst = Math.max(worst, dt);
  if (now - lastReport < 0.5) return;
  nerd.fps = frames / Math.max(acc, 1e-6); nerd.frameMs = (acc / frames) * 1000; nerd.worstMs = worst * 1000;
  if (info) { nerd.calls = info.render.calls; nerd.triangles = info.render.triangles; nerd.geometries = info.memory.geometries; nerd.textures = info.memory.textures; }
  acc = 0; frames = 0; worst = 0; lastReport = now;
}

export function countMessage(type: string, bytes: number, ops = 0): void {
  const w = nerd.ws;
  w.messages++; w.bytes += bytes;
  if (type === "hello") { w.hello++; w.lastHelloBytes = bytes; }
  else if (type === "patch") { w.patch++; w.lastPatchBytes = bytes; w.lastPatchOps = ops; w.patchOps += ops; }
  else if (type === "changed") w.changed++;
}
