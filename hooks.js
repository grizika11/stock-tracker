import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// Fetch a single stock with all related data
export function useStock(ticker) {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('stocks')
        .select('*')
        .eq('ticker', ticker)
        .single();
      setStock(data);
      setLoading(false);
    })();
  }, [ticker]);

  return { stock, loading };
}

// Fetch all active stocks (for multi-stock selector)
export function useStocks() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('stocks')
        .select('*')
        .eq('active', true)
        .order('ticker');
      setStocks(data || []);
      setLoading(false);
    })();
  }, []);

  return { stocks, loading };
}

// Fetch price history for a ticker
export function usePriceHistory(ticker) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ticker) return;
    const { data } = await supabase
      .from('price_history')
      .select('*')
      .eq('ticker', ticker)
      .order('date', { ascending: true });
    setHistory(data || []);
    setLoading(false);
  }, [ticker]);

  useEffect(() => { refresh(); }, [refresh]);

  return { history, loading, refresh };
}

// Fetch model assumptions
export function useModelAssumptions(ticker, userLabel = 'default') {
  const [assumptions, setAssumptions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      const { data } = await supabase
        .from('model_assumptions')
        .select('*')
        .eq('ticker', ticker)
        .eq('user_label', userLabel)
        .single();
      setAssumptions(data);
      setLoading(false);
    })();
  }, [ticker, userLabel]);

  const save = useCallback(async (updates) => {
    const { data, error } = await supabase
      .from('model_assumptions')
      .upsert({
        ticker,
        user_label: userLabel,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ticker,user_label' })
      .select()
      .single();
    if (!error && data) setAssumptions(data);
    return { data, error };
  }, [ticker, userLabel]);

  return { assumptions, loading, save };
}

// Fetch analyst ratings
export function useAnalysts(ticker) {
  const [analysts, setAnalysts] = useState([]);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      const { data } = await supabase
        .from('analyst_ratings')
        .select('*')
        .eq('ticker', ticker)
        .order('created_at', { ascending: false });
      setAnalysts(data || []);
    })();
  }, [ticker]);

  return analysts;
}

// Fetch catalysts
export function useCatalysts(ticker) {
  const [catalysts, setCatalysts] = useState([]);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      const { data } = await supabase
        .from('catalysts')
        .select('*')
        .eq('ticker', ticker)
        .order('created_at');
      setCatalysts(data || []);
    })();
  }, [ticker]);

  return catalysts;
}

// Fetch scorecard
export function useScorecard(ticker) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      const { data } = await supabase
        .from('scorecard')
        .select('*')
        .eq('ticker', ticker)
        .order('sort_order');
      setItems(data || []);
    })();
  }, [ticker]);

  return items;
}

// Fetch headlines
export function useHeadlines(ticker) {
  const [headlines, setHeadlines] = useState([]);

  useEffect(() => {
    if (!ticker) return;
    (async () => {
      const { data } = await supabase
        .from('headlines')
        .select('*')
        .eq('ticker', ticker)
        .order('date', { ascending: false })
        .limit(10);
      setHeadlines(data || []);
    })();
  }, [ticker]);

  return headlines;
}

// Trigger live data fetch via serverless function
export function useFetchLive() {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const fetchNow = useCallback(async (ticker = 'JBLU') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fetch-daily?ticker=${ticker}`);
      const json = await res.json();
      setLastResult(json.data || null);
      return json;
    } catch (err) {
      console.error('Fetch live error:', err);
      return { error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchNow, loading, lastResult };
}
