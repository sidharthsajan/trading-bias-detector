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
    const { message, trades, biases, insights, portfolio, history } = await req.json();

    const tradeSummary = trades?.length > 0
      ? `The trader has ${trades.length} recent trades. Total P/L: $${trades.reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0).toFixed(2)}. Win rate: ${(trades.filter((t: any) => Number(t.pnl) > 0).length / trades.length * 100).toFixed(0)}%. Most traded assets: ${[...new Set(trades.map((t: any) => t.asset))].slice(0, 5).join(', ')}.`
      : 'No trading data available yet.';

    const biasSummary = biases?.length > 0
      ? `Detected biases: ${biases.map((b: any) => `${b.title} (${b.severity}): ${b.description}`).join('; ')}`
      : 'No biases detected yet.';

    const insightSummary = insights
      ? `Precomputed coach insights:
- Bias summaries: ${(insights.biasSummaries || []).join(' | ') || 'none'}
- Stats: total trades ${insights.stats?.totalTrades ?? 0}, win rate ${insights.stats?.winRate ?? 0}%, total P/L ${insights.stats?.totalPnl ?? 0}, avg trades/day ${insights.stats?.avgTradesPerDay ?? 0}
- Heatmap signal: ${insights.stats?.highVolatilityFollowUps ?? 0} high-volatility follow-up trades
- Suggestions: ${(insights.suggestions || []).map((s: any) => `${s.title}: ${s.recommendation}`).join(' | ') || 'none'}`
      : 'No precomputed insights provided.';

    const portfolioSummary = portfolio
      ? `Portfolio optimization context:
- Total traded notional: ${portfolio.totalValue ?? 0}
- Assets traded: ${portfolio.assetCount ?? 0}
- Top concentration: ${portfolio.topAssetName ?? 'N/A'} at ${portfolio.topAssetPct ?? 0}%
- Recommendations: ${(portfolio.recommendations || []).map((r: any) => `${r.title}: ${r.detail}`).join(' | ') || 'none'}`
      : 'No portfolio optimization context provided.';

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
${insightSummary}
${portfolioSummary}

Response requirements:
1) Use markdown headings exactly in this order:
## Bias Summary
## Graphical Insights
## Personalized Suggestions
2) Bias Summary: include at least one concrete bias statement using trader data.
3) Graphical Insights: interpret timeline/heatmap style behavior in plain language (e.g., clustering by hour/day, drawdown periods, asset concentration).
4) Personalized Suggestions: include actionable bullets for:
- daily trade limits
- stop-loss discipline
- cooling-off periods
- journaling prompts for trading psychology
5) Be concise, specific, and behavior-focused.`;

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
