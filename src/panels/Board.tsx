import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { api, type Card, type Column } from "../api";
import { useLive } from "../state/live";
import type { Worker } from "../../server/adapters/types";
import { displayName } from "../util";
import { useWidth } from "../dock/useLayout";

const COLS: { id: Column; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

export function Board() {
  const snapshot = useStore((s) => s.snapshot);
  const teams = snapshot?.teams ?? [];
  const [cards, setCards] = useState<Card[]>([]);
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [team, setTeam] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState<string | undefined>();
  // In a narrow place (the dock, a phone) show one column at a time with a selector on top; wide (the big window): all five.
  const [ref, width] = useWidth<HTMLElement>();
  const narrow = width > 0 && width < 760;
  const [colView, setColView] = useState<Column>("backlog");
  const refresh = async () => { try { setCards(await api.board()); } catch (e) { setErr((e as Error).message); } };
  useLive(refresh, ["board"]);
  const guard = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await refresh(); } catch (e) { setErr((e as Error).message); } };

  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = cards.filter((c) => c.archived).length;
  const shown = cards.filter((c) => (!filter || c.team === filter) && !!c.archived === showArchived);
  const add = () => guard(async () => { await api.addCard(title, body, team || filter || teams[0]?.name || ""); setTitle(""); setBody(""); });
  const drop = (e: React.DragEvent, column: Column) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) void guard(() => api.patchCard(id, { column }));
  };

  /** Send a card three ways: as a message to a worker, as a fork of a worker, or to a new robot in the project. */
  const assignMenu = (c: Card) => {
    const all = teams.flatMap((t) => t.workers);
    const mine = all.filter((w) => w.team === c.team);
    const cwd = teams.find((t) => t.name === c.team)?.workers[0]?.cwd;
    const go = (target: { session?: string; cwd?: string; fork?: boolean }) => { setMenu(undefined); void guard(() => api.assign(c.id, target)); };
    const pick = (w: Worker, fork: boolean) => (
      <button key={`${fork}${w.id}`} onClick={() => go({ session: w.id, fork })} title={w.cwd}>
        {displayName(w)} <span className="muted small">{w.state}{w.liveInTerminal ? " · live in terminal" : ""}</span>
      </button>
    );
    const sendable = mine.filter((w) => !w.liveInTerminal).slice(0, 15);
    return (
      <div className="card-menu">
        <div className="muted small">New robot</div>
        {cwd ? <button onClick={() => go({ cwd })}>＋ New robot in {c.team}</button> : <span className="muted small">No project directory for this card (pick a team)</span>}
        <div className="muted small">Send as a message to…</div>
        {sendable.length ? sendable.map((w) => pick(w, false)) : <span className="muted small">No free worker in this project</span>}
        <div className="muted small">Fork (new worker continuing from…)</div>
        {(mine.length ? mine : all).slice(0, 15).map((w) => pick(w, true))}
      </div>
    );
  };

  return (
    <section className="panel" ref={ref}>
      <h1>Board</h1>
      <p className="muted small">Cards move to Review when a run ends. Done is always manual.</p>
      <div>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Description" value={body} onChange={(e) => setBody(e.target.value)} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
          <option value="">Team…</option>
          {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <button disabled={!title.trim()} onClick={add}>Add card</button>
        <button disabled={!(team || filter)} title="Read the project's task list file (docs/TASKS.md ...) and add its tasks as cards: unchecked to Backlog, checked to Done. Already imported tasks are skipped." onClick={() => void guard(async () => { const r = await api.importTasks(team || filter); setNote(`Imported ${r.added} new task${r.added === 1 ? "" : "s"} from ${r.file} (${r.skipped} already on the board).`); })}>⬇ Import tasks</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}
      {note && <p className="muted small">{note}</p>}
      <label className="small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived cards ({archivedCount})</label>
      {narrow && (
        <div className="tb-row" role="tablist" aria-label="Board columns" style={{ marginTop: 8 }}>
          {COLS.map((c) => (
            <button key={c.id} role="tab" aria-selected={colView === c.id} className={`chip ${colView === c.id ? "on" : ""}`} onClick={() => setColView(c.id)}>
              {c.label} {shown.filter((x) => x.column === c.id).length}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(5, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
        {(narrow ? COLS.filter((c) => c.id === colView) : COLS).map((col) => (
          <div key={col.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, col.id)} style={{ minHeight: 200, border: "1px solid #8884", borderRadius: 6, padding: 6 }}>
            <h3>{col.label}</h3>
            {shown.filter((c) => c.column === col.id).map((c) => (
              <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} style={{ border: "1px solid #8886", borderRadius: 4, padding: 6, marginBottom: 6 }}>
                <strong>{c.title}</strong>
                {c.body && <p className="small">{c.body}</p>}
                <p className="muted small">{c.team}{c.runId ? " · run linked" : ""}</p>
                {narrow && (
                  <select aria-label="Move to column" value={c.column} onChange={(e) => void guard(() => api.patchCard(c.id, { column: e.target.value as Column }))}>
                    {COLS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                )}
                <button onClick={() => setMenu(menu === c.id ? undefined : c.id)}>Send ▾</button>
                {c.archived
                  ? <>
                      <button onClick={() => void guard(() => api.patchCard(c.id, { archived: false }))}>Restore</button>
                      <button onClick={() => { if (window.confirm(`Permanently delete the card "${c.title}"? This only removes it from SparkBots; it cannot be undone.`)) void guard(() => api.deleteCard(c.id)); }} aria-label="Delete card for good">Delete…</button>
                    </>
                  : <button title="Hide this card (restore it from Show archived)" onClick={() => void guard(() => api.patchCard(c.id, { archived: true }))} aria-label="Archive card">🗄</button>}
                {menu === c.id && assignMenu(c)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
