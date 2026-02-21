# Deployment Guide

This app is a Vite + React SPA that uses **Supabase** for auth and database. You can deploy the frontend to **Vercel** and/or **AWS**, and optionally move the database to **AWS** (e.g. RDS).

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

## 2. Host on AWS (frontend)

You can host the same static build on AWS in two main ways.

### Option A: AWS Amplify (recommended)

Amplify fits a Vite SPA well (build, env vars, redirects for SPA).

1. **Install Amplify CLI** (one-time):  
   `npm install -g @aws-amplify/cli` and run `amplify configure`.

2. **Create app and connect repo**  
   In [AWS Amplify Console](https://console.aws.amazon.com/amplify/) → **New app** → **Host web app** → connect your Git provider and repo.

3. **Build settings** (Amplify will often detect them; if not, set):
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Base directory:** (leave empty unless the app lives in a subfolder)

4. **Environment variables** (Amplify Console → App → **Environment variables**):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

5. **SPA redirect**  
   In **App settings → Rewrites and redirects**, add:
   - **Source address:** `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`
   - **Target:** `/index.html`
   - **Type:** 200 (Rewrite)

6. Save and deploy. Your app will be served from AWS with the same Supabase backend.

### Option B: S3 + CloudFront (static only)

1. Build: `npm run build`.
2. Create an S3 bucket, enable **Static website hosting**, upload the contents of `dist/`.
3. Create a **CloudFront** distribution with the S3 website as origin.
4. Add a **custom error response** in CloudFront: HTTP 403 and 404 → response page `/index.html` (200) so client-side routes work.
5. Env vars: Vite inlines `VITE_*` at build time, so you must build with the correct env (e.g. in CI or a small script that sets vars and runs `npm run build`) before uploading to S3.

---

## 3. Database on AWS

Right now the app uses **Supabase** (Postgres + Supabase Auth). You have two paths.

### Option 1: Keep Supabase, frontend on AWS (easiest)

- Deploy the frontend to **Vercel** and/or **AWS** (Amplify or S3/CloudFront) as above.
- Keep using your existing Supabase project for database and auth.
- No backend or schema changes; only ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set in each hosting environment.

### Option 2: Move database (and auth) to AWS

To have “database on AWS” as well:

- **Database:** Run Postgres on **Amazon RDS** (or Aurora). You’d need to:
  - Create an RDS instance (e.g. PostgreSQL 15).
  - Apply your schema (e.g. run the SQL from `supabase/migrations/` or export from Supabase and adapt).
  - Use a connection pooler if you add server-side API (e.g. RDS Proxy or PgBouncer).

- **Auth:** Supabase Auth would need to be replaced, e.g. with **Amazon Cognito** (user pools):
  - Create a User Pool and optionally an App Client.
  - Replace Supabase auth in the app with Cognito (e.g. `amazon-cognito-identity-js` or Amplify Auth).
  - Update any RLS-like logic (e.g. API or backend) to use Cognito user id instead of `auth.uid()`.

- **Backend:** The app currently talks to Supabase from the browser. To use RDS + Cognito you typically add a backend (e.g. API on **Lambda + API Gateway** or **App Runner**) that:
  - Validates Cognito tokens.
  - Connects to RDS and runs queries with the user id from the token.

This is a larger migration (schema, auth, and API layer). If you want to proceed, the next step is to decide: Cognito + RDS + Lambda/API Gateway, or another stack (e.g. App Runner), and then we can outline concrete steps and file changes.

---

## Summary

| Goal                    | Action |
|-------------------------|--------|
| Fix Vercel              | Use the new `vercel.json` and set `VITE_SUPABASE_*` in Vercel. |
| Host frontend on AWS    | Use **Amplify** (easiest) or **S3 + CloudFront** with SPA redirect. |
| Database on AWS         | **Option 1:** Keep Supabase, only host frontend on AWS. **Option 2:** Migrate to RDS + Cognito + a small API layer. |

For “fix Vercel and also host on AWS with database on AWS,” the fastest path is: **fix Vercel as above**, **host the same app on AWS (e.g. Amplify)** with the same env vars, and **keep Supabase** as the database. If you later want the DB on AWS, we can plan the RDS + Cognito migration step by step.
