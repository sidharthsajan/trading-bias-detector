import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Heart, Plus, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const EMOTIONS = [
  { value: 'calm', emoji: '😌', label: 'Calm', color: 'hsl(160, 60%, 45%)' },
  { value: 'anxious', emoji: '😰', label: 'Anxious', color: 'hsl(40, 90%, 55%)' },
  { value: 'excited', emoji: '🤩', label: 'Excited', color: 'hsl(270, 60%, 55%)' },
  { value: 'frustrated', emoji: '😤', label: 'Frustrated', color: 'hsl(350, 84%, 46%)' },
  { value: 'fearful', emoji: '😨', label: 'Fearful', color: 'hsl(220, 25%, 40%)' },
  { value: 'confident', emoji: '😎', label: 'Confident', color: 'hsl(160, 80%, 35%)' },
  { value: 'stressed', emoji: '😩', label: 'Stressed', color: 'hsl(0, 70%, 50%)' },
  { value: 'neutral', emoji: '😐', label: 'Neutral', color: 'hsl(220, 10%, 50%)' },
];

export default function EmotionalTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tags, setTags] = useState<any[]>([]);
  const [selectedEmotion, setSelectedEmotion] = useState('neutral');
  const [intensity, setIntensity] = useState([5]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) fetchTags();
  }, [user]);

  const fetchTags = async () => {
    const { data } = await supabase
      .from('emotional_tags')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setTags(data || []);
  };

  const saveTag = async () => {
    setSaving(true);
    const { error } = await supabase.from('emotional_tags').insert({
      user_id: user!.id,
      emotional_state: selectedEmotion,
      intensity: intensity[0],
      notes: notes || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Logged!', description: 'Your emotional state has been recorded.' });
      setNotes('');
      setIntensity([5]);
      fetchTags();
    }
    setSaving(false);
  };

  // Chart: emotion frequency
  const emotionCounts = EMOTIONS.map(e => ({
    name: e.label,
    count: tags.filter(t => t.emotional_state === e.value).length,
    color: e.color,
  })).filter(e => e.count > 0);

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Heart className="w-8 h-8 text-primary" /> Emotional Tracker
          </h1>
          <p className="text-muted-foreground mt-1">Log your emotional state to correlate with trading performance</p>
        </div>

        {/* Log new emotion */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-display">How are you feeling?</CardTitle>
            <CardDescription>Tag your current state before or after trading</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-4 gap-3">
              {EMOTIONS.map(e => (
                <button
                  key={e.value}
                  onClick={() => setSelectedEmotion(e.value)}
                  className={`p-3 rounded-xl text-center transition-all ${
                    selectedEmotion === e.value
                      ? 'ring-2 ring-primary bg-accent scale-105'
                      : 'bg-muted hover:bg-accent/50'
                  }`}
                >
                  <span className="text-2xl block">{e.emoji}</span>
                  <span className="text-xs font-medium mt-1 block">{e.label}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Intensity: {intensity[0]}/10</label>
              <Slider value={intensity} onValueChange={setIntensity} min={1} max={10} step={1} />
            </div>

            <Textarea placeholder="Optional notes — what triggered this feeling?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />

            <Button onClick={saveTag} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Log State
            </Button>
          </CardContent>
        </Card>

        {/* Emotion frequency chart */}
        {emotionCounts.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-display">Emotional Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={emotionCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {emotionCounts.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Recent entries */}
        {tags.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-display">Recent Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tags.slice(0, 20).map(tag => {
                  const emotion = EMOTIONS.find(e => e.value === tag.emotional_state);
                  return (
                    <div key={tag.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <span className="text-xl">{emotion?.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{emotion?.label}</span>
                          <span className="text-xs text-muted-foreground">Intensity: {tag.intensity}/10</span>
                        </div>
                        {tag.notes && <p className="text-xs text-muted-foreground mt-0.5">{tag.notes}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(tag.created_at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
