import { VISIT_STATS_STORAGE_KEY } from "./constants";

/** Shape stored in localStorage as JSON (per browser). */
export type VisitStatsJson = {
  totalVisits: number;
  firstVisitAt: string;
  lastVisitAt: string;
};

let recordedThisPageLoad = false;

function loadLocal(): VisitStatsJson | null {
  try {
    const raw = localStorage.getItem(VISIT_STATS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitStatsJson;
    if (
      typeof parsed.totalVisits !== "number" ||
      !Number.isFinite(parsed.totalVisits)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Count one page load for this browser. Idempotent across React Strict Mode
 * double-mount in dev (single increment per full page load).
 */
export function recordBrowserVisit(): number {
  if (recordedThisPageLoad) {
    return loadLocal()?.totalVisits ?? 0;
  }
  recordedThisPageLoad = true;
  const now = new Date().toISOString();
  const prev = loadLocal();
  const next: VisitStatsJson = {
    totalVisits: Math.max(0, Math.floor(prev?.totalVisits ?? 0)) + 1,
    firstVisitAt: prev?.firstVisitAt ?? now,
    lastVisitAt: now,
  };
  localStorage.setItem(VISIT_STATS_STORAGE_KEY, JSON.stringify(next));
  return next.totalVisits;
}

/** Optional `public/visit-stats.json` with `{ "visits": number }` — used when `SITE_VISITS_OVERRIDE` is null. */
export async function fetchConfiguredVisitCount(): Promise<number | null> {
  try {
    const response = await fetch("/visit-stats.json", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { visits?: unknown };
    if (typeof data.visits !== "number" || !Number.isFinite(data.visits)) {
      return null;
    }
    return Math.max(0, Math.floor(data.visits));
  } catch {
    return null;
  }
}
