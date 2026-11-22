import type { CSSProperties, ReactNode } from "react";
/** Small inline styles shared by the room overlays (kept here so no global stylesheet is touched). */
export const panel: CSSProperties = { background: "rgba(10,12,20,.94)", border: "1px solid #475569", borderRadius: 10, padding: 10, color: "#e5e7eb", fontSize: 12, minWidth: 170, whiteSpace: "nowrap" };
export const btn: CSSProperties = { display: "block", width: "100%", margin: "3px 0", padding: "5px 8px", borderRadius: 6, border: "1px solid #64748b", background: "#1e293b", color: "#f1f5f9", cursor: "pointer", textAlign: "left", fontSize: 12 };
export const btnOff: CSSProperties = { ...btn, opacity: 0.45, cursor: "not-allowed" };
export const bubble: CSSProperties = { whiteSpace: "nowrap", padding: "5px 10px", borderRadius: 999, background: "rgba(10,12,20,.92)", border: "1px solid #64748b", color: "#e5e7eb", fontSize: 12, pointerEvents: "none" };
export const pointer = { onPointerOver: () => { document.body.style.cursor = "pointer"; }, onPointerOut: () => { document.body.style.cursor = ""; } };
/** Wrap the content of a clickable `<Html>` overlay: the DOM click would otherwise bubble to the scene's event source and also count as a click on the floor behind it (the manager would walk off). */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
export const Stop = ({ children }: { children: ReactNode }) => <div onClick={stop} onPointerDown={stop} onPointerUp={stop}>{children}</div>;
