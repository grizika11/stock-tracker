import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Sector-specific prompts
function getPrompt(stock) {
  const ticker = stock.ticker;
  const name = stock.name;

  if (stock.sector === 'Biotech') {
    return `Search for: 1) ${ticker} stock price today 2) XBI biotech ETF price today 3) ${ticker} short interest or shares short 4) FOLD Amicus Therapeutics stock price today 5) any ${name} news from past 3 days.

Return ONLY valid JSON, no markdown or backticks:
{"stock_price":number,"price_change_pct":number,"market_cap":"string","volume":"string","day_range":"string","week52":"string","xbi_price":number,"xbi_change_pct":number,"fold_price":number,"short_interest_pct":number or null,"avg_volume":"string","headlines":["h1","h2","h3"]}`;
  }

  // Default: Airlines
  return `Search for: 1) ${ticker} stock price today 2) Gulf Coast jet fuel spot price per gallon latest 3) WTI crude oil price today 4) any ${name} news from past 3 days.

Return ONLY valid JSON, no markdown or backticks:
{"stock_price":number,"price_change_pct":number,"jet_fuel":number,"wti_crude":number,"market_cap":"string","volume":"string","day_range":"string","week52":"string","headlines":["h1","h2","h3"]}`;
}

// Build price_history row based on sector
function buildRow(ticker, sector, parsed, today) {
  const base = {
    ticker,
    date: today,
    price: parsed.stock_price,
    price_change_pct: parsed.price_change_pct,
    volume: parsed.volume,
    market_cap: parsed.market_cap,
    day_range: parsed.day_range,
    extra_json: { week52: parsed.week52 },
  };

  if (sector === 'Biotech') {
    base.jet_fuel = null;
    base.wti_crude = null;
    base.crack_spread = null;
    base.extra_json = {
      ...base.extra_json,
      xbi_price: parsed.xbi_price,
      xbi_change_pct: parsed.xbi_change_pct,
      fold_price: parsed.fold_price,
      short_interest_pct: parsed.short_interest_pct,
      avg_volume: parsed.avg_volume,
    };
  } else {
    base.jet_fuel = parsed.jet_fuel;
    base.wti_crude = parsed.wti_crude;
    base.crack_spread = parsed.jet_fuel && parsed.wti_crude
      ? +(parsed.jet_fuel - parsed.wti_crude / 42).toFixed(4)
      : null;
  }

  return base;
}

// Fetch one stock from Anthropic API
async function fetchOneStock(stock) {
  const prompt = getPrompt(stock);
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text();
    throw new Error(`Anthropic HTTP ${anthropicRes.status}: ${errBody.substring(0, 200)}`);
  }

  const anthropicData = await anthropicRes.json();
  const textContent = (anthropicData.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (!textContent) throw new Error('No text content in response');

  const clean = textContent.replace(/```json|```/g, '').trim();
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found');

  const parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));
  const today = new Date().toISOString().split('T')[0];
  const row = buildRow(stock.ticker, stock.sector, parsed, today);

  const { error: upsertError } = await supabase
    .from('price_history')
    .upsert(row, { onConflict: 'ticker,date' });

  if (upsertError) console.error(`Upsert error for ${stock.ticker}:`, upsertError);

  if (parsed.headlines?.length) {
    await supabase.from('headlines').delete()
      .eq('ticker', stock.ticker).eq('date', today);
    await supabase.from('headlines').insert(
      parsed.headlines.map(h => ({ ticker: stock.ticker, date: today, headline: h }))
    );
  }

  return { ticker: stock.ticker, sector: stock.sector, data: parsed, date: today };
}

export default async function handler(req, res) {
  const { ticker } = req.method === 'POST' ? (req.body || {}) : (req.query || {});

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    // Single stock mode (manual refresh button)
    if (ticker) {
      const { data: stock, error: stockErr } = await supabase
        .from('stocks').select('*').eq('ticker', ticker).single();
      if (stockErr || !stock) return res.status(404).json({ error: `Stock ${ticker} not found` });

      const result = await fetchOneStock(stock);
      return res.status(200).json({ success: true, ...result });
    }

    // Multi-stock mode (cron job — no ticker specified)
    const { data: stocks } = await supabase
      .from('stocks').select('*').eq('active', true).order('ticker');

    if (!stocks?.length) return res.status(200).json({ success: true, message: 'No active stocks' });

    const results = [];
    for (const stock of stocks) {
      try {
        const result = await fetchOneStock(stock);
        results.push({ ...result, success: true });
        // Small delay between calls to avoid rate limits
        if (stocks.length > 1) await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        results.push({ ticker: stock.ticker, success: false, error: err.message });
      }
    }

    return res.status(200).json({ success: true, results });

  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack?.substring(0, 300) });
  }
}