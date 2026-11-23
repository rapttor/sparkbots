import { CAR_TYPES, type CarSpec } from "./carTypes";
import { project, type Track } from "./track";

/** Rear-drive arcade car physics (13.7.10). Pure. Heading h: the car faces (cos h, sin h) in the x/z plane; steer > 0 turns right (h grows).
 *  The tyres hold a limited lateral acceleration (`spec.cornerG`): enter a bend too fast and the car slides wide instead of turning;
 *  full throttle with the wheel turned breaks the rear loose; Space (handbrake) breaks it loose on purpose. */
export interface CarInput { throttle: number; steer: number; drift: boolean } // throttle -1..1 (negative = brake/reverse), steer -1..1
export interface CarState {
  x: number; z: number; h: number;
  vx: number; vz: number;
  drifting: boolean;
  seg: number;        // index on the track (search hint)
  s: number;          // distance along the centre line
  lat: number;        // offset from the centre line
  hits: number;       // wall bumps so far
  boost: number;      // seconds of speed boost left
  slick: number;      // seconds on oil: almost no grip
  cool: number;       // seconds before the next pothole can hurt
  pitch: number;      // monster truck: nose-up angle while it stands on the back wheels (rad)
  roll: number;       // monster truck rollover: angle turned so far (rad), 0 when not rolling
  rollT: number;      // seconds of rollover left (no control while it tumbles)
  rollDur: number; rollTotal: number; rolls: number; // length and total angle of the current rollover, rollovers so far
}

/** Nose-up angle of a monster truck on its back wheels (rad). */
export const WHEELIE = 0.5;
export const CAR = { DRAG: 0.3, BOOST: 1.3, OFFROAD_SPEED: 0.65 };
/** How far the car's centre may be from the centre line: the road edge plus two car widths. Beyond it a wall stops you. */
export const offroadLimit = (track: Track, spec: CarSpec): number => track.halfWidth + 4 * spec.radius;
const onGrass = (c: CarState, track: Track): boolean => Math.abs(c.lat) > track.halfWidth;

export const newCar = (x: number, z: number, h: number): CarState => ({ x, z, h, vx: 0, vz: 0, drifting: false, seg: -1, s: 0, lat: 0, hits: 0, boost: 0, slick: 0, cool: 0, pitch: 0, roll: 0, rollT: 0, rollDur: 0, rollTotal: 0, rolls: 0 });
export const speedOf = (c: CarState): number => Math.hypot(c.vx, c.vz);
/** Sideways speed relative to the nose (positive = sliding to the right). */
export const slideOf = (c: CarState): number => c.vx * -Math.sin(c.h) + c.vz * Math.cos(c.h);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Advance one car by dt seconds (dt <= 0.05 keeps it stable). `free` = carmageddon: no road edge, drive anywhere. */
export function stepCar(c: CarState, inp0: CarInput, dt: number, track: Track, spec: CarSpec = CAR_TYPES.race, free = false): void {
  let inp = inp0;
  if (spec.stunts) {
    if (c.rollT > 0) { // tumbling: no control, the speed bleeds off, then it lands on its wheels and drives on
      c.rollT = Math.max(0, c.rollT - dt);
      const k = 1 - c.rollT / c.rollDur, ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      c.roll = ease * c.rollTotal; c.pitch = 0;
      if (c.rollT === 0) c.roll = 0;
      c.vx *= Math.exp(-1.3 * dt); c.vz *= Math.exp(-1.3 * dt);
      inp = { throttle: 0, steer: 0, drift: false };
    } else {
      const vfNow = c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
      const want = inp0.throttle > 0.8 && vfNow > -0.5 && vfNow < spec.maxSpeed * 0.85 ? WHEELIE : 0; // a hard start from low speed rears it up
      c.pitch += (want - c.pitch) * Math.min(1, 3.2 * dt);
      if (c.pitch < 0.01 && want === 0) c.pitch = 0;
      if (inp0.throttle < -0.3 && c.pitch > WHEELIE * 0.45) { // braking on the back wheels: it flips over
        c.rolls++; c.rollTotal = Math.PI * 2 * (2 + (c.rolls % 2)); c.rollDur = 2.1 + 0.3 * (c.rolls % 2); c.rollT = c.rollDur; c.roll = 0; c.pitch = 0;
        c.hits++;
      }
    }
  }
  const fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const grass = !free && onGrass(c, track); // off the tarmac: slower and loose
  const max = spec.maxSpeed * (c.boost > 0 ? CAR.BOOST : 1) * (grass ? CAR.OFFROAD_SPEED : 1);
  const th = clamp(inp.throttle, -1, 1);
  if (th > 0) vf += spec.accel * th * Math.max(0, 1 - vf / max) * dt + (c.boost > 0 ? 6 * dt : 0);
  else if (th < 0) vf += (vf > 0.5 ? -spec.brake : -spec.accel * 0.6) * -th * dt;
  if (th <= 0.05) vf -= vf * CAR.DRAG * dt; // coasting slows you; with the throttle down the top speed is the spec
  if (vf < -spec.maxSpeed * 0.3) vf = -spec.maxSpeed * 0.3;
  if (vf > max) vf = vf > max + 0.5 ? vf - (vf - max) * Math.min(1, 3 * dt) : max; // too fast for the surface: bleeds off, no sudden stop
  const sp = Math.abs(vf);
  const bite = Math.min(1, sp / 3) / (1 + 1.2 * Math.min(1, sp / spec.maxSpeed)); // no spinning on the spot; the wheel gets less sensitive the faster you go, so a rocket stays drivable
  const drift = inp.drift && sp > spec.maxSpeed * 0.4 && Math.abs(inp.steer) > 0.15;
  const yawWant = clamp(inp.steer, -1, 1) * spec.steer * bite * (drift ? 1.3 : 1);
  const over = (Math.abs(yawWant) * sp) / spec.cornerG;          // how far past the tyres' limit this bend asks for
  let gripF = over <= 1 ? 1 : Math.max(0.12, 1 / (over * over));  // past the limit the grip collapses...
  if (th > 0.5 && Math.abs(inp.steer) > 0.4 && sp > 0.65 * max) gripF *= 0.6; // ...and power on the rear wheels in a bend lets the tail out
  if (drift) gripF = Math.min(gripF, 0.18);
  if (grass) gripF *= 0.7;
  let yaw = yawWant * (over > 1 ? 1 / Math.sqrt(over) : 1);        // the front tyres wash out: it turns less than you asked for
  if (c.slick > 0) { gripF *= 0.25; yaw *= 0.7; c.slick = Math.max(0, c.slick - dt); }
  if (c.cool > 0) c.cool = Math.max(0, c.cool - dt);
  // the world velocity stays as it is when the car turns: the part that no longer points along the nose is the slide
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.h += (vf >= 0 ? yaw : -yaw) * dt;
  const nfx = Math.cos(c.h), nfz = Math.sin(c.h);
  vf = c.vx * nfx + c.vz * nfz; vl = c.vx * -nfz + c.vz * nfx;
  c.drifting = gripF < 0.55 && sp > spec.maxSpeed * 0.3;
  vl *= Math.exp(-spec.grip * gripF * dt);
  if (c.drifting) vf *= Math.exp(-0.18 * dt);
  c.vx = nfx * vf - nfz * vl; c.vz = nfz * vf + nfx * vl;
  c.x += c.vx * dt; c.z += c.vz * dt;
  if (c.boost > 0) c.boost = Math.max(0, c.boost - dt);
  const p = project(track, c.x, c.z, c.seg);
  c.seg = p.i; c.s = p.s; c.lat = p.lat;
  if (free) return;
  // two car widths beyond the road edge there is a wall: slide along it, lose some speed, count the bump
  const lim = offroadLimit(track, spec);
  if (Math.abs(p.lat) > lim) {
    const sign = p.lat > 0 ? 1 : -1, nx = -p.tz * sign, nz = p.tx * sign; // outward normal
    const o = Math.abs(p.lat) - lim;
    c.x -= nx * o; c.z -= nz * o;
    const vn = c.vx * nx + c.vz * nz;
    if (vn > 0) { c.vx -= nx * vn * 1.2; c.vz -= nz * vn * 1.2; c.vx *= 0.93; c.vz *= 0.93; if (vn > 2) c.hits++; }
    c.lat = sign * lim;
  }
}

/** Where a car can run an agent over: each wheel and the body, in world x/z with a radius (a monster truck rolls over you with its wheels, not only with the middle). */
export function hitPoints(spec: CarSpec, c: { x: number; z: number; h: number }): { x: number; z: number; r: number }[] {
  const fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  const pts = [{ x: c.x, z: c.z, r: Math.max(0.6, spec.radius * 0.9) }]; // the body
  for (const p of spec.parts) if (p.shape === "cyl" && p.axis === "z") pts.push({ x: c.x + fx * p.at[0] + rx * p.at[2], z: c.z + fz * p.at[0] + rz * p.at[2], r: p.size[0] + 0.3 });
  return pts;
}
