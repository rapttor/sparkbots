import { useEffect, useRef } from "react";

/** While a popup is open its options answer to the number keys 1-9 (the n-th option = key n). The keys are captured so nothing else (walking, hotkeys) reacts. */
export function useNumberKeys(options: (() => void)[], active = true): void {
  const ref = useRef(options); ref.current = options;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const fn = ref.current[Number(e.key) - 1];
      if (!fn) return;
      e.preventDefault(); e.stopImmediatePropagation();
      fn();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);
}
