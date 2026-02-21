import { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import * as api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { parseCSV, Trade } from '@/lib/biasDetection';
import { Upload, Plus, FileSpreadsheet, Trash2, Loader2 } from 'lucide-react';

export default function UploadTrades() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [parsedTrades, setParsedTrades] = useState<Trade[]>([]);
  const [showManual, setShowManual] = useState(false);

  // Manual trade form
  const [manualTrade, setManualTrade] = useState({
    timestamp: new Date().toISOString().slice(0, 16),
    action: 'buy' as 'buy' | 'sell',
    asset: '',
    quantity: '',
    entry_price: '',
    exit_price: '',
    pnl: '',
    account_balance: '',
    notes: '',
  });

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const trades = parseCSV(text);

    if (trades.length === 0) {
      toast({ title: 'Parse error', description: 'Could not parse trades from the file. Ensure it has timestamp, action, and asset columns.', variant: 'destructive' });
      return;
    }

    setParsedTrades(trades);
    toast({ title: `Parsed ${trades.length} trades`, description: 'Review and save them below.' });
  }, [toast]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const text = await file.text();
    const trades = parseCSV(text);
    if (trades.length === 0) {
      toast({ title: 'Parse error', description: 'Could not parse trades.', variant: 'destructive' });
      return;
    }
    setParsedTrades(trades);
    toast({ title: `Parsed ${trades.length} trades` });
  }, [toast]);

  const saveTrades = async (tradesToSave: Trade[]) => {
    if (!user) return;
    setUploading(true);

    const rows = tradesToSave.map(t => ({
      timestamp: new Date(t.timestamp).toISOString(),
      action: t.action,
      asset: t.asset,
      quantity: t.quantity,
      entry_price: t.entry_price,
      exit_price: t.exit_price ?? null,
      pnl: t.pnl ?? null,
      account_balance: t.account_balance ?? null,
      notes: t.notes ?? null,
    }));
    try {
      await api.createTrades(rows);
      toast({ title: 'Saved!', description: `${rows.length} trades saved successfully.` });
      setParsedTrades([]);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    }
    setUploading(false);
  };

  const addManualTrade = async () => {
    const trade: Trade = {
      timestamp: manualTrade.timestamp,
      action: manualTrade.action,
      asset: manualTrade.asset,
      quantity: parseFloat(manualTrade.quantity) || 0,
      entry_price: parseFloat(manualTrade.entry_price) || 0,
      exit_price: manualTrade.exit_price ? parseFloat(manualTrade.exit_price) : undefined,
      pnl: manualTrade.pnl ? parseFloat(manualTrade.pnl) : undefined,
      account_balance: manualTrade.account_balance ? parseFloat(manualTrade.account_balance) : undefined,
      notes: manualTrade.notes || undefined,
    };

    if (!trade.asset || !trade.quantity || !trade.entry_price) {
      toast({ title: 'Missing fields', description: 'Asset, quantity, and entry price are required.', variant: 'destructive' });
      return;
    }

    await saveTrades([trade]);
    setManualTrade({
      timestamp: new Date().toISOString().slice(0, 16),
      action: 'buy',
      asset: '',
      quantity: '',
      entry_price: '',
      exit_price: '',
      pnl: '',
      account_balance: '',
      notes: '',
    });
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-3xl font-display font-bold">Upload Trades</h1>
          <p className="text-muted-foreground mt-1">Import your trading history via CSV or add trades manually</p>
        </div>

        {/* CSV Upload */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" /> CSV Upload</CardTitle>
            <CardDescription>Upload a CSV file with columns: timestamp, action (buy/sell), asset, quantity, entry_price, exit_price, pnl, account_balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('csv-input')?.click()}
            >
              <Upload className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-lg font-medium">Drop your CSV file here</p>
              <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
              <input id="csv-input" type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </div>
          </CardContent>
        </Card>

        {/* Parsed trades preview */}
        {parsedTrades.length > 0 && (
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display">{parsedTrades.length} Trades Parsed</CardTitle>
                <CardDescription>Review before saving</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setParsedTrades([])}>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
                <Button onClick={() => saveTrades(parsedTrades)} disabled={uploading} className="gradient-primary text-primary-foreground">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Save All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground">Date</th>
                      <th className="text-left py-2 text-muted-foreground">Action</th>
                      <th className="text-left py-2 text-muted-foreground">Asset</th>
                      <th className="text-right py-2 text-muted-foreground">Qty</th>
                      <th className="text-right py-2 text-muted-foreground">Entry</th>
                      <th className="text-right py-2 text-muted-foreground">Exit</th>
                      <th className="text-right py-2 text-muted-foreground">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTrades.slice(0, 50).map((t, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5">{new Date(t.timestamp).toLocaleDateString()}</td>
                        <td className="py-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.action === 'buy' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {t.action.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-1.5 font-medium">{t.asset}</td>
                        <td className="py-1.5 text-right">{t.quantity}</td>
                        <td className="py-1.5 text-right">${t.entry_price}</td>
                        <td className="py-1.5 text-right">{t.exit_price ? `$${t.exit_price}` : '—'}</td>
                        <td className={`py-1.5 text-right font-medium ${(t.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {t.pnl !== undefined ? `$${t.pnl.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedTrades.length > 50 && (
                  <p className="text-sm text-muted-foreground text-center mt-2">Showing first 50 of {parsedTrades.length} trades</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual entry */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Manual Entry</CardTitle>
                <CardDescription>Add individual trades</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowManual(!showManual)}>
                {showManual ? 'Hide' : 'Show'} Form
              </Button>
            </div>
          </CardHeader>
          {showManual && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Timestamp</Label>
                  <Input type="datetime-local" value={manualTrade.timestamp} onChange={e => setManualTrade(p => ({ ...p, timestamp: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={manualTrade.action}
                    onChange={e => setManualTrade(p => ({ ...p, action: e.target.value as 'buy' | 'sell' }))}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Asset</Label>
                  <Input placeholder="AAPL" value={manualTrade.asset} onChange={e => setManualTrade(p => ({ ...p, asset: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" step="any" placeholder="100" value={manualTrade.quantity} onChange={e => setManualTrade(p => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Entry Price</Label>
                  <Input type="number" step="any" placeholder="150.00" value={manualTrade.entry_price} onChange={e => setManualTrade(p => ({ ...p, entry_price: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Exit Price</Label>
                  <Input type="number" step="any" placeholder="155.00" value={manualTrade.exit_price} onChange={e => setManualTrade(p => ({ ...p, exit_price: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>P/L</Label>
                  <Input type="number" step="any" placeholder="500.00" value={manualTrade.pnl} onChange={e => setManualTrade(p => ({ ...p, pnl: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Account Balance</Label>
                  <Input type="number" step="any" placeholder="25000.00" value={manualTrade.account_balance} onChange={e => setManualTrade(p => ({ ...p, account_balance: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input placeholder="Optional notes" value={manualTrade.notes} onChange={e => setManualTrade(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <Button onClick={addManualTrade} className="mt-4 gradient-primary text-primary-foreground" disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Add Trade
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
