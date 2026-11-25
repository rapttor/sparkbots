import { useState } from "react";
import type { Layout } from "../world/layout";
import { PodModel } from "./PodModel";
import { useUnity } from "./store";
import { useStore } from "../state/store";
import { useLobbyCount } from "./presence";
import { bubble, RoomHtml, Stop } from "../world/rooms/ui";

/** The Unity pod in the office. Click it to go in; if Unity is still off, it opens the Unity panel where you switch it on. */
export function UnityPod({ layout }: { layout: Layout }) {
  const z = layout.zones.find((q) => q.zone.id === "unity");
  const [hover, setHover] = useState(false);
  const setPanel = useStore((s) => s.setPanel);
  const here = useLobbyCount(); // people inside right now (null: Unity is off or unreachable)
  if (!z) return null;

  const go = async () => {
    const ok = await useUnity.getState().enter();
    if (!ok) setPanel("unity");
  };
  return (
    <group position={[z.x, 0.2, z.z]}
      onClick={(e) => { e.stopPropagation(); void go(); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; setHover(true); }}
      onPointerOut={() => { document.body.style.cursor = ""; setHover(false); }}>
      <PodModel glow={hover ? 1 : here ? 0.5 + Math.min(here, 10) * 0.04 : 0.3} />
      <RoomHtml position={[0, 3.5, 0]} center zIndexRange={[10, 0]}>
        <Stop><div style={{ ...bubble, pointerEvents: "auto", cursor: "pointer" }} onClick={() => void go()}>🌀 Unity{here ? ` · ${here} here` : ""}</div></Stop>
      </RoomHtml>
    </group>
  );
}
