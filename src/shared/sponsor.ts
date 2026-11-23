/**
 * Sponsor links. Fixed SparkBots values, hardcoded on purpose: no settings, no network.
 * "#" means "not provided yet": such a card is shown disabled and can never be opened.
 * Fill in `href` (and `address` for a crypto address) when the real value exists. Never invent one.
 * Patreon and Buy Me a Coffee are the owner's own pages (github.com/rapttor); GitHub Sponsors is not set up yet; USDT has no address yet.
 */
export interface SponsorLink { id: string; label: string; icon: string; href: string; note: string }

export const SPONSOR_LINKS: SponsorLink[] = [
  { id: "patreon", label: "Patreon", icon: "🧡", href: "https://www.patreon.com/c/rapttor", note: "Support SparkBots monthly" },
  { id: "coffee", label: "Buy me a coffee", icon: "☕", href: "https://buymeacoffee.com/rapttor", note: "One-time thank-you" },
  { id: "usdt", label: "USDT", icon: "🪙", href: "#", note: "One-time tip (address coming soon)" },
  { id: "github", label: "GitHub Sponsors", icon: "⭐", href: "#", note: "Star or sponsor the repo" },
];

/** A link is real only when it is an absolute https URL. "#", empty and anything else is a placeholder. */
export const isFilled = (href: string): boolean => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(href.trim());
export const filledLinks = (): SponsorLink[] => SPONSOR_LINKS.filter((l) => isFilled(l.href));

/** Idle sponsor bubble lines (short, friendly, never pushy). */
export const SPONSOR_LINES = [
  "Enjoying the office? The sponsor room is open 💛",
  "SparkBots runs on coffee and kindness ☕",
  "Psst… there's a sponsor room if you feel generous.",
];
