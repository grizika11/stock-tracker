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

function Slider({ label, min, max, step, value, onChange, format, color = C.g, liveLabel }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.d, fontFamily: mono }}>{label}</span>
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

function TimeframeCard({ label, data, fuelMid }) {
  if (!data) return (
    <div style={{ padding: 10, background: `${C.bg}80`, borderRadius: 6, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 10, color: C.f, marginTop: 6 }}>No data</div>
    </div>
  );
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
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 540, width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge text={item.category} color={C.b} />
            <Badge text={item.status} color={STATUS_COLORS[item.status] || C.d} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.d, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <h3 style={{ fontSize: 17, color: C.t, margin: '0 0 6px', fontWeight: 700 }}>{item.label}</h3>
        <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>Current</div>
            <div style={{ fontSize: 20, fontFamily: mono, fontWeight: 700, color: STATUS_COLORS[item.status] || C.t }}>{item.current_value}</div>
          </div>
          {item.target_value && item.target_value !== '—' && <div>
            <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase' }}>Target</div>
            <div style={{ fontSize: 20, fontFamily: mono, fontWeight: 700, color: C.d }}>{item.target_value}</div>
          </div>}
        </div>
        <p style={{ fontSize: 13, color: C.d, lineHeight: 1.7, margin: 0 }}>{item.description}</p>
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
    }
  }, [assumptions]);

  // Save assumptions on change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      saveAssumptions({ rev_growth: revGrowth, op_margin: opMargin, fuel_cost: manFuel, jetforward_pct: jfPct, ev_multiple: evMult, ma_premium: maPremium, use_auto_fuel: useAuto, use_auto_margin: useAuto });
    }, 1500);
    return () => clearTimeout(t);
  }, [revGrowth, opMargin, manFuel, jfPct, evMult, maPremium, useAuto]);

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

  const chartData = history.map(h => ({
    name: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: parseFloat(h.price), fuel: parseFloat(h.jet_fuel),
    wti: parseFloat(h.wti_crude), crack: parseFloat(h.crack_spread),
  }));

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
        {tab === 'model' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="Live Signals" accent={C.p} span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                {[
                  { l: 'Fuel Spot', v: `$${parseFloat(latest?.jet_fuel || liveInputs.fuel_cost).toFixed(3)}`, signal: liveInputs.fuel_signal, sub: `${liveInputs.fuel_impact_bps > 0 ? '+' : ''}${liveInputs.fuel_impact_bps}bps` },
                  { l: 'Crack Spread', v: crackSpread ? `$${parseFloat(crackSpread).toFixed(3)}` : '—', signal: liveInputs.margin_signal, sub: 'Margin signal' },
                  { l: 'WTI Crude', v: latest?.wti_crude ? `$${parseFloat(latest.wti_crude).toFixed(2)}` : '—', signal: 'neutral', sub: 'Leading indicator' },
                  { l: 'Q1 Guide', v: `$${guidance.q1_2026?.fuel_low || 2.27}–$${guidance.q1_2026?.fuel_high || 2.42}`, signal: 'neutral', sub: `mid: $${fuelMid.toFixed(3)}` },
                ].map((s, i) => (
                  <div key={i} style={{ padding: 12, background: `${C.bg}80`, borderRadius: 6 }}>
                    <div style={{ fontSize: 8, color: C.f, fontFamily: mono, textTransform: 'uppercase', marginBottom: 4 }}>{s.l}</div>
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
              <Slider label="Revenue Growth" min={-3} max={6} step={0.5} value={revGrowth} onChange={setRevGrowth} format={v => `${v > 0 ? '+' : ''}${v}%`} />
              <Slider label="Base Op Margin" min={-5} max={5} step={0.5} value={opMargin} onChange={setOpMargin} format={v => `${v > 0 ? '+' : ''}${v}%`} color={totalMargin >= 0 ? C.g : C.r} liveLabel={useAuto ? `${marginAdj > 0 ? '+' : ''}${marginAdj.toFixed(1)}% adj` : null} />
              <Slider label="Fuel Cost" min={1.9} max={3} step={0.05} value={useAuto ? effectiveFuel : manFuel} onChange={v => { setUseAuto(false); setManFuel(v); }} format={v => `$${v.toFixed(2)}`} color={effectiveFuel <= 2.27 ? C.g : C.r} liveLabel={useAuto ? 'Auto' : null} />
              <Slider label="JetForward %" min={50} max={120} step={5} value={jfPct} onChange={setJfPct} format={v => `${v}%`} color={jfPct >= 100 ? C.g : C.o} />
              <Slider label="EV/EBITDA" min={3} max={9} step={0.5} value={evMult} onChange={setEvMult} format={v => `${v.toFixed(1)}x`} color={C.p} />
              <Slider label="M&A Premium" min={0} max={30} step={5} value={maPremium} onChange={setMaPremium} format={v => v === 0 ? 'None' : `+${v}%`} color={C.p} />
            </Card>

            <Card title="Price Target" accent={parseFloat(upside) > 0 ? C.g : C.r}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 44, fontFamily: mono, fontWeight: 700, color: parseFloat(upside) > 0 ? C.g : C.r }}>${userTarget.toFixed(2)}</div>
                <div style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: parseFloat(upside) > 0 ? C.g : C.r }}>{parseFloat(upside) > 0 ? '▲' : '▼'} {upside}%</div>
                <div style={{ fontSize: 10, color: C.d }}>vs ${currentPrice.toFixed(2)}</div>
                {useAuto && <div style={{ marginTop: 6 }}><Badge text="Live data feeding model" color={C.p} /></div>}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
                <Row label="Eff. Margin" value={`${totalMargin > 0 ? '+' : ''}${totalMargin.toFixed(1)}%`} color={totalMargin >= 0 ? C.g : C.r} />
                <Row label="JF Contrib" value={`$${(fyRef.jetforward_target * jfPct / 100 * 1000).toFixed(0)}M`} color={C.g} />
                <Row label="– Net Debt" value={`$${fyRef.net_debt}B`} color={C.r} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.r }}>Bear ${bearTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.o }}>Base ${baseTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.g }}>You ${userTarget.toFixed(2)}</span>
                <span style={{ fontSize: 9, fontFamily: mono, color: C.p }}>Bull ${bullTarget.toFixed(2)}</span>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ TIMEFRAMES ═══ */}
        {tab === 'timeframes' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Card title="Multi-Timeframe Averages" accent={C.p}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                <TimeframeCard label="Today" data={daily} fuelMid={fuelMid} />
                <TimeframeCard label="7-Day" data={weekly} fuelMid={fuelMid} />
                <TimeframeCard label="30-Day" data={monthly} fuelMid={fuelMid} />
                <TimeframeCard label="Q1 Running" data={quarterly} fuelMid={fuelMid} />
                <TimeframeCard label="All" data={computeTimeframeAverages(history)} fuelMid={fuelMid} />
              </div>
            </Card>
            {history.length >= 2 && (
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
            <Modal item={modalItem} onClose={() => setModalItem(null)} />
          </div>
        )}

        {/* ═══ CHARTS ═══ */}
        {tab === 'charts' && (
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
        {tab === 'thesis' && (
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
    </div>
  );
}
