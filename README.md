# National Bank Bias Detector

A full-stack tool that analyzes trading history to detect psychological biases: **overtrading**, **loss aversion**, and **revenge trading**. Upload a CSV of your trades and view an interactive, dark-themed dashboard with a bias score, heatmap, and trade journal.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Shadcn UI, Recharts, Lucide. Auth and persistence via **Supabase**.
- **Backend:** Python 3.12, FastAPI, Polars (high-performance CSV processing). Uses **uv** for dependency management.

## CSV format

Expected headers: **Timestamp**, **Buy/Sell**, **Asset**, **Quantity**, **Price**, **P/L**, **Balance**.

## Prerequisites

- Node.js (for the frontend)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/) (for the backend)

## Quick start

### 1. Frontend

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

- `VITE_SUPABASE_URL` – your Supabase project URL  
- `VITE_SUPABASE_PUBLISHABLE_KEY` – your Supabase anon key  

Optional (for bias analysis API):

- `VITE_API_URL=http://localhost:8000` – backend URL (defaults to this if unset)

Then:

```bash
npm run dev
```

App runs at http://localhost:5173 (or the port Vite prints).

### 2. Backend (bias analysis API)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs  

If port 8000 is in use, see [backend/README.md](backend/README.md) for using another port and setting `VITE_API_URL`.

## What you get

- **Upload:** Drop or pick a CSV on the Analysis page; the backend runs the bias engine and returns results.
- **Bias score:** A 0–100 radial gauge (higher = more biased).
- **Heatmap:** Trading intensity by hour of day.
- **Trade journal:** Table of all trades with **biased** rows highlighted in red (overtrading, loss aversion, revenge trading).
- **Supabase:** Sign in and optionally save trades and analyses for later.

## Project structure

- `src/` – React app (pages, components, Supabase client).
- `backend/` – FastAPI app and Polars bias engine (`app/bias_engine.py`, `app/main.py`).
- `docs/DEPLOYMENT.md` – Vercel + Supabase deployment.
- `backend/README.md` – Backend setup, run, and endpoints.

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for deploying the frontend to Vercel and using Supabase (no AWS).

## Bias detection (backend)

The engine in `backend/app/bias_engine.py` implements:

- **Overtrading:** >5 trades per hour or >10% of balance per ticket.
- **Loss aversion:** Compares duration of losing vs winning trades and average loss size.
- **Revenge trading:** Trades opened within 30 minutes of a loss with quantity >1.5× the previous trade.

Logic is modular so you can add e.g. sentiment analysis later.
