import { createClient } from '@supabase/supabase-js';

// This runs server-side on Vercel — API keys are safe here
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Allow GET (cron) and POST (manual trigger from frontend)
  const { ticker } = req.method === 'POST' ? req.body : req.query;
  const targetTicker = ticker || 'JBLU';

  try {
    // 1. Get stock info from Supabase
    const { data: stock } = await supabase
      .from('stocks')
      .select('*')
      .eq('ticker', targetTicker)
      .single();

    if (!stock) {
      return res.status(404).json({ error: `Stock ${targetTicker} not found` });
    }

    // 2. Call Anthropic API with web search
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for: 1) ${targetTicker} stock price today 2) Gulf Coast jet fuel spot price per gallon latest 3) WTI crude oil price today 4) any ${stock.name} news from past 3 days. Return ONLY valid JSON, no markdown or backticks:
{"stock_price":number,"price_change_pct":number,"jet_fuel":number,"wti_crude":number,"market_cap":"string","volume":"string","day_range":"string","week52":"string","headlines":["h1","h2","h3"]}`
        }],
      }),
    });

    const anthropicData = await anthropicRes.json();
    const textContent = anthropicData.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || '';

    const clean = textContent.replace(/```json|```/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      return res.status(500).json({ error: 'Could not parse Anthropic response', raw: textContent });
    }

    const parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));

    // 3. Calculate crack spread
    const crackSpread = parsed.jet_fuel && parsed.wti_crude
      ? +(parsed.jet_fuel - parsed.wti_crude / 42).toFixed(4)
      : null;

    // 4. Save to Supabase price_history (upsert by ticker+date)
    const today = new Date().toISOString().split('T')[0];
    const { error: upsertError } = await supabase
      .from('price_history')
      .upsert({
        ticker: targetTicker,
        date: today,
        price: parsed.stock_price,
        price_change_pct: parsed.price_change_pct,
        volume: parsed.volume,
        market_cap: parsed.market_cap,
        jet_fuel: parsed.jet_fuel,
        wti_crude: parsed.wti_crude,
        crack_spread: crackSpread,
        day_range: parsed.day_range,
        extra_json: {
          week52: parsed.week52,
        },
      }, { onConflict: 'ticker,date' });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
    }

    // 5. Save headlines
    if (parsed.headlines?.length) {
      const headlineRows = parsed.headlines.map(h => ({
        ticker: targetTicker,
        date: today,
        headline: h,
      }));
      // Delete today's old headlines first, then insert fresh
      await supabase.from('headlines').delete()
        .eq('ticker', targetTicker).eq('date', today);
      await supabase.from('headlines').insert(headlineRows);
    }

    // 6. Return everything to the frontend
    return res.status(200).json({
      success: true,
      data: { ...parsed, crack_spread: crackSpread, date: today },
    });

  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
