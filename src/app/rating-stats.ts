/**
 * Global rating stats: either static `/rating-stats.json` or Supabase (optional).
 *
 * Supabase setup (SQL editor):
 *
 * create table public.rating_aggregate (
 *   id int primary key check (id = 1),
 *   sum_stars bigint not null default 0,
 *   vote_count bigint not null default 0
 * );
 * insert into public.rating_aggregate (id, sum_stars, vote_count) values (1, 0, 0);
 *
 * alter table public.rating_aggregate enable row level security;
 * create policy "rating_aggregate_select" on public.rating_aggregate
 *   for select using (true);
 * grant select on public.rating_aggregate to anon, authenticated;
 *
 * create or replace function public.add_app_rating(p_stars int)
 * returns void language plpgsql security definer set search_path = public as $$
 * begin
 *   if p_stars < 1 or p_stars > 5 then return; end if;
 *   update public.rating_aggregate
 *   set sum_stars = sum_stars + p_stars, vote_count = vote_count + 1
 *   where id = 1;
 * end;
 * $$;
 * grant execute on function public.add_app_rating(int) to anon, authenticated;
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

export type GlobalRatingStats = {
  averageStars: number;
  voteCount: number;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

function supabaseHeaders(): HeadersInit {
  return {
    apikey: supabaseAnonKey ?? "",
    Authorization: `Bearer ${supabaseAnonKey ?? ""}`,
    "Content-Type": "application/json",
  };
}

function normalizeStats(
  sumStars: number,
  voteCount: number,
): GlobalRatingStats {
  const n = Math.max(0, Math.floor(voteCount));
  const sum = Math.max(0, Number(sumStars));
  return {
    voteCount: n,
    averageStars: n > 0 ? sum / n : 0,
  };
}

export async function fetchGlobalRatingStats(): Promise<GlobalRatingStats | null> {
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rating_aggregate?id=eq.1&select=sum_stars,vote_count`,
        { headers: supabaseHeaders(), cache: "no-store" },
      );
      if (!response.ok) return null;
      const rows = (await response.json()) as Array<{
        sum_stars: number;
        vote_count: number;
      }>;
      const row = rows[0];
      if (!row) return { averageStars: 0, voteCount: 0 };
      return normalizeStats(row.sum_stars, row.vote_count);
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch("/rating-stats.json", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      averageStars?: number;
      voteCount?: number;
    };
    const voteCount =
      typeof data.voteCount === "number" && Number.isFinite(data.voteCount)
        ? Math.max(0, Math.floor(data.voteCount))
        : 0;
    const averageStars =
      typeof data.averageStars === "number" && Number.isFinite(data.averageStars)
        ? data.averageStars
        : 0;
    if (voteCount <= 0) return { averageStars: 0, voteCount: 0 };
    return { averageStars, voteCount };
  } catch {
    return null;
  }
}

export async function submitGlobalRating(stars: number): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/add_app_rating`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({ p_stars: Math.round(stars) }),
    });
  } catch {
    /* ignore — local vote still counts for this device */
  }
}
