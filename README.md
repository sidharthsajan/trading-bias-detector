# National Bank Trading Bias Detector

Built for the **SESA x National Bank Hackathon** by:
- Jordan Yang
- Larry Wang
- Emily Hyuhn
- Sid the Jit

## Overview

This project helps traders upload and analyze trade history to identify behavioral bias and improve risk discipline.  
It includes bias detection, portfolio optimization recommendations, and an AI coach experience (Laurent Ferreira) with:
- Persistent chat history
- Insights panel (bias summary, charts, heatmap, suggestions)
- A moving mascot trigger (`mascot-walking.gif`) that walks around the page border

## Current Features

- Auth with Supabase
- Upload CSV or add trades manually
- Dashboard with:
  - P/L index by stock
  - 6-factor hexagonal bias radar (`overtrading`, `loss_aversion`, `revenge_trading`, `disposition_effect`, `anchoring`, `confirmation_bias`)
  - Recent trade table + quick clear
- All Trades page:
  - Server-side pagination/search
  - Per-trade delete and clear-all
- Bias Analysis and Risk Profile generation
- Portfolio Analysis:
  - Allocation charts and concentration metrics
  - Optimization recommendations
  - "Ask Laurent" handoff to AI coach with prefilled portfolio prompt
- AI Coach:
  - Dedicated coach page
  - Global moving mascot launcher
  - Clear chat history
  - Context-aware responses using trade, bias, insights, and portfolio optimization context

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind, shadcn/ui, Recharts
- Backend services: Supabase (Auth, Postgres, Edge Functions)
- Optional analysis API: FastAPI + Polars (`backend/`)

## Prerequisites

- Node.js 18+ and npm
- Supabase project (URL + anon key)
- Optional: Python 3.12+ and `uv` for the FastAPI service

## Environment Setup

Copy the template and fill values:

```bash
cp .env.example .env
```

Required:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional:
- `VITE_API_URL` (FastAPI endpoint, defaults to `http://localhost:8000` if used)
- `VITE_AI_COACH_AVATAR_URL` (coach profile image)
- `VITE_AI_COACH_MASCOT_URL` (moving launcher image, defaults to `/mascot-walking.gif`)

## Run Frontend

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Run Optional FastAPI Service

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: `http://localhost:8000/docs`

## AI Coach Edge Function

The app calls Supabase Edge Function `ai-coach`.

If you deploy/update it, ensure:
1. Function is deployed.
2. Secret `LOVABLE_API_KEY` is set in Supabase project secrets.

## CSV Notes

Parser supports flexible headers. Minimum required columns are:
- timestamp/date
- action (buy/sell)
- asset/symbol

Additional useful columns:
- quantity
- entry_price
- exit_price
- pnl
- account_balance
- notes

## Key Scripts

- `npm run dev` - start local frontend
- `npm run build` - production build
- `npm run preview` - preview build
- `npm run lint` - lint project
- `npm run test` - run Vitest tests

## Project Structure

- `src/` - frontend app
- `src/pages/` - main product pages
- `src/components/` - UI + coach components
- `src/lib/` - data/services/insight logic
- `supabase/` - migrations + edge functions
- `backend/` - optional FastAPI analysis API
- `docs/DEPLOYMENT.md` - deployment notes

## Deployment

Use Vercel for frontend and Supabase for backend services.  
See `docs/DEPLOYMENT.md` for deployment steps.
