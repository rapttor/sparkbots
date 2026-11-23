import { useState } from "react";
import { KEY_TABS, type KeyDef, type KeyTab } from "./keymap";

export interface KeyEntry { def: KeyDef; run?: () => void; why?: string | null }

const TAB_KEY = "ao.keymapTab";
const loadTab = (): KeyTab => { try { const v = localStorage.getItem(TAB_KEY); return KEY_TABS.some((t) => t.id === v) ? (v as KeyTab) : "basics"; } catch { return "basics"; } };

/** The key legend in the 3D view: tabs on top (basics, games, race, popups). Entries you can do right now are buttons; the others are greyed with the reason. */
export function KeymapLegend({ entries, onHide }: { entries: KeyEntry[]; onHide: () => void }) {
  const [tab, setTab] = useState<KeyTab>(loadTab);
  const pick = (t: KeyTab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };
  return (
    <div className="keymap" onWheel={(e) => e.stopPropagation()}>
      <h4>Keymap <button className="icon-btn" aria-label="Hide keymap" title="Hide (turn it on again in Settings > Keymap)" onClick={onHide}>×</button></h4>
      <div className="kmap-tabs" role="tablist" aria-label="Keymap">
        {KEY_TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} title={t.label} onClick={() => pick(t.id)}><span>{t.icon}</span><span className="kt-l">{t.label}</span></button>)}
      </div>
      {entries.filter((e) => (e.def.tab ?? "basics") === tab).map(({ def, run, why }) =>
        def.actionable && run ? (
          <button key={def.id} className="kmap-row" disabled={!!why} title={why ?? "Run it"} onClick={run}>
            <span className="kmap-key">{def.keys}</span><span>{def.label}</span>{why && <span className="kmap-why">{why}</span>}
          </button>
        ) : (
          <div key={def.id} className="kmap-row muted"><span className="kmap-key">{def.keys}</span><span>{def.label}</span></div>
        ))}
    </div>
  );
}
