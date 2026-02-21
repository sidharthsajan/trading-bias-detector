import { supabase } from '@/integrations/supabase/client';
import { buildCoachInsights, type CoachInsights, type InsightBias, type InsightTrade } from '@/lib/coachInsights';
import { buildPortfolioInsights, type PortfolioInsights } from '@/lib/portfolioInsights';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export const AI_COACH_NAME = 'Laurent Ferreira';
export const AI_COACH_DRAFT_KEY = 'ai_coach_prefill_draft';
const configuredAvatarUrl = (import.meta.env.VITE_AI_COACH_AVATAR_URL || '').trim();
export const AI_COACH_AVATAR_URL = configuredAvatarUrl || '/coach-avatar.png';
const configuredMascotUrl = (import.meta.env.VITE_AI_COACH_MASCOT_URL || '').trim();
export const AI_COACH_MASCOT_URL = configuredMascotUrl || '/national-bank-logo.png';

export type CoachContext = {
  trades: InsightTrade[];
  biases: InsightBias[];
  insights: CoachInsights;
  portfolio: PortfolioInsights;
};

export async function fetchCoachMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((message: any) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  }));
}

export async function clearCoachMessages(userId: string) {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}

export async function fetchCoachContext(userId: string): Promise<CoachContext> {
  const [tradesRes, biasesRes] = await Promise.all([
    supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1200),
    supabase
      .from('bias_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (tradesRes.error) throw tradesRes.error;
  if (biasesRes.error) throw biasesRes.error;

  const trades = (tradesRes.data || []) as InsightTrade[];
  const biases = (biasesRes.data || []) as InsightBias[];

  return {
    trades,
    biases,
    insights: buildCoachInsights(trades, biases),
    portfolio: buildPortfolioInsights(trades),
  };
}

export async function sendCoachMessage(
  userId: string,
  content: string,
  history: ChatMessage[],
): Promise<ChatMessage> {
  const userMessage = content.trim();
  if (!userMessage) throw new Error('Message cannot be empty.');

  const { error: userMessageError } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, role: 'user', content: userMessage });

  if (userMessageError) throw userMessageError;

  const context = await fetchCoachContext(userId);

  const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-coach', {
    body: {
      message: userMessage,
      trades: context.trades.slice(0, 200),
      biases: context.biases,
      insights: context.insights,
      portfolio: context.portfolio,
      history: history.slice(-10),
    },
  });

  if (aiError) throw aiError;

  const assistantReply = aiData?.reply || 'I apologize, I could not generate a response. Please try again.';

  const { data: insertedAssistant, error: assistantInsertError } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, role: 'assistant', content: assistantReply })
    .select('id, role, content, created_at')
    .single();

  if (assistantInsertError) throw assistantInsertError;

  return {
    id: insertedAssistant.id,
    role: insertedAssistant.role,
    content: insertedAssistant.content,
    created_at: insertedAssistant.created_at,
  };
}
