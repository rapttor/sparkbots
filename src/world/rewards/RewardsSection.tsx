import { useState } from "react";
import { SHELF_SLOTS, USER, itemDef, shelfSplit } from "../../shared/rewards";
import { giveReward, useRewards } from "./store";

/** Agent menu: what stands on this agent's shelf, the archive list of the rest, and your claw prizes you can hand over. */
export function RewardsSection({ id }: { id: string }) {
  const all = useRewards();
  const [msg, setMsg] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const { shelf, archive } = shelfSplit(all.get(id) ?? [], SHELF_SLOTS);
  const mine = all.get(USER) ?? [];
  const chip = (item: string) => { const d = itemDef(item); return d ? `${d.icon} ${d.name}` : item; };
  if (!shelf.length && !mine.length) return <div className="am-row small muted" title="Win trophies in games; prizes come from the claw machine in the game room">🏆 Shelf: empty</div>;
  return (
    <div className="am-row small" style={{ display: "block" }}>
      <div title="Newest first. The shelf in the cubicle holds three; older ones move to the archive list.">🏆 Shelf {shelf.length ? shelf.map((r) => <span key={r.id} title={`from ${r.from || "?"}`} style={{ marginRight: 6 }}>{chip(r.item)}</span>) : <span className="muted">empty</span>}</div>
      {archive.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchive(!showArchive)}>🗄 Archive ({archive.length})</button>
          {showArchive && <ul style={{ margin: "2px 0 0 14px", padding: 0 }}>{archive.map((r) => <li key={r.id}>{chip(r.item)} <span className="muted">{new Date(r.at).toLocaleDateString()}</span></li>)}</ul>}
        </div>
      )}
      {mine.length > 0 && (
        <div title="Your own inventory (claw prizes). Giving one puts it on this agent's shelf.">
          🎁 Give a prize:{" "}
          <select aria-label="Give a prize" value="" onChange={(e) => { const v = e.target.value; if (v) void giveReward(v, id).then((err) => setMsg(err ?? "Given!")); }}>
            <option value="">choose…</option>{mine.map((r) => <option key={r.id} value={r.id}>{chip(r.item)}</option>)}
          </select>{" "}{msg && <span role="status" className="muted">{msg}</span>}
        </div>
      )}
    </div>
  );
}
