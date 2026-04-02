export type MonsterDrop = {
  id: number;
  name: string;
  quantity: string | null;
  rarity: number;
  rolls: number;
};

export type Monster = {
  id: number;
  name: string;
  wiki_name: string;
  last_updated?: string | null;
  drops: MonsterDrop[];
};

export type DropResult = {
  id: number;
  name: string;
  quantity: number;
  rarity: number;
};

export type MonsterResponse = Monster[] | Record<string, Monster>;

export type SimulationBatch = {
  drops: DropResult[];
  expectedRareRolls: number;
  successfulRareRolls: number;
};

export type AccountMonsterStats = {
  id: number;
  name: string;
  totalKills: number;
  lastPlayedAt: string;
};

export type AccountStatsStore = Record<string, AccountMonsterStats>;

export type LuckPoint = {
  id: number;
  luckPercent: number;
};

/** Where a monster lives in the encounter list (not the UI filter). */
export type MonsterEncounterCategory = "raids" | "dt2" | "bosses";

/** UI category: all encounters, raids only, or DT2 bosses only. Pair with hard mode for CM/HM/Awakened. */
export type EncounterFilter = "all" | "raids" | "dt2";

export type EncounterMode = "normal" | "hard";
