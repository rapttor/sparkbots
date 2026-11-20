import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { PANEL_TITLES, panelShowing, type PanelId } from "../state/dock";
import { Icon } from "./icons";
import { useMatch } from "./useLayout";

const ITEMS: { id: PanelId; hint?: string }[] = [
  { id: "view" }, { id: "map" }, { id: "projects" }, { id: "chats" }, { id: "teams" }, { id: "control" }, { id: "board", hint: "opens in a window" },
  { id: "stats" }, { id: "notes" }, { id: "data" }, { id: "services" }, { id: "server" }, { id: "settings" },
];

/** Top-right menu that opens the panels as dock tabs (the Board in the big window). On small screens it is the main menu. */
export function PanelMenu() {
  const dock = useStore((s) => s.dock);
  const setPanel = useStore((s) => s.setPanel);
  const toggle = useStore((s) => s.toggleDock);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const wide = useMatch("(min-width: 760px)"); // small icons: all of them fit in the header from here up
  const isOn = (id: PanelId) => panelShowing(dock, id);

  if (wide) {
    return (
      <div className="pm-row" role="toolbar" aria-label="Panels">
        {ITEMS.map(({ id, hint }) => (
          <button key={id} className={`pm-icon ${isOn(id) ? "on" : ""}`} title={`${PANEL_TITLES[id]}${hint ? ` (${hint})` : ""}`} aria-label={PANEL_TITLES[id]}
            onClick={() => setPanel(id)}>
            <Icon name={id} size={16} />{id === "chats" && dock.chats.length > 0 && <span className="pm-badge">{dock.chats.length}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="panel-menu" ref={ref}>
      <button className={`pm-btn ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} title="Open a panel" onClick={() => setOpen(!open)}>
        <Icon name="panels" /><span className="pm-label">Panels</span><Icon name="down" size={14} />
      </button>
      {open && (
        <div className="pm-drop" role="menu">
          {ITEMS.map(({ id, hint }) => (
            <button key={id} role="menuitem" className={`pm-item ${isOn(id) ? "on" : ""}`} onClick={() => { setPanel(id); setOpen(false); }}>
              <Icon name={id} size={18} />
              <span>{PANEL_TITLES[id]}{id === "chats" && dock.chats.length > 0 ? ` (${dock.chats.length})` : ""}{hint && <small className="muted"> · {hint}</small>}</span>
            </button>
          ))}
          {(dock.panel !== null || dock.chats.length > 0) && (
            <button role="menuitem" className="pm-item pm-foot" onClick={() => { toggle(); setOpen(false); }}>
              <Icon name={dock.open ? (dock.side === "right" ? "right" : "left") : (dock.side === "right" ? "left" : "right")} size={20} />
              <span>{dock.open ? "Hide the dock" : "Show the dock"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
