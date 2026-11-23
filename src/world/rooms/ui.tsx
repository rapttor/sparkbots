import { useRef, type CSSProperties, type ComponentProps, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { avatarScreen } from "../occlusion";
/** Small inline styles shared by the room overlays (kept here so no global stylesheet is touched). */
export const panel: CSSProperties = { background: "rgba(10,12,20,.94)", border: "1px solid #475569", borderRadius: 10, padding: 10, color: "#e5e7eb", fontSize: 12, minWidth: 170, whiteSpace: "nowrap" };
export const btn: CSSProperties = { display: "block", width: "100%", margin: "3px 0", padding: "5px 8px", borderRadius: 6, border: "1px solid #64748b", background: "#1e293b", color: "#f1f5f9", cursor: "pointer", textAlign: "left", fontSize: 12 };
export const btnOff: CSSProperties = { ...btn, opacity: 0.45, cursor: "not-allowed" };
export const bubble: CSSProperties = { whiteSpace: "nowrap", padding: "5px 10px", borderRadius: 999, background: "rgba(10,12,20,.92)", border: "1px solid #64748b", color: "#e5e7eb", fontSize: 12, pointerEvents: "none" };
export const pointer = { onPointerOver: () => { document.body.style.cursor = "pointer"; }, onPointerOut: () => { document.body.style.cursor = ""; } };
/** Wrap the content of a clickable `<Html>` overlay: the DOM click would otherwise bubble to the scene's event source and also count as a click on the floor behind it (the manager would walk off). */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
export const Stop = ({ children }: { children: ReactNode }) => <div onClick={stop} onPointerDown={stop} onPointerUp={stop}>{children}</div>;

const tmpW = new Vector3(), tmpP = new Vector3();
/**
 * A drei `<Html>` label that does not draw over you: DOM labels are always painted on top of the 3D scene, so a bubble hanging behind your
 * character (the reception sign, "Brewing…") used to cover your head. Here it fades out while it lies farther away than you AND on top of
 * you on the screen. Same props as `Html`; `position` is relative to the parent like before.
 */
export function RoomHtml({ position = [0, 0, 0], children, ...rest }: Omit<ComponentProps<typeof Html>, "position"> & { position?: [number, number, number] }) {
  const g = useRef<Group>(null), el = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    const node = g.current, div = el.current;
    if (!node || !div) return;
    let hide = false;
    if (avatarScreen.on) {
      node.getWorldPosition(tmpW);
      const dist = camera.position.distanceTo(tmpW);
      if (dist > avatarScreen.dist + 0.3) {
        tmpP.copy(tmpW).project(camera);
        hide = tmpP.x > avatarScreen.x0 && tmpP.x < avatarScreen.x1 && tmpP.y > avatarScreen.y0 && tmpP.y < avatarScreen.y1;
      }
    }
    const want = hide ? "0" : "1";
    if (div.style.opacity !== want) div.style.opacity = want;
  });
  return <group ref={g} position={position}><Html {...rest}><div ref={el} style={{ transition: "opacity .15s" }}>{children}</div></Html></group>;
}
