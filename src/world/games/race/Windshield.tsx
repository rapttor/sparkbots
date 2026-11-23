import { useEffect, useState } from "react";
import { raceCam } from "./cam";
import { SPLAT_LIFE_MS, useWindshield } from "./glassSplats";

/** Green splashes on the glass in the driver view. Semi-transparent and click-through: you can still see the road and drive. */
export function Windshield() {
  const splats = useWindshield((s) => s.splats);
  const [, tick] = useState(0);
  useEffect(() => { if (!splats.length) return; const h = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(h); }, [splats.length]);
  const now = Date.now(), live = splats.filter((p) => now - p.at < SPLAT_LIFE_MS);
  if (!raceCam.active || !raceCam.fpv || !live.length) return null;
  return (
    <div className="ws-layer" aria-hidden="true">
      {live.map((p) => <div key={p.id} className="ws-blob" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, ["--r" as string]: `${p.rot}deg` }} />)}
    </div>
  );
}
