import "./styles/globals.css";
import { useEffect, useMemo, useRef, useState } from "react";

type MonsterDrop = {
  id: number;
  name: string;
  quantity: string | null;
  rarity: number;
  rolls: number;
};

type Monster = {
  id: number;
  name: string;
  wiki_name: string;
  last_updated?: string | null;
  drops: MonsterDrop[];
};

type DropResult = {
  id: number;
  name: string;
  quantity: number;
  rarity: number;
};

type MonsterResponse = Monster[] | Record<string, Monster>;
type SimulationBatch = {
  drops: DropResult[];
  expectedRareRolls: number;
  successfulRareRolls: number;
};
type AccountMonsterStats = {
  id: number;
  name: string;
  totalKills: number;
  lastPlayedAt: string;
};
type AccountStatsStore = Record<string, AccountMonsterStats>;
type LuckPoint = {
  id: number;
  luckPercent: number;
};
type ItemDropPrediction = {
  monsterId: number;
  monsterName: string;
  itemName: string;
  perKillChance: number;
  expectedKills: number;
  killsFor90Percent: number;
};
type EncounterFilter =
  | "all"
  | "bosses"
  | "raids"
  | "raids-hard"
  | "dt2"
  | "dt2-hard";
type EncounterMode = "normal" | "hard";

const MONSTER_URLS = [
  "/monsters-complete.json",
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json",
  "https://cdn.jsdelivr.net/gh/osrsbox/osrsbox-db@master/docs/monsters-complete.json",
];
const ITEM_ICON_URL =
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-icons";
const ITEM_JSON_URL =
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-json";
const WIKI_IMAGE_BASE_URL = "https://oldschool.runescape.wiki/images";
const ACCOUNT_STORAGE_KEY = "osrs-drop-sim-account-stats-v1";
const RARE_DROP_THRESHOLD = 0.02;
const EXTREME_RARE_THRESHOLD = 0.001;
const CUSTOM_ITEM_PRICES: Record<string, number> = {
  "Magma Vestige": 68_000_000,
  "Eye of the Duke": 22_000_000,
  "Ultor Vestige": 120_000_000,
  "Executioner's axe head": 24_000_000,
  "Bellator Vestige": 58_000_000,
  "Siren's staff": 21_000_000,
  "Venator Vestige": 36_000_000,
  "Leviathan's lure": 19_000_000,
};
const FALLBACK_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='32'><rect width='100%' height='100%' rx='4' ry='4' fill='%23222222'/><text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' fill='%23aaaaaa' font-size='9' font-family='Arial'>ITEM</text></svg>";

const CUSTOM_ENCOUNTERS: Monster[] = [
  {
    id: -1001,
    name: "Duke Sucellus",
    wiki_name: "Duke Sucellus",
    drops: [
      { id: 9001001, name: "Magma Vestige", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001002, name: "Eye of the Duke", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001003, name: "Virtus mask", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001004, name: "Virtus robe top", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001005, name: "Virtus robe bottom", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 11230, name: "Dragon dart tips", quantity: "30-100", rarity: 0.06, rolls: 1 },
      { id: 565, name: "Blood rune", quantity: "120-300", rarity: 0.12, rolls: 1 },
      { id: 2364, name: "Runite bar", quantity: "2-6", rarity: 0.08, rolls: 1 },
      { id: 995, name: "Coins", quantity: "15000-55000", rarity: 0.38, rolls: 1 },
    ],
  },
  {
    id: -1002,
    name: "Vardorvis",
    wiki_name: "Vardorvis",
    drops: [
      { id: 9001010, name: "Ultor Vestige", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001011, name: "Executioner's axe head", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001003, name: "Virtus mask", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001004, name: "Virtus robe top", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001005, name: "Virtus robe bottom", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 11230, name: "Dragon dart tips", quantity: "35-110", rarity: 0.07, rolls: 1 },
      { id: 452, name: "Runite ore", quantity: "3-7", rarity: 0.08, rolls: 1 },
      { id: 561, name: "Nature rune", quantity: "200-500", rarity: 0.11, rolls: 1 },
      { id: 995, name: "Coins", quantity: "18000-62000", rarity: 0.35, rolls: 1 },
    ],
  },
  {
    id: -1003,
    name: "The Whisperer",
    wiki_name: "The Whisperer",
    drops: [
      { id: 9001020, name: "Bellator Vestige", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001021, name: "Siren's staff", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001003, name: "Virtus mask", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001004, name: "Virtus robe top", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001005, name: "Virtus robe bottom", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 560, name: "Death rune", quantity: "300-650", rarity: 0.13, rolls: 1 },
      { id: 565, name: "Blood rune", quantity: "220-520", rarity: 0.12, rolls: 1 },
      { id: 11230, name: "Dragon dart tips", quantity: "20-90", rarity: 0.06, rolls: 1 },
      { id: 995, name: "Coins", quantity: "17000-64000", rarity: 0.36, rolls: 1 },
    ],
  },
  {
    id: -1004,
    name: "The Leviathan",
    wiki_name: "The Leviathan",
    drops: [
      { id: 9001030, name: "Venator Vestige", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001031, name: "Leviathan's lure", quantity: "1", rarity: 0.0015, rolls: 1 },
      { id: 9001003, name: "Virtus mask", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001004, name: "Virtus robe top", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 9001005, name: "Virtus robe bottom", quantity: "1", rarity: 0.0009, rolls: 1 },
      { id: 1516, name: "Magic logs", quantity: "30-100", rarity: 0.1, rolls: 1 },
      { id: 2364, name: "Runite bar", quantity: "2-6", rarity: 0.08, rolls: 1 },
      { id: 560, name: "Death rune", quantity: "250-550", rarity: 0.1, rolls: 1 },
      { id: 995, name: "Coins", quantity: "19000-60000", rarity: 0.34, rolls: 1 },
    ],
  },
  {
    id: -2001,
    name: "Chambers of Xeric",
    wiki_name: "Chambers of Xeric (Raid)",
    drops: [
      { id: 20997, name: "Twisted bow", quantity: "1", rarity: 0.0013, rolls: 1 },
      { id: 21006, name: "Kodai insignia", quantity: "1", rarity: 0.002, rolls: 1 },
      { id: 21009, name: "Dragon claws", quantity: "1", rarity: 0.0025, rolls: 1 },
      { id: 21000, name: "Dragon hunter crossbow", quantity: "1", rarity: 0.0028, rolls: 1 },
      { id: 21018, name: "Ancestral hat", quantity: "1", rarity: 0.0026, rolls: 1 },
      { id: 21021, name: "Ancestral robe top", quantity: "1", rarity: 0.0026, rolls: 1 },
      { id: 21024, name: "Ancestral robe bottom", quantity: "1", rarity: 0.0026, rolls: 1 },
      { id: 21079, name: "Dexterous prayer scroll", quantity: "1", rarity: 0.0065, rolls: 1 },
      { id: 21034, name: "Arcane prayer scroll", quantity: "1", rarity: 0.0065, rolls: 1 },
      { id: 995, name: "Coins", quantity: "40000-200000", rarity: 0.65, rolls: 1 },
    ],
  },
  {
    id: -2002,
    name: "Theatre of Blood",
    wiki_name: "Theatre of Blood (Raid)",
    drops: [
      { id: 22325, name: "Scythe of vitur", quantity: "1", rarity: 0.0032, rolls: 1 },
      { id: 22324, name: "Ghrazi rapier", quantity: "1", rarity: 0.004, rolls: 1 },
      { id: 22481, name: "Sanguinesti staff", quantity: "1", rarity: 0.004, rolls: 1 },
      { id: 22494, name: "Avernic defender hilt", quantity: "1", rarity: 0.006, rolls: 1 },
      { id: 25731, name: "Justiciar faceguard", quantity: "1", rarity: 0.0033, rolls: 1 },
      { id: 22327, name: "Justiciar chestguard", quantity: "1", rarity: 0.0033, rolls: 1 },
      { id: 22330, name: "Justiciar legguards", quantity: "1", rarity: 0.0033, rolls: 1 },
      { id: 995, name: "Coins", quantity: "50000-250000", rarity: 0.7, rolls: 1 },
    ],
  },
  {
    id: -2003,
    name: "Tombs of Amascut",
    wiki_name: "Tombs of Amascut (Raid)",
    drops: [
      { id: 27277, name: "Tumeken's shadow", quantity: "1", rarity: 0.0016, rolls: 1 },
      { id: 27226, name: "Osmumten's fang", quantity: "1", rarity: 0.0055, rolls: 1 },
      { id: 27235, name: "Elidinis' ward", quantity: "1", rarity: 0.005, rolls: 1 },
      { id: 27251, name: "Lightbearer", quantity: "1", rarity: 0.005, rolls: 1 },
      { id: 27275, name: "Masori mask", quantity: "1", rarity: 0.0042, rolls: 1 },
      { id: 27272, name: "Masori body", quantity: "1", rarity: 0.0042, rolls: 1 },
      { id: 27269, name: "Masori chaps", quantity: "1", rarity: 0.0042, rolls: 1 },
      { id: 27322, name: "Elidinis' ward (f)", quantity: "1", rarity: 0.0018, rolls: 1 },
      { id: 995, name: "Coins", quantity: "60000-300000", rarity: 0.72, rolls: 1 },
    ],
  },
];

function parseQuantityRange(quantity: string | null): number {
  if (!quantity) return 1;

  const normalized = quantity.replaceAll(",", "").trim();
  const [left, right] = normalized.split("-");
  const min = Number.parseInt(left, 10);

  if (!Number.isFinite(min)) return 1;
  if (!right) return min;

  const max = Number.parseInt(right, 10);
  if (!Number.isFinite(max) || max < min) return min;

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function runDropSimulation(drops: MonsterDrop[], killCount: number): SimulationBatch {
  const totals = new Map<number, DropResult>();
  let successfulRareRolls = 0;
  let expectedRareRolls = 0;

  for (let kill = 0; kill < killCount; kill += 1) {
    for (const drop of drops) {
      const isRareDrop = drop.rarity <= RARE_DROP_THRESHOLD;
      if (isRareDrop) {
        expectedRareRolls += drop.rarity * drop.rolls;
      }
      for (let roll = 0; roll < drop.rolls; roll += 1) {
        if (Math.random() <= drop.rarity) {
          if (isRareDrop) {
            successfulRareRolls += 1;
          }
          const amount = parseQuantityRange(drop.quantity);
          const current = totals.get(drop.id);

          if (current) {
            current.quantity += amount;
          } else {
            totals.set(drop.id, {
              id: drop.id,
              name: drop.name,
              quantity: amount,
              rarity: drop.rarity,
            });
          }
        }
      }
    }
  }

  return {
    drops: [...totals.values()].sort((a, b) => b.quantity - a.quantity),
    expectedRareRolls,
    successfulRareRolls,
  };
}

function normalizeMonsters(data: MonsterResponse): Monster[] {
  const list = Array.isArray(data) ? data : Object.values(data);
  return list.filter(
    (monster) =>
      typeof monster?.id === "number" &&
      typeof monster?.name === "string" &&
      Array.isArray(monster?.drops),
  );
}

function parseTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dedupeMonstersByLatestUpdate(monsters: Monster[]): Monster[] {
  const byDisplayName = new Map<string, Monster>();

  for (const monster of monsters) {
    const displayName = (monster.wiki_name || monster.name).trim().toLowerCase();
    const existing = byDisplayName.get(displayName);

    if (!existing) {
      byDisplayName.set(displayName, monster);
      continue;
    }

    const currentUpdated = parseTimestamp(monster.last_updated);
    const existingUpdated = parseTimestamp(existing.last_updated);

    if (
      currentUpdated > existingUpdated ||
      (currentUpdated === existingUpdated && monster.id > existing.id)
    ) {
      byDisplayName.set(displayName, monster);
    }
  }

  return [...byDisplayName.values()];
}

function getMonsterLabel(monster: Monster): string {
  return monster.wiki_name || monster.name;
}

function getQuantityTierClass(quantity: number): string {
  if (quantity >= 1_000_000) return "qty-tier-1m";
  if (quantity >= 100_000) return "qty-tier-100k";
  if (quantity >= 10_000) return "qty-tier-10k";
  if (quantity >= 1_000) return "qty-tier-1k";
  return "qty-tier-base";
}

function mergeDropResults(current: DropResult[], incoming: DropResult[]): DropResult[] {
  const totals = new Map<number, DropResult>();

  for (const drop of current) {
    totals.set(drop.id, { ...drop });
  }

  for (const drop of incoming) {
    const existing = totals.get(drop.id);
    if (existing) {
      existing.quantity += drop.quantity;
      existing.rarity = Math.min(existing.rarity, drop.rarity);
    } else {
      totals.set(drop.id, { ...drop });
    }
  }

  return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
}

function formatGp(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} gp`;
}

function loadAccountStore(): AccountStatsStore {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AccountStatsStore;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function isPetDropName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    /\bpet\b/.test(normalized) ||
    /\b(jr\.?|cub|pup(py)?|kitten|chompy chick|guardian|snakeling|olmlet|hellpuppy|tangleroot|rocky|beaver|heron|phoenix|squirrel|noon|dusk)\b/.test(
      normalized,
    )
  );
}

function getDropCardClass(drop: DropResult): string {
  if (isPetDropName(drop.name)) return "pet-card";
  if (drop.rarity <= EXTREME_RARE_THRESHOLD) return "extreme-rare-card";
  return "";
}

function getWikiItemImageUrl(itemName: string): string {
  const normalized = itemName.trim().replace(/\s+/g, "_");
  return `${WIKI_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}_detail.png`;
}

function getEncounterType(monster: Monster): EncounterFilter {
  if (monster.id <= -2000) return "raids";
  if (monster.id <= -1000) return "dt2";
  return "bosses";
}

function getFilterBaseType(filter: EncounterFilter): "all" | "bosses" | "raids" | "dt2" {
  if (filter === "raids-hard") return "raids";
  if (filter === "dt2-hard") return "dt2";
  return filter;
}

function getModeFromFilter(filter: EncounterFilter): EncounterMode {
  return filter.endsWith("-hard") ? "hard" : "normal";
}

function getDropsForMode(monster: Monster, mode: EncounterMode): MonsterDrop[] {
  if (mode === "normal") return monster.drops;

  const encounterType = getEncounterType(monster);
  if (encounterType !== "raids" && encounterType !== "dt2") return monster.drops;

  const uniqueBoost = encounterType === "raids" ? 1.25 : 1.15;
  return monster.drops.map((drop) => {
    if (drop.rarity > 0.02) return drop;
    return {
      ...drop,
      rarity: Math.min(1, drop.rarity * uniqueBoost),
    };
  });
}

function calculatePerKillChance(rarity: number, rolls: number): number {
  if (rarity <= 0 || rolls <= 0) return 0;
  return 1 - (1 - rarity) ** rolls;
}

function calculateItemPredictions(monsters: Monster[], itemQuery: string): ItemDropPrediction[] {
  const query = itemQuery.trim().toLowerCase();
  if (!query) return [];

  const predictions: ItemDropPrediction[] = [];

  for (const monster of monsters) {
    const matchingDrops = monster.drops.filter((drop) => drop.name.toLowerCase().includes(query));
    if (matchingDrops.length === 0) continue;

    const groupedByItem = new Map<string, { itemName: string; perKillMissChance: number }>();

    for (const drop of matchingDrops) {
      const key = drop.name.toLowerCase();
      const chanceThisEntry = calculatePerKillChance(drop.rarity, drop.rolls);
      const existing = groupedByItem.get(key);

      if (!existing) {
        groupedByItem.set(key, {
          itemName: drop.name,
          perKillMissChance: 1 - chanceThisEntry,
        });
      } else {
        existing.perKillMissChance *= 1 - chanceThisEntry;
      }
    }

    for (const grouped of groupedByItem.values()) {
      const perKillChance = 1 - grouped.perKillMissChance;
      if (perKillChance <= 0) continue;

      const expectedKills = 1 / perKillChance;
      const killsFor90Percent = Math.log(0.1) / Math.log(1 - perKillChance);

      predictions.push({
        monsterId: monster.id,
        monsterName: getMonsterLabel(monster),
        itemName: grouped.itemName,
        perKillChance,
        expectedKills,
        killsFor90Percent,
      });
    }
  }

  return predictions
    .sort((a, b) => a.expectedKills - b.expectedKills)
    .slice(0, 20);
}

function App() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>("");
  const [encounterFilter, setEncounterFilter] = useState<EncounterFilter>("all");
  const [monsterQuery, setMonsterQuery] = useState("");
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [killCountInput, setKillCountInput] = useState("100");
  const [autoKillEnabled, setAutoKillEnabled] = useState(false);
  const [results, setResults] = useState<DropResult[]>([]);
  const [totalKills, setTotalKills] = useState(0);
  const [lifetimeKills, setLifetimeKills] = useState(0);
  const [itemValues, setItemValues] = useState<Record<number, number>>({});
  const [expectedRareRollsTotal, setExpectedRareRollsTotal] = useState(0);
  const [successfulRareRollsTotal, setSuccessfulRareRollsTotal] = useState(0);
  const [luckHistory, setLuckHistory] = useState<LuckPoint[]>([]);
  const [isLoadingMonsters, setIsLoadingMonsters] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightItemValues = useRef<Set<number>>(new Set());

  useEffect(() => {
    const fetchMonstersFromAnySource = async (): Promise<Monster[]> => {
      for (const url of MONSTER_URLS) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const rawData = (await response.json()) as MonsterResponse;
          const data = normalizeMonsters(rawData);
          if (data.length > 0) return data;
        } catch {
          // Try next mirror when one source fails.
        }
      }

      throw new Error("Monster endpoints are unreachable.");
    };

    const fetchMonsters = async () => {
      try {
        const data = await fetchMonstersFromAnySource();
        const withDrops = dedupeMonstersByLatestUpdate([...data, ...CUSTOM_ENCOUNTERS])
          .filter((monster) => monster.drops.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));

        setMonsters(withDrops);
      } catch {
        setError(
          "Could not load monster data. Add public/monsters-complete.json or check your internet connection.",
        );
      } finally {
        setIsLoadingMonsters(false);
      }
    };

    void fetchMonsters();
  }, []);

  const selectedMonster = useMemo(
    () => monsters.find((monster) => String(monster.id) === selectedMonsterId),
    [monsters, selectedMonsterId],
  );

  const filteredMonsters = useMemo(() => {
    const baseType = getFilterBaseType(encounterFilter);
    const byType =
      baseType === "all"
        ? monsters
        : monsters.filter((monster) => getEncounterType(monster) === baseType);

    const query = monsterQuery.trim().toLowerCase();
    if (!query) return byType;

    return byType.filter((monster) => {
      const label = getMonsterLabel(monster).toLowerCase();
      return label.includes(query);
    });
  }, [encounterFilter, monsters, monsterQuery]);

  const itemPredictions = useMemo(
    () => calculateItemPredictions(monsters, itemSearchQuery),
    [itemSearchQuery, monsters],
  );

  const totalGpValue = useMemo(() => {
    return results.reduce((sum, drop) => {
      const itemValue = itemValues[drop.id] ?? CUSTOM_ITEM_PRICES[drop.name] ?? 0;
      return sum + itemValue * drop.quantity;
    }, 0);
  }, [itemValues, results]);

  const averageLuckPercent = useMemo(() => {
    if (expectedRareRollsTotal <= 0) return 0;
    return (successfulRareRollsTotal / expectedRareRollsTotal) * 100;
  }, [expectedRareRollsTotal, successfulRareRollsTotal]);

  const dryLevel = useMemo(() => {
    if (totalKills < 20 || expectedRareRollsTotal <= 0) return "";
    if (averageLuckPercent < 35) return "YOU ARE DRY";
    if (averageLuckPercent < 60) return "Slightly dry";
    if (averageLuckPercent > 140) return "Insane spooned";
    if (averageLuckPercent > 110) return "Above average luck";
    return "Average luck";
  }, [averageLuckPercent, expectedRareRollsTotal, totalKills]);

  const applyBatch = (kills: number) => {
    if (!selectedMonster) return;
    const modeDrops = getDropsForMode(selectedMonster, getModeFromFilter(encounterFilter));
    const batch = runDropSimulation(modeDrops, kills);
    setResults((previous) => mergeDropResults(previous, batch.drops));
    setTotalKills((previous) => previous + kills);
    setExpectedRareRollsTotal((previous) => previous + batch.expectedRareRolls);
    setSuccessfulRareRollsTotal((previous) => previous + batch.successfulRareRolls);

    const luckPercent =
      batch.expectedRareRolls > 0
        ? (batch.successfulRareRolls / batch.expectedRareRolls) * 100
        : 0;
    setLuckHistory((previous) => {
      const nextId = previous.length === 0 ? 1 : previous[previous.length - 1].id + 1;
      const next = [...previous, { id: nextId, luckPercent }];
      return next.slice(-30);
    });
  };

  const handleManualKill = () => {
    const kills = Number.parseInt(killCountInput, 10);
    if (!Number.isFinite(kills) || kills <= 0) {
      setError("Enter a valid kill count.");
      return;
    }
    if (!selectedMonster) {
      setError("Please select a monster first.");
      return;
    }

    setError(null);
    applyBatch(kills);
  };

  useEffect(() => {
    if (!autoKillEnabled) return;
    if (!selectedMonster) return;

    const kills = Number.parseInt(killCountInput, 10);
    if (!Number.isFinite(kills) || kills <= 0) return;

    const interval = window.setInterval(() => {
      applyBatch(kills);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [autoKillEnabled, encounterFilter, killCountInput, selectedMonster]);

  useEffect(() => {
    const missingIds = results
      .map((drop) => drop.id)
      .filter((id) => itemValues[id] === undefined && !inFlightItemValues.current.has(id));

    for (const id of missingIds) {
      inFlightItemValues.current.add(id);
      void fetch(`${ITEM_JSON_URL}/${id}.json`)
        .then(async (response) => {
          if (!response.ok) {
            setItemValues((previous) => ({ ...previous, [id]: 0 }));
            return null;
          }
          const data = (await response.json()) as { highalch?: number | null; cost?: number };
          const value = data.highalch ?? data.cost ?? 0;
          setItemValues((previous) => ({ ...previous, [id]: value }));
          return null;
        })
        .catch(() => {
          setItemValues((previous) => ({ ...previous, [id]: 0 }));
          return null;
        })
        .finally(() => {
          inFlightItemValues.current.delete(id);
        });
    }
  }, [itemValues, results]);

  useEffect(() => {
    setResults([]);
    setTotalKills(0);
    setAutoKillEnabled(false);
    setExpectedRareRollsTotal(0);
    setSuccessfulRareRollsTotal(0);
    setLuckHistory([]);
    setError(null);
    if (!selectedMonster) {
      setLifetimeKills(0);
      return;
    }
    const accountStore = loadAccountStore();
    const stats = accountStore[String(selectedMonster.id)];
    setLifetimeKills(stats?.totalKills ?? 0);
  }, [selectedMonsterId]);

  useEffect(() => {
    if (!selectedMonster) return;
    const accountStore = loadAccountStore();
    accountStore[String(selectedMonster.id)] = {
      id: selectedMonster.id,
      name: getMonsterLabel(selectedMonster),
      totalKills: lifetimeKills + totalKills,
      lastPlayedAt: new Date().toISOString(),
    };
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accountStore));
  }, [lifetimeKills, selectedMonster, totalKills]);

  return (
    <div className="container">
      <div className="panel">
        <div className="panel-header">
          <h1>OSRS Boss Drop Simulator</h1>
          <p>Pick a boss, set kills, roll loot tab, and track your RNG.</p>
        </div>

        <div className="controls">
          <label htmlFor="encounter-filter">Encounter Type</label>
          <select
            id="encounter-filter"
            value={encounterFilter}
            onChange={(event) => setEncounterFilter(event.target.value as EncounterFilter)}
          >
            <option value="all">All</option>
            <option value="bosses">Bosses</option>
            <option value="raids">Raids</option>
            <option value="raids-hard">Raids (Hard)</option>
            <option value="dt2">DT2 Bosses</option>
            <option value="dt2-hard">DT2 Bosses (Hard)</option>
          </select>

          <label htmlFor="monster">Monster</label>
          <input
            id="monster"
            type="text"
            list="monster-options"
            value={monsterQuery}
            onChange={(event) => {
              const value = event.target.value;
              setMonsterQuery(value);

              const exactMatch = monsters.find(
                (monster) => getMonsterLabel(monster).toLowerCase() === value.toLowerCase(),
              );
              setSelectedMonsterId(exactMatch ? String(exactMatch.id) : "");
            }}
            placeholder="Select or type a boss/raid..."
            disabled={isLoadingMonsters}
          />
          <datalist id="monster-options">
            {filteredMonsters.map((monster) => (
              <option key={monster.id} value={getMonsterLabel(monster)} />
            ))}
          </datalist>

          <label htmlFor="kills">Kill Count</label>
          <input
            id="kills"
            type="number"
            min={1}
            value={killCountInput}
            onChange={(event) => setKillCountInput(event.target.value)}
            placeholder="e.g. 500"
          />

          <button
            type="button"
            className="kill-btn"
            onClick={handleManualKill}
            disabled={isLoadingMonsters || !selectedMonster}
          >
            {selectedMonster
              ? `Kill ${getMonsterLabel(selectedMonster)} x${killCountInput || "0"}`
              : "Select a monster first"}
          </button>

          <button
            type="button"
            className="secondary-btn auto-btn"
            onClick={() => setAutoKillEnabled((previous) => !previous)}
            disabled={!selectedMonster}
          >
            {autoKillEnabled ? "Stop Auto Kill" : "Start Auto Kill"}
          </button>
        </div>

        <div className="predictor">
          <label htmlFor="item-search">Item Hunt Predictor</label>
          <input
            id="item-search"
            type="text"
            value={itemSearchQuery}
            onChange={(event) => setItemSearchQuery(event.target.value)}
            placeholder="Type item name (e.g. abyssal whip, tanzanite fang)..."
          />
          {itemSearchQuery.trim() && (
            <div className="predictor-results">
              {itemPredictions.length === 0 ? (
                <p className="empty">No matching item drops found for this query.</p>
              ) : (
                itemPredictions.map((prediction) => (
                  <div
                    className="predictor-row"
                    key={`${prediction.monsterId}-${prediction.itemName}`}
                  >
                    <span>
                      <strong>{prediction.monsterName}</strong> drops{" "}
                      <em>{prediction.itemName}</em>
                    </span>
                    <span>
                      Avg: {Math.ceil(prediction.expectedKills).toLocaleString("en-US")} kills
                    </span>
                    <span>
                      90%: {Math.ceil(prediction.killsFor90Percent).toLocaleString("en-US")} kills
                    </span>
                    <span>Chance/kill: {(prediction.perKillChance * 100).toFixed(3)}%</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="results-meta">
          <span>{selectedMonster ? getMonsterLabel(selectedMonster) : "No monster selected"}</span>
          <span>Killed: {totalKills.toLocaleString("en-US")}</span>
          <span>Account kills: {(lifetimeKills + totalKills).toLocaleString("en-US")}</span>
          <span>{results.length} unique drops</span>
          <span>Total value: {formatGp(totalGpValue)}</span>
          <span>Rare luck: {averageLuckPercent.toFixed(1)}%</span>
          {dryLevel && <span className="dry-indicator">{dryLevel} 😂</span>}
        </div>

        <div className="rng-panel">
          <div className="rng-row">
            <span>Rare luck vs average player ({`<=${Math.round(RARE_DROP_THRESHOLD * 100)}% drop chance`})</span>
            <strong>{averageLuckPercent.toFixed(1)}% vs 100%</strong>
          </div>
          <div className="rng-chart">
            {luckHistory.length === 0 ? (
              <p className="empty">RNG distribution appears after your first kill batch.</p>
            ) : (
              luckHistory.map((point) => (
                <div
                  key={point.id}
                  className="rng-bar"
                  style={{
                    height: `${Math.min(100, Math.max(6, point.luckPercent / 2))}%`,
                  }}
                  title={`${point.luckPercent.toFixed(1)}%`}
                />
              ))
            )}
          </div>
        </div>

        <h3 className="loot-tab-title">Loot Tab</h3>
        <div className="results">
          {results.length === 0 ? (
            <p className="empty">No results yet. Run a simulation.</p>
          ) : (
            results.map((drop) => (
              <div className={`drop-card ${getDropCardClass(drop)}`} key={drop.id}>
                <img
                  src={drop.id > 0 ? `${ITEM_ICON_URL}/${drop.id}.png` : getWikiItemImageUrl(drop.name)}
                  alt={drop.name}
                  loading="lazy"
                  onError={(event) => {
                    const image = event.currentTarget;
                    const wikiImage = getWikiItemImageUrl(drop.name);
                    if (image.src !== wikiImage) image.src = wikiImage;
                    else if (image.src !== FALLBACK_ICON) image.src = FALLBACK_ICON;
                  }}
                />
                <p>{drop.name}</p>
                <strong className={getQuantityTierClass(drop.quantity)}>
                  x{drop.quantity.toLocaleString("en-US")}
                </strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
