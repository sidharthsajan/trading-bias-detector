import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, MessageSquare, Send, Trash2, X } from 'lucide-react';
import {
  AI_COACH_AVATAR_URL,
  AI_COACH_NAME,
  ChatMessage,
  clearCoachMessages,
  fetchCoachMessages,
  sendCoachMessage,
} from '@/lib/aiCoach';

export default function FloatingCoach() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchCoachMessages(user.id);
      setMessages(data);
    } catch (error: any) {
      toast({ title: 'Failed to load chat', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!open || !user) return;
    void loadMessages();
  }, [open, user, loadMessages]);

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
      toast({ title: 'Reply failed', description: error?.message || 'Unable to get reply.', variant: 'destructive' });
      await loadMessages();
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!user || clearing) return;
    const confirmed = window.confirm(`Clear all chat history with ${AI_COACH_NAME}?`);
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

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!open ? (
        <Button className="h-12 rounded-full gradient-primary text-primary-foreground shadow-lg px-4" onClick={() => setOpen(true)}>
          <Avatar className="w-6 h-6 mr-2 border border-primary-foreground/30">
            <AvatarImage src={AI_COACH_AVATAR_URL} alt={AI_COACH_NAME} />
            <AvatarFallback>LF</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline">{AI_COACH_NAME}</span>
          <MessageSquare className="w-4 h-4 sm:ml-2" />
        </Button>
      ) : (
        <Card className="w-[calc(100vw-2rem)] sm:w-[360px] h-[520px] glass-card shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="w-7 h-7 border border-border">
                <AvatarImage src={AI_COACH_AVATAR_URL} alt={AI_COACH_NAME} />
                <AvatarFallback>LF</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold leading-tight">{AI_COACH_NAME}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{AI_COACH_NAME}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={clearHistory} disabled={clearing}>
                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {loading && (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center px-2">
                <div>
                  <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Start chatting with {AI_COACH_NAME}</p>
                </div>
              </div>
            )}

            {!loading && messages.map((message, index) => (
              <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'gradient-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  {message.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={`Message ${AI_COACH_NAME}...`}
                className="min-h-[42px] max-h-28 resize-none"
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void onSend();
                  }
                }}
              />
              <Button onClick={onSend} disabled={sending || !input.trim()} className="gradient-primary text-primary-foreground px-3">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
