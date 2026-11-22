import { useRef } from "react";
import { useStore } from "../state/store";
import { PANEL_KEY, PANEL_TITLES, chatOf, chatTab, dockVisible, isChat } from "../state/dock";
import { displayName } from "../util";
import { WorkerChat } from "../world/WorkerChat";
import { PanelView } from "./PanelView";
import { Icon, type IconName } from "./icons";
import { colorOfDock, useDockColorVersion } from "../state/dockColors";

/** Tabs next to the 3D office: panels and one chat per agent. A side column on wide screens, a bottom sheet on narrow ones. */
export function Dock({ narrow }: { narrow: boolean }) {
  const dock = useStore((s) => s.dock);
  const snapshot = useStore((s) => s.snapshot);
  const activate = useStore((s) => s.activateTab);
  const closeTab = useStore((s) => s.closeTab);
  const toggle = useStore((s) => s.toggleDock);
  const setSide = useStore((s) => s.setDockSide);
  const resize = useStore((s) => s.resizeDock);
  const openDialog = useStore((s) => s.openDialog);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useDockColorVersion(); // repaint when a colour is changed in Settings
  const workers = snapshot?.teams.flatMap((t) => t.workers) ?? [];

  const chatLabel = (id: string) => { const w = workers.find((x) => x.id === id); return { text: w ? displayName(w) : "(agent)", state: w?.state }; };
  const active = dock.active;
  const showingChat = isChat(active);
  const content = showingChat
    ? <WorkerChat key={active} workerId={chatOf(active)} onClose={() => closeTab(active)} dock="right" />
    : dock.panel ? <PanelView id={dock.panel} /> : null;
  const title = showingChat ? { icon: "chat" as IconName, text: chatLabel(chatOf(active)).text } : dock.panel ? { icon: dock.panel as IconName, text: PANEL_TITLES[dock.panel] } : null;

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, w: dock.width }; (e.target as Element).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (drag.current) resize(drag.current.w + (dock.side === "right" ? drag.current.x - e.clientX : e.clientX - drag.current.x)); };

  if (!dockVisible(dock)) return null;
  return (
    <aside className={`dock ${narrow ? "sheet" : `side-${dock.side}`}`} style={{ "--dock-accent": colorOfDock(dock), ...(narrow ? {} : { width: dock.width }) } as React.CSSProperties}>
      {!narrow && <div className={`dock-grip ${dock.side}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} title="Drag to resize" />}
      <div className="dock-tabs">
        {title && <span className="dock-title"><Icon name={title.icon} size={15} /> {title.text}</span>}
        <span className="spacer" />
        {!showingChat && dock.panel && <button className="icon-btn" title="Open in the big window" onClick={() => openDialog(dock.panel)}><Icon name="expand" size={15} /></button>}
        {!narrow && <button className="icon-btn" title="Dock to the other side" onClick={() => setSide(dock.side === "right" ? "left" : "right")}><Icon name="swap" size={15} /></button>}
        <button className="icon-btn" title="Hide the dock" onClick={toggle}><Icon name={narrow ? "down" : dock.side === "right" ? "right" : "left"} size={15} /></button>
      </div>
      {(dock.chats.length > 0) && (
        <div className="dock-chats" role="tablist" aria-label="Agent chats">
          {dock.panel && (
            <div role="tab" aria-selected={active === PANEL_KEY} className={`dock-tab ${active === PANEL_KEY ? "on" : ""}`} onClick={() => activate(PANEL_KEY)} title={PANEL_TITLES[dock.panel]}>
              <Icon name={dock.panel as IconName} size={14} /><span className="dock-tab-text">{PANEL_TITLES[dock.panel]}</span>
            </div>
          )}
          {dock.chats.map((id) => {
            const l = chatLabel(id), k = chatTab(id);
            return (
              <div key={k} role="tab" aria-selected={k === active} className={`dock-tab ${k === active ? "on" : ""}`} onClick={() => activate(k)} title={l.text}>
                <Icon name="chat" size={14} /><span className="dock-tab-text">{l.text}</span>{l.state && <i className={`dot s-${l.state}`} />}
                <button className="icon-btn" aria-label={`Close ${l.text}`} onClick={(e) => { e.stopPropagation(); closeTab(k); }}><Icon name="close" size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
      <div className="dock-body">{content}</div>
    </aside>
  );
}
