import type { ReactNode } from "react";
import type { PanelId } from "../state/dock";

/** Small line icons (24 x 24, drawn with the text color) for the panel menu, dock tabs and dialog. */
const PATHS: Record<string, ReactNode> = {
  world: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6M3 20h18" /></>,
  map: <><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z" /><path d="M9 4v13M15 7v13" /></>,
  teams: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.9-.2 5 1.6 5 4.3" /></>,
  control: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 11h2.5l1.5-3 2.5 6 1.5-3H17" /><path d="M9 20h6M12 16v4" /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1.2" /><rect x="9.5" y="4" width="5" height="10" rx="1.2" /><rect x="16" y="4" width="5" height="13" rx="1.2" /></>,
  stats: <><rect x="4" y="11" width="3.5" height="9" rx="1" /><rect x="10.2" y="4" width="3.5" height="16" rx="1" /><rect x="16.5" y="8" width="3.5" height="12" rx="1" /></>,
  notes: <><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5M8 9h8M8 12.5h4" /></>,
  data: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5M8 9.5h5M8 12h3" /></>,
  services: <><path d="M9 3v5M15 3v5" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v3" /></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></>,
  settings: <><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="12" r="6.4" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" /></>,
  about: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6h.01" /></>,
  view: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  chats: <><path d="M3 4.5h13v9H8l-5 4z" /><path d="M19 9.5v7h-5l-3 3v-3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  right: <path d="m9 5 7 7-7 7" />,
  left: <path d="m15 5-7 7 7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  panels: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
};

export type IconName = PanelId | keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.panels}
    </svg>
  );
}
