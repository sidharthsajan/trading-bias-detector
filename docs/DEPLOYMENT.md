# Deployment Guide

This app is a Vite + React SPA that uses **Supabase** for auth and database. Deploy the frontend to **Vercel** and keep Supabase as the backend.

---

## 1. Fix Vercel deployment

### What was fixed

- **`vercel.json`** was added so that:
  - Build uses `npm run build` and output is `dist` (Vite default).
  - All non-asset routes are rewritten to `/index.html` for client-side routing (e.g. `/dashboard`, `/analysis`).

### Steps to deploy on Vercel

1. **Connect the repo** in [Vercel](https://vercel.com) (Import Git Repository).

2. **Set environment variables** in the project **Settings → Environment Variables**:
   - `VITE_SUPABASE_URL` — your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your Supabase anon/public key  

   Get both from [Supabase](https://supabase.com/dashboard) → your project → **Settings → API**.

3. **Redeploy** (or push a commit). The build should succeed and routes like `/dashboard` should load correctly.

### Local preview

Copy `.env.example` to `.env`, fill in the values, then:

```bash
npm install
npm run build
npm run preview
```

---

## Summary

- **Frontend:** Deploy to Vercel using the steps above; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel.
- **Backend:** Use your existing Supabase project for database and auth; no additional hosting required.
- **Optional backend API:** If you run the Python FastAPI bias-analysis backend, deploy it separately (e.g. Railway, Render, Fly.io) and set its URL in the frontend env; the app works with Supabase alone for saved trades and analysis persistence.
