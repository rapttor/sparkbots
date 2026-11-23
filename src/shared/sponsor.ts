/**
 * Sponsor links. Fixed SparkBots values, hardcoded on purpose: no settings, no network.
 * "#" means "not provided yet": such a card is shown disabled and can never be opened.
 * Fill in `href` (and `address` for a crypto address) when the real value exists. Never invent one.
 * Patreon and Buy Me a Coffee are the owner's own pages (github.com/rapttor); the Ethereum card holds the owner's receive address; GitHub Sponsors is not set up yet.
 */
export interface SponsorLink { id: string; label: string; icon: string; href: string; note: string; /** a crypto receive address: the card copies it on click, nothing is ever opened or sent */ address?: string }

export const SPONSOR_LINKS: SponsorLink[] = [
  { id: "patreon", label: "Patreon", icon: "🧡", href: "https://www.patreon.com/c/rapttor", note: "Support SparkBots monthly" },
  { id: "coffee", label: "Buy me a coffee", icon: "☕", href: "https://buymeacoffee.com/rapttor", note: "One-time thank-you" },
  { id: "eth", label: "Ethereum", icon: "Ξ", href: "#", address: "0xeF4590e1c22Cabade5300aFa469f9dDEBA1275D2", note: "Tip in ETH on Ethereum mainnet only. Click to copy the address." },
  { id: "github", label: "GitHub Sponsors", icon: "⭐", href: "#", note: "Star or sponsor the repo" },
];

/** A receive address: 0x + 40 hex characters (the copy button only ever copies one of these). */
export const isAddress = (a: string | undefined): boolean => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
/** A card is usable when it has a real https link or a valid receive address. */
export const isUsable = (l: SponsorLink): boolean => isFilled(l.href) || isAddress(l.address);

/** A link is real only when it is an absolute https URL. "#", empty and anything else is a placeholder. */
export const isFilled = (href: string): boolean => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(href.trim());
export const filledLinks = (): SponsorLink[] => SPONSOR_LINKS.filter((l) => isFilled(l.href));

/** Idle sponsor bubble lines (short, friendly, never pushy). */
export const SPONSOR_LINES = [
  "Enjoying the office? The sponsor room is open 💛",
  "SparkBots runs on coffee and kindness ☕",
  "Psst… there's a sponsor room if you feel generous.",
];
