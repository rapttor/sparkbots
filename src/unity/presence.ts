import { useEffect, useState } from "react";
import { api } from "../api";
import { countUrl, parseCount } from "../shared/unity";
import { useUnity } from "./store";

/**
 * How many people are in Unity right now, for the pod in the office. Only asks the relay when you have switched Unity on (it reveals
 * your IP address to the relay, exactly like joining does), only while this tab is visible, and at most every 30 seconds (the relay
 * also caches the answer). Returns null when Unity is off or the relay can't be reached. Inside Unity you know the number yourself.
 */
export function useLobbyCount(): number | null {
  const inside = useUnity((s) => s.inside);
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (inside) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const s = await api.unity();
          if (!s.enabled) setN(null);
          else {
            const r = await fetch(countUrl(s.relay));
            setN(r.ok ? parseCount(await r.json()) : null);
          }
        } catch { setN(null); }
      }
      if (!stop) timer = setTimeout(() => void tick(), 30_000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [inside]);
  return n;
}
