import "./styles/globals.css";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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
};

type MonsterResponse = Monster[] | Record<string, Monster>;

const MONSTER_URLS = [
  "/monsters-complete.json",
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json",
  "https://cdn.jsdelivr.net/gh/osrsbox/osrsbox-db@master/docs/monsters-complete.json",
];
const ITEM_ICON_URL =
  "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-icons";

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

function runDropSimulation(monster: Monster, killCount: number): DropResult[] {
  const totals = new Map<number, DropResult>();

  for (let kill = 0; kill < killCount; kill += 1) {
    for (const drop of monster.drops) {
      for (let roll = 0; roll < drop.rolls; roll += 1) {
        if (Math.random() <= drop.rarity) {
          const amount = parseQuantityRange(drop.quantity);
          const current = totals.get(drop.id);

          if (current) {
            current.quantity += amount;
          } else {
            totals.set(drop.id, {
              id: drop.id,
              name: drop.name,
              quantity: amount,
            });
          }
        }
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
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

function App() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>("");
  const [monsterQuery, setMonsterQuery] = useState("");
  const [killCountInput, setKillCountInput] = useState("100");
  const [results, setResults] = useState<DropResult[]>([]);
  const [isLoadingMonsters, setIsLoadingMonsters] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      throw new Error("Monster endpointi niso dosegljivi.");
    };

    const fetchMonsters = async () => {
      try {
        const data = await fetchMonstersFromAnySource();
        const withDrops = dedupeMonstersByLatestUpdate(data)
          .filter((monster) => monster.drops.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));

        setMonsters(withDrops);
      } catch {
        setError(
          "Podatkov ni bilo mogoce naloziti. Dodaj datoteko public/monsters-complete.json ali preveri internet.",
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
    const query = monsterQuery.trim().toLowerCase();
    if (!query) return monsters;

    return monsters.filter((monster) => {
      const label = getMonsterLabel(monster).toLowerCase();
      return label.includes(query);
    });
  }, [monsters, monsterQuery]);

  const handleSimulate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedMonster) {
      setError("Najprej izberi monsterja.");
      return;
    }

    const kills = Number.parseInt(killCountInput, 10);
    if (!Number.isFinite(kills) || kills <= 0) {
      setError("Vnesi veljavno stevilo killov.");
      return;
    }

    setError(null);
    setResults(runDropSimulation(selectedMonster, kills));
  };

  return (
    <div className="container">
      <div className="panel">
        <h1>OSRS Boss Drop Simulator</h1>

        <form className="controls" onSubmit={handleSimulate}>
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
            placeholder="Izberi ali vpisi monsterja..."
            disabled={isLoadingMonsters}
          />
          <datalist id="monster-options">
            {filteredMonsters.map((monster) => (
              <option key={monster.id} value={getMonsterLabel(monster)} />
            ))}
          </datalist>

          <label htmlFor="kills">Stevilo killov</label>
          <input
            id="kills"
            type="number"
            min={1}
            value={killCountInput}
            onChange={(event) => setKillCountInput(event.target.value)}
            placeholder="npr. 500"
          />

          <button type="submit" disabled={isLoadingMonsters}>
            Simuliraj drope
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        <div className="results">
          {results.length === 0 ? (
            <p className="empty">Ni rezultatov. Zazeni simulacijo.</p>
          ) : (
            results.map((drop) => (
              <div className="drop-card" key={drop.id}>
                <img
                  src={`${ITEM_ICON_URL}/${drop.id}.png`}
                  alt={drop.name}
                  loading="lazy"
                />
                <p>{drop.name}</p>
                <strong>x{drop.quantity}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
