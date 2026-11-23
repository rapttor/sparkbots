/** The cars (13.7.10, backlog "race track"): three types with their own speed, grip and look. Pure data; the renderer builds meshes from `parts`. */
export type CarKind = "race" | "kart" | "monster";

/** A typical agent's walking pace in m/s. The monster truck is 2x of it (slowest); the rocket kart and race car are real speed machines (kart 32 m/s, race car 40 m/s). */
export const AGENT_SPEED = 3.5;

export type Shape = "box" | "cyl" | "cone" | "sph";
/** One piece of a car. Local frame: +x forward, +y up, +z right. box: size = [length, height, width]; cyl: size = [radius, length, -]
 *  along `axis`; cone: [radius, length, -] along `axis` (the tip points to -axis for "x"... see the renderer); sph: [radius, -, -]. */
export interface Part {
  shape: Shape;
  size: [number, number, number];
  at: [number, number, number];
  axis?: "x" | "y" | "z";
  color: string | "team";   // "team" = the driver's colour
  flame?: boolean;          // glowing, flickers with the throttle
  tip?: 1 | -1;             // cone along x: which way the tip points
}

export interface CarSpec {
  kind: CarKind;
  name: string;
  icon: string;
  maxSpeed: number;   // m/s
  accel: number;
  brake: number;
  steer: number;      // rad/s at full lock
  grip: number;       // how fast sideways speed dies when the tyres hold
  cornerG: number;    // lateral acceleration the tyres hold (m/s^2); past it the car slides wide
  radius: number;     // keeps the body inside the road edge
  hitRadius: number;  // how close an agent must be to get run over
  camBack: number; camUp: number; eye: number; // chase camera distance/height, driver's-seat eye height
  /** Driver view (C): the camera sits on the very front of the vehicle, `fpvAhead` m in front of the centre and `fpvUp` m high, so no part of the body is in the way. */
  fpvAhead: number; fpvUp: number;
  parts: Part[];
}

const DARK = "#1b1d22", TYRE = "#16171a", METAL = "#c9d0dc", GLASS = "#5c7ea8";
const wheel = (x: number, z: number, r: number, w: number): Part => ({ shape: "cyl", size: [r, w, 0], at: [x, r, z], axis: "z", color: TYRE });

export const CAR_TYPES: Record<CarKind, CarSpec> = {
  race: {
    kind: "race", name: "Race car", icon: "🏎", maxSpeed: 40, accel: 26, brake: 45, steer: 2.4, grip: 9, cornerG: 32, radius: 0.8, hitRadius: 1.3,
    camBack: 9, camUp: 3.4, eye: 0.8, fpvAhead: 2.6, fpvUp: 0.8,
    parts: [
      { shape: "box", size: [2.6, 0.3, 0.8], at: [0, 0.38, 0], color: "team" },
      { shape: "cone", size: [0.4, 1.1, 0], at: [1.9, 0.36, 0], axis: "x", tip: 1, color: "team" },
      { shape: "box", size: [0.9, 0.3, 0.55], at: [-0.9, 0.68, 0], color: "team" },
      { shape: "box", size: [0.8, 0.22, 0.5], at: [0.1, 0.62, 0], color: DARK },
      { shape: "sph", size: [0.2, 0, 0], at: [0.05, 0.86, 0], color: "#f4f6fa" },
      { shape: "box", size: [0.4, 0.05, 1.7], at: [2.2, 0.16, 0], color: DARK },
      { shape: "box", size: [0.45, 0.05, 1.5], at: [-1.55, 0.98, 0], color: DARK },
      { shape: "box", size: [0.1, 0.5, 0.05], at: [-1.5, 0.74, 0.5], color: DARK },
      { shape: "box", size: [0.1, 0.5, 0.05], at: [-1.5, 0.74, -0.5], color: DARK },
      { shape: "box", size: [0.5, 0.12, 0.12], at: [1.2, 0.38, 0.55], color: DARK },
      { shape: "box", size: [0.5, 0.12, 0.12], at: [1.2, 0.38, -0.55], color: DARK },
      wheel(1.3, 0.9, 0.34, 0.34), wheel(1.3, -0.9, 0.34, 0.34), wheel(-1.2, 0.95, 0.42, 0.45), wheel(-1.2, -0.95, 0.42, 0.45),
    ],
  },
  kart: {
    kind: "kart", name: "Rocket kart", icon: "🛺", maxSpeed: 32, accel: 30, brake: 40, steer: 2.5, grip: 8, cornerG: 26, radius: 0.9, hitRadius: 1.4,
    camBack: 9.5, camUp: 3.8, eye: 1.5, fpvAhead: 1.6, fpvUp: 1.25,
    parts: [
      { shape: "box", size: [2.2, 0.18, 1.3], at: [0, 0.36, 0], color: "team" },
      { shape: "box", size: [0.3, 0.24, 1.6], at: [1.25, 0.34, 0], color: "team" },
      { shape: "box", size: [0.6, 0.12, 0.9], at: [-0.25, 0.6, 0], color: "#3a3f4b" },          // big seat
      { shape: "box", size: [0.14, 0.8, 0.9], at: [-0.55, 1.0, 0], color: "#3a3f4b" },
      { shape: "sph", size: [0.24, 0, 0], at: [-0.25, 1.35, 0], color: "#f4f6fa" },            // the driver
      { shape: "box", size: [0.4, 0.36, 0.3], at: [-0.2, 0.9, 0], color: "team" },
      { shape: "box", size: [0.06, 0.34, 0.34], at: [0.5, 1.0, 0], color: DARK },              // steering wheel
      { shape: "cyl", size: [0.05, 0.5, 0], at: [0.35, 0.8, 0], axis: "x", color: DARK },
      { shape: "cyl", size: [0.3, 1.5, 0], at: [-1.6, 0.85, 0], axis: "x", color: METAL },      // the rocket
      { shape: "cone", size: [0.3, 0.5, 0], at: [-0.7, 0.85, 0], axis: "x", tip: 1, color: "#e53935" },
      { shape: "cone", size: [0.38, 0.5, 0], at: [-2.6, 0.85, 0], axis: "x", tip: 1, color: "#555a66" },
      { shape: "box", size: [0.5, 0.05, 0.7], at: [-1.9, 0.85, 0], color: "#e53935" },
      { shape: "box", size: [0.5, 0.7, 0.05], at: [-1.9, 0.85, 0], color: "#e53935" },
      { shape: "cone", size: [0.3, 1.4, 0], at: [-3.3, 0.85, 0], axis: "x", tip: -1, color: "#ffb02e", flame: true },
      wheel(0.9, 0.85, 0.38, 0.36), wheel(0.9, -0.85, 0.38, 0.36), wheel(-0.85, 0.95, 0.46, 0.5), wheel(-0.85, -0.95, 0.46, 0.5),
    ],
  },
  monster: {
    kind: "monster", name: "Monster truck", icon: "🛻", maxSpeed: AGENT_SPEED * 2, accel: 8, brake: 16, steer: 1.9, grip: 7, cornerG: 11, radius: 1.2, hitRadius: 2.0,
    camBack: 10.5, camUp: 5, eye: 2.7, fpvAhead: 2.2, fpvUp: 2.7,
    parts: [
      { shape: "box", size: [3.0, 0.35, 1.2], at: [0, 1.0, 0], color: DARK },
      { shape: "box", size: [2.7, 0.8, 1.9], at: [0, 1.6, 0], color: "team" },
      { shape: "box", size: [1.2, 0.7, 1.8], at: [-0.25, 2.35, 0], color: "team" },
      { shape: "box", size: [0.06, 0.45, 1.5], at: [0.38, 2.4, 0], color: GLASS },
      { shape: "box", size: [0.7, 0.3, 1.7], at: [1.5, 1.95, 0], color: "team" },
      { shape: "box", size: [0.2, 0.6, 2.0], at: [1.75, 1.2, 0], color: METAL },                 // bull bar
      { shape: "cyl", size: [0.07, 0.9, 0], at: [-1.2, 2.5, 0.8], axis: "y", color: METAL },     // exhausts
      { shape: "cyl", size: [0.07, 0.9, 0], at: [-1.2, 2.5, -0.8], axis: "y", color: METAL },
      { shape: "box", size: [0.15, 0.15, 1.5], at: [-0.25, 2.8, 0], color: "#ffd166" },          // roof lights
      { shape: "box", size: [0.12, 0.12, 2.9], at: [1.2, 0.85, 0], color: DARK },                // axles
      { shape: "box", size: [0.12, 0.12, 2.9], at: [-1.2, 0.85, 0], color: DARK },
      wheel(1.2, 1.55, 0.85, 0.8), wheel(1.2, -1.55, 0.85, 0.8), wheel(-1.2, 1.55, 0.85, 0.8), wheel(-1.2, -1.55, 0.85, 0.8),
    ],
  },
};
export const CAR_KINDS = Object.keys(CAR_TYPES) as CarKind[];
