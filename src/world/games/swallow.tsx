import { useEffect, useRef } from "react";

/** Everything inside an overlay stays in the overlay: no click, drag or wheel reaches the 3D scene behind it (the character would walk off).
 *  Native listeners on purpose: the scene listens natively on a parent element, and React's own stopPropagation runs too late to stop it.
 *
 *  Inside a drei `<Html>` the content lives in its own React root (a div directly under the wrapper that holds the canvas). React handles clicks on that root's
 *  element, so stopping the event on the inner element would also stop React's `onClick`. There the listeners go on the root element itself:
 *  they run after React's (same element, added later) and stop the event before it reaches the wrapper the scene listens on. */
export function useSwallowEvents(): import("react").RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const inner = ref.current; if (!inner) return;
    let host: HTMLElement = inner;
    for (let n: HTMLElement | null = inner; n?.parentElement; n = n.parentElement) {
      if (n.parentElement.querySelector("canvas") && !n.querySelector("canvas")) { host = n; break; } // n is a drei Html root: a child of the wrapper the scene listens on
    }
    const stop = (e: Event) => e.stopPropagation();
    const types = ["click", "dblclick", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "contextmenu", "wheel", "touchstart", "touchend"];
    for (const t of types) host.addEventListener(t, stop);
    return () => { for (const t of types) host.removeEventListener(t, stop); };
  }, []);
  return ref;
}
