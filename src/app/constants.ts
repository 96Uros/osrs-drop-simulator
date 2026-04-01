export const MONSTER_URLS = [
  "/monsters-complete.json",
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json",
  "https://cdn.jsdelivr.net/gh/osrsbox/osrsbox-db@master/docs/monsters-complete.json",
];

export const ITEM_ICON_URL =
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-icons";
export const ITEM_JSON_URL =
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-json";
export const WIKI_IMAGE_BASE_URL = "https://oldschool.runescape.wiki/images";
export const WIKI_LATEST_PRICE_URL =
  "https://prices.runescape.wiki/api/v1/osrs/latest";
export const WIKI_MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
export const RUNELITE_ICON_URL = "https://static.runelite.net/cache/item/icon";

export const ACCOUNT_STORAGE_KEY = "osrs-drop-sim-account-stats-v1";
export const RARE_DROP_THRESHOLD = 0.02;
export const EXTREME_RARE_THRESHOLD = 0.001;
export const MAX_KILL_INPUT = 15_000;

export const CUSTOM_ITEM_PRICES: Record<string, number> = {
  "Magus vestige": 68_000_000,
  "Eye of the duke": 22_000_000,
  "Ultor vestige": 120_000_000,
  "Bellator vestige": 58_000_000,
  "Venator vestige": 36_000_000,
  "Executioner's axe head": 24_000_000,
  "Siren's staff": 21_000_000,
  "Leviathan's lure": 19_000_000,
  "Chromium ingot": 54_000,
  "Awakener's orb": 370_000,
};

export const FALLBACK_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='32'><rect width='100%' height='100%' rx='4' ry='4' fill='%23222222'/><text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' fill='%23aaaaaa' font-size='9' font-family='Arial'>ITEM</text></svg>";
