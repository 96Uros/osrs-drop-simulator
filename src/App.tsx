import "./styles/globals.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountStatsStore,
  DropResult,
  EncounterFilter,
  EncounterMode,
  ItemDropPrediction,
  LuckPoint,
  Monster,
  MonsterDrop,
  MonsterResponse,
  SimulationBatch,
} from "./app/types";
import {
  ACCOUNT_STORAGE_KEY,
  CUSTOM_ITEM_PRICES,
  EXTREME_RARE_THRESHOLD,
  FALLBACK_ICON,
  ITEM_ICON_URL,
  ITEM_JSON_URL,
  MAX_KILL_INPUT,
  MONSTER_URLS,
  RARE_DROP_THRESHOLD,
  RUNELITE_ICON_URL,
  WIKI_IMAGE_BASE_URL,
  WIKI_LATEST_PRICE_URL,
  WIKI_MAPPING_URL,
} from "./app/constants";
import { CUSTOM_ENCOUNTERS } from "./app/custom-encounters";

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

function runDropSimulation(
  drops: MonsterDrop[],
  killCount: number,
): SimulationBatch {
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
    const displayName = (monster.wiki_name || monster.name)
      .trim()
      .toLowerCase();
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

function getDisplayMonsterLabel(
  monster: Monster,
  filter: EncounterFilter,
): string {
  const baseLabel = getMonsterLabel(monster);
  if (filter === "dt2-hard" && getEncounterType(monster) === "dt2") {
    return `Awakened ${baseLabel}`;
  }
  return baseLabel;
}

function getQuantityTierClass(quantity: number): string {
  if (quantity >= 1_000_000) return "qty-tier-1m";
  if (quantity >= 100_000) return "qty-tier-100k";
  if (quantity >= 10_000) return "qty-tier-10k";
  if (quantity >= 1_000) return "qty-tier-1k";
  return "qty-tier-base";
}

function mergeDropResults(
  current: DropResult[],
  incoming: DropResult[],
): DropResult[] {
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

function getWikiItemImageUrlPlain(itemName: string): string {
  const normalized = itemName.trim().replace(/\s+/g, "_");
  return `${WIKI_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}.png`;
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

function getDropUnitValue(
  drop: DropResult,
  itemIdByName: Record<string, number>,
  itemValues: Record<number, number>,
): number {
  const resolvedId = getResolvedItemId(drop, itemIdByName);
  const resolvedById = itemValues[resolvedId];
  if (typeof resolvedById === "number") return resolvedById;

  const byName = CUSTOM_ITEM_PRICES[drop.name];
  if (typeof byName === "number") return byName;

  const normalized = normalizeItemName(drop.name);
  const nameMatch = Object.entries(CUSTOM_ITEM_PRICES).find(
    ([name]) => normalizeItemName(name) === normalized,
  );
  return nameMatch?.[1] ?? 0;
}

function getResolvedItemId(
  drop: DropResult,
  itemIdByName: Record<string, number>,
): number {
  if (drop.id > 0) return drop.id;
  return itemIdByName[normalizeItemName(drop.name)] ?? drop.id;
}

function getIconCandidates(drop: DropResult): string[] {
  const wikiDetail = getWikiItemImageUrl(drop.name);
  const wikiPlain = getWikiItemImageUrlPlain(drop.name);
  if (drop.id > 0) {
    return [
      `${RUNELITE_ICON_URL}/${drop.id}.png`,
      `${ITEM_ICON_URL}/${drop.id}.png`,
      wikiDetail,
      wikiPlain,
      FALLBACK_ICON,
    ];
  }
  return [wikiDetail, wikiPlain, FALLBACK_ICON];
}

function getEncounterType(monster: Monster): EncounterFilter {
  if (monster.id <= -2000) return "raids";
  if (monster.id <= -1000) return "dt2";
  return "bosses";
}

function getFilterBaseType(
  filter: EncounterFilter,
): "all" | "bosses" | "raids" | "dt2" {
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
  if (encounterType !== "raids" && encounterType !== "dt2")
    return monster.drops;

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

function calculateItemPredictions(
  monsters: Monster[],
  itemQuery: string,
): ItemDropPrediction[] {
  const query = itemQuery.trim().toLowerCase();
  if (!query) return [];

  const predictions: ItemDropPrediction[] = [];

  for (const monster of monsters) {
    const matchingDrops = monster.drops.filter((drop) =>
      drop.name.toLowerCase().includes(query),
    );
    if (matchingDrops.length === 0) continue;

    const groupedByItem = new Map<
      string,
      { itemName: string; perKillMissChance: number }
    >();

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
  const [encounterFilter, setEncounterFilter] =
    useState<EncounterFilter>("all");
  const [monsterQuery, setMonsterQuery] = useState("");
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [killCountInput, setKillCountInput] = useState("100");
  const [autoKillEnabled, setAutoKillEnabled] = useState(false);
  const [results, setResults] = useState<DropResult[]>([]);
  const [totalKills, setTotalKills] = useState(0);
  const [lifetimeKills, setLifetimeKills] = useState(0);
  const [itemValues, setItemValues] = useState<Record<number, number>>({});
  const [itemIdByName, setItemIdByName] = useState<Record<string, number>>({});
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
        const withDrops = dedupeMonstersByLatestUpdate([
          ...data,
          ...CUSTOM_ENCOUNTERS,
        ])
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

  useEffect(() => {
    void fetch(WIKI_MAPPING_URL)
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as Array<{ id: number; name: string }>;
        const byName: Record<string, number> = {};
        for (const row of data) {
          if (!row?.id || !row?.name) continue;
          byName[normalizeItemName(row.name)] = row.id;
        }
        setItemIdByName(byName);
        return null;
      })
      .catch(() => null);
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
      const itemValue = getDropUnitValue(drop, itemIdByName, itemValues);
      return sum + drop.quantity * itemValue;
    }, 0);
  }, [itemIdByName, itemValues, results]);

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
    const modeDrops = getDropsForMode(
      selectedMonster,
      getModeFromFilter(encounterFilter),
    );
    const batch = runDropSimulation(modeDrops, kills);
    setResults((previous) => mergeDropResults(previous, batch.drops));
    setTotalKills((previous) => previous + kills);
    setExpectedRareRollsTotal((previous) => previous + batch.expectedRareRolls);
    setSuccessfulRareRollsTotal(
      (previous) => previous + batch.successfulRareRolls,
    );

    const luckPercent =
      batch.expectedRareRolls > 0
        ? (batch.successfulRareRolls / batch.expectedRareRolls) * 100
        : 0;
    setLuckHistory((previous) => {
      const nextId =
        previous.length === 0 ? 1 : previous[previous.length - 1].id + 1;
      const next = [...previous, { id: nextId, luckPercent }];
      return next.slice(-30);
    });
  };

  const handleManualKill = () => {
    const kills = Number.parseInt(killCountInput, 10);
    if (!Number.isFinite(kills) || kills <= 0 || kills > MAX_KILL_INPUT) {
      setError(
        `Enter a valid kill count (1-${MAX_KILL_INPUT.toLocaleString("en-US")}).`,
      );
      return;
    }
    if (!selectedMonster) {
      setError("Please select a monster first.");
      return;
    }

    setError(null);
    applyBatch(kills);
  };

  const handleResetRun = () => {
    setResults([]);
    setTotalKills(0);
    setExpectedRareRollsTotal(0);
    setSuccessfulRareRollsTotal(0);
    setLuckHistory([]);
    setAutoKillEnabled(false);
    setError(null);
  };

  useEffect(() => {
    if (!autoKillEnabled) return;
    if (!selectedMonster) return;

    const kills = Number.parseInt(killCountInput, 10);
    if (!Number.isFinite(kills) || kills <= 0 || kills > MAX_KILL_INPUT) return;

    const interval = window.setInterval(() => {
      applyBatch(kills);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [autoKillEnabled, encounterFilter, killCountInput, selectedMonster]);

  useEffect(() => {
    const missingIds = results
      .map((drop) => getResolvedItemId(drop, itemIdByName))
      .filter(
        (id) =>
          itemValues[id] === undefined && !inFlightItemValues.current.has(id),
      );

    for (const id of missingIds) {
      if (id <= 0) {
        setItemValues((previous) => ({ ...previous, [id]: 0 }));
        continue;
      }
      inFlightItemValues.current.add(id);
      void fetch(`${WIKI_LATEST_PRICE_URL}?id=${id}`)
        .then(async (response) => {
          if (!response.ok) {
            return fetch(`${ITEM_JSON_URL}/${id}.json`);
          }
          const data = (await response.json()) as {
            data?: Record<string, { high?: number; low?: number }>;
          };
          const liveValue =
            data.data?.[String(id)]?.high ?? data.data?.[String(id)]?.low ?? 0;
          setItemValues((previous) => ({ ...previous, [id]: liveValue }));
          return null;
        })
        .then(async (fallbackResponse) => {
          if (
            !fallbackResponse ||
            !("ok" in fallbackResponse) ||
            !fallbackResponse.ok
          ) {
            setItemValues((previous) => ({ ...previous, [id]: 0 }));
            return null;
          }
          const fallbackData = (await fallbackResponse.json()) as {
            highalch?: number | null;
            cost?: number;
          };
          const value = fallbackData.highalch ?? fallbackData.cost ?? 0;
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
  }, [itemIdByName, itemValues, results]);

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
            onChange={(event) =>
              setEncounterFilter(event.target.value as EncounterFilter)
            }
          >
            <option value="all">All</option>
            <option value="bosses">Bosses</option>
            <option value="raids">Raids</option>
            <option value="raids-hard">Raids (Hard)</option>
            <option value="dt2">DT2 Bosses</option>
            <option value="dt2-hard">DT2 Bosses (Hard)</option>
          </select>

          <label htmlFor="monster">Monster/Raid or Boss</label>
          <input
            id="monster"
            type="text"
            list="monster-options"
            value={monsterQuery}
            onChange={(event) => {
              const value = event.target.value;
              setMonsterQuery(value);

              const exactMatch = monsters.find(
                (monster) =>
                  getDisplayMonsterLabel(monster, encounterFilter).toLowerCase() ===
                  value.toLowerCase(),
              );
              setSelectedMonsterId(exactMatch ? String(exactMatch.id) : "");
            }}
            placeholder="Select or type a boss/raid..."
            disabled={isLoadingMonsters}
          />
          <datalist id="monster-options">
            {filteredMonsters.map((monster) => (
              <option
                key={monster.id}
                value={getDisplayMonsterLabel(monster, encounterFilter)}
              />
            ))}
          </datalist>

          <label htmlFor="kills">Kills and Raids count</label>
          <input
            id="kills"
            type="number"
            min={1}
            max={MAX_KILL_INPUT}
            value={killCountInput}
            onChange={(event) => {
              const value = event.target.value;
              const parsed = Number.parseInt(value, 10);
              if (Number.isFinite(parsed) && parsed > MAX_KILL_INPUT) {
                setKillCountInput(String(MAX_KILL_INPUT));
                return;
              }
              setKillCountInput(value);
            }}
            placeholder="e.g. 500"
          />

          <div className="controls-actions">
            <button
              type="button"
              className="kill-btn"
              onClick={handleManualKill}
              disabled={isLoadingMonsters || !selectedMonster}
            >
              {selectedMonster
                ? `Kill ${getDisplayMonsterLabel(selectedMonster, encounterFilter)} x${killCountInput || "0"}`
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

            <button
              type="button"
              className="secondary-btn auto-btn reset-btn"
              onClick={handleResetRun}
              disabled={!selectedMonster}
            >
              Reset
            </button>
          </div>
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
                <p className="empty">
                  No matching item drops found for this query.
                </p>
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
                      Avg:{" "}
                      {Math.ceil(prediction.expectedKills).toLocaleString(
                        "en-US",
                      )}{" "}
                      kills
                    </span>
                    <span>
                      90%:{" "}
                      {Math.ceil(prediction.killsFor90Percent).toLocaleString(
                        "en-US",
                      )}{" "}
                      kills
                    </span>
                    <span>
                      Chance/kill: {(prediction.perKillChance * 100).toFixed(3)}
                      %
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="results-meta">
          <span>
            {selectedMonster
              ? getDisplayMonsterLabel(selectedMonster, encounterFilter)
              : "No monster selected"}
          </span>
          <span>Killed: {totalKills.toLocaleString("en-US")}</span>
          <span>
            Account kills:{" "}
            {(lifetimeKills + totalKills).toLocaleString("en-US")}
          </span>
          <span>{results.length} unique drops</span>
          <span>Rare luck: {averageLuckPercent.toFixed(1)}%</span>
          {dryLevel && <span className="dry-indicator">{dryLevel}</span>}
        </div>

        <div className="rng-panel">
          <div className="rng-row">
            <span>
              Rare luck vs average player (
              {`<=${Math.round(RARE_DROP_THRESHOLD * 100)}% drop chance`})
            </span>
            <strong>{averageLuckPercent.toFixed(1)}% vs 100%</strong>
          </div>
          <div className="rng-chart">
            {luckHistory.length === 0 ? (
              <p className="empty">
                RNG distribution appears after your first kill batch.
              </p>
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

        <div className="loot-tab-header">
          <h3 className="loot-tab-title">Loot Tab</h3>
          <span className="loot-tab-value">Total GP: {formatGp(totalGpValue)}</span>
        </div>
        <div className="results">
          {results.length === 0 ? (
            <p className="empty">No results yet. Run a simulation.</p>
          ) : (
            results.map((drop) => (
              <div
                className={`drop-card ${getDropCardClass(drop)}`}
                key={drop.id}
              >
                {(() => {
                  const resolvedId = getResolvedItemId(drop, itemIdByName);
                  const iconDrop: DropResult = { ...drop, id: resolvedId };
                  return (
                <img
                  src={getIconCandidates(iconDrop)[0]}
                  alt={drop.name}
                  loading="lazy"
                  onError={(event) => {
                    const image = event.currentTarget;
                    const candidates = getIconCandidates(iconDrop);
                    const currentStep = Number.parseInt(
                      image.dataset.fallbackStep ?? "0",
                      10,
                    );
                    const nextStep = Number.isFinite(currentStep)
                      ? currentStep + 1
                      : 1;
                    image.dataset.fallbackStep = String(nextStep);
                    image.src =
                      candidates[Math.min(nextStep, candidates.length - 1)];
                  }}
                />
                  );
                })()}
                <p>{drop.name}</p>
                <strong className={getQuantityTierClass(drop.quantity)}>
                  x{drop.quantity.toLocaleString("en-US")}
                </strong>
                <span className="drop-card-gp">
                  {formatGp(
                    getDropUnitValue(drop, itemIdByName, itemValues) *
                      drop.quantity,
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
