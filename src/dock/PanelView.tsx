import { Suspense } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { Teams } from "../panels/Teams";
import { MapPanel } from "../panels/MapPanel";
import { ViewPanel } from "../panels/ViewPanel";
import { ChatsPanel } from "../panels/ChatsPanel";
import { ProjectsPanel } from "../panels/ProjectsPanel";
import { ControlRoom } from "../panels/ControlRoom";
import { Stats } from "../panels/Stats";
import { Board } from "../panels/Board";
import { Notes } from "../panels/Notes";
import { DataRoom } from "../panels/DataRoom";
import { Services } from "../panels/Services";
import { ServerRoom } from "../panels/ServerRoom";
import { Settings } from "../panels/Settings";
import { About } from "../panels/About";
import { PANEL_TITLES, type PanelId } from "../state/dock";

const VIEWS: Partial<Record<PanelId, () => JSX.Element>> = {
  about: About, chats: ChatsPanel, view: ViewPanel, projects: ProjectsPanel, map: MapPanel, teams: Teams, control: ControlRoom, stats: Stats, board: Board, notes: Notes, data: DataRoom, services: Services, server: ServerRoom, settings: Settings,
};

/** One panel, wrapped so a crash in it shows a message instead of taking the dock down. */
export function PanelView({ id }: { id: PanelId }) {
  const View = VIEWS[id];
  if (!View) return null;
  return <ErrorBoundary key={id} label={PANEL_TITLES[id]}><Suspense fallback={<p className="muted">Loading…</p>}><View /></Suspense></ErrorBoundary>;
}
