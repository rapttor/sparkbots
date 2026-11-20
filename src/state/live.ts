import { useEffect, useRef } from "react";
import { onChanged, wsConnected } from "./store";
import type { Slice } from "../shared/sync";

const FALLBACK_MS = 5000;

/**
 * Keep a view fresh without polling: runs `load` once, then again whenever the server pings that one of `kinds`
 * changed (for `id`, if given). Pauses while the tab is hidden and refetches when it comes back. Only if the
 * live connection is down does it fall back to a slow poll.
 */
export function useLive(load: () => void | Promise<void>, kinds: Slice[], id?: string, enabled = true) {
  const fn = useRef(load);
  fn.current = load;
  const key = kinds.join(",");
  useEffect(() => {
    if (!enabled) return;
    const run = () => { if (!document.hidden) void fn.current(); };
    run();
    const off = onChanged((k, cid) => { if ((kinds as string[]).includes(k) && (!id || !cid || cid === id)) run(); });
    const vis = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => { if (!wsConnected()) run(); }, FALLBACK_MS);
    return () => { off(); document.removeEventListener("visibilitychange", vis); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id, enabled]);
}
