import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { clearTradesForUser, fetchTradeCountForUser, fetchTradesPageForUser, invalidateTradeCache } from '@/lib/trades';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Trash2, Table2 } from 'lucide-react';

const PAGE_SIZE = 100;

export default function Trades() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trades, setTrades] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [allTradeCount, setAllTradeCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const loadTrades = useCallback(async (targetPage: number, search: string, isRefresh = false) => {
    if (!user) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [{ trades: pageRows, totalCount: count }, absoluteCount] = await Promise.all([
        fetchTradesPageForUser(user.id, targetPage, PAGE_SIZE, search),
        fetchTradeCountForUser(user.id),
      ]);
      setTrades(pageRows);
      setTotalCount(count);
      setAllTradeCount(absoluteCount);
    } catch (error: any) {
      toast({ title: 'Failed to load trades', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    void loadTrades(page, debouncedQuery);
  }, [user, page, debouncedQuery, loadTrades]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const visiblePnl = useMemo(
    () => trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0),
    [trades],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showingStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);

  const jumpToPage = () => {
    const requestedPage = Number.parseInt(pageInput, 10);
    if (Number.isNaN(requestedPage)) {
      setPageInput(String(page));
      return;
    }

    const clampedPage = Math.max(1, Math.min(totalPages, requestedPage));
    setPage(clampedPage);
    setPageInput(String(clampedPage));
  };

  const deleteTrade = async (tradeId: string) => {
    if (!user) return;
    setDeletingTradeId(tradeId);

    try {
      const { error } = await supabase.from('trades').delete().eq('id', tradeId).eq('user_id', user.id);
      if (error) throw error;

      invalidateTradeCache(user.id);
      setAllTradeCount((prev) => Math.max((prev ?? 1) - 1, 0));
      const nextTotal = Math.max(totalCount - 1, 0);
      const nextPage = Math.min(page, Math.max(1, Math.ceil(nextTotal / PAGE_SIZE)));
      setPage(nextPage);
      await loadTrades(nextPage, debouncedQuery, true);
      toast({ title: 'Trade removed' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setDeletingTradeId(null);
    }
  };

  const clearAllTrades = async () => {
    const knownAllCount = allTradeCount ?? totalCount;
    if (!user || knownAllCount === 0) return;
    const confirmDelete = window.confirm('Clear all saved trades? This action cannot be undone.');
    if (!confirmDelete) return;

    setDeletingAll(true);
    try {
      const { deletedCount, remainingCount } = await clearTradesForUser(user.id);

      invalidateTradeCache(user.id);

      if (remainingCount > 0) {
        setPage(1);
        await loadTrades(1, debouncedQuery, true);
        toast({
          title: 'Bulk delete incomplete',
          description: `${remainingCount} trade(s) still remain. Try again.`,
          variant: 'destructive',
        });
        return;
      }

      setTrades([]);
      setTotalCount(0);
      setAllTradeCount(0);
      setPage(1);
      toast({
        title: 'All trades cleared',
        description: deletedCount > 0 ? `${deletedCount} trade(s) removed.` : undefined,
      });
    } catch (error: any) {
      toast({ title: 'Bulk delete failed', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setDeletingAll(false);
    }
  };

  const knownAllCount = allTradeCount ?? totalCount;

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">All Trades</h1>
            <p className="text-muted-foreground mt-1">Manage your full trade history</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadTrades(page, debouncedQuery, true)} disabled={refreshing || deletingAll}>
              {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
            <Button variant="destructive" onClick={clearAllTrades} disabled={deletingAll || knownAllCount === 0}>
              {deletingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Clear Trades
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">Matching Trades</p>
              <p className="text-3xl font-display font-bold">{totalCount}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">Showing</p>
              <p className="text-3xl font-display font-bold">{showingStart}-{showingEnd}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">Visible P/L</p>
              <p className={`text-3xl font-display font-bold ${visiblePnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(visiblePnl)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-display">Trade Records</CardTitle>
              <CardDescription>Server-side pagination and search for fast loading</CardDescription>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by asset, action, or note..."
              className="w-full md:w-72"
            />
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Table2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                {totalCount === 0 ? 'No trades found.' : 'No rows on this page.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Asset</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Action</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Qty</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Entry</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Exit</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">P/L</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2">{new Date(trade.timestamp).toLocaleDateString()}</td>
                        <td className="py-2 font-medium">{trade.asset}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trade.action === 'buy' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {String(trade.action).toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 text-right">{trade.quantity}</td>
                        <td className="py-2 text-right">{formatMoney(trade.entry_price)}</td>
                        <td className="py-2 text-right">{trade.exit_price !== null ? formatMoney(trade.exit_price) : '-'}</td>
                        <td className={`py-2 text-right font-medium ${(trade.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {trade.pnl !== null ? formatMoney(trade.pnl) : '-'}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteTrade(trade.id)}
                            disabled={deletingTradeId === trade.id}
                          >
                            {deletingTradeId === trade.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalCount > 0 && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Showing {showingStart}-{showingEnd} of {totalCount}</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1 || refreshing || deletingAll}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages || refreshing || deletingAll}
                  >
                    Next
                  </Button>
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-xs text-muted-foreground">Jump to</span>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(event) => setPageInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          jumpToPage();
                        }
                      }}
                      className="h-8 w-20"
                      disabled={refreshing || deletingAll}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={jumpToPage}
                      disabled={refreshing || deletingAll}
                    >
                      Go
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
