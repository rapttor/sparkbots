import { useEffect } from "react";
import { useStore } from "../state/store";
import { PANEL_TITLES } from "../state/dock";
import { Icon } from "./icons";
import { PanelView } from "./PanelView";

/** The big window: used for the Board and for any panel you expand with ⤢. Esc or × closes it. */
export function Dialog() {
  const id = useStore((s) => s.dock.dialog);
  const close = useStore((s) => s.openDialog);
  useEffect(() => {
    if (!id) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) close(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [id, close]);
  if (!id) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(null); }}>
      <div className="dialog" role="dialog" aria-label={PANEL_TITLES[id]}>
        <header className="dialog-head"><strong className="dialog-title"><Icon name={id} size={18} /> {PANEL_TITLES[id]}</strong><button className="icon-btn" aria-label="Close" onClick={() => close(null)}><Icon name="close" size={16} /></button></header>
        <div className="dialog-body"><PanelView id={id} /></div>
      </div>
    </div>
  );
}
