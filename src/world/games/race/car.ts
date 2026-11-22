import { project, type Track } from "./track";

/** Arcade car physics (13.7.10). Pure. Heading h: the car faces (cos h, sin h) in the x/z plane; steer > 0 turns right (h grows). */
export interface CarInput { throttle: number; steer: number; drift: boolean } // throttle -1..1 (negative = brake/reverse), steer -1..1
export interface CarState {
  x: number; z: number; h: number;
  vx: number; vz: number;
  drifting: boolean;
  seg: number;        // index on the track (search hint)
  s: number;          // distance along the centre line
  lat: number;        // offset from the centre line
  hits: number;       // wall bumps so far
  boost: number;      // seconds of speed boost left (powerups, later)
}

export const CAR = {
  MAX: 17,            // top speed (m/s)
  ACC: 15,
  BRAKE: 26,
  REVERSE: 5,
  DRAG: 0.35,
  STEER: 2.3,         // rad/s at full lock
  GRIP: 9,            // how fast sideways speed dies
  DRIFT_GRIP: 1.3,    // the same while drifting: the car slides
  DRIFT_MIN: 7,       // slowest speed a drift can start at
  RADIUS: 0.8,        // keeps the car body inside the road edge
  BOOST: 1.35,
};

export const newCar = (x: number, z: number, h: number): CarState => ({ x, z, h, vx: 0, vz: 0, drifting: false, seg: -1, s: 0, lat: 0, hits: 0, boost: 0 });
export const speedOf = (c: CarState): number => Math.hypot(c.vx, c.vz);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Advance one car by dt seconds (dt <= 0.05 keeps it stable) and keep it on the road. */
export function stepCar(c: CarState, inp: CarInput, dt: number, track: Track): void {
  const fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const max = CAR.MAX * (c.boost > 0 ? CAR.BOOST : 1);
  const th = clamp(inp.throttle, -1, 1);
  if (th > 0) vf += CAR.ACC * th * Math.max(0, 1 - vf / max) * dt + (c.boost > 0 ? 8 * dt : 0);
  else if (th < 0) vf += (vf > 0.5 ? -CAR.BRAKE : -CAR.REVERSE * 2) * -th * dt;
  vf -= vf * CAR.DRAG * dt;
  if (vf < -CAR.REVERSE) vf = -CAR.REVERSE;
  if (vf > max) vf = max; // boost ending: bleed back to top speed through drag, never jump
  // steering bites with speed (no spinning on the spot) but eases off when flat out
  const sp = Math.abs(vf), bite = Math.min(1, sp / 4) * (1 - 0.3 * Math.min(1, sp / CAR.MAX));
  const drift = inp.drift && sp > CAR.DRIFT_MIN && Math.abs(inp.steer) > 0.15;
  const yaw = clamp(inp.steer, -1, 1) * CAR.STEER * bite * (drift ? 1.35 : 1) * (vf >= 0 ? 1 : -1);
  // the world velocity stays as it is when the car turns: the part that no longer points along the nose is the slide
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.h += yaw * dt;
  const nfx = Math.cos(c.h), nfz = Math.sin(c.h);
  vf = c.vx * nfx + c.vz * nfz; vl = c.vx * -nfz + c.vz * nfx;
  const slide = Math.abs(vl) / Math.max(4, sp);
  c.drifting = drift || (slide > 0.35 && sp > CAR.DRIFT_MIN);
  vl *= Math.exp(-(drift ? CAR.DRIFT_GRIP : CAR.GRIP) * dt); // grip: sideways speed dies, slowly while drifting
  if (drift) vf *= Math.exp(-0.25 * dt);
  c.vx = nfx * vf - nfz * vl; c.vz = nfz * vf + nfx * vl;
  c.x += c.vx * dt; c.z += c.vz * dt;
  if (c.boost > 0) c.boost = Math.max(0, c.boost - dt);
  // track bounds: the road edge is a wall. Slide along it, lose some speed, count the bump.
  const p = project(track, c.x, c.z, c.seg);
  c.seg = p.i; c.s = p.s; c.lat = p.lat;
  const lim = track.halfWidth - CAR.RADIUS;
  if (Math.abs(p.lat) > lim) {
    const sign = p.lat > 0 ? 1 : -1, nx = -p.tz * sign, nz = p.tx * sign; // outward normal
    const over = Math.abs(p.lat) - lim;
    c.x -= nx * over; c.z -= nz * over;
    const vn = c.vx * nx + c.vz * nz;
    if (vn > 0) { c.vx -= nx * vn * 1.2; c.vz -= nz * vn * 1.2; c.vx *= 0.93; c.vz *= 0.93; if (vn > 2) c.hits++; }
    c.lat = sign * lim;
  }
}
