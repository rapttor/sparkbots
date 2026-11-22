import { useEffect, useRef } from "react";

/** Everything inside the claw window stays in the window: no click, drag or wheel reaches the 3D scene behind it (the character would walk off).
 *  Native listeners on purpose: the scene listens natively on a parent element, and React's own stopPropagation runs too late to stop it. */
export function useSwallowEvents(): import("react").RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const types = ["click", "dblclick", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "contextmenu", "wheel", "touchstart", "touchend"];
    for (const t of types) el.addEventListener(t, stop);
    return () => { for (const t of types) el.removeEventListener(t, stop); };
  }, []);
  return ref;
}

