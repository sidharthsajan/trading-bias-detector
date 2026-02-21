# trading-bias-detector

## Run locally (frontend)

```bash
npm install
npm run dev
```

You can also use:

```bash
npm start
```

## Python setup

Vite + React frontend with Supabase (auth + database). See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for Vercel and AWS deployment.

## Local dev (frontend)

```bash
npm install
cp .env.example .env   # then set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## Python / data (optional)

```bash
uv sync
source .venv/bin/activate
```
