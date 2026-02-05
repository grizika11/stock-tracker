import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, ComposedChart,
  Area, ReferenceLine,
} from 'recharts';
import {
  useStocks, useStock, usePriceHistory, useModelAssumptions,
  useAnalysts, useCatalysts, useScorecard, useHeadlines, useFetchLive,
} from './lib/hooks';
import {
  THEME as C, STATUS_COLORS,
  computeTimeframeAverages, getTimeframeData,
  computeLiveModelInputs, calcPriceTarget,
  calcRnpv, calcBiotechScenarios, computeBiotechSignals,
} from './lib/utils';

const mono = "'JetBrains Mono','Fira Code',monospace";

// ─── Reusable UI Components ───

function Card({ title, children, accent = C.g, span = 1, style = {} }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: 6, padding: '14px 16px', gridColumn: span > 1 ? `span ${span}` : undefined, ...style }}>
      {title && <div style={{ fontSize: 9, fontFamily: mono, color: accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>{title}</div>}
      {children}
    </div>
  );
}

function Row({ label, value, color = C.t, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: `1px solid ${C.border}50` }}>
      <span style={{ fontSize: 11, color: C.d, fontFamily: mono }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 12, color, fontFamily: mono, fontWeight: 600 }}>{value}</span>
        {sub && <div style={{ fontSize: 8, color: C.f }}>{sub}</div>}
      </div>
    </div>
  );
}

function Badge({ text, color }) {
  return <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: `${color}18`, color, fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, display: 'inline-block' }}>{text}</span>;
}

function Signal({ signal }) {
  const map = { tailwind: { icon: '▲', color: C.g }, headwind: { icon: '▼', color: C.r }, neutral: { icon: '—', color: C.d }, 'in-range': { icon: '●', color: C.b } };
  const s = map[signal] || map.neutral;
  return <span style={{ color: s.color, fontSize: 9, fontFamily: mono, fontWeight: 700 }}>{s.icon} {signal}</span>;
}

function Slider({ label, min, max, step, value, onChange, format, color = C.g, liveLabel, onInfo }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.d, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 4 }}>
          {label}
          {onInfo && <button onClick={onInfo} style={{ background: `${C.b}15`, border: `1px solid ${C.b}30`, borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, fontSize: 8, color: C.b, fontFamily: mono, fontWeight: 700, lineHeight: 1 }}>?</button>}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          {liveLabel && <span style={{ fontSize: 8, color: C.p, fontFamily: mono, background: `${C.p}12`, padding: '1px 5px', borderRadius: 2 }}>LIVE: {liveLabel}</span>}
          <span style={{ fontSize: 12, color, fontFamily: mono, fontWeight: 700 }}>{format ? format(value) : value}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ accentColor: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8, color: C.f, fontFamily: mono }}>{format ? format(min) : min}</span>
        <span style={{ fontSize: 8, color: C.f, fontFamily: mono }}>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

function TimeframeCard({ label, data, fuelMid, isBiotech }) {
  if (!data) return (
    <div style={{ padding: 10, background: `${C.bg}80`, borderRadius: 6, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 10, color: C.f, marginTop: 6 }}>No data</div>
    </div>
  );
  if (isBiotech) {
    return (
      <div style={{ padding: 10, background: `${C.bg}80`, borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.d, fontFamily: mono, textTransform: 'uppercase' }}>{label}</span>
          <Badge text={`${data.count} pts`} color={C.d} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>PRICE</div><div style={{ fontSize: 14, fontFamily: mono, fontWeight: 700 }}>${data.price?.toFixed(2) || '—'}</div></div>
          <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>XBI</div><div style={{ fontSize: 14, fontFamily: mono, fontWeight: 700, color: C.b }}>${data.xbi?.toFixed(2) || '—'}</div></div>
          <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>RANGE</div><div style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, color: C.d }}>{data.price_min != null ? `$${data.price_min.toFixed(2)}–$${data.price_max.toFixed(2)}` : '—'}</div></div>
          <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>VOL</div><div style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, color: C.o }}>{data.volume ? (data.volume / 1e6).toFixed(1) + 'M' : '—'}</div></div>
        </div>
      </div>
    );
  }
  const fd = data.fuel ? data.fuel - fuelMid : null;
  const fc = fd == null ? C.d : fd < -0.05 ? C.g : fd > 0.05 ? C.r : C.o;
  return (
    <div style={{ padding: 10, background: `${C.bg}80`, borderRadius: 6, border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: C.d, fontFamily: mono, textTransform: 'uppercase' }}>{label}</span>
        <Badge text={`${data.count} pts`} color={C.d} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>PRICE</div><div style={{ fontSize: 14, fontFamily: mono, fontWeight: 700 }}>${data.price?.toFixed(2) || '—'}</div></div>
        <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>FUEL</div><div style={{ fontSize: 14, fontFamily: mono, fontWeight: 700, color: fc }}>${data.fuel?.toFixed(3) || '—'}</div></div>
        <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>WTI</div><div style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: C.b }}>${data.wti?.toFixed(2) || '—'}</div></div>
        <div><div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>CRACK</div><div style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: data.crack > 0.6 ? C.r : C.g }}>${data.crack?.toFixed(3) || '—'}</div></div>
      </div>
    </div>
  );
}

function Modal({ item, onClose }) {
  if (!item) return null;
  const accent = STATUS_COLORS[item.status] || item.accent || C.b;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 540, width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge text={item.category} color={C.b} />
            {item.status && <Badge text={item.status} color={accent} />}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.d, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <h3 style={{ fontSize: 17, color: C.t, margin: '0 0 6px', fontWeight: 700 }}>{item.label}</h3>
        {(item.current_value || item.target_value) && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
            {item.current_value && <div>
              <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>Current</div>
              <div style={{ fontSize: 20, fontFamily: mono, fontWeight: 700, color: accent }}>{item.current_value}</div>
            </div>}
            {item.target_value && item.target_value !== '—' && <div>
              <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>Target / Range</div>
              <div style={{ fontSize: 20, fontFamily: mono, fontWeight: 700, color: C.d }}>{item.target_value}</div>
            </div>}
          </div>
        )}
        <p style={{ fontSize: 13, color: C.d, lineHeight: 1.7, margin: 0 }}>{item.description}</p>
        {item.impact && (
          <div style={{ marginTop: 12, padding: '8px 10px', background: `${accent}08`, border: `1px solid ${accent}20`, borderRadius: 6 }}>
            <div style={{ fontSize: 8, color: accent, fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>Impact on Model</div>
            <p style={{ fontSize: 12, color: C.t, lineHeight: 1.6, margin: 0 }}>{item.impact}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TABS ───
const TABS = [
  { id: 'model', label: 'Live Model', icon: '⚡' },
  { id: 'timeframes', label: 'Timeframes', icon: '◷' },
  { id: 'scorecard', label: 'Scorecard', icon: '◧' },
  { id: 'charts', label: 'Charts', icon: '◩' },
  { id: 'analysts', label: 'Analysts', icon: '◫' },
  { id: 'thesis', label: 'Bull / Bear', icon: '⇅' },
  { id: 'catalysts', label: 'Catalysts', icon: '⏱' },
];

// ─── MODEL INFO DESCRIPTIONS ───
const SIGNAL_INFO = {
  fuel_spot: {
    label: 'Jet Fuel Spot Price', category: 'Live Signal', accent: C.o,
    description: 'The Gulf Coast kerosene-type jet fuel spot price — this is what JetBlue actually pays to fuel their planes. Published daily by the EIA. Management guides fuel cost per gallon each quarter, so comparing the spot price to guidance tells you whether fuel is a tailwind (below guide) or headwind (above guide). JetBlue consumes roughly 1 billion gallons per year.',
    impact: 'Each $0.10/gallon move = ~$100M annual cost impact = ~90 basis points of operating margin. When fuel spot is below the Q1 guide of $2.27, that margin benefit flows directly into higher EBITDA and a higher price target.',
  },
  crack_spread: {
    label: 'Crack Spread', category: 'Live Signal', accent: C.r,
    description: 'The crack spread is the difference between refined jet fuel price and crude oil price per gallon (Jet Fuel − WTI÷42). It represents the refining margin — the premium airlines pay above crude for the actual usable fuel. This is the hidden variable most investors miss. In Q4 2025, crude oil was moderate but the crack spread spiked, catching JetBlue off guard and hurting margins.',
    impact: 'A "normal" crack spread is $0.40–$0.55/gal. Above $0.60 signals refining tightness that hits airline margins even when crude looks benign. Below $0.45 is a tailwind. The model subtracts 0.5% margin when crack exceeds $0.70 and adds 0.3% when below $0.45.',
  },
  wti_crude: {
    label: 'WTI Crude Oil', category: 'Live Signal', accent: C.b,
    description: 'West Texas Intermediate crude oil price per barrel — the primary benchmark for U.S. oil. This is a leading indicator for where jet fuel is headed, since jet fuel is refined from crude. However, the relationship is not 1:1 because refining capacity, seasonal demand, and supply disruptions (like refinery outages) can cause jet fuel to diverge from crude.',
    impact: 'Crude drives the medium-term direction of fuel costs. A $10/barrel move in crude translates to roughly $0.24/gal in jet fuel (divide by 42 gallons per barrel). Watch for geopolitical shocks (Middle East, Russia) that can spike crude overnight.',
  },
  q1_guide: {
    label: 'Q1 2026 Fuel Guidance', category: 'Guidance', accent: C.p,
    description: 'Management guided Q1 2026 fuel costs at $2.27–$2.42 per gallon, with a midpoint of $2.345. This range was set during the Q4 2025 earnings call based on forward curves at that time. The quarterly fuel average is what actually hits the income statement — not any single day\'s spot price. That\'s why the running quarterly average matters more than today\'s spot.',
    impact: 'If the Q1 average comes in below $2.27, JetBlue beats fuel guidance — that surplus flows straight to operating income. Every $0.01/gal below guide ≈ $10M incremental benefit. The Timeframes tab tracks the running Q1 average to flag beat/miss probability.',
  },
};

const SLIDER_INFO = {
  rev_growth: {
    label: 'Revenue Growth', category: 'Model Assumption', accent: C.g,
    current_value: 'Adjustable', target_value: '-3% to +6%',
    description: 'Year-over-year revenue growth applied to the $9.1B TTM base. Revenue is driven by RASM (revenue per available seat mile) × capacity (ASMs). Q1 2026 RASM is guided at 0–4% with capacity growth of 0.5–3.5%. Blue Sky (United partnership) and Fort Lauderdale expansion are incremental revenue drivers. Leisure demand is correlated with consumer confidence and employment.',
    impact: 'Each 1% of revenue growth adds ~$91M to the top line. At current margins, that flows through at roughly 10-20% to EBITDA depending on operating leverage. The base case assumes 2% growth; bull case assumes 4% driven by RASM recovery + Blue Sky.',
  },
  op_margin: {
    label: 'Base Operating Margin', category: 'Model Assumption', accent: C.g,
    current_value: 'Adjustable', target_value: '-5% to +5%',
    description: 'The operating margin adjustment applied to projected revenue before adding D&A and JetForward to calculate EBITDA. A 0% base margin means JetBlue is at breakeven operations — which is roughly where they are guided for 2026. Positive margin means they outperform on costs or revenue; negative means they miss. In Auto mode, fuel prices automatically adjust this — a fuel tailwind increases the effective margin.',
    impact: 'Each 1% of operating margin on $9.1B revenue = $91M of operating income = directly adds to EBITDA. The fuel auto-adjustment uses the formula: each $0.10/gal deviation from guidance midpoint = ~90bps margin impact. So if fuel is $0.20 below guide, you get +1.8% automatic margin boost.',
  },
  fuel_cost: {
    label: 'Fuel Cost Assumption', category: 'Model Assumption', accent: C.o,
    current_value: 'Adjustable', target_value: '$1.90 – $3.00/gal',
    description: 'The assumed fuel cost per gallon used in the model. In Auto mode, this pulls directly from live spot prices or the quarterly running average. In Manual mode, you set your own assumption. JetBlue does minimal hedging compared to peers like Southwest, so they have high fuel price exposure. The Q1 2026 guide range is $2.27–$2.42.',
    impact: 'Fuel is JetBlue\'s largest variable cost (~30% of CASM). Each $0.10/gal = ~$100M annual impact = ~90bps of margin. At $1.95/gal (current spot), JetBlue is saving roughly $300M annualized vs. the guide midpoint. This is why fuel is the single most important live variable in the model.',
  },
  jf_pct: {
    label: 'JetForward Delivery %', category: 'Model Assumption', accent: C.g,
    current_value: 'Adjustable', target_value: '50% – 120% of $310M',
    description: 'JetForward is JetBlue\'s multi-year transformation program targeting cumulative $850–950M in incremental EBIT. Year 1 (2025) delivered $305M vs. $290M target — a beat. Year 2 (2026) targets an additional $310M. This slider adjusts what percentage of that $310M target you believe they\'ll actually deliver. Key initiatives: network optimization, product perks, fleet simplification, AI-driven cost reductions, first-class cabin.',
    impact: 'At 100%, the full $310M flows into the EBITDA calculation (weighted by margin scenario). At 75%, only $233M flows through — the difference is ~$77M of EBITDA, which at a 5.5x multiple = ~$423M of enterprise value = ~$1.16/share. JetForward delivery is the second most impactful variable after fuel.',
  },
  ev_multiple: {
    label: 'EV/EBITDA Multiple', category: 'Model Assumption', accent: C.p,
    current_value: 'Adjustable', target_value: '3.0x – 9.0x',
    description: 'Enterprise Value to EBITDA — the valuation multiple the market assigns to JetBlue\'s earnings. This is how you translate operational performance into a stock price. The multiple reflects market confidence: low multiples (3-4x) mean the market doubts sustainability; high multiples (7-9x) mean the market prices in growth. Legacy carriers like DAL/UAL trade at 4-6x; LCCs at 5-7x. JetBlue currently trades at the low end because of its debt load and turnaround uncertainty.',
    impact: 'The multiple is the biggest lever on price target after EBITDA itself. On $1.5B EBITDA, the difference between 4x and 7x is $4.5B of enterprise value = ~$12.36/share. Each 0.5x multiple expansion = roughly $2B EV = ~$5.50/share. Catalysts that expand multiples: consistent execution, debt reduction, FCF generation, or M&A speculation.',
  },
  ma_premium: {
    label: 'M&A / Strategic Premium', category: 'Model Assumption', accent: C.p,
    current_value: 'Adjustable', target_value: '0% – 30%',
    description: 'An optional premium added for merger/acquisition or strategic value. Citi\'s upgrade thesis specifically cited M&A optionality — JetBlue trades at 0.18x revenue and 0.74x book value, making it statistically cheap as an acquisition target. Potential acquirers: another airline seeking JFK/BOS slots and routes, or a private equity take-private at depressed valuations. Amazon\'s logistics ambitions have also been speculated.',
    impact: 'This adds a percentage premium directly to the equity value after subtracting debt. At 15% premium on an $8B enterprise value, that\'s $1.2B additional equity = ~$3.30/share. Most base cases should use 0% — only add premium if you believe an M&A catalyst is likely within your investment horizon.',
  },
};

const TARGET_INFO = {
  eff_margin: {
    label: 'Effective Operating Margin', category: 'Price Target', accent: C.g,
    description: 'The total operating margin used in the EBITDA calculation — your base margin assumption plus any auto-adjustment from live fuel data. This represents what percentage of revenue becomes operating income. JetBlue\'s 2026 target is breakeven (0%) to slightly positive. The auto fuel adjustment adds/subtracts margin based on how spot fuel compares to guidance.',
    impact: 'Applied to projected revenue to get operating income. Operating income + D&A (~$500M) + weighted JetForward contribution = EBITDA. The margin is the primary driver of whether EBITDA is $800M (bear) or $1.8B (bull).',
  },
  jf_contrib: {
    label: 'JetForward EBIT Contribution', category: 'Price Target', accent: C.g,
    description: 'The dollar amount of JetForward\'s incremental EBIT flowing into the model, based on your delivery percentage × $310M target. This is added to EBITDA with a weight factor (0.3–0.5x) since some JetForward savings are already embedded in the base margin. In 2025, JetForward was the primary reason CASM ex-fuel beat guidance 7 consecutive quarters.',
    impact: 'Added directly to EBITDA after weighting. At 100% delivery with 0.5x weighting, $155M flows to EBITDA. At 5.5x multiple, that\'s $853M of enterprise value = $2.34/share of price target.',
  },
  net_debt: {
    label: 'Net Debt Subtracted', category: 'Price Target', accent: C.r,
    description: 'Net debt = total debt ($5.2B) minus liquidity ($2.5B cash + equivalents) = $2.7B. This is subtracted from Enterprise Value to get Equity Value. JetBlue\'s heavy debt load is the primary bear case — $580M annual interest expense, $325M convertible note due April 2026, and D/E ratio of 3.73x. Management plans to repay $800M and raise $500M new financing in 2026. Gross debt has peaked.',
    impact: 'Every $100M of debt reduction adds ~$0.27/share to the price target (100M ÷ 364M shares). If JetBlue hits its 2026 debt repayment plan and reduces net debt from $2.7B to $2.2B, that\'s ~$1.37/share of value creation from deleveraging alone.',
  },
  scenarios: {
    label: 'Scenario Range', category: 'Price Target', accent: C.o,
    description: 'Bear ($' + '—' + '): Revenue -1%, margin -3%, fuel $2.60, JetForward 75%, 4x multiple, no premium. Assumes fuel spike, macro downturn, JetForward stumbles. Base ($' + '—' + '): Revenue +2%, flat margin + fuel adjustment, JetForward 100%, 5.5x multiple. Assumes guidance execution. Bull ($' + '—' + '): Revenue +4%, margin +3%, fuel tailwind, JetForward 110%, 7x multiple, 15% M&A premium. Assumes full execution + strategic catalyst.',
    impact: 'The scenario range shows where your assumptions sit relative to bear/base/bull. If your target is near the bull end, you\'re pricing in a lot of things going right. Near the bear end, you\'re pricing in deterioration. Your conviction level should match your scenario positioning.',
  },
};

// ─── BIOTECH MODEL INFO ───
const BIOTECH_SIGNAL_INFO = {
  xbi: {
    label: 'XBI — Biotech ETF', category: 'Sector Signal', accent: C.b,
    description: 'The SPDR S&P Biotech ETF tracks the biotech sector broadly. Micro-cap biotechs like SGMO correlate heavily with XBI — when the sector is in "risk-on" mode, even fundamentals-weak biotechs rally. When XBI sells off, SGMO gets dragged down regardless of pipeline news. Comparing SGMO\'s daily move to XBI tells you whether the stock is moving on its own merits or just riding sector flows.',
    impact: 'If SGMO is up 5% on a day XBI is flat, that\'s stock-specific (news, data readout, partnership rumor). If SGMO is up 5% and XBI is up 4%, it\'s mostly sector beta. For timing entries, buying SGMO on an XBI red day + positive SGMO catalyst = better risk/reward.',
  },
  short_interest: {
    label: 'Short Interest', category: 'Sentiment Signal', accent: C.o,
    description: 'Percentage of SGMO\'s float sold short. High short interest on a micro-cap biotech with binary catalysts (FDA approval/rejection) creates squeeze potential. When good news drops (positive data, BLA acceptance), shorts rush to cover, amplifying the move. SGMO\'s low float and high institutional ownership make it particularly squeeze-prone.',
    impact: 'Above 15% short interest = high squeeze potential on positive catalysts. A BLA approval with 15%+ SI could drive 50-100%+ moves in days. Below 8% = limited squeeze potential. Short interest updates biweekly (FINRA reporting).',
  },
  fold: {
    label: 'FOLD — Amicus (Competitor)', category: 'Competitive Signal', accent: C.p,
    description: 'Amicus Therapeutics (FOLD) markets Galafold for Fabry disease — a small molecule oral therapy. FOLD is the most direct comp for ST-920\'s commercial potential. If FOLD is performing well, it validates the Fabry market size. If FOLD struggles with reimbursement or adoption, it signals market challenges for any Fabry therapy. FOLD\'s pricing (~$300K/yr) also sets a reference for ST-920 pricing.',
    impact: 'FOLD rising = Fabry market validated = positive for ST-920\'s commercial potential. FOLD falling on Fabry-specific issues = warning sign. Watch FOLD\'s Galafold revenue growth on their earnings calls as a demand indicator.',
  },
  volume: {
    label: 'Volume vs Average', category: 'Activity Signal', accent: C.g,
    description: 'Comparing today\'s trading volume to the average gives you an activity signal. In biotech, volume spikes often precede or accompany catalysts — someone knows something, or the market is positioning ahead of data. SGMO\'s average volume is ~6M shares/day; spikes to 15-20M+ suggest institutional activity or retail surge.',
    impact: 'Volume spike + price up = accumulation (bullish). Volume spike + price flat/down = distribution (bearish). Low volume + price drift = no conviction. Watch for unusual volume before FDA action dates or earnings.',
  },
};

const BIOTECH_SLIDER_INFO = {
  st920_prob: {
    label: 'ST-920 Approval Probability', category: 'rNPV Input', accent: C.g,
    current_value: 'Adjustable', target_value: '0% – 100%',
    description: 'The probability that ST-920 receives FDA approval. Currently in BLA rolling submission under Accelerated Approval pathway. Phase 1/2 STAAR study showed positive eGFR slope (+1.965) at 52 weeks. Industry base rate for BLA-stage gene therapies with Accelerated Approval pathway and positive registrational data is ~60-75%. Key risks: manufacturing (CMC), long-term safety, confirmatory study requirements.',
    impact: 'This is the single most important slider. At 65% probability and $800M peak sales, ST-920 contributes ~$330M to rNPV. At 85%, it\'s ~$430M. At 35% (bear), it\'s ~$175M. The probability × peak sales product drives the majority of SGMO\'s valuation.',
  },
  st920_peak: {
    label: 'ST-920 Peak Sales ($M)', category: 'rNPV Input', accent: C.g,
    current_value: 'Adjustable', target_value: '$200M – $2B',
    description: 'Estimated peak annual sales for ST-920 if approved. Fabry disease has ~10,000 diagnosed patients in the US. At $500K-$2M per one-time treatment, the addressable market is $2-10B. Penetration depends on: switching patients from ERT (evidence of superiority), capturing newly diagnosed, global access. Competitors: Fabrazyme ($1.2B/yr), Galafold ($500M/yr), Elfabrio.',
    impact: 'Peak sales flow through the rNPV ramp curve (10% → 100% over 5 years). At $800M peak and 30% royalty (partnered), the discounted revenue stream = ~$500M NPV before probability adjustment. Self-commercialize at 50% margin = much higher but requires $200M+ in build-out.',
  },
  st920_royalty: {
    label: 'ST-920 Net Margin / Royalty %', category: 'rNPV Input', accent: C.o,
    current_value: 'Adjustable', target_value: '10% – 60%',
    description: 'What percentage of ST-920 revenue flows to Sangamo as profit. If partnered: Sangamo receives royalties (15-30% typical for BLA-stage assets) + milestones. If self-commercialized: 50-60% margin but requires commercial infrastructure investment (~$200M). Sangamo is actively seeking a partner, so royalty scenario is most likely.',
    impact: 'The difference between 15% royalty (unfavorable deal) and 30% royalty (strong deal) at $800M peak sales = $120M/year difference in peak earnings = massive impact on per-share value. Partnership terms are the second most impactful unknown after approval probability.',
  },
  st503_prob: {
    label: 'ST-503 Probability', category: 'rNPV Input', accent: C.p,
    current_value: 'Adjustable', target_value: '0% – 50%',
    description: 'Probability ST-503 (Small Fiber Neuropathy / chronic pain) succeeds. Much earlier stage than ST-920 — Phase 1/2 STAND trial just started dosing. Preliminary data expected Q4 2026. Novel non-opioid mechanism using zinc finger epigenetic regulators. FDA Fast Track designation received. Chronic pain is a massive market ($7B+) but notoriously hard to show efficacy in trials.',
    impact: 'High risk / high reward. At 20% probability and $500M peak, ST-503 adds ~$40M to rNPV. At 35% and $1B peak, it adds ~$150M. This is optionality value — if it works, it could be worth more than ST-920. But most pain drug candidates fail.',
  },
  partner: {
    label: 'Partnership Probability', category: 'rNPV Input', accent: C.b,
    current_value: 'Adjustable', target_value: '0% – 100%',
    description: 'Probability Sangamo signs a commercialization partner for ST-920 in 2026. Sangamo has no commercial infrastructure and ~$60M cash. Without a partner, they cannot effectively launch even if approved. Active discussions ongoing. The $25M Feb 2026 offering bought time but signals no deal is imminent.',
    impact: 'A partnership upfront payment ($50-200M) directly reduces dilution risk and extends runway. Milestones ($200-1000M) provide long-term value. If probability is 0% (no partner), Sangamo must self-fund via dilutive raises — the diluted share count explodes and per-share value collapses.',
  },
  diluted_shares: {
    label: 'Diluted Share Count (M)', category: 'rNPV Input', accent: C.r,
    current_value: 'Adjustable', target_value: '350M – 600M',
    description: 'Total shares including warrants, options, and future dilution. Pre-Feb offering: ~280M shares. Feb 2026 offering added 35M shares + 18M pre-funded warrants + 53M warrants = potentially 386M. Plus 24M existing warrants repriced. If another $50M raise at $0.50: +100M shares. This is the silent killer for micro-cap biotech investors.',
    impact: 'rNPV ÷ shares = price target. At 450M shares and $300M rNPV = $0.67/share. At 350M shares = $0.86. At 600M shares (aggressive dilution) = $0.50. Every capital raise at sub-$1 prices massively erodes per-share value. A partnership that reduces the need for raises is critical.',
  },
  discount_rate: {
    label: 'Discount Rate', category: 'rNPV Input', accent: C.d,
    current_value: 'Adjustable', target_value: '8% – 18%',
    description: 'The rate used to discount future cash flows back to present value. Reflects the risk level — higher discount rate = more skeptical of future earnings materializing. Standard biotech discount rates: 10-12% for late-stage (BLA), 12-15% for Phase 2, 15-18% for early pipeline. Given SGMO\'s cash concerns and execution risk, 12% (base) is reasonable.',
    impact: 'At 10% discount rate, future revenues are worth more today — bullish. At 15%, they\'re worth less — bearish. A 12% vs 15% rate on ST-920 alone changes the asset\'s NPV by ~20%. Lower discount rates are justified once key risks are removed (BLA filing complete, partner signed).',
  },
};

// ─── MAIN APP ───
export default function App() {
  const [activeTicker, setActiveTicker] = useState('JBLU');
  const [tab, setTab] = useState('model');
  const [modalItem, setModalItem] = useState(null);

  // Data hooks
  const { stocks } = useStocks();
  const { stock } = useStock(activeTicker);
  const { history, refresh: refreshHistory } = usePriceHistory(activeTicker);
  const { assumptions, save: saveAssumptions } = useModelAssumptions(activeTicker);
  const analysts = useAnalysts(activeTicker);
  const catalysts = useCatalysts(activeTicker);
  const scorecardItems = useScorecard(activeTicker);
  const headlines = useHeadlines(activeTicker);
  const { fetchNow, loading: fetchLoading, lastResult } = useFetchLive();

  // Model state (initialized from DB when assumptions load)
  const [revGrowth, setRevGrowth] = useState(2);
  const [opMargin, setOpMargin] = useState(0);
  const [manFuel, setManFuel] = useState(2.35);
  const [jfPct, setJfPct] = useState(100);
  const [evMult, setEvMult] = useState(5.5);
  const [maPremium, setMaPremium] = useState(0);
  const [useAuto, setUseAuto] = useState(true);

  // Biotech rNPV state
  const [st920Prob, setSt920Prob] = useState(65);
  const [st920Peak, setSt920Peak] = useState(800);
  const [st920Royalty, setSt920Royalty] = useState(30);
  const [st503Prob, setSt503Prob] = useState(20);
  const [st503Peak, setSt503Peak] = useState(500);
  const [st506Prob, setSt506Prob] = useState(10);
  const [partnerProb, setPartnerProb] = useState(50);
  const [partnerUpfront, setPartnerUpfront] = useState(100);
  const [partnerMilestones, setPartnerMilestones] = useState(500);
  const [discountRate, setDiscountRate] = useState(12);
  const [dilutedShares, setDilutedShares] = useState(450);
  const [cashOnHand, setCashOnHand] = useState(60);

  // Sync assumptions from DB
  useEffect(() => {
    if (assumptions) {
      setRevGrowth(parseFloat(assumptions.rev_growth) || 2);
      setOpMargin(parseFloat(assumptions.op_margin) || 0);
      setManFuel(parseFloat(assumptions.fuel_cost) || 2.35);
      setJfPct(parseFloat(assumptions.jetforward_pct) || 100);
      setEvMult(parseFloat(assumptions.ev_multiple) || 5.5);
      setMaPremium(parseFloat(assumptions.ma_premium) || 0);
      setUseAuto(assumptions.use_auto_fuel !== false);
      // Biotech sync
      const cj = assumptions.custom_json || {};
      if (cj.model_type === 'rNPV') {
        setSt920Prob(cj.st920_prob ?? 65);
        setSt920Peak(cj.st920_peak_sales ?? 800);
        setSt920Royalty(cj.st920_royalty_pct ?? 30);
        setSt503Prob(cj.st503_prob ?? 20);
        setSt503Peak(cj.st503_peak_sales ?? 500);
        setSt506Prob(cj.st506_prob ?? 10);
        setPartnerProb(cj.partnership_prob ?? 50);
        setPartnerUpfront(cj.partnership_upfront ?? 100);
        setPartnerMilestones(cj.milestone_payments ?? 500);
        setDiscountRate(cj.discount_rate ?? 12);
        setDilutedShares(cj.dilution_shares ?? 450);
        setCashOnHand(cj.cash_current ?? 60);
      }
    }
  }, [assumptions]);

  // Save assumptions on change (debounced)
  const isBiotech = stock?.sector === 'Biotech';
  useEffect(() => {
    const t = setTimeout(() => {
      if (isBiotech) {
        saveAssumptions({ custom_json: {
          model_type: 'rNPV', st920_prob: st920Prob, st920_peak_sales: st920Peak, st920_royalty_pct: st920Royalty,
          st503_prob: st503Prob, st503_peak_sales: st503Peak, st506_prob: st506Prob,
          partnership_prob: partnerProb, partnership_upfront: partnerUpfront, milestone_payments: partnerMilestones,
          discount_rate: discountRate, dilution_shares: dilutedShares, cash_current: cashOnHand,
        }});
      } else {
        saveAssumptions({ rev_growth: revGrowth, op_margin: opMargin, fuel_cost: manFuel, jetforward_pct: jfPct, ev_multiple: evMult, ma_premium: maPremium, use_auto_fuel: useAuto, use_auto_margin: useAuto });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [revGrowth, opMargin, manFuel, jfPct, evMult, maPremium, useAuto, st920Prob, st920Peak, st920Royalty, st503Prob, st503Peak, st506Prob, partnerProb, partnerUpfront, partnerMilestones, discountRate, dilutedShares, cashOnHand, isBiotech]);

  // Refresh handler
  const handleRefresh = async () => {
    await fetchNow(activeTicker);
    setTimeout(() => refreshHistory(), 1000); // Let Supabase catch up
  };

  // Computations
  const guidance = stock?.guidance_json || {};
  const fyRef = guidance.fy_2026 || { base_rev: 9.1, shares: 0.364, net_debt: 2.7, da: 0.5, jetforward_target: 0.31 };
  const fuelMid = guidance.q1_2026?.fuel_mid || 2.345;

  const latest = history.length ? history[history.length - 1] : lastResult;
  const daily = computeTimeframeAverages(getTimeframeData(history, 1));
  const weekly = computeTimeframeAverages(getTimeframeData(history, 7));
  const monthly = computeTimeframeAverages(getTimeframeData(history, 30));
  const quarterly = computeTimeframeAverages(getTimeframeData(history, 90));

  const liveInputs = computeLiveModelInputs(latest, quarterly, guidance);
  const effectiveFuel = useAuto ? liveInputs.fuel_cost : manFuel;
  const marginAdj = useAuto ? liveInputs.margin_adj : 0;
  const totalMargin = opMargin + marginAdj;

  const currentPrice = parseFloat(latest?.price || latest?.stock_price) || 5.0;
  const userTarget = calcPriceTarget({ revGrowth, opMargin: totalMargin, jfPct, evMult, maPremium }, fyRef);
  const bearTarget = calcPriceTarget({ revGrowth: -1, opMargin: -3, jfPct: 75, evMult: 4, maPremium: 0 }, fyRef);
  const baseTarget = calcPriceTarget({ revGrowth: 2, opMargin: 0 + marginAdj, jfPct: 100, evMult: 5.5, maPremium: 0 }, fyRef);
  const bullTarget = calcPriceTarget({ revGrowth: 4, opMargin: 3 + marginAdj, jfPct: 110, evMult: 7, maPremium: 15 }, fyRef);
  const upside = ((userTarget / currentPrice - 1) * 100).toFixed(1);
  const crackSpread = latest?.crack_spread || (latest?.jet_fuel && latest?.wti_crude ? (latest.jet_fuel - latest.wti_crude / 42).toFixed(3) : null);

  // ── Biotech rNPV computations ──
  const rnpvParams = { st920Prob, st920Peak, st920Royalty, st920LaunchYear: 2027, st503Prob, st503Peak, st503Royalty: 25, st503LaunchYear: 2030, st506Prob, st506Peak: 200, st506Royalty: 25, st506LaunchYear: 2032, partnerProb, partnerUpfront, partnerMilestones, discountRate, dilutedShares, cashOnHand };
  const rnpv = calcRnpv(rnpvParams);
  const bioScenarios = calcBiotechScenarios(cashOnHand);
  const bioSignals = computeBiotechSignals(latest);
  const bioUpside = ((rnpv.perShare / currentPrice - 1) * 100).toFixed(1);
  const extra = latest?.extra_json || {};

  const chartData = history.map(h => {
    const base = {
      name: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(h.price),
    };
    if (isBiotech) {
      base.xbi = parseFloat(h.extra_json?.xbi_price) || null;
      base.fold = parseFloat(h.extra_json?.fold_price) || null;
    } else {
      base.fuel = parseFloat(h.jet_fuel);
      base.wti = parseFloat(h.wti_crude);
      base.crack = parseFloat(h.crack_spread);
    }
    return base;
  });

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* HEADER */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Stock Selector */}
          <select value={activeTicker} onChange={e => setActiveTicker(e.target.value)}
            style={{ background: `${C.g}12`, border: `1px solid ${C.g}33`, borderRadius: 5, padding: '3px 10px', fontFamily: mono, fontSize: 15, fontWeight: 700, color: C.g, letterSpacing: 2, cursor: 'pointer', appearance: 'none' }}>
            {stocks.map(s => <option key={s.ticker} value={s.ticker}>{s.ticker}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.d }}>{stock?.name || ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: (parseFloat(latest?.price_change_pct) || 0) >= 0 ? C.g : C.r }}>
            ${currentPrice.toFixed(2)}
          </span>
          {latest?.price_change_pct && (
            <span style={{ fontFamily: mono, fontSize: 11, color: parseFloat(latest.price_change_pct) >= 0 ? C.g : C.r }}>
              {parseFloat(latest.price_change_pct) >= 0 ? '▲' : '▼'}{Math.abs(parseFloat(latest.price_change_pct)).toFixed(2)}%
            </span>
          )}
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: latest ? C.g : C.f, animation: latest ? 'blink 2s infinite' : 'none' }} />
          <button onClick={handleRefresh} disabled={fetchLoading}
            style={{ background: `${C.g}10`, border: `1px solid ${C.g}25`, color: C.g, fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: fetchLoading ? 'not-allowed' : 'pointer', fontFamily: mono }}>
            {fetchLoading ? '⟳ Fetching...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.card, padding: '0 18px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.g}` : '2px solid transparent',
            color: tab === t.id ? C.g : C.d, padding: '7px 12px', cursor: 'pointer',
            fontSize: 9, fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: '14px 18px 40px', animation: 'fadeIn 0.3s ease' }}>

        {/* ═══ LIVE MODEL ═══ */}
        {tab === 'model' && !isBiotech && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Live Signals" accent={C.p} span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                {[
                  { l: 'Fuel Spot', v: `$${parseFloat(latest?.jet_fuel || liveInputs.fuel_cost).toFixed(3)}`, signal: liveInputs.fuel_signal, sub: `${liveInputs.fuel_impact_bps > 0 ? '+' : ''}${liveInputs.fuel_impact_bps}bps`, info: SIGNAL_INFO.fuel_spot },
                  { l: 'Crack Spread', v: crackSpread ? `$${parseFloat(crackSpread).toFixed(3)}` : '—', signal: liveInputs.margin_signal, sub: 'Margin signal', info: SIGNAL_INFO.crack_spread },
                  { l: 'WTI Crude', v: latest?.wti_crude ? `$${parseFloat(latest.wti_crude).toFixed(2)}` : '—', signal: 'neutral', sub: 'Leading indicator', info: SIGNAL_INFO.wti_crude },
                  { l: 'Q1 Guide', v: `$${guidance.q1_2026?.fuel_low || 2.27}–$${guidance.q1_2026?.fuel_high || 2.42}`, signal: 'neutral', sub: `mid: $${fuelMid.toFixed(3)}`, info: SIGNAL_INFO.q1_guide },
                ].map((s, i) => (
                  <div key={i} onClick={() => setModalItem(s.info)} style={{ padding: 12, background: `${C.bg}80`, borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s', border: '1px solid transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.b}40`; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>{s.l}</span>
                      <span style={{ fontSize: 8, color: C.b, fontFamily: mono }}>ⓘ</span>
                    </div>
                    <div style={{ fontSize: 18, fontFamily: mono, fontWeight: 700, color: C.t }}>{s.v}</div>
                    <Signal signal={s.signal} />
                    <div style={{ fontSize: 8, color: C.f, marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Model Assumptions" accent={C.g}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setUseAuto(true)} style={{ flex: 1, padding: 6, borderRadius: 4, border: `1px solid ${useAuto ? C.p : C.border}`, background: useAuto ? `${C.p}12` : 'transparent', color: useAuto ? C.p : C.d, fontSize: 9, fontFamily: mono, cursor: 'pointer', fontWeight: 600 }}>⚡ Auto</button>
                <button onClick={() => setUseAuto(false)} style={{ flex: 1, padding: 6, borderRadius: 4, border: `1px solid ${!useAuto ? C.b : C.border}`, background: !useAuto ? `${C.b}12` : 'transparent', color: !useAuto ? C.b : C.d, fontSize: 9, fontFamily: mono, cursor: 'pointer', fontWeight: 600 }}>✎ Manual</button>
              </div>
              <Slider label="Revenue Growth" min={-3} max={6} step={0.5} value={revGrowth} onChange={setRevGrowth} format={v => `${v > 0 ? '+' : ''}${v}%`} onInfo={() => setModalItem(SLIDER_INFO.rev_growth)} />
              <Slider label="Base Op Margin" min={-5} max={5} step={0.5} value={opMargin} onChange={setOpMargin} format={v => `${v > 0 ? '+' : ''}${v}%`} color={totalMargin >= 0 ? C.g : C.r} liveLabel={useAuto ? `${marginAdj > 0 ? '+' : ''}${marginAdj.toFixed(1)}% adj` : null} onInfo={() => setModalItem(SLIDER_INFO.op_margin)} />
              <Slider label="Fuel Cost" min={1.9} max={3} step={0.05} value={useAuto ? effectiveFuel : manFuel} onChange={v => { setUseAuto(false); setManFuel(v); }} format={v => `$${v.toFixed(2)}`} color={effectiveFuel <= 2.27 ? C.g : C.r} liveLabel={useAuto ? 'Auto' : null} onInfo={() => setModalItem(SLIDER_INFO.fuel_cost)} />
              <Slider label="JetForward %" min={50} max={120} step={5} value={jfPct} onChange={setJfPct} format={v => `${v}%`} color={jfPct >= 100 ? C.g : C.o} onInfo={() => setModalItem(SLIDER_INFO.jf_pct)} />
              <Slider label="EV/EBITDA" min={3} max={9} step={0.5} value={evMult} onChange={setEvMult} format={v => `${v.toFixed(1)}x`} color={C.p} onInfo={() => setModalItem(SLIDER_INFO.ev_multiple)} />
              <Slider label="M&A Premium" min={0} max={30} step={5} value={maPremium} onChange={setMaPremium} format={v => v === 0 ? 'None' : `+${v}%`} color={C.p} onInfo={() => setModalItem(SLIDER_INFO.ma_premium)} />
            </Card>

            <Card title="Price Target" accent={parseFloat(upside) > 0 ? C.g : C.r}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 44, fontFamily: mono, fontWeight: 700, color: parseFloat(upside) > 0 ? C.g : C.r }}>${userTarget.toFixed(2)}</div>
                <div style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: parseFloat(upside) > 0 ? C.g : C.r }}>{parseFloat(upside) > 0 ? '▲' : '▼'} {upside}%</div>
                <div style={{ fontSize: 10, color: C.d }}>vs ${currentPrice.toFixed(2)}</div>
                {useAuto && <div style={{ marginTop: 6 }}><Badge text="Live data feeding model" color={C.p} /></div>}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
                <div onClick={() => setModalItem(TARGET_INFO.eff_margin)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: `1px solid ${C.border}50`, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.b}08`; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize: 11, color: C.d, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 4 }}>Eff. Margin <span style={{ fontSize: 8, color: C.b }}>ⓘ</span></span>
                  <span style={{ fontSize: 12, color: totalMargin >= 0 ? C.g : C.r, fontFamily: mono, fontWeight: 600 }}>{totalMargin > 0 ? '+' : ''}{totalMargin.toFixed(1)}%</span>
                </div>
                <div onClick={() => setModalItem(TARGET_INFO.jf_contrib)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: `1px solid ${C.border}50`, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.b}08`; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize: 11, color: C.d, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 4 }}>JF Contrib <span style={{ fontSize: 8, color: C.b }}>ⓘ</span></span>
                  <span style={{ fontSize: 12, color: C.g, fontFamily: mono, fontWeight: 600 }}>${(fyRef.jetforward_target * jfPct / 100 * 1000).toFixed(0)}M</span>
                </div>
                <div onClick={() => setModalItem(TARGET_INFO.net_debt)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: `1px solid ${C.border}50`, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${C.b}08`; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize: 11, color: C.d, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 4 }}>– Net Debt <span style={{ fontSize: 8, color: C.b }}>ⓘ</span></span>
                  <span style={{ fontSize: 12, color: C.r, fontFamily: mono, fontWeight: 600 }}>${fyRef.net_debt}B</span>
                </div>
              </div>
              <div onClick={() => setModalItem(TARGET_INFO.scenarios)} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0 0' }}
                onMouseEnter={e => { e.currentTarget.style.background = `${C.b}08`; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.r }}>Bear ${bearTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.o }}>Base ${baseTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.g }}>You ${userTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.p }}>Bull ${bullTarget.toFixed(2)}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ BIOTECH rNPV MODEL ═══ */}
        {tab === 'model' && isBiotech && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Biotech Live Signals */}
            <Card title="Live Signals" accent={C.p} span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                {[
                  { l: 'XBI Biotech ETF', v: extra.xbi_price ? `$${parseFloat(extra.xbi_price).toFixed(2)}` : '—', signal: bioSignals.xbi_signal, sub: extra.xbi_change_pct != null ? `${parseFloat(extra.xbi_change_pct) >= 0 ? '+' : ''}${parseFloat(extra.xbi_change_pct).toFixed(2)}% today` : 'Sector proxy', info: BIOTECH_SIGNAL_INFO.xbi },
                  { l: 'Short Interest', v: extra.short_interest_pct != null ? `${parseFloat(extra.short_interest_pct).toFixed(1)}%` : '—', signal: bioSignals.short_signal, sub: bioSignals.short_signal === 'high' ? 'Squeeze potential' : 'Float sold short', info: BIOTECH_SIGNAL_INFO.short_interest },
                  { l: 'FOLD (Competitor)', v: extra.fold_price ? `$${parseFloat(extra.fold_price).toFixed(2)}` : '—', signal: 'neutral', sub: 'Fabry market proxy', info: BIOTECH_SIGNAL_INFO.fold },
                  { l: 'Volume', v: latest?.volume || '—', signal: bioSignals.volume_signal, sub: extra.avg_volume ? `avg: ${extra.avg_volume}` : 'Activity signal', info: BIOTECH_SIGNAL_INFO.volume },
                ].map((s, i) => (
                  <div key={i} onClick={() => setModalItem(s.info)} style={{ padding: 12, background: `${C.bg}80`, borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s', border: '1px solid transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.b}40`; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>{s.l}</span>
                      <span style={{ fontSize: 8, color: C.b, fontFamily: mono }}>ⓘ</span>
                    </div>
                    <div style={{ fontSize: 18, fontFamily: mono, fontWeight: 700, color: C.t }}>{s.v}</div>
                    <Signal signal={s.signal} />
                    <div style={{ fontSize: 8, color: C.f, marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* rNPV Pipeline Inputs */}
            <Card title="Pipeline Assumptions (rNPV)" accent={C.g}>
              <div style={{ fontSize: 9, fontFamily: mono, color: C.p, background: `${C.p}10`, padding: '4px 8px', borderRadius: 4, marginBottom: 12, textAlign: 'center' }}>🧬 Risk-Adjusted Net Present Value Model</div>
              <div style={{ fontSize: 8, fontFamily: mono, color: C.d, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>ST-920 (Fabry) — BLA Filing</div>
              <Slider label="Approval Prob." min={0} max={100} step={5} value={st920Prob} onChange={setSt920Prob} format={v => `${v}%`} color={st920Prob >= 50 ? C.g : C.r} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.st920_prob)} />
              <Slider label="Peak Sales ($M)" min={200} max={2000} step={50} value={st920Peak} onChange={setSt920Peak} format={v => `$${v}M`} color={C.g} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.st920_peak)} />
              <Slider label="Royalty / Margin" min={10} max={60} step={5} value={st920Royalty} onChange={setSt920Royalty} format={v => `${v}%`} color={C.o} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.st920_royalty)} />

              <div style={{ fontSize: 8, fontFamily: mono, color: C.d, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>ST-503 (Pain) — Phase 1/2</div>
              <Slider label="Success Prob." min={0} max={50} step={5} value={st503Prob} onChange={setSt503Prob} format={v => `${v}%`} color={st503Prob >= 15 ? C.o : C.r} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.st503_prob)} />
              <Slider label="Peak Sales ($M)" min={100} max={2000} step={100} value={st503Peak} onChange={setSt503Peak} format={v => `$${v}M`} color={C.p} />

              <div style={{ fontSize: 8, fontFamily: mono, color: C.d, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>ST-506 (Prion) — Preclinical</div>
              <Slider label="Success Prob." min={0} max={30} step={2} value={st506Prob} onChange={(v) => { /* st506Prob is part of rnpvParams directly */ setSt506Prob(v); }} format={v => `${v}%`} color={C.f} />

              <div style={{ fontSize: 8, fontFamily: mono, color: C.d, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>Partnership & Capital</div>
              <Slider label="Partner Prob." min={0} max={100} step={10} value={partnerProb} onChange={setPartnerProb} format={v => `${v}%`} color={partnerProb >= 40 ? C.b : C.r} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.partner)} />
              <Slider label="Upfront ($M)" min={0} max={300} step={25} value={partnerUpfront} onChange={setPartnerUpfront} format={v => `$${v}M`} color={C.b} />
              <Slider label="Milestones ($M)" min={0} max={1500} step={100} value={partnerMilestones} onChange={setPartnerMilestones} format={v => `$${v}M`} color={C.b} />
              <Slider label="Diluted Shares (M)" min={350} max={600} step={10} value={dilutedShares} onChange={setDilutedShares} format={v => `${v}M`} color={dilutedShares <= 450 ? C.g : C.r} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.diluted_shares)} />
              <Slider label="Discount Rate" min={8} max={18} step={1} value={discountRate} onChange={setDiscountRate} format={v => `${v}%`} color={C.d} onInfo={() => setModalItem(BIOTECH_SLIDER_INFO.discount_rate)} />
              <Slider label="Cash ($M)" min={10} max={150} step={5} value={cashOnHand} onChange={setCashOnHand} format={v => `$${v}M`} color={cashOnHand >= 40 ? C.g : C.r} />
            </Card>

            {/* rNPV Price Target */}
            <Card title="rNPV Price Target" accent={parseFloat(bioUpside) > 0 ? C.g : C.r}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 44, fontFamily: mono, fontWeight: 700, color: parseFloat(bioUpside) > 0 ? C.g : C.r }}>${rnpv.perShare.toFixed(2)}</div>
                <div style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: parseFloat(bioUpside) > 0 ? C.g : C.r }}>{parseFloat(bioUpside) > 0 ? '▲' : '▼'} {bioUpside}%</div>
                <div style={{ fontSize: 10, color: C.d }}>vs ${currentPrice.toFixed(2)}</div>
                <div style={{ marginTop: 6 }}><Badge text={`rNPV: $${rnpv.total.toFixed(0)}M ÷ ${rnpv.shares}M shares`} color={C.p} /></div>
              </div>

              {/* Value Waterfall */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
                {[
                  { label: 'ST-920 (Fabry)', value: rnpv.breakdown.st920, color: C.g, pct: (rnpv.breakdown.st920 / Math.max(rnpv.total, 1) * 100) },
                  { label: 'ST-503 (Pain)', value: rnpv.breakdown.st503, color: C.p, pct: (rnpv.breakdown.st503 / Math.max(rnpv.total, 1) * 100) },
                  { label: 'ST-506 (Prion)', value: rnpv.breakdown.st506, color: C.d, pct: (rnpv.breakdown.st506 / Math.max(rnpv.total, 1) * 100) },
                  { label: 'Partnership', value: rnpv.breakdown.partner, color: C.b, pct: (rnpv.breakdown.partner / Math.max(rnpv.total, 1) * 100) },
                  { label: 'Cash', value: rnpv.breakdown.cash, color: C.o, pct: (rnpv.breakdown.cash / Math.max(rnpv.total, 1) * 100) },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: C.d, fontFamily: mono }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: item.color, fontFamily: mono, fontWeight: 600 }}>${item.value.toFixed(0)}M ({item.pct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(item.pct, 100)}%`, background: item.color, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-share breakdown */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8 }}>
                <Row label="Per Share" value={`$${rnpv.perShare.toFixed(2)}`} color={C.t} sub={`${rnpv.shares}M diluted shares`} />
                <Row label="Runway" value={`~${Math.floor(cashOnHand / 25)} qtrs`} color={cashOnHand / 25 >= 3 ? C.g : C.r} sub={`$${cashOnHand}M ÷ $25M/qtr burn`} />
              </div>

              {/* Scenario range */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.r }}>Bear ${bioScenarios.bear.perShare.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.o }}>Base ${bioScenarios.base.perShare.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.g }}>You ${rnpv.perShare.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.p }}>Bull ${bioScenarios.bull.perShare.toFixed(2)}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ TIMEFRAMES ═══ */}
        {tab === 'timeframes' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Card title="Multi-Timeframe Averages" accent={C.p}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                <TimeframeCard label="Today" data={daily} fuelMid={fuelMid} isBiotech={isBiotech} />
                <TimeframeCard label="7-Day" data={weekly} fuelMid={fuelMid} isBiotech={isBiotech} />
                <TimeframeCard label="30-Day" data={monthly} fuelMid={fuelMid} isBiotech={isBiotech} />
                <TimeframeCard label="Q1 Running" data={quarterly} fuelMid={fuelMid} isBiotech={isBiotech} />
                <TimeframeCard label="All" data={computeTimeframeAverages(history)} fuelMid={fuelMid} isBiotech={isBiotech} />
              </div>
            </Card>
            {history.length >= 2 && !isBiotech && (
              <Card title="History Chart" accent={C.b}>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.f }} />
                    <YAxis yAxisId="p" orientation="left" tick={{ fontSize: 8, fill: C.g }} domain={['dataMin-0.5', 'dataMax+0.5']} />
                    <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 8, fill: C.o }} domain={['dataMin-0.1', 'dataMax+0.1']} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: mono }} />
                    <Area yAxisId="p" type="monotone" dataKey="price" fill={`${C.g}12`} stroke={C.g} strokeWidth={2} name="Price" />
                    <Line yAxisId="f" type="monotone" dataKey="fuel" stroke={C.o} strokeWidth={2} name="Fuel" />
                    <Line yAxisId="f" type="monotone" dataKey="crack" stroke={C.r} strokeWidth={1.5} strokeDasharray="4 2" name="Crack" />
                    <ReferenceLine yAxisId="f" y={fuelMid} stroke={C.p} strokeDasharray="8 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}
            {history.length >= 2 && isBiotech && (
              <Card title="Price vs XBI History" accent={C.b}>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.f }} />
                    <YAxis yAxisId="p" orientation="left" tick={{ fontSize: 8, fill: C.g }} domain={['dataMin-0.05', 'dataMax+0.05']} />
                    <YAxis yAxisId="x" orientation="right" tick={{ fontSize: 8, fill: C.b }} domain={['dataMin-2', 'dataMax+2']} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: mono }} />
                    <Area yAxisId="p" type="monotone" dataKey="price" fill={`${C.g}12`} stroke={C.g} strokeWidth={2} name={activeTicker} />
                    <Line yAxisId="x" type="monotone" dataKey="xbi" stroke={C.b} strokeWidth={2} name="XBI" />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        )}

        {/* ═══ SCORECARD ═══ */}
        {tab === 'scorecard' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: 'span 2', fontSize: 10, color: C.d }}>Click any metric for details.</div>
            {scorecardItems.map(item => (
              <div key={item.id} onClick={() => setModalItem(item)} style={{
                background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${STATUS_COLORS[item.status] || C.d}`,
                borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}><Badge text={item.category} color={C.b} /><Badge text={item.status} color={STATUS_COLORS[item.status] || C.d} /></div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontFamily: mono, fontWeight: 700, color: STATUS_COLORS[item.status] || C.t }}>{item.current_value}</span>
                  {item.target_value && <span style={{ fontSize: 9, fontFamily: mono, color: C.f }}>tgt: {item.target_value}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ CHARTS ═══ */}
        {tab === 'charts' && !isBiotech && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Card title="All Variables vs Price" accent={C.g}>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.f }} />
                    <YAxis yAxisId="p" orientation="left" tick={{ fontSize: 8, fill: C.g }} domain={['dataMin-0.5', 'dataMax+0.5']} />
                    <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 8, fill: C.o }} domain={['dataMin-0.1', 'dataMax+0.1']} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: mono }} />
                    <Area yAxisId="p" type="monotone" dataKey="price" fill={`${C.g}15`} stroke={C.g} strokeWidth={2} name="Price" />
                    <Line yAxisId="f" type="monotone" dataKey="fuel" stroke={C.o} strokeWidth={2} name="Fuel" />
                    <Line yAxisId="f" type="monotone" dataKey="crack" stroke={C.r} strokeWidth={1.5} strokeDasharray="4 2" name="Crack" />
                    <ReferenceLine yAxisId="f" y={guidance.q1_2026?.fuel_low || 2.27} stroke={`${C.p}60`} strokeDasharray="6 4" />
                    <ReferenceLine yAxisId="f" y={guidance.q1_2026?.fuel_high || 2.42} stroke={`${C.p}60`} strokeDasharray="6 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.f, fontFamily: mono, fontSize: 11 }}>Need 2+ data points</div>}
            </Card>
            <Card title="Crack Spread" accent={C.r}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', padding: 10, background: `${C.bg}80`, borderRadius: 6 }}>
                  <div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>FUEL</div>
                  <div style={{ fontSize: 18, fontFamily: mono, fontWeight: 700, color: C.o }}>${parseFloat(latest?.jet_fuel || 0).toFixed(3) || '—'}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: `${C.bg}80`, borderRadius: 6 }}>
                  <div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>WTI</div>
                  <div style={{ fontSize: 18, fontFamily: mono, fontWeight: 700, color: C.b }}>${parseFloat(latest?.wti_crude || 0).toFixed(2) || '—'}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: `${C.bg}80`, borderRadius: 6 }}>
                  <div style={{ fontSize: 8, color: C.f, fontFamily: mono }}>CRACK</div>
                  <div style={{ fontSize: 18, fontFamily: mono, fontWeight: 700, color: crackSpread && parseFloat(crackSpread) > 0.6 ? C.r : C.g }}>${crackSpread || '—'}</div>
                </div>
              </div>
              {chartData.length >= 2 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.f }} />
                    <YAxis tick={{ fontSize: 8, fill: C.f }} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9 }} />
                    <Bar dataKey="crack" fill={C.r} name="Crack Spread" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        )}

        {/* ═══ BIOTECH CHARTS ═══ */}
        {tab === 'charts' && isBiotech && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Card title="SGMO vs XBI Biotech ETF" accent={C.g}>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.f }} />
                    <YAxis yAxisId="p" orientation="left" tick={{ fontSize: 8, fill: C.g }} domain={['dataMin-0.05', 'dataMax+0.05']} />
                    <YAxis yAxisId="x" orientation="right" tick={{ fontSize: 8, fill: C.b }} domain={['dataMin-2', 'dataMax+2']} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 9 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: mono }} />
                    <Area yAxisId="p" type="monotone" dataKey="price" fill={`${C.g}15`} stroke={C.g} strokeWidth={2} name={activeTicker} />
                    <Line yAxisId="x" type="monotone" dataKey="xbi" stroke={C.b} strokeWidth={2} name="XBI" />
                    <Line yAxisId="p" type="monotone" dataKey="fold" stroke={C.p} strokeWidth={1.5} strokeDasharray="4 2" name="FOLD" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.f, fontFamily: mono, fontSize: 11 }}>Need 2+ data points — hit Refresh to pull live data</div>}
            </Card>
            <Card title="Market Snapshot" accent={C.p}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                {[
                  { l: 'Market Cap', v: latest?.market_cap || '—', c: C.t },
                  { l: 'Day Range', v: latest?.day_range || '—', c: C.t },
                  { l: '52-Week', v: extra.week52 || '—', c: C.t },
                  { l: 'Cash Est.', v: `~$${cashOnHand}M`, c: cashOnHand >= 40 ? C.g : C.r },
                ].map((s, i) => (
                  <div key={i} style={{ padding: 10, background: `${C.bg}80`, borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase', marginBottom: 4 }}>{s.l}</div>
                    <div style={{ fontSize: 14, fontFamily: mono, fontWeight: 700, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ═══ ANALYSTS ═══ */}
        {tab === 'analysts' && (
          <Card title="Wall Street Consensus" accent={C.p}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
              {[
                { l: 'Buy', c: analysts.filter(a => /buy/i.test(a.rating)).length, co: C.g },
                { l: 'Hold', c: analysts.filter(a => /neutral|hold|equal|perform/i.test(a.rating)).length, co: C.o },
                { l: 'Sell', c: analysts.filter(a => /sell|under/i.test(a.rating)).length, co: C.r },
              ].map(s => (
                <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${s.co}18`, border: `2px solid ${s.co}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: s.co }}>{s.c}</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.d }}>{s.l}</span>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10, color: C.d }}>
                Avg: <span style={{ color: C.t, fontWeight: 700 }}>${(analysts.filter(a => a.price_target).reduce((s, a) => s + parseFloat(a.price_target), 0) / (analysts.filter(a => a.price_target).length || 1)).toFixed(2)}</span>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: mono }}>
              <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {['Firm', 'Rating', 'Target', 'Δ', 'Date'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: C.f, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
              </tr></thead>
              <tbody>{analysts.map((a, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  <td style={{ padding: '5px 8px', fontWeight: 600 }}>{a.firm}</td>
                  <td style={{ padding: '5px 8px', color: /sell/i.test(a.rating) ? C.r : /buy/i.test(a.rating) ? C.g : C.o, fontWeight: 600 }}>{a.rating}</td>
                  <td style={{ padding: '5px 8px', fontWeight: 600 }}>{a.price_target ? `$${parseFloat(a.price_target).toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '5px 8px', color: a.direction === 'upgrade' || a.direction === 'raise' ? C.g : a.direction === 'lower' || a.direction === 'downgrade' ? C.r : C.f, fontWeight: 700 }}>{a.direction === 'upgrade' || a.direction === 'raise' ? '↑' : a.direction === 'lower' || a.direction === 'downgrade' ? '↓' : '—'}</td>
                  <td style={{ padding: '5px 8px', color: C.f, fontSize: 9 }}>{a.date}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}

        {/* ═══ THESIS ═══ */}
        {tab === 'thesis' && !isBiotech && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Bull Case — $7-$10" accent={C.g}>
              {['JetForward: $305M Y1, +$310M Y2', 'Blue Sky: $50M EBIT/yr live Q1', 'Spirit exit → FLL gift',
                'M&A optionality', '0.74x book, 0.18x rev', 'J.D. Power #1 premium',
                'First class + lounges', 'Fuel tailwind', 'Debt peaked', 'FCF+ by 2027',
              ].map((p, i) => <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.border}30`, fontSize: 11 }}><span style={{ color: C.g, marginRight: 6 }}>▸</span>{p}</div>)}
            </Card>
            <Card title="Bear Case — $2.50-$3.50" accent={C.r}>
              {['$5.2B debt + $580M interest', '-$0.49 Q4 miss', '22% cancel rate (Devin)',
                'NE hub concentration', 'Revenue declining YoY', 'Leisure = macro risk',
                'P&W slipping', '0 Buy, 5+ Sell', '$325M convert Apr', 'DAL/UAL aggressive',
              ].map((p, i) => <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.border}30`, fontSize: 11 }}><span style={{ color: C.r, marginRight: 6 }}>▸</span>{p}</div>)}
            </Card>
            <Card title="Key Levels" accent={C.o} span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.g, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>SUPPORT</div>
                  <Row label="50-Day MA" value="~$4.90" color={C.g} /><Row label="200-Day MA" value="~$4.78" color={C.g} />
                  <Row label="Analyst Median" value="$4.00" color={C.o} /><Row label="52-Wk Low" value="$3.34" color={C.r} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: C.r, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>RESISTANCE</div>
                  <Row label="Rejection" value="$5.50–$5.65" color={C.o} /><Row label="Citi/JPM" value="$6.00" color={C.o} />
                  <Row label="MS" value="$7.00" color={C.p} /><Row label="52-Wk High" value="$8.30" color={C.r} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === 'thesis' && isBiotech && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Bull Case — $4-$10" accent={C.g}>
              {['ST-920 BLA → Accelerated Approval H2 2026', 'STAAR: +1.965 eGFR slope (best-in-class)',
                'FDA: Orphan + Fast Track + RMAT + PRIME', 'One-time gene therapy vs lifelong ERT infusions',
                'Fabry market $1.5B+ and growing', 'Lilly partnership validates zinc finger ($1.4B milestones)',
                'ST-503 pain optionality (massive TAM $7B+)', 'Partnership upfront de-risks cash runway',
                'Short squeeze potential on approval news', 'Analyst consensus $4-$7 (10-15x upside)',
              ].map((p, i) => <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.border}30`, fontSize: 11 }}><span style={{ color: C.g, marginRight: 6 }}>▸</span>{p}</div>)}
            </Card>
            <Card title="Bear Case — $0.10-$0.30" accent={C.r}>
              {['~$60M cash = ~2.5 qtrs runway', 'Feb 2026 offering: 53M warrants = massive dilution',
                'No commercialization partner yet', 'Gene therapy CMC manufacturing risk',
                'Accelerated Approval needs confirmatory study', 'Micro-cap: low liquidity, high volatility',
                'ST-503/ST-506 very early stage', 'Competition: Fabrazyme, Galafold, Elfabrio',
                'Warrant overhang depresses price', 'Barclays PT $1 (skeptical on execution)',
              ].map((p, i) => <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.border}30`, fontSize: 11 }}><span style={{ color: C.r, marginRight: 6 }}>▸</span>{p}</div>)}
            </Card>
            <Card title="Key Levels" accent={C.o} span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.g, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>SUPPORT</div>
                  <Row label="Offering Price" value="$0.47" color={C.g} />
                  <Row label="Recent Low" value="~$0.35" color={C.o} />
                  <Row label="Cash/Share" value={`~$${(cashOnHand / dilutedShares * 1000).toFixed(2)}`} color={C.o} />
                  <Row label="Barclays PT" value="$1.00" color={C.r} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: C.r, fontFamily: mono, fontWeight: 700, marginBottom: 4 }}>RESISTANCE / CATALYSTS</div>
                  <Row label="$1.00 psych" value="$1.00" color={C.o} />
                  <Row label="Jefferies PT" value="$1.50" color={C.o} />
                  <Row label="Consensus" value="~$5.00" color={C.p} />
                  <Row label="HC Wainwright" value="$10.00" color={C.p} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ CATALYSTS ═══ */}
        {tab === 'catalysts' && (
          <Card title="Timeline" accent={C.p}>
            {catalysts.map((c, i) => {
              const tc = { bull: C.g, risk: C.r, catalyst: C.p, neutral: C.d };
              const sc = { active: C.g, upcoming: C.o, future: C.f, completed: C.b };
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, padding: '7px 6px', borderBottom: `1px solid ${C.border}30`, background: c.status === 'active' ? `${C.g}05` : 'transparent' }}>
                  <span style={{ fontSize: 9, fontFamily: mono, color: sc[c.status], fontWeight: 600 }}>{c.date_label}</span>
                  <span style={{ fontSize: 11 }}>{c.event}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Badge text={c.event_type} color={tc[c.event_type] || C.d} />
                    <Badge text={c.status} color={sc[c.status] || C.d} />
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
      <Modal item={modalItem} onClose={() => setModalItem(null)} />
    </div>
  );
}