import { useCallback, useRef } from "react";

/** Everything inside an overlay stays in the overlay: no click, drag or wheel reaches the 3D scene behind it (the character would walk off).
 *  Native listeners on purpose: the scene listens natively on a parent element, and React's own stopPropagation runs too late to stop it.
 *  Returns a callback ref, so it also works for an element that is mounted later (a popover that opens).
 *
 *  Inside a drei `<Html>` the content lives in its own React root (a div directly under the wrapper that holds the canvas). React handles clicks on that root's
 *  element, so stopping the event on the inner element would also stop React's `onClick`. There the listeners go on the root element itself:
 *  they run after React's (same element, added later) and stop the event before it reaches the wrapper the scene listens on. */
const TYPES = ["click", "dblclick", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "contextmenu", "wheel", "touchstart", "touchend"];
const stop = (e: Event) => e.stopPropagation();

export function useSwallowEvents(): (node: HTMLDivElement | null) => void {
  const off = useRef<(() => void) | null>(null);
  return useCallback((inner: HTMLDivElement | null) => {
    off.current?.(); off.current = null;
    if (!inner) return;
    let host: HTMLElement | null = null;
    for (let n: HTMLElement | null = inner; n?.parentElement; n = n.parentElement) {
      // n is a drei Html root: a child of the wrapper the scene listens on. Plain DOM overlays (beside the canvas, not inside its wrapper)
      // never reach the scene's listeners, so they need nothing, and stopping their events would also stop React's own onClick.
      if (n.parentElement.querySelector(":scope > div > canvas") && !n.querySelector("canvas")) { host = n; break; }
    }
    if (!host) return;
    const h = host;
    for (const t of TYPES) h.addEventListener(t, stop);
    off.current = () => { for (const t of TYPES) h.removeEventListener(t, stop); };
  }, []);
}
