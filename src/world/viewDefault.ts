/** The camera the user chose as their default view (saved in this browser). */
export interface SavedView { cam: [number, number, number]; target: [number, number, number]; walk: { zoom: number; yaw: number; pitch: number } }
const KEY = "ao.defaultView";

const nums = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every((x) => typeof x === "number" && Number.isFinite(x));

export function loadView(): SavedView | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SavedView> | null;
    if (!o || !nums(o.cam, 3) || !nums(o.target, 3) || !o.walk) return null;
    const { zoom, yaw, pitch } = o.walk;
    if (![zoom, yaw, pitch].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
    return { cam: o.cam as SavedView["cam"], target: o.target as SavedView["target"], walk: { zoom, yaw, pitch } };
  } catch { return null; }
}
export function saveView(v: SavedView): void { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } }
export function clearView(): void { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
