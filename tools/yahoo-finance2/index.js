async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Yahoo request failed with status ${response.status}`);
  return response.json();
}

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const payload = await fetchJson(url);
  return payload?.quoteResponse?.result?.[0] || {};
}

async function quoteSummary(symbol, options = {}) {
  const modules = Array.isArray(options.modules) ? options.modules.join(",") : "price";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;
  const payload = await fetchJson(url);
  return payload?.quoteSummary?.result?.[0] || {};
}

async function historical(symbol, options = {}) {
  const period1Date = options.period1 ? new Date(options.period1) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const period2Date = options.period2 ? new Date(options.period2) : new Date();
  const period1 = Math.floor(period1Date.getTime() / 1000);
  const period2 = Math.floor(period2Date.getTime() / 1000);
  const interval = options.interval || "1d";

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${encodeURIComponent(interval)}`;
  const payload = await fetchJson(url);
  const result = payload?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  return timestamps.map((ts, idx) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: quote.open?.[idx] ?? null,
    high: quote.high?.[idx] ?? null,
    low: quote.low?.[idx] ?? null,
    close: quote.close?.[idx] ?? null,
    volume: quote.volume?.[idx] ?? null
  }));
}

module.exports = { default: { quote, quoteSummary, historical }, quote, quoteSummary, historical };
