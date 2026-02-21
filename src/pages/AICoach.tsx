import { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send, Loader2, Brain, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export default function AICoach() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) fetchMessages();
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: true });
    setMessages((data || []).map((m: any) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })));
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Save user message
    await supabase.from('chat_messages').insert({ user_id: user!.id, role: 'user', content: userMsg.content });

    // Get trading context
    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user!.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    const { data: biases } = await supabase
      .from('bias_analyses')
      .select('*')
      .eq('user_id', user!.id);

    try {
      const response = await supabase.functions.invoke('ai-coach', {
        body: {
          message: userMsg.content,
          trades: trades || [],
          biases: biases || [],
          history: messages.slice(-10),
        },
      });

      const aiContent = response.data?.reply || 'I apologize, I could not generate a response. Please try again.';
      const aiMsg: ChatMessage = { role: 'assistant', content: aiContent };
      setMessages(prev => [...prev, aiMsg]);

      await supabase.from('chat_messages').insert({ user_id: user!.id, role: 'assistant', content: aiContent });
    } catch {
      toast({ title: 'Error', description: 'Failed to get AI response.', variant: 'destructive' });
    }
    setSending(false);
  };

  const clearChat = async () => {
    await supabase.from('chat_messages').delete().eq('user_id', user!.id);
    setMessages([]);
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-2">
              <Brain className="w-8 h-8 text-primary" /> AI Trading Coach
            </h1>
            <p className="text-muted-foreground mt-1">Personalized guidance based on your trading patterns</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearChat}>
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        </div>

        <Card className="glass-card flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center py-16">
                <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <h3 className="text-lg font-display font-semibold mb-2">Start a conversation</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask about your trading biases, get personalized tips, or discuss your trading psychology.
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    'What are my biggest trading weaknesses?',
                    'How can I avoid revenge trading?',
                    'Analyze my risk management',
                    'Give me tips to improve discipline',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="px-3 py-1.5 rounded-lg bg-muted text-sm hover:bg-accent transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'gradient-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">AI Coach</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask your trading coach..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button onClick={sendMessage} disabled={sending || !input.trim()} className="gradient-primary text-primary-foreground px-4">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
