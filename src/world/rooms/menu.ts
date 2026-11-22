/** Restaurant data and the order state machine. Pure and cosmetic: nothing here touches agents or the server. */
export interface Dish { id: string; name: string; icon: string; cuisine: ChefLookId; blurb: string }
export type ChefLookId = "italian" | "chinese" | "american" | "mexican" | "plain";

/** How the chef looks while preparing a cuisine. Pure data; the component only reads colors and flags. */
export interface ChefLook { id: ChefLookId; label: string; hat: string; hatH: number; body: string; belly: number; mustache: boolean; slant: number; quip: string }

export const CHEF_LOOKS: Record<ChefLookId, ChefLook> = {
  plain:    { id: "plain",    label: "Chef",     hat: "#ffffff", hatH: 0.22, body: "#f5f5f4", belly: 1,   mustache: false, slant: 0,    quip: "What will it be?" },
  italian:  { id: "italian",  label: "Italian",  hat: "#ef4444", hatH: 0.3,  body: "#f5f5f4", belly: 1.1, mustache: true,  slant: 0,    quip: "Mamma mia!" },
  chinese:  { id: "chinese",  label: "Sushi",    hat: "#1f2937", hatH: 0.12, body: "#e5e7eb", belly: 1,   mustache: false, slant: 0.35, quip: "Fresh fish, very sharp knife." },
  american: { id: "american", label: "American", hat: "#2563eb", hatH: 0.16, body: "#fef3c7", belly: 1.6, mustache: false, slant: 0,    quip: "Extra cheese, extra everything." },
  mexican:  { id: "mexican",  label: "Mexican",  hat: "#d97706", hatH: 0.2,  body: "#fde68a", belly: 1.15, mustache: true, slant: 0,    quip: "¡Ándale!" },
};

export const MENU: Dish[] = [
  { id: "pizza", name: "Pizza", icon: "🍕", cuisine: "italian", blurb: "Hand-tossed, a little dramatic." },
  { id: "sushi", name: "Sushi", icon: "🍣", cuisine: "chinese", blurb: "Eight pieces, zero regrets." },
  { id: "burger", name: "Burger", icon: "🍔", cuisine: "american", blurb: "Stacked high." },
  { id: "taco", name: "Tacos", icon: "🌮", cuisine: "mexican", blurb: "Three, because two is not enough." },
  { id: "salad", name: "Salad", icon: "🥗", cuisine: "plain", blurb: "For the disciplined." },
];
export const dishById = (id: string): Dish | undefined => MENU.find((d) => d.id === id);

export type OrderState = "idle" | "preparing" | "ready" | "served";
export interface Order { state: OrderState; dish: string | null; at: number }
export const COOK_S = 6;   // seconds the chef needs
export const SERVE_S = 4;  // seconds the meal stays "ready" before it counts as eaten and the chef reverts

export const newOrder = (): Order => ({ state: "idle", dish: null, at: 0 });

/** Place an order. Only possible while idle (one meal at a time); unknown dishes are refused. */
export function place(o: Order, dish: string, now: number): Order {
  if (o.state !== "idle" || !dishById(dish)) return o;
  return { state: "preparing", dish, at: now };
}
/** Advance by time. preparing -> ready -> served -> idle (served is shown for one tick, then the chef reverts). */
export function tick(o: Order, now: number): Order {
  if (o.state === "preparing" && now - o.at >= COOK_S * 1000) return { ...o, state: "ready", at: now };
  if (o.state === "ready" && now - o.at >= SERVE_S * 1000) return { ...o, state: "served", at: now };
  if (o.state === "served") return newOrder();
  return o;
}
/** The look the chef wears right now: the dish's cuisine while cooking/serving, back to plain otherwise. */
export function chefLook(o: Order): ChefLook {
  const d = o.state === "preparing" || o.state === "ready" ? dishById(o.dish ?? "") : undefined;
  return CHEF_LOOKS[d?.cuisine ?? "plain"];
}
