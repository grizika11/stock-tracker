# Stock Tracker Dashboard

A real-time stock analysis dashboard with live data feeds, dynamic pricing models, and multi-timeframe tracking. Built with React, Supabase, and Vercel.

Currently tracking **JBLU (JetBlue Airways)** with full earnings model, analyst consensus, catalyst timeline, and live fuel/crude/crack spread monitoring.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Vercel     │────▶│  Anthropic   │
│  (React App) │◀────│  Serverless  │◀────│   Claude     │
└──────┬───────┘     └──────┬───────┘     │ + Web Search │
       │                    │             └──────────────┘
       │              ┌─────▼──────┐
       └─────────────▶│  Supabase  │
                      │ (Postgres) │
                      └────────────┘
```

- **Frontend**: Vite + React + Recharts
- **Database**: Supabase (Postgres)
- **API**: Vercel serverless functions (keeps Anthropic key secret)
- **Data**: Claude Sonnet w/ web search fetches live prices daily
- **Cron**: Vercel cron job auto-fetches at 9 PM ET on weekdays

---

## Step-by-Step Setup

### We'll do this one step at a time. Don't move to the next step until the current one works.

---

### STEP 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Fill in:
   - **Name**: `stock-tracker`
   - **Database Password**: Pick something strong (save it somewhere)
   - **Region**: Pick the closest to you (East US 1 if you're in Boston area)
4. Wait ~2 minutes for it to provision

**How to confirm it worked:**
- You should see a dashboard with your project name at the top
- The URL bar should show something like `supabase.com/dashboard/project/abcdefgh`

**Tell me when this is done and I'll give you Step 2.**

---

### STEP 2: Run the Database Schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Copy the ENTIRE contents of `supabase/migrations/001_initial_schema.sql` and paste it in
4. Click **"Run"** (or Cmd+Enter)
5. You should see "Success. No rows returned" (that's correct)

**How to confirm it worked:**
- Click **"Table Editor"** in the left sidebar
- You should see 8 tables: `stocks`, `price_history`, `model_assumptions`, `analyst_ratings`, `catalysts`, `scorecard`, `notes`, `headlines`
- Click on `stocks` — you should see one row for JBLU
- Click on `analyst_ratings` — you should see 9 rows (one per analyst)
- Click on `scorecard` — you should see 12 rows

---

### STEP 3: Get Your Supabase Keys

1. In Supabase dashboard, click **"Settings"** (gear icon) in left sidebar
2. Click **"API"** under Configuration
3. Copy these two values:
   - **Project URL**: looks like `https://abcdefgh.supabase.co`
   - **anon public key**: starts with `eyJ...` (it's the one under "Project API Keys")

**Save both — you'll need them in Step 5.**

---

### STEP 4: Create GitHub Repository

1. Go to [github.com](https://github.com) and create a new repository
   - **Name**: `stock-tracker`
   - **Visibility**: Private (has your API keys in env vars)
   - Do NOT initialize with README (we have our own files)
2. Clone it to your local machine:
   ```bash
   git clone https://github.com/YOUR_USERNAME/stock-tracker.git
   cd stock-tracker
   ```
3. Copy ALL the project files into this folder (everything from the file structure I gave you)
4. Your folder should look like:
   ```
   stock-tracker/
   ├── api/
   │   └── fetch-daily.js
   ├── public/
   ├── src/
   │   ├── components/
   │   ├── lib/
   │   │   ├── hooks.js
   │   │   ├── supabase.js
   │   │   └── utils.js
   │   ├── styles/
   │   │   └── global.css
   │   ├── App.jsx
   │   └── main.jsx
   ├── supabase/
   │   └── migrations/
   │       └── 001_initial_schema.sql
   ├── .env.example
   ├── .gitignore
   ├── index.html
   ├── package.json
   ├── vercel.json
   └── vite.config.js
   ```

**How to confirm:** Run `ls` in the project folder and make sure you see all the files above.

---

### STEP 5: Create .env.local

1. In your project root, create a file called `.env.local`
2. Add:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   ```
3. Replace the values with:
   - Supabase URL and anon key from Step 3
   - Your Anthropic API key (from console.anthropic.com → API Keys)

**IMPORTANT**: `.env.local` is in `.gitignore` so it won't be pushed to GitHub. Never commit API keys.

---

### STEP 6: Test Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`

**How to confirm it worked:**
- You should see the dashboard with "JBLU" in the header
- The Scorecard tab should show 12 metric cards (data comes from Supabase)
- The Analysts tab should show 9 analysts
- The Catalysts tab should show the timeline

**Note:** The "Refresh" button won't work locally because the serverless function only runs on Vercel. That's OK — we'll fix that in Step 8.

---

### STEP 7: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **"Add New Project"**
3. Import your `stock-tracker` repository
4. In the configuration screen:
   - **Framework Preset**: Vite
   - **Build Command**: `vite build` (should auto-detect)
   - **Output Directory**: `dist` (should auto-detect)
5. Click **"Environment Variables"** and add:
   - `VITE_SUPABASE_URL` → your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `ANTHROPIC_API_KEY` → your Anthropic API key
6. Click **"Deploy"**

**How to confirm it worked:**
- Vercel will give you a URL like `stock-tracker-abc123.vercel.app`
- Open it — you should see the same dashboard
- Share this URL with your dad

---

### STEP 8: Test the Live Data Fetch

1. Once deployed, visit: `https://your-app.vercel.app/api/fetch-daily?ticker=JBLU`
2. You should see a JSON response with live stock price, fuel price, etc.
3. Now go back to your dashboard and click the **↻ Refresh** button
4. The header should update with the live JBLU price

**How to confirm it worked:**
- Go to Supabase → Table Editor → `price_history`
- You should see a new row with today's date, JBLU price, fuel price, etc.
- Go to `headlines` table — you should see 3 headlines

---

### STEP 9: Verify the Cron Job

The `vercel.json` file configures a daily cron at 9 PM UTC (4 PM ET / market close + 30 min). 

1. In Vercel dashboard, go to your project → **Settings** → **Cron Jobs**
2. You should see one cron: `/api/fetch-daily` scheduled at `0 21 * * 1-5`
3. You can click **"Run Now"** to test it manually

After the cron runs, check Supabase `price_history` — a new row should appear daily.

---

### STEP 10: Add More Stocks (When Ready)

To add a new stock (e.g., DAL):

1. Go to Supabase SQL Editor and run:
   ```sql
   INSERT INTO stocks (ticker, name, sector, guidance_json)
   VALUES ('DAL', 'Delta Air Lines', 'Airlines', '{}');

   INSERT INTO model_assumptions (ticker, user_label)
   VALUES ('DAL', 'default');
   ```

2. Update the cron to fetch multiple stocks — edit `api/fetch-daily.js` to loop through all active stocks, or create individual cron entries in `vercel.json`.

3. The dashboard stock selector dropdown will automatically show the new stock.

---

## File Reference

| File | Purpose |
|---|---|
| `src/App.jsx` | Main dashboard with all tabs |
| `src/lib/hooks.js` | Supabase data fetching hooks |
| `src/lib/supabase.js` | Supabase client init |
| `src/lib/utils.js` | Model calculations, theme, helpers |
| `api/fetch-daily.js` | Serverless function: fetches live data via Anthropic, saves to Supabase |
| `supabase/migrations/001_initial_schema.sql` | Database schema + JBLU seed data |
| `vercel.json` | Cron job config (daily at 9 PM UTC weekdays) |

---

## Costs

Everything is free tier:
- **Supabase**: 500MB database, 50K MAUs — more than enough
- **Vercel**: 100GB bandwidth, serverless functions, 1 cron/day
- **Anthropic**: ~$0.01-0.03 per daily fetch (Sonnet + web search)
- **Total**: Essentially free, maybe $1/month in Anthropic API costs
