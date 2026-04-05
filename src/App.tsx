import "./styles/globals.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountStatsStore,
  DropResult,
  EncounterFilter,
  EncounterMode,
  LuckPoint,
  Monster,
  MonsterDrop,
  MonsterEncounterCategory,
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
  SITE_LAST_UPDATED,
  WIKI_IMAGE_BASE_URL,
  WIKI_LATEST_PRICE_URL,
  WIKI_MAPPING_URL,
} from "./app/constants";
import { CUSTOM_ENCOUNTERS } from "./app/custom-encounters";
declare global {
  interface Window {
    kofiwidget2?: {
      init: (title: string, color: string, id: string) => void;
      /** Uses document.writeln — never call after load; it wipes the page. */
      draw: () => void;
      getHTML: () => string;
    };
  }
}

let kofiWidgetInitialized = false;

function getKofiFooterMarkup(): string | null {
  if (!window.kofiwidget2) return null;
  if (!kofiWidgetInitialized) {
    window.kofiwidget2.init(
      "Support project on Ko-fi",
      "#3b3b3b",
      "S6S61X1T35",
    );
    kofiWidgetInitialized = true;
  }
  return window.kofiwidget2.getHTML();
}

type RaidUniqueModel = {
  uniqueChance: number;
  uniqueWeights: Array<{ name: string; weight: number }>;
};

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

function clampDropRollProbability(rarity: number): number {
  if (!Number.isFinite(rarity)) return 0;
  return Math.min(1, Math.max(0, rarity));
}

function applyDropQuantityToTotals(
  totals: Map<number, DropResult>,
  drop: MonsterDrop,
  amount: number,
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
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
  return true;
}

function runDropSimulation(
  drops: MonsterDrop[],
  killCount: number,
  raidUniqueModel?: RaidUniqueModel | null,
): SimulationBatch {
  const totals = new Map<number, DropResult>();
  let successfulRareRolls = 0;
  let expectedRareRolls = 0;
  const raidUniqueNames = new Set(
    (raidUniqueModel?.uniqueWeights ?? []).map((item) =>
      item.name.toLowerCase(),
    ),
  );

  const pickRaidUnique = (): string | null => {
    if (!raidUniqueModel || raidUniqueModel.uniqueWeights.length === 0)
      return null;
    const totalWeight = raidUniqueModel.uniqueWeights.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    if (totalWeight <= 0) return null;
    let target = Math.random() * totalWeight;
    for (const item of raidUniqueModel.uniqueWeights) {
      target -= item.weight;
      if (target <= 0) return item.name;
    }
    return raidUniqueModel.uniqueWeights[
      raidUniqueModel.uniqueWeights.length - 1
    ].name;
  };

  for (let kill = 0; kill < killCount; kill += 1) {
    let rareDropAlreadyHit = false;
    let killYieldedLoot = false;

    if (raidUniqueModel) {
      expectedRareRolls += raidUniqueModel.uniqueChance;
      if (Math.random() <= raidUniqueModel.uniqueChance) {
        const uniqueName = pickRaidUnique();
        const uniqueDrop = drops.find(
          (drop) => drop.name.toLowerCase() === uniqueName?.toLowerCase(),
        );
        if (uniqueDrop) {
          successfulRareRolls += 1;
          rareDropAlreadyHit = true;
          const amount = parseQuantityRange(uniqueDrop.quantity);
          if (applyDropQuantityToTotals(totals, uniqueDrop, amount)) {
            killYieldedLoot = true;
          }
        }
      }
    }

    for (const drop of drops) {
      if (raidUniqueNames.has(drop.name.toLowerCase())) {
        continue;
      }
      const isRareDrop = drop.rarity <= RARE_DROP_THRESHOLD;
      if (isRareDrop) {
        expectedRareRolls += drop.rarity * drop.rolls;
      }

      const rollChance = clampDropRollProbability(drop.rarity);

      for (let roll = 0; roll < drop.rolls; roll += 1) {
        if (isRareDrop && rareDropAlreadyHit && !drop.independentRare) {
          continue;
        }

        if (Math.random() <= rollChance) {
          if (isRareDrop) {
            successfulRareRolls += 1;
            if (!drop.independentRare) {
              rareDropAlreadyHit = true;
            }
          }
          const amount = parseQuantityRange(drop.quantity);
          if (applyDropQuantityToTotals(totals, drop, amount)) {
            killYieldedLoot = true;
          }
        }
      }
    }

    // Every kill should drop at least something (OSRS always has loot on a kill).
    if (!killYieldedLoot && drops.length > 0) {
      const eligible = drops.filter(
        (d) => !raidUniqueNames.has(d.name.toLowerCase()),
      );
      let pool = eligible.length > 0 ? eligible : drops;
      const commons = pool.filter((d) => d.rarity > RARE_DROP_THRESHOLD);
      if (commons.length > 0) {
        pool = commons;
      }
      const fallbackDrop = pool.reduce((best, d) =>
        clampDropRollProbability(d.rarity) >
        clampDropRollProbability(best.rarity)
          ? d
          : best,
      );
      const rawAmount = parseQuantityRange(fallbackDrop.quantity);
      const amount = Math.max(1, rawAmount);
      applyDropQuantityToTotals(totals, fallbackDrop, amount);
    }
  }

  return {
    drops: [...totals.values()]
      .filter((d) => d.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity),
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
  categoryHardMode: boolean,
): string {
  const baseLabel = getMonsterLabel(monster);
  if (
    filter === "dt2" &&
    categoryHardMode &&
    getEncounterType(monster) === "dt2"
  ) {
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

type KillFormField = "monster" | "kills";

function scrollFieldIntoView(elementId: string) {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
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
  // Match all "boss pets" from OSRS Wiki Pet list.
  // We normalize by removing non-alphanumerics so apostrophes/dots/parentheses
  // don't prevent matching (e.g. "Baby chinchompa (red)" -> babychinchompa).
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "");

  const key = normalize(name);

  // The full list is intentionally spelled as stable tokens (already normalized).
  // This avoids relying on substrings like "pet" which can cause false positives.
  const keys = [
    "petchaoselemental",
    "petdagannothsupreme",
    "petdagannothprime",
    "petdagannothrex",
    "petpenancequeen",
    "petkreearra",
    "petgeneralgraardor",
    "petzilyana",
    "petkriltsutsaroth",
    "babymole",
    "princeblackdragon",
    "kalphiteprincess",
    "petsmokedevil",
    "petkraken",
    "petdarkcore",
    "petsnakeling",
    "chompychick",
    "venenatispiderling",
    "callistocub",
    "vetionjr",
    "scorpiasoffspring",
    "tzrekjad",
    "hellpuppy",
    "abyssalorphan",
    "heron",
    "rockgolem",
    "beaver",
    "babychinchompa",
    "bloodhound",
    "giantsquirrel",
    "tangleroot",
    "riftguardian",
    "rocky",
    "phoenix",
    "olmlet",
    "skotos",
    "jalnibrek",
    "herbi",
    "noon",
    "vorki",
    "lilzik",
    "ikklehydra",
    "smolcano",
    "sraracha",
    "youngllef",
    "littlenightmare",
    "lilcreator",
    "tinytempor",
    "nexling",
    "abyssalprotector",
    "tumekensguardian",
    "muphin",
    "wisp",
    "butch",
    "lilviathan",
    "baron",
    "scurry",
    "smolheredit",
    "quetzin",
    "nid",
    "huberte",
    "moxi",
    "bran",
    "yami",
    "dom",
    "soup",
    "gullpet",
    "beef",
  ];

  return keys.some((k) => key.includes(k));
}

function getDropCardClass(drop: DropResult): string {
  if (isPetDropName(drop.name)) return "pet-card";
  if (drop.rarity <= EXTREME_RARE_THRESHOLD) return "extreme-rare-card";
  return "";
}

function isCoinsDrop(name: string): boolean {
  return normalizeItemName(name) === "coins";
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
  if (typeof resolvedById === "number" && resolvedById > 0) return resolvedById;

  const byName = CUSTOM_ITEM_PRICES[drop.name];
  if (typeof byName === "number" && byName > 0) return byName;

  const normalized = normalizeItemName(drop.name);
  const nameMatch = Object.entries(CUSTOM_ITEM_PRICES).find(
    ([name]) => normalizeItemName(name) === normalized,
  );
  if (nameMatch && typeof nameMatch[1] === "number" && nameMatch[1] > 0) {
    return nameMatch[1];
  }

  if (typeof resolvedById === "number") return resolvedById;
  return 0;
}

function getResolvedItemId(
  drop: DropResult,
  itemIdByName: Record<string, number>,
): number {
  const mappedId = itemIdByName[normalizeItemName(drop.name)];
  if (typeof mappedId === "number" && mappedId > 0) return mappedId;
  if (drop.id > 0) return drop.id;
  return drop.id;
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

function getEncounterType(monster: Monster): MonsterEncounterCategory {
  if (monster.id <= -2000) return "raids";
  if (monster.id <= -1000) return "dt2";
  return "bosses";
}

function getSimulationMode(
  filter: EncounterFilter,
  categoryHardMode: boolean,
): EncounterMode {
  if (categoryHardMode && (filter === "raids" || filter === "dt2")) {
    return "hard";
  }
  return "normal";
}

function getDropsForMode(monster: Monster, mode: EncounterMode): MonsterDrop[] {
  if (mode === "normal") return monster.drops;

  const encounterType = getEncounterType(monster);
  if (encounterType !== "raids" && encounterType !== "dt2")
    return monster.drops;

  const uniqueBoost = encounterType === "raids" ? 1.25 : 3;
  return monster.drops.map((drop) => {
    if (drop.rarity > RARE_DROP_THRESHOLD) return drop;
    // Awakened DT2: ~3x unique rate (wiki); skip rolls at exactly the rare threshold so
    // standard ~2% supply drops are not tripled alongside the unique table.
    if (encounterType === "dt2" && drop.rarity >= RARE_DROP_THRESHOLD) {
      return drop;
    }
    return {
      ...drop,
      rarity: Math.min(1, drop.rarity * uniqueBoost),
    };
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseQuantityBounds(quantity: string | null): { min: number; max: number } | null {
  if (!quantity) return null;
  const normalized = quantity.replaceAll(",", "").trim();
  const parts = normalized.split("-");
  const min = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(min)) return null;
  if (parts.length < 2) return { min, max: min };
  const max = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(max) || max < min) return { min, max: min };
  return { min, max };
}

function formatScaledQuantity(min: number, max: number): string {
  if (min === max) return String(min);
  return `${min}-${max}`;
}

function getBarrowsScaledDrops(drops: MonsterDrop[], rewardPotential: number) {
  // Ratio in [0..1]; max potential (wiki) is treated as 1012 in this simulator.
  const ratio = clampNumber(rewardPotential, 0, 1012) / 1012;

  const scaleByPotentialNames = new Set([
    "Coins",
    "Mind rune",
    "Chaos rune",
    "Death rune",
    "Blood rune",
    "Bolt rack",
    "Loop half of key",
    "Tooth half of key",
    "Dragon med helm",
  ]);

  return drops.map((drop) => {
    if (!scaleByPotentialNames.has(drop.name)) return drop;

    const bounds = parseQuantityBounds(drop.quantity);
    if (!bounds) return drop;

    const scaledMin = Math.max(1, Math.floor(bounds.min * ratio));
    const scaledMax = Math.max(scaledMin, Math.floor(bounds.max * ratio));
    const scaledQuantity = formatScaledQuantity(scaledMin, scaledMax);

    // Coins are guaranteed in our barrows table; keep their rarity as-is.
    const scaledRarity =
      drop.name === "Coins" ? drop.rarity : Math.min(1, drop.rarity * ratio);

    return { ...drop, quantity: scaledQuantity, rarity: scaledRarity };
  });
}

function getRaidUniqueModel(
  monster: Monster,
  mode: EncounterMode,
  coxPoints: number,
  toaLevel: number,
  tobTeamSize: number,
  tobDeathless: boolean,
): RaidUniqueModel | null {
  if (monster.id === -2001) {
    // OSRS: 1% chance per 8,676 total points to obtain a unique loot (purple table),
    // capped at 65.7% (570,000 points).
    const uniqueChance = clampNumber(coxPoints / 867_600, 0, 0.657);
    return {
      uniqueChance,
      uniqueWeights: [
        // OSRS purple table weights (sum = 69).
        { name: "Dexterous prayer scroll", weight: 20 },
        { name: "Arcane prayer scroll", weight: 20 },
        { name: "Twisted buckler", weight: 4 },
        { name: "Dragon hunter crossbow", weight: 4 },
        { name: "Dinh's bulwark", weight: 3 },
        { name: "Ancestral hat", weight: 3 },
        { name: "Ancestral robe top", weight: 3 },
        { name: "Ancestral robe bottom", weight: 3 },
        { name: "Dragon claws", weight: 3 },
        { name: "Elder maul", weight: 2 },
        { name: "Kodai insignia", weight: 2 },
        { name: "Twisted bow", weight: 2 },
      ],
    };
  }

  if (monster.id === -2002) {
    const teamSize = clampNumber(tobTeamSize, 1, 5);
    // Monumental chest (wiki): team purple ~1/9.1 (normal) or ~1/7.7 (hard), same for any team size.
    // Deaths lower the rate (~12% boost when deathless vs with deaths, matching prior sim tuning).
    // Personal loot: one player receives the unique — approximate with equal split across team size.
    const teamPurpleChance =
      (mode === "hard" ? 1 / 7.7 : 1 / 9.1) * (tobDeathless ? 1 : 1 / 1.12);
    const uniqueChance = clampNumber(teamPurpleChance / teamSize, 0, 0.45);
    // Monumental chest (OSRS wiki): among uniques, rarities are 1/x; P ∝ 1/x.
    // Normal — hilt 1/2.375, weapons/justiciar 1/9.5 each, scythe 1/19 → weights 8:2:2:2:2:2:1 (sum 19).
    // Hard — hilt 1/2.571, others 1/9, scythe 1/18 → weights 7:2:2:2:2:2:1 (sum 18).
    const uniqueWeights =
      mode === "hard"
        ? [
            { name: "Avernic defender hilt", weight: 7 },
            { name: "Ghrazi rapier", weight: 2 },
            { name: "Sanguinesti staff (uncharged)", weight: 2 },
            { name: "Justiciar faceguard", weight: 2 },
            { name: "Justiciar chestguard", weight: 2 },
            { name: "Justiciar legguards", weight: 2 },
            { name: "Scythe of vitur (uncharged)", weight: 1 },
          ]
        : [
            { name: "Avernic defender hilt", weight: 8 },
            { name: "Ghrazi rapier", weight: 2 },
            { name: "Sanguinesti staff (uncharged)", weight: 2 },
            { name: "Justiciar faceguard", weight: 2 },
            { name: "Justiciar chestguard", weight: 2 },
            { name: "Justiciar legguards", weight: 2 },
            { name: "Scythe of vitur (uncharged)", weight: 1 },
          ];
    return {
      uniqueChance,
      uniqueWeights,
    };
  }

  if (monster.id === -2003) {
    // Base unique rate model: keep existing approximation of purple roll frequency.
    const baseUniqueChance = clampNumber(
      ((toaLevel + 5) / 3500) * (mode === "hard" ? 1.12 : 1),
      0.005,
      0.55,
    );

    // OSRS: purple table selection weights and entry-mode reduction are defined in
    // Module:Tombs_of_Amascut_loot. We model it in terms of:
    // - Reweighting for raid levels > 300 (decrease fang/lightbearer, increase others)
    // - Entry mode reduction for items gated at raid_level 150 (divide those rates by 50)
    // Then we scale the overall uniqueChance by the effective weight sum ratio.
    const raidLevel = toaLevel;

    // Base purple weights (sum = 240) for raid_level <= 300.
    let fangWeight = 70;
    let lightbearerWeight = 70;
    const wardBase = 30;
    const shadowBase = 10;
    const masoriBase = 20; // each piece

    if (raidLevel > 300) {
      if (raidLevel >= 500) {
        fangWeight = 30;
        lightbearerWeight = 35;
      } else if (raidLevel >= 450) {
        fangWeight = 40 - Math.floor((raidLevel - 450) * 0.2);
        lightbearerWeight = 40 - Math.floor((raidLevel - 450) * 0.1);
      } else if (raidLevel >= 400) {
        fangWeight = 40;
        lightbearerWeight = 50 - Math.floor((raidLevel - 400) * 0.2);
      } else if (raidLevel >= 350) {
        fangWeight = 60 - Math.floor((raidLevel - 350) * 0.4);
        lightbearerWeight = 60 - Math.floor((raidLevel - 350) * 0.2);
      } else {
        // 301..349
        fangWeight = 70 - Math.floor((raidLevel - 300) * 0.2);
        lightbearerWeight = 70 - Math.floor((raidLevel - 300) * 0.2);
      }
    }

    // Apply entry-mode gating. In the wiki module:
    // - items with level = 150 get divided by 50 when raid_level < 150
    // - fang/lightbearer get divided by 50 when raid_level < 50
    const gateFactor150 = raidLevel < 150 ? 1 / 50 : 1;
    const gateFactor50 = raidLevel < 50 ? 1 / 50 : 1;

    const wardWeight = wardBase * gateFactor150;
    const shadowWeight = shadowBase * gateFactor150;
    const masoriWeight = masoriBase * gateFactor150;
    const fangEffectiveWeight = fangWeight * gateFactor50;
    const lightbearerEffectiveWeight = lightbearerWeight * gateFactor50;

    const sumBaseWeights = fangWeight + lightbearerWeight + wardBase + shadowBase + 3 * masoriBase;
    const sumEffectiveWeights =
      fangEffectiveWeight +
      lightbearerEffectiveWeight +
      wardWeight +
      shadowWeight +
      3 * masoriWeight;

    const uniqueChance = clampNumber(
      baseUniqueChance * (sumEffectiveWeights / sumBaseWeights),
      0,
      0.55,
    );

    return {
      uniqueChance,
      uniqueWeights: [
        { name: "Osmumten's fang", weight: fangEffectiveWeight },
        { name: "Tumeken's shadow", weight: shadowWeight },
        { name: "Elidinis' ward", weight: wardWeight },
        { name: "Lightbearer", weight: lightbearerEffectiveWeight },
        { name: "Masori mask", weight: masoriWeight },
        { name: "Masori body", weight: masoriWeight },
        { name: "Masori chaps", weight: masoriWeight },
      ],
    };
  }

  if (monster.id === -500) {
    // Barrows (wiki: Chest (Barrows)), approximation:
    // With all 6 brothers slain, chance to receive at least one Barrows equipment piece
    // is about 1/15.01 per chest. We'll model "uniqueChance" as a single equipment drop
    // chosen uniformly from the 24 equipment items.
    const uniqueChance = 1 / 15.01;

    return {
      uniqueChance: clampNumber(uniqueChance, 0, 0.75),
      uniqueWeights: [
        { name: "Ahrim's hood", weight: 1 },
        { name: "Ahrim's robetop", weight: 1 },
        { name: "Ahrim's robeskirt", weight: 1 },
        { name: "Ahrim's staff", weight: 1 },
        { name: "Dharok's helm", weight: 1 },
        { name: "Dharok's platebody", weight: 1 },
        { name: "Dharok's platelegs", weight: 1 },
        { name: "Dharok's greataxe", weight: 1 },
        { name: "Guthan's helm", weight: 1 },
        { name: "Guthan's platebody", weight: 1 },
        { name: "Guthan's chainskirt", weight: 1 },
        { name: "Guthan's warspear", weight: 1 },
        { name: "Karil's coif", weight: 1 },
        { name: "Karil's leathertop", weight: 1 },
        { name: "Karil's leatherskirt", weight: 1 },
        { name: "Karil's crossbow", weight: 1 },
        { name: "Torag's helm", weight: 1 },
        { name: "Torag's platebody", weight: 1 },
        { name: "Torag's platelegs", weight: 1 },
        { name: "Torag's hammers", weight: 1 },
        { name: "Verac's helm", weight: 1 },
        { name: "Verac's brassard", weight: 1 },
        { name: "Verac's plateskirt", weight: 1 },
        { name: "Verac's flail", weight: 1 },
      ],
    };
  }

  return null;
}

function App() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>("");
  const [encounterFilter, setEncounterFilter] =
    useState<EncounterFilter>("all");
  const [categoryHardMode, setCategoryHardMode] = useState(false);
  const [monsterQuery, setMonsterQuery] = useState("");
  const [killCountInput, setKillCountInput] = useState("1");
  const [autoKillEnabled, setAutoKillEnabled] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [coxPointsInput, setCoxPointsInput] = useState("30000");
  const [toaLevelInput, setToaLevelInput] = useState("300");
  const [tobTeamSizeInput, setTobTeamSizeInput] = useState("4");
  const [tobDeathless, setTobDeathless] = useState(true);
  // OSRS Barrows: reward potential affects which main-table items show up,
  // but unique equipment chance is ~flat when all 6 brothers are slain.
  // Wiki "optimal profit" is ~86%-88% of max potential (~880-890).
  // Barrows: user-facing control in percent.
  // Internally we convert percent -> reward potential (0..1012).
  const [barrowsRewardPercentInput, setBarrowsRewardPercentInput] =
    useState("87");
  const [results, setResults] = useState<DropResult[]>([]);
  const [totalKills, setTotalKills] = useState(0);
  const [lifetimeKills, setLifetimeKills] = useState(0);
  const [itemValues, setItemValues] = useState<Record<number, number>>({});
  const [itemIdByName, setItemIdByName] = useState<Record<string, number>>({});
  const [expectedRareRollsTotal, setExpectedRareRollsTotal] = useState(0);
  const [successfulRareRollsTotal, setSuccessfulRareRollsTotal] = useState(0);
  const [luckHistory, setLuckHistory] = useState<LuckPoint[]>([]);
  const [lastPriceUpdateAt, setLastPriceUpdateAt] = useState<number | null>(
    null,
  );
  const [priceTick, setPriceTick] = useState(0);
  const [isLoadingMonsters, setIsLoadingMonsters] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killFormErrors, setKillFormErrors] = useState<
    Partial<Record<KillFormField, boolean>>
  >({});
  const [kofiFooterHtml, setKofiFooterHtml] = useState("");
  const inFlightItemValues = useRef<Set<number>>(new Set());

  useEffect(() => {
    const SCRIPT_ID = "kofi-widget-2";
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const onLoad = () => {
      const html = getKofiFooterMarkup();
      if (html) setKofiFooterHtml(html);
    };

    if (existing) {
      if (window.kofiwidget2) onLoad();
      else existing.addEventListener("load", onLoad, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://storage.ko-fi.com/cdn/widget/Widget_2.js";
    script.async = true;
    script.onload = onLoad;
    document.body.appendChild(script);
  }, []);

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
        const data = (await response.json()) as Array<{
          id: number;
          name: string;
        }>;
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

  useEffect(() => {
    // Load live GE prices in one request and refresh every 60 seconds.
    const fetchAllPrices = () =>
      fetch(WIKI_LATEST_PRICE_URL)
        .then(async (response) => {
          if (!response.ok) return null;
          const data = (await response.json()) as {
            data?: Record<string, { high?: number; low?: number }>;
          };
          const nextValues: Record<number, number> = {};
          for (const [id, value] of Object.entries(data.data ?? {})) {
            const numericId = Number.parseInt(id, 10);
            if (!Number.isFinite(numericId)) continue;
            const resolved = value.high ?? value.low ?? 0;
            nextValues[numericId] = resolved;
          }
          // Keep latest live prices authoritative over stale cached zeros.
          setItemValues((previous) => ({ ...previous, ...nextValues }));
          setLastPriceUpdateAt(Date.now());
          return null;
        })
        .catch(() => null);

    void fetchAllPrices();
    const interval = window.setInterval(() => {
      void fetchAllPrices();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPriceTick((previous) => previous + 1);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedMonster = useMemo(
    () => monsters.find((monster) => String(monster.id) === selectedMonsterId),
    [monsters, selectedMonsterId],
  );
  const selectedMonsterLabel = useMemo(() => {
    if (!selectedMonster) return "";
    return getDisplayMonsterLabel(
      selectedMonster,
      encounterFilter,
      categoryHardMode,
    );
  }, [categoryHardMode, encounterFilter, selectedMonster]);

  useEffect(() => {
    if (!selectedMonster) return;
    setKillCountInput("1");
  }, [selectedMonster]);

  const filteredMonsters = useMemo(() => {
    const byType =
      encounterFilter === "all"
        ? monsters
        : monsters.filter(
            (monster) => getEncounterType(monster) === encounterFilter,
          );

    // Safety: only show encounters that have actual drops.
    const byTypeWithDrops = byType.filter((monster) => monster.drops.length > 0);

    const query = monsterQuery.trim().toLowerCase();
    if (!query) return byTypeWithDrops;

    return byType.filter((monster) => {
      const label = getMonsterLabel(monster).toLowerCase();
      return label.includes(query);
    });
  }, [encounterFilter, monsters, monsterQuery]);

  const totalGpValue = useMemo(() => {
    return results.reduce((sum, drop) => {
      const itemValue = getDropUnitValue(drop, itemIdByName, itemValues);
      return sum + drop.quantity * itemValue;
    }, 0);
  }, [itemIdByName, itemValues, results]);

  const lootTabHasPet = useMemo(
    () => results.some((drop) => isPetDropName(drop.name)),
    [results],
  );

  const averageLuckPercent = useMemo(() => {
    if (expectedRareRollsTotal <= 0) return 0;
    return (successfulRareRollsTotal / expectedRareRollsTotal) * 100;
  }, [expectedRareRollsTotal, successfulRareRollsTotal]);

  const latestLuckPercent = useMemo(() => {
    if (luckHistory.length === 0) return 0;
    return luckHistory[luckHistory.length - 1].luckPercent;
  }, [luckHistory]);

  const priceUpdatedLabel = useMemo(() => {
    void priceTick;
    if (!lastPriceUpdateAt) return "Prices updating...";
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - lastPriceUpdateAt) / 1000),
    );
    if (elapsedSec < 60) return `Prices updated ${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    return `Prices updated ${elapsedMin}m ago`;
  }, [lastPriceUpdateAt, priceTick]);

  const applyBatch = useCallback(
    (kills: number) => {
      if (!selectedMonster) return;
      const mode = getSimulationMode(encounterFilter, categoryHardMode);
      const modeDrops = getDropsForMode(selectedMonster, mode);
      const barrowsRewardPotential =
        selectedMonster.id === -500
          ? clampNumber(
              (clampNumber(
                Number.parseFloat(barrowsRewardPercentInput) || 87,
                0,
                100,
              ) /
                100) *
                1012,
              0,
              1012,
            )
          : 1012;
      const dropsForSim =
        selectedMonster.id === -500
          ? getBarrowsScaledDrops(modeDrops, barrowsRewardPotential)
          : modeDrops;
      const raidUniqueModel = getRaidUniqueModel(
        selectedMonster,
        mode,
        clampNumber(
          Number.parseInt(coxPointsInput, 10) || 30_000,
          1_000,
          200_000,
        ),
        clampNumber(Number.parseInt(toaLevelInput, 10) || 300, 0, 700),
        clampNumber(Number.parseInt(tobTeamSizeInput, 10) || 4, 1, 5),
        tobDeathless,
      );
      const batch = runDropSimulation(dropsForSim, kills, raidUniqueModel);
      setResults((previous) => mergeDropResults(previous, batch.drops));
      setTotalKills((previous) => previous + kills);
      setExpectedRareRollsTotal(
        (previous) => previous + batch.expectedRareRolls,
      );
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
    },
    [
      categoryHardMode,
      coxPointsInput,
      barrowsRewardPercentInput,
      encounterFilter,
      selectedMonster,
      toaLevelInput,
      tobDeathless,
      tobTeamSizeInput,
    ],
  );

  const handleManualKill = () => {
    const kills = Number.parseInt(killCountInput, 10);
    const killsInvalid =
      !Number.isFinite(kills) || kills <= 0 || kills > MAX_KILL_INPUT;
    const monsterMissing = !selectedMonster;

    if (killsInvalid || monsterMissing) {
      setKillFormErrors({
        kills: killsInvalid,
        monster: monsterMissing,
      });
      if (monsterMissing) {
        setError(
          "Choose a boss or raid: set Encounter type (dropdown above), then pick a name from the list or type it exactly — on some phones the suggestion list is limited.",
        );
        scrollFieldIntoView("monster");
        return;
      }
      setError(
        `Enter a valid kill count (1-${MAX_KILL_INPUT.toLocaleString("en-US")}).`,
      );
      scrollFieldIntoView("kills");
      return;
    }

    setKillFormErrors({});
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
    setKillFormErrors({});
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
  }, [applyBatch, autoKillEnabled, killCountInput, selectedMonster]);

  useEffect(() => {
    if (!isHelpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsHelpOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isHelpOpen]);

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
    setKillFormErrors({});
    if (!selectedMonster) {
      setLifetimeKills(0);
      return;
    }
    const accountStore = loadAccountStore();
    const stats = accountStore[String(selectedMonster.id)];
    setLifetimeKills(stats?.totalKills ?? 0);
  }, [selectedMonster]);

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
    <div className="app-layout">
      <div className="container">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title-row">
              <h1>OSRS Drop Simulator</h1>
            </div>
          </div>

          {isHelpOpen && (
            <div
              className="help-modal-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setIsHelpOpen(false)}
            >
              <div
                className="help-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="help-modal-header">
                  <h2>How this simulator calculates drops</h2>
                  <button
                    type="button"
                    className="help-modal-close"
                    aria-label="Close"
                    onClick={() => setIsHelpOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="help-modal-body">
                  <p>
                    This is a simplified fan model (not 1:1 “game code”), but it
                    reproduces the main OSRS mechanics: purple/unique selection,
                    weighted tables, and point-based split uniques (where
                    applicable).
                  </p>

                  <details open>
                    <summary>Bosses & encounters (what “clicks” mean)</summary>
                    <p>
                      “Kills and Raids count” is the number of separate runs/chests
                      you simulate. The app then aggregates all drops into the loot
                      tab.
                    </p>
                  </details>

                  <details>
                    <summary>CoX (Chambers of Xeric) unique “purple”</summary>
                    <p>
                      CoX has a separate model: first, the chance for receiving
                      unique loot is simulated from your <code>CoX points</code>
                      (OSRS: 1% per 8,676 points, capped at 65.7%). If the unique
                      happens, the item is selected from the purple table by weight
                      and this app assigns one unique per simulated run.
                    </p>
                  </details>

                  <details>
                    <summary>ToA (Tombs of Amascut) purple table + entry mode</summary>
                    <p>
                      ToA uses purple reweighting (305+) and entry-mode gating (cutoff
                      at raid level 150), then selects the unique by weight. In this
                      app, the “unique roll” is treated as a simplified trigger per run.
                    </p>
                  </details>

                  <details>
                    <summary>ToB / DT2 “Hard (CM / HM / awakened)”</summary>
                    <p>
                      When you enable <b>Hard</b> in the UI, the simulator increases
                      unique rates only for the relevant encounter types (ToB/DT2/raids),
                      matching the CM/HM/awakened variants.
                    </p>
                  </details>

                  <details>
                    <summary>GE prices (“Prices updated …”)</summary>
                    <p>
                      The app periodically fetches live Grand Exchange prices and uses
                      them to compute the “Total GP” and per-drop GP values. The label
                      <code>Prices updated …</code> shows when the last refresh happened
                      (it updates roughly every 60 seconds).
                    </p>
                  </details>

                  <details>
                    <summary>Barrows (Chest (Barrows)) reward potential</summary>
                    <p>
                      Barrows is modeled as: unique equipment is ~flat (~1/15),
                      while main-table items (runes, bolt racks, key halves, dragon med helm)
                      are scaled by your <code>reward %</code> input. Dragon med helm is
                      prevented from rolling when a Barrows equipment unique is hit.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          )}

          <div className="controls">
            <div className="controls-rng">
              <div className="rng-row">
                <span>
                  Rare luck vs average player (
                  {`<=${Math.round(RARE_DROP_THRESHOLD * 100)}% drop chance`})
                </span>
                <strong>{averageLuckPercent.toFixed(1)}% vs 100%</strong>
              </div>
              <div className="rng-row">
                <span>Luck graph (%)</span>
                <strong>Latest: {latestLuckPercent.toFixed(1)}%</strong>
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

            <div className="controls-fields">
              <label htmlFor="encounter-filter">Encounter type</label>
              <select
                id="encounter-filter"
                className="controls-touch-select"
                value={encounterFilter}
                onChange={(event) => {
                  setEncounterFilter(event.target.value as EncounterFilter);
                  setKillFormErrors((previous) => ({
                    ...previous,
                    monster: false,
                  }));
                }}
              >
                <option value="all">All encounters (incl. bosses)</option>
                <option value="raids">Raids</option>
                <option value="dt2">DT2 bosses</option>
              </select>

              {(encounterFilter === "raids" || encounterFilter === "dt2") && (
                <>
                  <label htmlFor="category-mode">Mode</label>
                  <select
                    id="category-mode"
                    className="controls-touch-select"
                    value={categoryHardMode ? "hard" : "normal"}
                    onChange={(event) => {
                      setCategoryHardMode(event.target.value === "hard");
                      setKillFormErrors((previous) => ({
                        ...previous,
                        monster: false,
                      }));
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="hard">Hard (CM / HM / awakened)</option>
                  </select>
                </>
              )}

              <label
                className={
                  killFormErrors.monster ? "controls-label--error" : undefined
                }
                htmlFor="monster"
              >
                Monster/Raid or Boss
              </label>
              <input
                id="monster"
                type="text"
                list="monster-options"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={killFormErrors.monster ? true : undefined}
                className={killFormErrors.monster ? "field-error" : undefined}
                value={monsterQuery}
                onFocus={() => {
                  // If a boss is already selected, clear query on focus so full list shows.
                  if (
                    selectedMonster &&
                    monsterQuery.trim().toLowerCase() ===
                      selectedMonsterLabel.trim().toLowerCase()
                  ) {
                    setMonsterQuery("");
                  }
                }}
                onChange={(event) => {
                  const value = event.target.value;
                  setMonsterQuery(value);
                  setKillFormErrors((previous) => ({
                    ...previous,
                    monster: false,
                  }));

                  const exactMatch = monsters.find(
                    (monster) =>
                      getDisplayMonsterLabel(
                        monster,
                        encounterFilter,
                        categoryHardMode,
                      ).toLowerCase() === value.toLowerCase(),
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
                    value={getDisplayMonsterLabel(
                      monster,
                      encounterFilter,
                      categoryHardMode,
                    )}
                  />
                ))}
              </datalist>

              <label
                className={
                  killFormErrors.kills ? "controls-label--error" : undefined
                }
                htmlFor="kills"
              >
                Kills and Raids count
              </label>
              <input
                id="kills"
                type="number"
                min={1}
                max={MAX_KILL_INPUT}
                inputMode="numeric"
                aria-invalid={killFormErrors.kills ? true : undefined}
                className={killFormErrors.kills ? "field-error" : undefined}
                value={killCountInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setKillFormErrors((previous) => ({
                    ...previous,
                    kills: false,
                  }));
                  const parsed = Number.parseInt(value, 10);
                  if (Number.isFinite(parsed) && parsed > MAX_KILL_INPUT) {
                    setKillCountInput(String(MAX_KILL_INPUT));
                    return;
                  }
                  setKillCountInput(value);
                }}
                placeholder="e.g. 500"
              />

              {selectedMonster &&
                getEncounterType(selectedMonster) === "raids" && (
                  <>
                    {selectedMonster.id === -2001 && (
                      <>
                        <label htmlFor="cox-points">CoX points</label>
                        <input
                          id="cox-points"
                          type="number"
                          min={1000}
                          max={200000}
                          value={coxPointsInput}
                          onChange={(event) =>
                            setCoxPointsInput(event.target.value)
                          }
                          placeholder="e.g. 30000"
                        />
                      </>
                    )}
                    {selectedMonster.id === -2003 && (
                      <>
                        <label htmlFor="toa-level">ToA raid level</label>
                        <input
                          id="toa-level"
                          type="number"
                          min={0}
                          max={700}
                          value={toaLevelInput}
                          onChange={(event) =>
                            setToaLevelInput(event.target.value)
                          }
                          placeholder="e.g. 300"
                        />
                      </>
                    )}
                    {selectedMonster.id === -2002 && (
                      <>
                        <label htmlFor="tob-team-size">ToB team size</label>
                        <input
                          id="tob-team-size"
                          type="number"
                          min={1}
                          max={5}
                          value={tobTeamSizeInput}
                          onChange={(event) =>
                            setTobTeamSizeInput(event.target.value)
                          }
                          placeholder="e.g. 4"
                          title="Team purple rate is ~fixed; your simulated share is divided by team size (equal split)."
                        />
                        <label htmlFor="tob-deathless">ToB deathless run</label>
                        <select
                          id="tob-deathless"
                          className="controls-touch-select"
                          value={tobDeathless ? "yes" : "no"}
                          onChange={(event) =>
                            setTobDeathless(event.target.value === "yes")
                          }
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </>
                    )}
                  </>
                )}

              {selectedMonster && selectedMonster.id === -500 && (
                <>
                  <label htmlFor="barrows-reward-percent">
                    Barrows reward %
                  </label>
                  <input
                    id="barrows-reward-percent"
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    value={barrowsRewardPercentInput}
                    onChange={(event) =>
                      setBarrowsRewardPercentInput(event.target.value)
                    }
                    placeholder="e.g. 86-88"
                    title="Controls main-table items (runes, bolt racks, key halves, dragon med helm). Value is a % of max reward potential (0-100). Uniques stay ~flat (~1/15 with all 6 brothers)."
                  />
                </>
              )}
            </div>

            {error && (
              <p className="error controls-error" role="alert">
                {error}
              </p>
            )}

            <div className="controls-actions">
              <button
                type="button"
                className="kill-btn"
                onClick={handleManualKill}
                disabled={isLoadingMonsters}
              >
                {selectedMonster
                  ? `Kill ${getDisplayMonsterLabel(selectedMonster, encounterFilter, categoryHardMode)} x${killCountInput || "0"}`
                  : "Kill (choose boss/raid above)"}
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

          <div
            className={
              lootTabHasPet
                ? "loot-tab-section loot-tab-section--pet-gold"
                : "loot-tab-section"
            }
          >
            <div className="loot-tab-header">
              <h3 className="loot-tab-title">
                Loot Tab
                {selectedMonster
                  ? ` | ${getDisplayMonsterLabel(selectedMonster, encounterFilter, categoryHardMode)} x${totalKills.toLocaleString("en-US")}`
                  : ""}
              </h3>
              <div className="loot-tab-values">
                <span className="loot-tab-value">
                  Total GP: {formatGp(totalGpValue)}
                </span>
                <span className="loot-tab-value">{priceUpdatedLabel}</span>
                <button
                  type="button"
                  className="loot-tab-value help-btn"
                  aria-label="About calculation"
                  onClick={() => setIsHelpOpen(true)}
                  title="How calculations work"
                >
                  ?
                </button>
              </div>
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
                              candidates[
                                Math.min(nextStep, candidates.length - 1)
                              ];
                          }}
                        />
                      );
                    })()}
                    <p>{drop.name}</p>
                    <strong className={getQuantityTierClass(drop.quantity)}>
                      x{drop.quantity.toLocaleString("en-US")}
                    </strong>
                    {!isCoinsDrop(drop.name) && !isPetDropName(drop.name) && (
                      <span className="drop-card-gp">
                        {formatGp(
                          getDropUnitValue(drop, itemIdByName, itemValues) *
                            drop.quantity,
                        )}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="footer-container">
        <div className="footer">
          {kofiFooterHtml ? (
            <div
              className="footer-kofi"
              dangerouslySetInnerHTML={{ __html: kofiFooterHtml }}
            />
          ) : null}
          <div className="footer-copy">
            <p className="footer-credit">
              Created by <span className="footer-credit-ign">SoP crVek</span>
            </p>
            <p className="footer-last-updated">
              Last updated {SITE_LAST_UPDATED}
            </p>
            <p className="footer-attrib">
              Monster, drop, and GE data from the{" "}
              <a
                href="https://oldschool.runescape.wiki/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Old School RuneScape Wiki
              </a>
              . Independent fan simulator — not affiliated with, endorsed by, or
              supported by Jagex or the wiki staff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
