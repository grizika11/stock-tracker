// ═══════════════════════════════════════════
// Model Calculations & Data Utilities
// ═══════════════════════════════════════════

export function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

export function getTimeframeData(history, days) {
  const cutoff = Date.now() - days * 86400000;
  return history.filter(h => new Date(h.date).getTime() > cutoff);
}

export function computeTimeframeAverages(data) {
  if (!data.length) return null;
  const prices = data.map(d => parseFloat(d.price)).filter(Boolean);
  const fuels = data.map(d => parseFloat(d.jet_fuel)).filter(Boolean);
  const wtis = data.map(d => parseFloat(d.wti_crude)).filter(Boolean);
  const cracks = data.map(d => parseFloat(d.crack_spread)).filter(Boolean);
  return {
    price: avg(prices), fuel: avg(fuels), wti: avg(wtis), crack: avg(cracks),
    count: data.length,
    fuel_min: fuels.length ? Math.min(...fuels) : null,
    fuel_max: fuels.length ? Math.max(...fuels) : null,
    price_min: prices.length ? Math.min(...prices) : null,
    price_max: prices.length ? Math.max(...prices) : null,
  };
}

// Map live data to model adjustments
export function computeLiveModelInputs(latest, quarterlyAvg, guidance) {
  const fuelMid = guidance?.q1_2026?.fuel_mid || 2.345;
  const fuelLow = guidance?.q1_2026?.fuel_low || 2.27;
  const fuelHigh = guidance?.q1_2026?.fuel_high || 2.42;

  const inputs = {
    fuel_cost: fuelMid,
    fuel_signal: 'neutral',
    fuel_impact_bps: 0,
    margin_adj: 0,
    margin_signal: 'neutral',
  };

  const fuelRef = quarterlyAvg?.fuel || latest?.jet_fuel;
  if (fuelRef) {
    inputs.fuel_cost = fuelRef;
    const delta = fuelRef - fuelMid;
    // Each $0.10/gal ≈ 90bps margin impact for JBLU
    inputs.fuel_impact_bps = Math.round(delta / 0.10 * -90);
    inputs.margin_adj = inputs.fuel_impact_bps / 100;
    if (fuelRef < fuelLow) inputs.fuel_signal = 'tailwind';
    else if (fuelRef > fuelHigh) inputs.fuel_signal = 'headwind';
    else inputs.fuel_signal = 'in-range';
  }

  const crackRef = quarterlyAvg?.crack || latest?.crack_spread;
  if (crackRef) {
    if (crackRef > 0.70) { inputs.margin_adj -= 0.5; inputs.margin_signal = 'headwind'; }
    else if (crackRef < 0.45) { inputs.margin_adj += 0.3; inputs.margin_signal = 'tailwind'; }
    else { inputs.margin_signal = inputs.fuel_signal; }
  }

  return inputs;
}

// EV/EBITDA price target calculation
export function calcPriceTarget(params, fyRef) {
  const { revGrowth, opMargin, jfPct, evMult, maPremium } = params;
  const baseRev = fyRef?.base_rev || 9.1;
  const shares = fyRef?.shares || 0.364;
  const netDebt = fyRef?.net_debt || 2.7;
  const da = fyRef?.da || 0.50;
  const jfTarget = fyRef?.jetforward_target || 0.310;

  const rev = baseRev * (1 + revGrowth / 100);
  const opIncome = rev * (opMargin / 100);
  const jfContrib = jfTarget * (jfPct / 100);
  const ebitda = Math.max(opIncome + da + jfContrib * (opMargin === 0 ? 0.5 : 0.3), 0.10);
  const ev = ebitda * evMult;
  const equity = ev - netDebt + maPremium / 10;
  return Math.max(equity / shares, 0);
}

// Status colors
export const STATUS_COLORS = {
  beat: '#00e5b0', strong: '#00e5b0', tracking: '#60a5fa', launching: '#c084fc',
  guided: '#60a5fa', favorable: '#00e5b0', risk: '#ff4d4f',
};

// Theme
export const THEME = {
  bg: '#080b10', card: '#0d1117', border: '#1b2028',
  g: '#00e5b0', r: '#ff4d4f', o: '#f5a623', p: '#c084fc', b: '#60a5fa',
  t: '#d1d5db', d: '#6b7280', f: '#374151', w: '#ffffff',
};
