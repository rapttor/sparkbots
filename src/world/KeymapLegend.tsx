import type { KeyDef } from "./keymap";

export interface KeyEntry { def: KeyDef; run?: () => void; why?: string | null }

/** The key legend in the 3D view. Entries you can do right now are buttons; the others are greyed with the reason. */
export function KeymapLegend({ entries, onHide }: { entries: KeyEntry[]; onHide: () => void }) {
  return (
    <div className="keymap" onWheel={(e) => e.stopPropagation()}>
      <h4>Keymap <button className="icon-btn" aria-label="Hide keymap" title="Hide (turn it on again in Settings > Keymap)" onClick={onHide}>×</button></h4>
      {entries.map(({ def, run, why }) =>
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
