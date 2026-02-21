import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, trades, biases, history } = await req.json();

    const tradeSummary = trades?.length > 0
      ? `The trader has ${trades.length} recent trades. Total P/L: $${trades.reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0).toFixed(2)}. Win rate: ${(trades.filter((t: any) => Number(t.pnl) > 0).length / trades.length * 100).toFixed(0)}%. Most traded assets: ${[...new Set(trades.map((t: any) => t.asset))].slice(0, 5).join(', ')}.`
      : 'No trading data available yet.';

    const biasSummary = biases?.length > 0
      ? `Detected biases: ${biases.map((b: any) => `${b.title} (${b.severity}): ${b.description}`).join('; ')}`
      : 'No biases detected yet.';

    const chatHistory = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const systemPrompt = `You are Laurent Ferreira, an expert AI trading coach for the National Bank Bias Detector platform. Your role is to:
1. Analyze trading behavior and identify psychological biases
2. Provide personalized, actionable advice
3. Help traders improve discipline and emotional control
4. Suggest portfolio optimization strategies
5. Perform sentiment analysis on trader notes
6. Predict potential bias-triggering situations

Current trader context:
${tradeSummary}
${biasSummary}

Be empathetic but direct. Use specific data from their trades when possible. Keep responses concise (2-4 paragraphs max). Reference behavioral finance concepts.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatHistory,
          { role: 'user', content: message },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.';

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ reply: 'An error occurred. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
