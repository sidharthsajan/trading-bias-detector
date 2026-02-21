import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export const AI_COACH_NAME = 'Laurent Ferreira';
const configuredAvatarUrl = (import.meta.env.VITE_AI_COACH_AVATAR_URL || '').trim();
export const AI_COACH_AVATAR_URL = configuredAvatarUrl || '/coach-avatar.png';

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

  const [tradesRes, biasesRes] = await Promise.all([
    supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(50),
    supabase
      .from('bias_analyses')
      .select('*')
      .eq('user_id', userId),
  ]);

  if (tradesRes.error) throw tradesRes.error;
  if (biasesRes.error) throw biasesRes.error;

  const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-coach', {
    body: {
      message: userMessage,
      trades: tradesRes.data || [],
      biases: biasesRes.data || [],
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
