/**
 * Tiny sound effects made on the fly with the Web Audio API (no files, nothing is downloaded or sent anywhere). Cosmetic: used by the race
 * (screams, tyre screech, splat). Off with Settings > Sound. Browsers only allow sound after you have clicked or pressed a key once, which
 * always happened before you can drive.
 */
const KEY = "ao.sound";
let on = (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })();
export const soundOn = (): boolean => on;
export function setSound(v: boolean): void { on = v; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } }

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
const audio = (): AudioContext | null => {
  if (!on || typeof AudioContext === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
};
const noiseBuf = (c: AudioContext): AudioBuffer => {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
};
const last: Record<string, number> = {};
const gate = (name: string, ms: number): boolean => { const n = performance.now(); if (n - (last[name] ?? 0) < ms) return false; last[name] = n; return true; };

/** A short high scream that falls and wobbles; `pitch` 0..1 picks a higher or lower voice. */
export function playScream(pitch = Math.random()): void {
  const c = audio(); if (!c || !gate("scream", 90)) return;
  const t = c.currentTime, f0 = 650 + pitch * 650;
  const osc = c.createOscillator(); osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.8);
  const lfo = c.createOscillator(); lfo.frequency.value = 11 + pitch * 4;
  const depth = c.createGain(); depth.gain.value = 45; lfo.connect(depth); depth.connect(osc.frequency);
  const band = c.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1500; band.Q.value = 2.5;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  osc.connect(band); band.connect(g); g.connect(c.destination);
  osc.start(t); lfo.start(t); osc.stop(t + 0.9); lfo.stop(t + 0.9);
}

/** Tyres screeching: filtered noise that sweeps down. `power` 0..1 is how hard. */
export function playScreech(power = 0.6): void {
  const c = audio(); if (!c || !gate("screech", 450)) return;
  const t = c.currentTime, src = c.createBufferSource(); src.buffer = noiseBuf(c);
  const band = c.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 9;
  band.frequency.setValueAtTime(2600, t); band.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.12 * Math.min(1, power), t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(band); band.connect(g); g.connect(c.destination); src.start(t); src.stop(t + 0.55);
}

/** A wet thump. */
export function playSplat(): void {
  const c = audio(); if (!c || !gate("splat", 60)) return;
  const t = c.currentTime;
  const osc = c.createOscillator(); osc.type = "sine"; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g); g.connect(c.destination); osc.start(t); osc.stop(t + 0.25);
  const src = c.createBufferSource(); src.buffer = noiseBuf(c);
  const low = c.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 500;
  const g2 = c.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(low); low.connect(g2); g2.connect(c.destination); src.start(t); src.stop(t + 0.16);
}
