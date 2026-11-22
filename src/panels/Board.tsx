import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { api, type Card, type Column } from "../api";
import { useLive } from "../state/live";
import type { Worker } from "../../server/adapters/types";
import { displayName } from "../util";
import { useWidth } from "../dock/useLayout";
import { BacklogLane } from "./BacklogLane";

const COLS: { id: Column; label: string; tone: string }[] = [
  { id: "backlog", label: "Backlog", tone: "var(--muted)" },
  { id: "ready", label: "Ready", tone: "var(--blue)" },
  { id: "in_progress", label: "In progress", tone: "var(--amber)" },
  { id: "review", label: "Review", tone: "var(--accent)" },
  { id: "done", label: "Done", tone: "var(--green)" },
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
  const [colView, setColView] = useState<Column | "backlogmd">("backlog");
  const [over, setOver] = useState<Column | null>(null);
  const [composing, setComposing] = useState(false);
  const [showMd, setShowMd] = useState(() => { try { return localStorage.getItem("ao.boardBacklog") === "1"; } catch { return false; } });
  const toggleMd = (v: boolean) => { setShowMd(v); try { localStorage.setItem("ao.boardBacklog", v ? "1" : "0"); } catch { /* private mode */ } };
  const refresh = async () => { try { setCards(await api.board()); } catch (e) { setErr((e as Error).message); } };
  useLive(refresh, ["board"]);
  const guard = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await refresh(); } catch (e) { setErr((e as Error).message); } };

  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = cards.filter((c) => c.archived).length;
  const shown = cards.filter((c) => (!filter || c.team === filter) && !!c.archived === showArchived);
  const add = () => guard(async () => { await api.addCard(title, body, team || filter || teams[0]?.name || ""); setTitle(""); setBody(""); setComposing(false); });
  const drop = (e: React.DragEvent, column: Column) => {
    e.preventDefault(); setOver(null);
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
    const sendable = mine.filter((w) => !w.liveInTerminal && w.source !== "opencode").slice(0, 15);
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

  // Picking a project loads its task list onto the board automatically (already imported tasks are skipped; a project without a task file is fine).
  useEffect(() => {
    if (!filter) return;
    let live = true;
    api.importTasks(filter).then(async (r) => {
      if (!live) return;
      setNote(r.added ? `Loaded ${r.added} new task${r.added === 1 ? "" : "s"} from ${r.file}.` : "");
      if (r.added) await refresh();
    }).catch(() => { /* no task file: nothing to load */ });
    return () => { live = false; };
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const mdVisible = !!filter && showMd; // the backlog.md lane needs exactly one project
  const lanes = narrow ? COLS.filter((c) => c.id === colView) : COLS;
  const importTasks = () => void guard(async () => { const r = await api.importTasks(team || filter); setNote(`Imported ${r.added} new task${r.added === 1 ? "" : "s"} from ${r.file} (${r.skipped} already on the board).`); });

  return (
    <section className="panel kb" ref={ref}>
      <header className="kb-head">
        <h1>Board</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <span className="spacer" />
        {filter && <label className="small" title="Show this project's backlog.md next to the cards (read-only)"><input type="checkbox" checked={showMd} onChange={(e) => toggleMd(e.target.checked)} /> Backlog.md</label>}
        <label className="small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived ({archivedCount})</label>
        <button className="small" disabled={!(team || filter)} title="Read the project's task list file (docs/TASKS.md ...) and add its tasks as cards: unchecked to Backlog, checked to Done. Already imported tasks are skipped." onClick={importTasks}>⬇ Import tasks</button>
        <button className="small primary" onClick={() => setComposing(!composing)}>{composing ? "Close" : "＋ New card"}</button>
      </header>
      <p className="muted small">Cards move to Review when a run ends. Done is always manual.</p>
      {composing && (
        <form className="kb-compose" onSubmit={(e) => { e.preventDefault(); if (title.trim()) add(); }}>
          <input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input placeholder="Description (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="">{filter ? `Team: ${filter}` : "Team…"}</option>
            {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <button type="submit" className="primary" disabled={!title.trim()}>Add card</button>
        </form>
      )}
      {err && <p role="alert" className="s-error">{err}</p>}
      {note && <p className="muted small">{note}</p>}
      {narrow && (
        <div className="tb-row" role="tablist" aria-label="Board columns">
          {COLS.map((c) => (
            <button key={c.id} role="tab" aria-selected={colView === c.id} className={`chip ${colView === c.id ? "on" : ""}`} onClick={() => setColView(c.id)}>
              {c.label} {shown.filter((x) => x.column === c.id).length}
            </button>
          ))}
          {mdVisible && <button role="tab" aria-selected={colView === "backlogmd"} className={`chip ${colView === "backlogmd" ? "on" : ""}`} onClick={() => setColView("backlogmd")}>Backlog.md</button>}
        </div>
      )}
      <div className={`kb-grid ${narrow ? "narrow" : ""} ${mdVisible && !narrow ? "with-md" : ""}`}>
        {mdVisible && (!narrow || colView === "backlogmd") && <BacklogLane team={filter} />}
        {(narrow && colView === "backlogmd" ? [] : lanes).map((col) => {
          const cards_ = shown.filter((c) => c.column === col.id);
          return (
            <div key={col.id} className={`kb-col ${over === col.id ? "over" : ""}`} style={{ "--tone": col.tone } as React.CSSProperties}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }} onDragLeave={() => setOver((o) => (o === col.id ? null : o))} onDrop={(e) => drop(e, col.id)}>
              <div className="kb-col-head"><h3>{col.label}</h3><span className="kb-count">{cards_.length}</span></div>
              {cards_.length === 0 && <div className="kb-drop muted small">Drop a card here</div>}
              {cards_.map((c) => (
                <article key={c.id} className={`kb-card ${c.archived ? "archived" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}>
                  <strong className="kb-title">{c.title}</strong>
                  {c.body && <p className="small kb-body">{c.body}</p>}
                  <div className="kb-meta">
                    {c.team && <span className="kb-chip">{c.team}</span>}
                    {c.runId && <span className="kb-chip run" title="A run is linked to this card">● run</span>}
                  </div>
                  <div className="kb-actions">
                    {narrow && (
                      <select aria-label="Move to column" value={c.column} onChange={(e) => void guard(() => api.patchCard(c.id, { column: e.target.value as Column }))}>
                        {COLS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    )}
                    <button className="small" onClick={() => setMenu(menu === c.id ? undefined : c.id)}>Send ▾</button>
                    {c.archived
                      ? <>
                          <button className="small" onClick={() => void guard(() => api.patchCard(c.id, { archived: false }))}>Restore</button>
                          <button className="small" onClick={() => { if (window.confirm(`Permanently delete the card "${c.title}"? This only removes it from SparkBots; it cannot be undone.`)) void guard(() => api.deleteCard(c.id)); }} aria-label="Delete card for good">Delete…</button>
                        </>
                      : <button className="small" title="Hide this card (restore it from Archived)" onClick={() => void guard(() => api.patchCard(c.id, { archived: true }))} aria-label="Archive card">🗄</button>}
                  </div>
                  {menu === c.id && assignMenu(c)}
                </article>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
