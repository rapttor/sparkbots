/** Commands the View and Projects panels send to the 3D office (they live in the dock, the office in its own component tree). */
export type ViewCmd =
  | { t: "mode"; mode?: "overview" | "walk" }
  | { t: "zoom"; factor: number }
  | { t: "pan"; right: number; forward: number }
  | { t: "angle"; dyaw: number; dpitch: number }
  | { t: "reset" } | { t: "lock" } | { t: "tags" } | { t: "saveDefault" } | { t: "clearDefault" }
  | { t: "showAll"; on: boolean }
  | { t: "animate"; ids: string[] };

const subs = new Set<(c: ViewCmd) => void>();
export const sendView = (c: ViewCmd): void => { for (const f of subs) f(c); };
export const onView = (f: (c: ViewCmd) => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
