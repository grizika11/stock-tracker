-- ═══════════════════════════════════════════════════════
-- STOCK TRACKER - Supabase Schema
-- Run this in Supabase SQL Editor (one time setup)
-- ═══════════════════════════════════════════════════════

-- 1. STOCKS TABLE
-- Core table: one row per stock you're tracking
-- The guidance_json field stores earnings guidance specific to each stock
CREATE TABLE stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,           -- e.g. 'JBLU'
  name TEXT NOT NULL,                     -- e.g. 'JetBlue Airways'
  sector TEXT,                            -- e.g. 'Airlines'
  active BOOLEAN DEFAULT true,
  guidance_json JSONB DEFAULT '{}',       -- flexible: store any guidance data per stock
  notes TEXT,                             -- general notes about the stock
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PRICE HISTORY TABLE
-- Daily snapshots of price + macro variables
-- This is what the cron job writes to and what charts read from
CREATE TABLE price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  date DATE NOT NULL,
  price NUMERIC(10,4),                    -- stock closing price
  price_change_pct NUMERIC(8,4),          -- daily % change
  volume TEXT,                            -- trading volume
  market_cap TEXT,                        -- market cap string
  jet_fuel NUMERIC(10,4),                 -- Gulf Coast jet fuel $/gal
  wti_crude NUMERIC(10,4),               -- WTI crude $/bbl
  crack_spread NUMERIC(10,4),            -- jet fuel - (WTI/42)
  day_range TEXT,                         -- "low - high"
  extra_json JSONB DEFAULT '{}',          -- flexible: TSA data, consumer confidence, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, date)                    -- one row per stock per day
);

-- 3. MODEL ASSUMPTIONS TABLE
-- Your slider positions / assumptions per stock
-- Each user can have their own set of assumptions
CREATE TABLE model_assumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  user_label TEXT DEFAULT 'default',      -- for multi-user: 'ben', 'dad', etc.
  rev_growth NUMERIC(6,2) DEFAULT 2.0,
  op_margin NUMERIC(6,2) DEFAULT 0.0,
  fuel_cost NUMERIC(6,4) DEFAULT 2.35,
  jetforward_pct NUMERIC(6,2) DEFAULT 100,
  ev_multiple NUMERIC(6,2) DEFAULT 5.5,
  ma_premium NUMERIC(6,2) DEFAULT 0,
  use_auto_fuel BOOLEAN DEFAULT true,
  use_auto_margin BOOLEAN DEFAULT true,
  custom_json JSONB DEFAULT '{}',         -- stock-specific model inputs
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, user_label)
);

-- 4. ANALYST RATINGS TABLE
-- Wall Street tracker
CREATE TABLE analyst_ratings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  firm TEXT NOT NULL,
  analyst TEXT,
  rating TEXT NOT NULL,                   -- 'Buy', 'Hold', 'Sell', 'Neutral', etc.
  price_target NUMERIC(10,2),
  prev_rating TEXT,
  direction TEXT,                         -- 'upgrade', 'downgrade', 'raise', 'maintain'
  date TEXT,                              -- readable date like 'Feb 3'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. CATALYSTS TABLE
-- Events timeline per stock
CREATE TABLE catalysts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  date_label TEXT NOT NULL,               -- 'Q1 2026', 'Apr 27-28', etc.
  event TEXT NOT NULL,
  event_type TEXT DEFAULT 'neutral',      -- 'bull', 'bear', 'risk', 'catalyst', 'neutral'
  status TEXT DEFAULT 'upcoming',         -- 'active', 'upcoming', 'future', 'completed'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. SCORECARD TABLE
-- Metric tracking with descriptions
CREATE TABLE scorecard (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,               -- e.g. 'jetforward_2025'
  label TEXT NOT NULL,                    -- 'JetForward 2025'
  current_value TEXT NOT NULL,            -- '$305M'
  target_value TEXT,                      -- '$290M'
  status TEXT DEFAULT 'tracking',         -- 'beat', 'strong', 'tracking', 'risk', etc.
  category TEXT,                          -- 'Strategy', 'Revenue', 'Cost', etc.
  description TEXT,                       -- full explanation paragraph
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, metric_key)
);

-- 7. NOTES TABLE
-- Timestamped observations
CREATE TABLE notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT REFERENCES stocks(ticker) ON DELETE SET NULL,  -- null = general note
  user_label TEXT DEFAULT 'default',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. HEADLINES TABLE
-- News headlines captured during fetches
CREATE TABLE headlines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  date DATE NOT NULL,
  headline TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_price_history_ticker_date ON price_history(ticker, date DESC);
CREATE INDEX idx_analyst_ratings_ticker ON analyst_ratings(ticker);
CREATE INDEX idx_catalysts_ticker ON catalysts(ticker);
CREATE INDEX idx_scorecard_ticker ON scorecard(ticker);
CREATE INDEX idx_headlines_ticker_date ON headlines(ticker, date DESC);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- For now, allow all operations (no auth required)
-- You can tighten this later if you add user accounts
-- ═══════════════════════════════════════════════════════
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalysts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE headlines ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (open access for now)
CREATE POLICY "Allow all" ON stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON model_assumptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON analyst_ratings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON catalysts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON scorecard FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON headlines FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- SEED DATA: JBLU
-- ═══════════════════════════════════════════════════════
INSERT INTO stocks (ticker, name, sector, guidance_json) VALUES (
  'JBLU', 'JetBlue Airways', 'Airlines',
  '{
    "q1_2026": {
      "fuel_low": 2.27, "fuel_high": 2.42, "fuel_mid": 2.345,
      "rasm_low": 0, "rasm_high": 4,
      "casm_low": 3.5, "casm_high": 5.5,
      "capacity_low": 0.5, "capacity_high": 3.5,
      "earnings_date": "Apr 27-28, 2026",
      "eps_consensus": -0.43
    },
    "fy_2026": {
      "base_rev": 9.1,
      "shares": 0.364,
      "net_debt": 2.7,
      "da": 0.50,
      "interest": 0.58,
      "jetforward_target": 0.310,
      "capacity_growth_low": 2.5, "capacity_growth_high": 4.5,
      "target_margin": "Breakeven or better"
    }
  }'
);

-- Default model assumptions for JBLU
INSERT INTO model_assumptions (ticker, user_label, rev_growth, op_margin, fuel_cost, jetforward_pct, ev_multiple, ma_premium)
VALUES ('JBLU', 'default', 2.0, 0.0, 2.35, 100, 5.5, 0);

-- Analyst ratings
INSERT INTO analyst_ratings (ticker, firm, rating, price_target, prev_rating, direction, date) VALUES
  ('JBLU', 'Citi', 'Neutral', 6.00, 'Sell', 'upgrade', 'Feb 3'),
  ('JBLU', 'JPMorgan', 'Neutral', 6.00, 'Neutral', 'raise', 'Jan 28'),
  ('JBLU', 'Evercore ISI', 'Hold', 6.00, 'Hold', 'raise', 'Jan 29'),
  ('JBLU', 'TD Cowen', 'Hold', 5.00, 'Hold', 'raise', 'Jan 7'),
  ('JBLU', 'Susquehanna', 'Neutral', 5.00, 'Neutral', 'raise', 'Jan 8'),
  ('JBLU', 'Morgan Stanley', 'Equal-Weight', 7.00, 'Equal-Weight', 'lower', 'Dec 8'),
  ('JBLU', 'Goldman Sachs', 'Sell', 4.00, 'Sell', 'raise', 'Jan 12'),
  ('JBLU', 'UBS', 'Sell', 3.00, 'Sell', 'maintain', 'Dec 11'),
  ('JBLU', 'Barclays', 'Sell', NULL, 'Sell', 'maintain', 'Jan 9');

-- Catalysts
INSERT INTO catalysts (ticker, date_label, event, event_type, status) VALUES
  ('JBLU', 'Q1 2026', 'Blue Sky reciprocal revenue bookings go live', 'bull', 'active'),
  ('JBLU', 'Q1 2026', 'Blue Sky reciprocal elite benefits launch', 'bull', 'active'),
  ('JBLU', 'Apr 2026', '$325M convertible note maturity — must refinance', 'risk', 'upcoming'),
  ('JBLU', 'Apr 27-28', 'Q1 2026 Earnings — the inflection test', 'catalyst', 'upcoming'),
  ('JBLU', 'Mid 2026', 'Domestic first-class retrofit begins', 'bull', 'upcoming'),
  ('JBLU', '2026', 'Boston BlueHouse Lounge opens', 'bull', 'upcoming'),
  ('JBLU', '2026', 'United MileagePlus Travel → Paisly transition', 'bull', 'upcoming'),
  ('JBLU', 'End 2027', 'JetForward cumulative $850-950M EBIT target', 'bull', 'future'),
  ('JBLU', '2027', 'Management targets positive free cash flow', 'bull', 'future');

-- Scorecard items
INSERT INTO scorecard (ticker, metric_key, label, current_value, target_value, status, category, description, sort_order) VALUES
  ('JBLU', 'jf25', 'JetForward 2025', '$305M', '$290M', 'beat', 'Strategy',
   'JetForward multi-year transformation delivered $305M incremental EBIT in 2025, exceeding the $290M initial target. 7 consecutive quarters of cost outperformance.', 1),
  ('JBLU', 'jf26', 'JetForward 2026', '+$310M', '+$310M', 'tracking', 'Strategy',
   'Targets additional $310M incremental EBIT in 2026, bringing cumulative total to ~$615M. Key to reaching breakeven operating margin.', 2),
  ('JBLU', 'blue_sky', 'Blue Sky (United)', '$50M EBIT/yr', '$50M', 'launching', 'Revenue',
   'Collaboration with United Airlines: reciprocal loyalty live Oct 2025, revenue bookings Q1 2026, elite benefits early 2026. Expected $50M annual EBIT.', 3),
  ('JBLU', 'rasm_q4', 'Q4 RASM Actual', '+0.2% YoY', '-4% to flat', 'beat', 'Revenue',
   'Revenue per Available Seat Mile increased 0.2% YoY in Q4 2025, significantly beating guidance. First positive print in recent quarters.', 4),
  ('JBLU', 'rasm_q1', 'Q1 RASM Guide', '0% to +4%', '—', 'guided', 'Revenue',
   'Most bullish RASM guidance in JetForward era. Key metric at April 27-28 earnings.', 5),
  ('JBLU', 'fuel_q1', 'Q1 Fuel Guide', '$2.27-$2.42', '—', 'favorable', 'Cost',
   'Spot prices running below guidance range. Each $0.10/gal = ~90bps margin impact.', 6),
  ('JBLU', 'casm', 'CASM ex-Fuel', '7th Qtr beat', '+3.5-5.5%', 'strong', 'Cost',
   '7 consecutive quarters of beating cost guidance. Fleet simplification to 2 types driving structural improvement.', 7),
  ('JBLU', 'pw', 'P&W Grounded', 'Mid-single digits', 'Low-single', 'risk', 'Operations',
   'Pratt & Whitney GTF engine issues. 9 grounded avg in 2025, expected mid-single digits 2026. Each = ~$10-15M lost revenue.', 8),
  ('JBLU', 'nps', 'NPS Score', '+8pts YoY', '—', 'strong', 'Operations',
   'Net Promoter Score gained 8 points YoY. J.D. Power #1 first/business class. Supports premium pricing.', 9),
  ('JBLU', 'debt', 'Leverage', 'D/E 3.73x', 'Improving', 'risk', 'Balance Sheet',
   '$5.2B debt, $580M interest. Gross debt peaked 2025. $325M convertible due April 2026.', 10),
  ('JBLU', 'fll', 'Fort Lauderdale', '+35% capacity', '—', 'strong', 'Network',
   'Fastest-growing hub. Spirit bankruptcy created vacuum. 17 new routes, RASM headwinds declining faster than expected.', 11),
  ('JBLU', 'loyalty', 'Loyalty Revenue', '13% of rev', 'Growing', 'strong', 'Revenue',
   'TrueBlue now 13% of total revenue. Premium credit card exceeded targets. JFK lounge opened Dec 2025.', 12);
