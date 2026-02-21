import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type TradeRow = Database['public']['Tables']['trades']['Row'];

const TRADE_PAGE_SIZE = 1000;
const UI_PAGE_SIZE = 100;
const CACHE_TTL_MS = 30_000;
const DELETE_BATCH_SIZE = 20;
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

type ClearTradesResult = {
  deletedCount: number;
  remainingCount: number;
};

export async function clearBiasAnalysesForUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('bias_analyses')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Clears all trades for a user in bounded batches to avoid oversized delete operations.
 */
export async function clearTradesForUser(userId: string): Promise<ClearTradesResult> {
  const beforeCount = await fetchTradeCountForUser(userId);
  if (beforeCount === 0) {
    return { deletedCount: 0, remainingCount: 0 };
  }

  // Fast path: one server-side delete for all rows.
  // If this does not fully clear rows, we fall back to small verified batches.
  const { error: bulkDeleteError } = await supabase.from('trades').delete().eq('user_id', userId);
  let remainingCount = await fetchTradeCountForUser(userId);
  if (remainingCount === 0) {
    return { deletedCount: beforeCount, remainingCount: 0 };
  }

  const maxPasses = Math.ceil(beforeCount / DELETE_BATCH_SIZE) + 10;
  for (let pass = 0; pass < maxPasses && remainingCount > 0; pass += 1) {
    const { data: idRows, error: idError } = await supabase
      .from('trades')
      .select('id')
      .eq('user_id', userId)
      .limit(DELETE_BATCH_SIZE);

    if (idError) throw idError;

    const ids = (idRows || []).map((row) => row.id).filter(Boolean);
    if (ids.length === 0) break;

    const { error: batchDeleteError } = await supabase
      .from('trades')
      .delete()
      .eq('user_id', userId)
      .in('id', ids);
    if (batchDeleteError) throw batchDeleteError;

    // Verify this exact batch was removed to avoid infinite loops on partial failures.
    const { count: stillPresentCount, error: verifyError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('id', ids);
    if (verifyError) throw verifyError;
    if ((stillPresentCount ?? 0) > 0) {
      throw new Error('Unable to clear selected trades. Please try again.');
    }

    remainingCount = await fetchTradeCountForUser(userId);
  }

  if (remainingCount > 0) {
    if (bulkDeleteError) throw bulkDeleteError;
    throw new Error(`Unable to clear all trades. ${remainingCount} trade(s) remain.`);
  }

  return { deletedCount: beforeCount - remainingCount, remainingCount };
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
