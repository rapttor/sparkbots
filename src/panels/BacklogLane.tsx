import { useEffect, useState } from "react";
import { api } from "../api";
import type { BacklogItem, BacklogStatus } from "../../server/backlog";

const LABEL: Record<BacklogStatus, string> = { idea: "idea", todo: "todo", planned: "planned", "in-progress": "in progress", blocked: "blocked", done: "done", question: "question" };

/** Read-only view of a project's backlog.md, grouped by heading. Offers to create the file from the bundled template. */
export function BacklogLane({ team }: { team: string }) {
  const [data, setData] = useState<{ file: string; items: BacklogItem[] } | null | undefined>();
  const [err, setErr] = useState("");
  const load = () => api.backlog(team).then((d) => { setData(d); setErr(""); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { setData(undefined); void load(); }, [team]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = () => {
    if (!window.confirm(`Create backlog.md in ${team}? An existing file is never overwritten.`)) return;
    api.createBacklog(team).then(load).catch((e) => setErr((e as Error).message));
  };

  const groups = new Map<string, BacklogItem[]>();
  for (const it of data?.items ?? []) groups.set(it.heading, [...(groups.get(it.heading) ?? []), it]);
  return (
    <div className="kb-col kb-backlog">
      <div className="kb-col-head"><h3>Backlog.md</h3>{data && <span className="kb-count">{data.items.length}</span>}</div>
      {err && <p role="alert" className="small s-error">{err}</p>}
      {data === undefined && !err && <p className="muted small">Loading…</p>}
      {data === null && (
        <div className="kb-empty">
          <p className="muted small">This project has no backlog.md.</p>
          <button className="small" onClick={create}>Create from template</button>
        </div>
      )}
      {data && <p className="muted small kb-file">{data.file} · read-only</p>}
      {[...groups.entries()].map(([heading, items]) => (
        <div key={heading} className="kb-group">
          {heading && <div className="kb-group-title">{heading}</div>}
          {items.map((it, i) => (
            <div key={i} className={`kb-item st-${it.status}`}>
              <span className="kb-pill">{LABEL[it.status]}</span>
              <span className="kb-item-text">{it.text}</span>
              {(it.model || it.depends) && <span className="muted small">{[it.model, it.depends && `after ${it.depends}`].filter(Boolean).join(" · ")}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
