import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { ticker } = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const targetTicker = ticker || 'JBLU';

  try {
    // 1. Get stock info
    const { data: stock, error: stockErr } = await supabase
      .from('stocks')
      .select('*')
      .eq('ticker', targetTicker)
      .single();

    if (stockErr || !stock) {
      return res.status(404).json({ error: `Stock ${targetTicker} not found`, detail: stockErr });
    }

    // 2. Verify we have an API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment variables' });
    }

    // 3. Call Anthropic API
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for the current ${targetTicker} stock price, Gulf Coast jet fuel spot price per gallon, and WTI crude oil price. Also find any recent ${stock.name} news headlines from the past few days.

Return your answer as ONLY a JSON object with no other text, no markdown backticks, no explanation:
{"stock_price":number,"price_change_pct":number,"jet_fuel":number,"wti_crude":number,"market_cap":"string","volume":"string","day_range":"string","week52":"string","headlines":["headline1","headline2","headline3"]}`
        }],
      }),
    });

    // 4. Check for HTTP errors
    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return res.status(500).json({ 
        error: 'Anthropic API HTTP error', 
        status: anthropicRes.status,
        detail: errBody 
      });
    }

    const anthropicData = await anthropicRes.json();

    // 5. Log full response structure for debugging
    if (!anthropicData.content || !anthropicData.content.length) {
      return res.status(500).json({ 
        error: 'No content in Anthropic response', 
        response_keys: Object.keys(anthropicData),
        stop_reason: anthropicData.stop_reason,
        usage: anthropicData.usage,
      });
    }

    // 6. Extract text from all content blocks
    const textParts = [];
    for (const block of anthropicData.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      }
    }
    const textContent = textParts.join('');

    if (!textContent) {
      return res.status(500).json({ 
        error: 'No text content in response',
        block_types: anthropicData.content.map(b => b.type),
        stop_reason: anthropicData.stop_reason,
      });
    }

    // 7. Parse JSON from response
    const clean = textContent.replace(/```json|```/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      return res.status(500).json({ 
        error: 'Could not find JSON in response', 
        raw: textContent.substring(0, 500) 
      });
    }

    const parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));

    // 8. Calculate crack spread
    const crackSpread = parsed.jet_fuel && parsed.wti_crude
      ? +(parsed.jet_fuel - parsed.wti_crude / 42).toFixed(4)
      : null;

    // 9. Save to Supabase
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
        extra_json: { week52: parsed.week52 },
      }, { onConflict: 'ticker,date' });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
    }

    // 10. Save headlines
    if (parsed.headlines?.length) {
      await supabase.from('headlines').delete()
        .eq('ticker', targetTicker).eq('date', today);
      await supabase.from('headlines').insert(
        parsed.headlines.map(h => ({ ticker: targetTicker, date: today, headline: h }))
      );
    }

    return res.status(200).json({
      success: true,
      data: { ...parsed, crack_spread: crackSpread, date: today },
    });

  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack?.substring(0, 300) });
  }
}