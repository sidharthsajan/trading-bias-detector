import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.config import settings
from app.schemas.common import AICoachRequest, AICoachResponse
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/ai-coach", tags=["ai_coach"])


@router.post("", response_model=AICoachResponse)
async def ai_coach(
    body: AICoachRequest,
    user_id=Depends(get_current_user_id),
):
    trade_summary = (
        f"The trader has {len(body.trades)} recent trades. "
        f"Total P/L: ${sum((t.get('pnl') or 0) for t in body.trades):.2f}. "
    )
    if body.trades:
        wins = sum(1 for t in body.trades if (t.get("pnl") or 0) > 0)
        trade_summary += f"Win rate: {(wins / len(body.trades) * 100):.0f}%. "
        assets = list(dict.fromkeys(t.get("asset", "") for t in body.trades))[:5]
        trade_summary += f"Most traded assets: {', '.join(assets)}."
    else:
        trade_summary += "No trading data available yet."

    bias_summary = (
        "Detected biases: " + "; ".join(
            f"{b.get('title', '')} ({b.get('severity', '')}): {b.get('description', '')}"
            for b in body.biases
        )
        if body.biases
        else "No biases detected yet."
    )

    chat_history = [{"role": m.get("role"), "content": m.get("content", "")} for m in (body.history or [])]

    system_prompt = f"""You are an expert AI trading coach for the National Bank Bias Detector platform. Your role is to:
1. Analyze trading behavior and identify psychological biases
2. Provide personalized, actionable advice
3. Help traders improve discipline and emotional control
4. Suggest portfolio optimization strategies
5. Perform sentiment analysis on trader notes
6. Predict potential bias-triggering situations

Current trader context:
{trade_summary}
{bias_summary}

Be empathetic but direct. Use specific data from their trades when possible. Keep responses concise (2-4 paragraphs max). Reference behavioral finance concepts."""

    messages = [
        {"role": "system", "content": system_prompt},
        *chat_history,
        {"role": "user", "content": body.message},
    ]

    if not settings.LOVABLE_API_KEY:
        return AICoachResponse(reply="AI Coach is not configured. Set LOVABLE_API_KEY.")

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                "https://ai.gateway.lovable.dev/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.LOVABLE_API_KEY}",
                },
                json={
                    "model": "google/gemini-3-flash-preview",
                    "messages": messages,
                    "max_tokens": 1000,
                    "temperature": 0.7,
                },
                timeout=60.0,
            )
            r.raise_for_status()
            data = r.json()
            reply = (data.get("choices") or [{}])[0].get("message", {}).get("content") or "I apologize, I could not generate a response."
            return AICoachResponse(reply=reply)
        except Exception as e:
            raise HTTPException(status_code=500, detail="AI Coach request failed") from e
