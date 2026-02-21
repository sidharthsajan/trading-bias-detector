import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type TradeRow = Database['public']['Tables']['trades']['Row'];

const TRADE_PAGE_SIZE = 1000;
const UI_PAGE_SIZE = 100;
const CACHE_TTL_MS = 30_000;
/** Max trades to load for dashboard (keeps navigation fast after large uploads) */
export const DASHBOARD_TRADE_LIMIT = 10_000;

const tradeCache = new Map<string, { fetchedAt: number; rows: TradeRow[] }>();

type PageResult = {
  trades: TradeRow[];
  totalCount: number;
};

const clampPageSize = (size: number) => Math.max(1, Math.min(size, TRADE_PAGE_SIZE));

const normalizeQueryForIlike = (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[,%]/g, '');
};

export function invalidateTradeCache(userId?: string) {
  if (userId) {
    tradeCache.delete(userId);
    for (const key of tradeCache.keys()) {
      if (String(key).startsWith(`${userId}:`)) tradeCache.delete(key);
    }
    return;
  }
  tradeCache.clear();
}

/** Lightweight count-only query for total trades (no rows loaded). */
export async function fetchTradeCountForUser(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  return count ?? 0;
}

export async function fetchAllTradesForUser(userId: string, maxRows?: number): Promise<TradeRow[]> {
  const limit = maxRows ?? Infinity;
  const cacheKey = maxRows != null ? `${userId}:${maxRows}` : userId;
  const cached = tradeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
    return cached.rows;
  }

  let from = 0;
  const allTrades: TradeRow[] = [];

  while (allTrades.length < limit) {
    const remaining = limit === Infinity ? TRADE_PAGE_SIZE : Math.min(TRADE_PAGE_SIZE, limit - allTrades.length);
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .range(from, from + remaining - 1);

    if (error) throw error;

    const batch = data || [];
    allTrades.push(...batch);

    if (batch.length < remaining) break;
    from += batch.length;
  }

  tradeCache.set(cacheKey, { fetchedAt: Date.now(), rows: allTrades });
  return allTrades;
}

export async function fetchTradesPageForUser(
  userId: string,
  page: number,
  pageSize = UI_PAGE_SIZE,
  query = '',
): Promise<PageResult> {
  const safePage = Math.max(1, page);
  const safePageSize = clampPageSize(pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let request = supabase
    .from('trades')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  const normalizedQuery = normalizeQueryForIlike(query);
  if (normalizedQuery) {
    const like = `%${normalizedQuery}%`;
    request = request.or(`asset.ilike.${like},action.ilike.${like},notes.ilike.${like}`);
  }

  const { data, error, count } = await request
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    trades: data || [],
    totalCount: count || 0,
  };
}
