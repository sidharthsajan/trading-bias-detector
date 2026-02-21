import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import CoachInsightsPanel from '@/components/CoachInsightsPanel';
import {
  AI_COACH_AVATAR_URL,
  AI_COACH_DRAFT_KEY,
  AI_COACH_NAME,
  ChatMessage,
  clearCoachMessages,
  fetchCoachContext,
  fetchCoachMessages,
  sendCoachMessage,
} from '@/lib/aiCoach';
import type { CoachInsights } from '@/lib/coachInsights';

export default function AICoach() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [insights, setInsights] = useState<CoachInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadingInsights(true);
    try {
      const [chatData, context] = await Promise.all([
        fetchCoachMessages(user.id),
        fetchCoachContext(user.id),
      ]);
      setMessages(chatData);
      setInsights(context.insights);
    } catch (error: any) {
      toast({ title: 'Failed to load chat history', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingInsights(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    void fetchMessages();

    const draft = localStorage.getItem(AI_COACH_DRAFT_KEY);
    if (draft) {
      setInput(draft);
      localStorage.removeItem(AI_COACH_DRAFT_KEY);
    }
  }, [user, fetchMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const onSend = async () => {
    if (!user || !input.trim() || sending) return;

    const prompt = input.trim();
    const userMessage: ChatMessage = { role: 'user', content: prompt, created_at: new Date().toISOString() };
    const historyWithLatest = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const assistantMessage = await sendCoachMessage(user.id, prompt, historyWithLatest);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to get AI response.', variant: 'destructive' });
      await fetchMessages();
    } finally {
      setSending(false);
    }
  };

  const clearChatHistory = async () => {
    if (!user || clearing) return;
    const confirmed = window.confirm('Clear all chat history with Laurent Ferreira? This action cannot be undone.');
    if (!confirmed) return;

    setClearing(true);
    try {
      await clearCoachMessages(user.id);
      setMessages([]);
      toast({ title: 'Chat history cleared' });
    } catch (error: any) {
      toast({ title: 'Clear failed', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] min-h-0 flex flex-col animate-fade-in gap-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-2">
              <Avatar className="w-8 h-8 border border-border">
                <AvatarImage src={AI_COACH_AVATAR_URL} alt={AI_COACH_NAME} />
                <AvatarFallback>LF</AvatarFallback>
              </Avatar>
              {AI_COACH_NAME}
            </h1>
            <p className="text-muted-foreground mt-1">Your behavioral trading coach with personalized guidance</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearChatHistory} disabled={clearing}>
            {clearing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Clear Chat History
          </Button>
        </div>

        <CoachInsightsPanel insights={insights} loading={loadingInsights} />

        <Card className="glass-card flex-1 min-h-0 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-6 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center py-16">
                <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <h3 className="text-lg font-display font-semibold mb-2">Start a conversation with {AI_COACH_NAME}</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask about your trading biases, get personalized tips, or discuss your trading psychology.
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    'What are my biggest trading weaknesses?',
                    'How can I avoid revenge trading?',
                    'Analyze my risk management',
                    'Give me tips to improve discipline',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); }}
                      className="px-3 py-1.5 rounded-lg bg-muted text-sm hover:bg-accent transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'gradient-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Avatar className="w-4 h-4">
                        <AvatarImage src={AI_COACH_AVATAR_URL} alt={AI_COACH_NAME} />
                        <AvatarFallback>LF</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-primary">{AI_COACH_NAME}</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
                placeholder={`Ask ${AI_COACH_NAME}...`}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button onClick={onSend} disabled={sending || !input.trim()} className="gradient-primary text-primary-foreground px-4">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
