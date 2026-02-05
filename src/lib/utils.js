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

// ═══════════════════════════════════════════
// BIOTECH: rNPV Model Calculations
// ═══════════════════════════════════════════

// Risk-adjusted Net Present Value for pipeline assets
// Each asset: probability × (peak_sales × margin × discount_factor)
export function calcRnpv(params) {
  const {
    st920Prob, st920Peak, st920Royalty, st920LaunchYear,
    st503Prob, st503Peak, st503Royalty, st503LaunchYear,
    st506Prob, st506Peak, st506Royalty, st506LaunchYear,
    partnerProb, partnerUpfront, partnerMilestones,
    discountRate, dilutedShares, cashOnHand,
  } = params;

  const dr = discountRate / 100;
  const now = 2026;

  // NPV of a drug asset: probability × Σ(year_revenue × margin) / (1+r)^t
  // Simplified ramp: 10%, 30%, 60%, 80%, 100%, 100%, 90%, 70% of peak over 8 years
  const ramp = [0.10, 0.30, 0.60, 0.80, 1.00, 1.00, 0.90, 0.70];

  function assetNpv(prob, peak, royalty, launchYear) {
    if (!prob || !peak) return 0;
    let npv = 0;
    const margin = royalty / 100; // royalty = net margin on revenue
    ramp.forEach((pct, i) => {
      const yr = launchYear + i - now;
      if (yr > 0) {
        npv += (peak * pct * margin) / Math.pow(1 + dr, yr);
      }
    });
    return npv * (prob / 100);
  }

  const st920Npv = assetNpv(st920Prob, st920Peak, st920Royalty, st920LaunchYear || 2027);
  const st503Npv = assetNpv(st503Prob, st503Peak, st503Royalty, st503LaunchYear || 2030);
  const st506Npv = assetNpv(st506Prob, st506Peak, st506Royalty, st506LaunchYear || 2032);

  // Partnership value: probability × (upfront + discounted milestones)
  const partnerNpv = (partnerProb / 100) * (
    partnerUpfront + partnerMilestones / Math.pow(1 + dr, 3)
  );

  const totalNpv = st920Npv + st503Npv + st506Npv + partnerNpv + cashOnHand;
  const shares = dilutedShares || 450;
  const pricePerShare = Math.max(totalNpv / shares, 0);

  return {
    total: totalNpv,
    perShare: pricePerShare,
    breakdown: {
      st920: st920Npv,
      st503: st503Npv,
      st506: st506Npv,
      partner: partnerNpv,
      cash: cashOnHand,
    },
    shares,
  };
}

// Biotech scenario presets
export function calcBiotechScenarios(cashOnHand) {
  const bear = calcRnpv({
    st920Prob: 35, st920Peak: 400, st920Royalty: 15, st920LaunchYear: 2028,
    st503Prob: 5, st503Peak: 200, st503Royalty: 15, st503LaunchYear: 2031,
    st506Prob: 2, st506Peak: 100, st506Royalty: 15, st506LaunchYear: 2033,
    partnerProb: 20, partnerUpfront: 30, partnerMilestones: 100,
    discountRate: 15, dilutedShares: 550, cashOnHand: cashOnHand || 60,
  });
  const base = calcRnpv({
    st920Prob: 65, st920Peak: 800, st920Royalty: 30, st920LaunchYear: 2027,
    st503Prob: 20, st503Peak: 500, st503Royalty: 25, st503LaunchYear: 2030,
    st506Prob: 10, st506Peak: 200, st506Royalty: 25, st506LaunchYear: 2032,
    partnerProb: 50, partnerUpfront: 100, partnerMilestones: 500,
    discountRate: 12, dilutedShares: 450, cashOnHand: cashOnHand || 60,
  });
  const bull = calcRnpv({
    st920Prob: 85, st920Peak: 1500, st920Royalty: 50, st920LaunchYear: 2027,
    st503Prob: 35, st503Peak: 1000, st503Royalty: 40, st503LaunchYear: 2029,
    st506Prob: 15, st506Peak: 400, st506Royalty: 35, st506LaunchYear: 2031,
    partnerProb: 80, partnerUpfront: 200, partnerMilestones: 1000,
    discountRate: 10, dilutedShares: 400, cashOnHand: cashOnHand || 60,
  });
  return { bear, base, bull };
}

// Biotech-specific timeframe averages (includes XBI, short interest)
export function computeBiotechTimeframeAverages(data) {
  if (!data.length) return null;
  const prices = data.map(d => parseFloat(d.price)).filter(Boolean);
  const xbis = data.map(d => parseFloat(d.extra_json?.xbi_price)).filter(Boolean);
  const vols = data.map(d => parseFloat(d.volume?.replace(/,/g,''))).filter(Boolean);
  return {
    price: avg(prices), xbi: avg(xbis), volume: avg(vols),
    count: data.length,
    price_min: prices.length ? Math.min(...prices) : null,
    price_max: prices.length ? Math.max(...prices) : null,
  };
}

// Biotech signal analysis from live data
export function computeBiotechSignals(latest) {
  const signals = {
    xbi_signal: 'neutral',
    volume_signal: 'neutral',
    short_signal: 'neutral',
    fold_signal: 'neutral',
  };

  const extra = latest?.extra_json || {};

  // XBI trend vs SGMO — is biotech sector helping or hurting?
  if (extra.xbi_change_pct != null) {
    const sgmoChg = parseFloat(latest?.price_change_pct) || 0;
    const xbiChg = parseFloat(extra.xbi_change_pct) || 0;
    if (sgmoChg > xbiChg + 2) signals.xbi_signal = 'outperforming';
    else if (sgmoChg < xbiChg - 2) signals.xbi_signal = 'underperforming';
    else signals.xbi_signal = 'tracking';
  }

  // Volume spike detection
  if (extra.avg_volume && latest?.volume) {
    const vol = parseFloat(String(latest.volume).replace(/,/g, ''));
    const avgVol = parseFloat(String(extra.avg_volume).replace(/,/g, ''));
    if (avgVol > 0 && vol > avgVol * 2) signals.volume_signal = 'spike';
    else if (avgVol > 0 && vol > avgVol * 1.3) signals.volume_signal = 'elevated';
    else signals.volume_signal = 'normal';
  }

  // Short interest — high SI on micro-cap = squeeze potential
  if (extra.short_interest_pct != null) {
    const si = parseFloat(extra.short_interest_pct);
    if (si > 15) signals.short_signal = 'high';
    else if (si > 8) signals.short_signal = 'moderate';
    else signals.short_signal = 'low';
  }

  return signals;
}