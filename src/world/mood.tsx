import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { playFx } from "./fx";
import { nervousPicks, rateLimitedAt } from "./rateLimit";
import { refreshCaffeine } from "./caffeine";
import type { Layout } from "./layout";

/** Mounts no meshes: keeps caffeine levels fresh and, while rate limited, makes a rotating few robots twitch (fx "nervous"). */
export function MoodDriver({ layout }: { layout: Layout }) {
  const lay = useRef(layout);
  lay.current = layout;
  useEffect(() => { void refreshCaffeine(); const t = setInterval(() => { if (!document.hidden) void refreshCaffeine(); }, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let tick = 0;
    const t = setInterval(() => {
      if (document.hidden || !rateLimitedAt(useStore.getState().snapshot?.rateLimitedUntil)) return;
      for (const id of nervousPicks(lay.current.desks.map((d) => d.worker.id), tick++)) playFx("nervous", id);
    }, 1200);
    return () => clearInterval(t);
  }, []);
  return null;
}
