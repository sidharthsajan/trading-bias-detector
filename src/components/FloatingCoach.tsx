import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import CoachInsightsPanel from '@/components/CoachInsightsPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import {
  AI_COACH_AVATAR_URL,
  AI_COACH_DRAFT_KEY,
  AI_COACH_MASCOT_URL,
  AI_COACH_NAME,
  ChatMessage,
  clearCoachMessages,
  fetchCoachContext,
  fetchCoachMessages,
  sendCoachMessage,
} from '@/lib/aiCoach';
import type { CoachInsights } from '@/lib/coachInsights';

const MASCOT_SIZE = 56;
const MASCOT_MARGIN = 8;
const MASCOT_TOP_OFFSET = 72;
const MASCOT_SPEED_PX_PER_SEC = 28;
const MASCOT_STATE_STORAGE_KEY = 'floating_coach_mascot_state_v1';

type BorderEdge = 'top' | 'right' | 'bottom' | 'left';

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type MotionState = {
  x: number;
  y: number;
  edge: BorderEdge;
};

export default function FloatingCoach() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [insights, setInsights] = useState<CoachInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showInsights, setShowInsights] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLButtonElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const motionRef = useRef<MotionState>({ x: MASCOT_MARGIN, y: MASCOT_TOP_OFFSET, edge: 'top' });

  const getBounds = useCallback((): Bounds => {
    const minX = MASCOT_MARGIN;
    const minY = MASCOT_TOP_OFFSET;
    const maxX = Math.max(minX, window.innerWidth - MASCOT_MARGIN - MASCOT_SIZE);
    const maxY = Math.max(minY, window.innerHeight - MASCOT_MARGIN - MASCOT_SIZE);
    return { minX, maxX, minY, maxY };
  }, []);

  const applyPosition = useCallback((x: number, y: number) => {
    if (!mascotRef.current) return;
    mascotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const projectMotionToBounds = useCallback((motion: MotionState, bounds: Bounds): MotionState => {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    if (motion.edge === 'top') {
      return { edge: 'top', x: clamp(motion.x, bounds.minX, bounds.maxX), y: bounds.minY };
    }
    if (motion.edge === 'right') {
      return { edge: 'right', x: bounds.maxX, y: clamp(motion.y, bounds.minY, bounds.maxY) };
    }
    if (motion.edge === 'bottom') {
      return { edge: 'bottom', x: clamp(motion.x, bounds.minX, bounds.maxX), y: bounds.maxY };
    }
    return { edge: 'left', x: bounds.minX, y: clamp(motion.y, bounds.minY, bounds.maxY) };
  }, []);

  const persistMotionState = useCallback(() => {
    try {
      window.sessionStorage.setItem(MASCOT_STATE_STORAGE_KEY, JSON.stringify(motionRef.current));
    } catch {
      // Ignore storage failures (private mode or quota limits)
    }
  }, []);

  const restoreMotionState = useCallback(() => {
    const bounds = getBounds();
    let next: MotionState = { x: bounds.minX, y: bounds.minY, edge: 'top' };

    try {
      const raw = window.sessionStorage.getItem(MASCOT_STATE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MotionState>;
        const isValidEdge = parsed.edge === 'top' || parsed.edge === 'right' || parsed.edge === 'bottom' || parsed.edge === 'left';
        if (isValidEdge && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          next = { x: Number(parsed.x), y: Number(parsed.y), edge: parsed.edge };
        }
      }
    } catch {
      // Ignore invalid saved state and use fallback
    }

    const projected = projectMotionToBounds(next, bounds);
    motionRef.current = projected;
    applyPosition(projected.x, projected.y);
  }, [applyPosition, getBounds, projectMotionToBounds]);

  const moveAlongBorder = useCallback((distance: number, bounds: Bounds) => {
    let remaining = distance;
    let guard = 0;

    while (remaining > 0.01 && guard < 12) {
      guard += 1;
      const motion = motionRef.current;

      if (motion.edge === 'top') {
        const room = bounds.maxX - motion.x;
        if (room <= 0.01) {
          motion.edge = 'right';
          continue;
        }
        const step = Math.min(remaining, room);
        motion.x += step;
        remaining -= step;
        if (motion.x >= bounds.maxX - 0.01) motion.edge = 'right';
        continue;
      }

      if (motion.edge === 'right') {
        const room = bounds.maxY - motion.y;
        if (room <= 0.01) {
          motion.edge = 'bottom';
          continue;
        }
        const step = Math.min(remaining, room);
        motion.y += step;
        remaining -= step;
        if (motion.y >= bounds.maxY - 0.01) motion.edge = 'bottom';
        continue;
      }

      if (motion.edge === 'bottom') {
        const room = motion.x - bounds.minX;
        if (room <= 0.01) {
          motion.edge = 'left';
          continue;
        }
        const step = Math.min(remaining, room);
        motion.x -= step;
        remaining -= step;
        if (motion.x <= bounds.minX + 0.01) motion.edge = 'left';
        continue;
      }

      const room = motion.y - bounds.minY;
      if (room <= 0.01) {
        motion.edge = 'top';
        continue;
      }
      const step = Math.min(remaining, room);
      motion.y -= step;
      remaining -= step;
      if (motion.y <= bounds.minY + 0.01) motion.edge = 'top';
    }

    applyPosition(motionRef.current.x, motionRef.current.y);
  }, [applyPosition]);

  const loadMessages = useCallback(async () => {
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
      toast({ title: 'Failed to load chat', description: error?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingInsights(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!open || !user) return;
    void loadMessages();

    const draft = localStorage.getItem(AI_COACH_DRAFT_KEY);
    if (draft) {
      setInput(draft);
      localStorage.removeItem(AI_COACH_DRAFT_KEY);
    }
  }, [open, user, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!user) return;

    restoreMotionState();
    lastFrameTimeRef.current = null;

    const onResize = () => {
      const projected = projectMotionToBounds(motionRef.current, getBounds());
      motionRef.current = projected;
      applyPosition(projected.x, projected.y);
      persistMotionState();
    };
    window.addEventListener('resize', onResize);

    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsedMs = timestamp - (lastFrameTimeRef.current ?? timestamp);
      lastFrameTimeRef.current = timestamp;
      const elapsedSeconds = Math.min(elapsedMs / 1000, 0.05);

      moveAlongBorder(MASCOT_SPEED_PX_PER_SEC * elapsedSeconds, getBounds());
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      lastFrameTimeRef.current = null;
      persistMotionState();
    };
  }, [user, applyPosition, getBounds, moveAlongBorder, persistMotionState, projectMotionToBounds, restoreMotionState]);

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
    <>
      <button
        ref={mascotRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open chat with ${AI_COACH_NAME}`}
        className="fixed left-0 top-0 z-50 h-14 w-14 rounded-full border border-border bg-background/95 shadow-lg overflow-hidden transition-transform hover:scale-105"
      >
        <img src={AI_COACH_MASCOT_URL} alt={AI_COACH_NAME} className="h-full w-full object-contain p-1" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[760px] h-[min(84vh,640px)] p-0 overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <DialogHeader className="px-5 py-3 border-b border-border flex-row items-center justify-between space-y-0">
              <DialogTitle className="flex items-center gap-2">
                <Avatar className="w-7 h-7 border border-border">
                  <AvatarImage src={AI_COACH_AVATAR_URL} alt={AI_COACH_NAME} />
                  <AvatarFallback>LF</AvatarFallback>
                </Avatar>
                {AI_COACH_NAME}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowInsights((prev) => !prev)}>
                  {showInsights ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                  Insights
                </Button>
                <Button variant="outline" size="sm" onClick={clearHistory} disabled={clearing}>
                  {clearing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Clear Chat History
                </Button>
              </div>
            </DialogHeader>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 space-y-3">
              {showInsights && (
                <CoachInsightsPanel insights={insights} loading={loadingInsights} compact />
              )}

              {loading && (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-center px-2">
                  <div>
                    <MessageSquare className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Start chatting with {AI_COACH_NAME}</p>
                  </div>
                </div>
              )}

              {!loading && messages.map((message, index) => (
                <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
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

            <div className="p-4 border-t border-border">
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
