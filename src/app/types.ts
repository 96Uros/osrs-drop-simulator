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

export type ItemDropPrediction = {
  monsterId: number;
  monsterName: string;
  itemName: string;
  perKillChance: number;
  expectedKills: number;
  killsFor90Percent: number;
};

export type EncounterFilter =
  | "all"
  | "bosses"
  | "raids"
  | "raids-hard"
  | "dt2"
  | "dt2-hard";

export type EncounterMode = "normal" | "hard";
