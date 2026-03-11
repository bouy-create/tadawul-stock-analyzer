const { normalizeSymbol } = require("../utils/symbol");

function mapStockData({ symbol, quote = {}, profile = {}, metrics = {}, td = {} }) {
  return {
    companyName: profile.name || td.name || symbol,
    symbol,
    currentPrice: Number(quote.c ?? td.price ?? 0) || null,
    previousClose: Number(quote.pc ?? td.previous_close ?? 0) || null,
    "52WeekHigh": Number(metrics["52WeekHigh"] ?? td["52_week_high"] ?? 0) || null,
    "52WeekLow": Number(metrics["52WeekLow"] ?? td["52_week_low"] ?? 0) || null,
    volume: Number(quote.v ?? td.volume ?? 0) || null,
    marketCap: Number(profile.marketCapitalization ?? td.market_cap ?? 0) || null,
    peRatio: Number(metrics.peNormalizedAnnual ?? td.pe ?? 0) || null,
    eps: Number(metrics.epsNormalizedAnnual ?? td.eps ?? 0) || null,
    dividendYield: Number(metrics.dividendYieldIndicatedAnnual ?? td.dividend_yield ?? 0) || null,
    ipoPrice: Number(profile.ipoPrice ?? td.ipo_price ?? 0) || null,
    sector: profile.finnhubIndustry ?? td.sector ?? null,
    industry: profile.industry ?? td.industry ?? null,
    timestamps: {
      asOf: new Date().toISOString()
    }
  };
}

function mockStock(symbol) {
  const isSaudi = symbol.endsWith('.SR');
  return {
    companyName: isSaudi ? 'Saudi Listed Company' : 'International Company',
    symbol,
    currentPrice: isSaudi ? 30.5 : 180.2,
    previousClose: isSaudi ? 30.2 : 179.4,
    "52WeekHigh": isSaudi ? 36.1 : 199.6,
    "52WeekLow": isSaudi ? 24.7 : 143.9,
    volume: isSaudi ? 1200345 : 68402011,
    marketCap: isSaudi ? 1800000000 : 2500000000000,
    peRatio: 16.2,
    eps: 2.7,
    dividendYield: 0.032,
    ipoPrice: isSaudi ? 32 : 22,
    sector: isSaudi ? 'Energy' : 'Technology',
    industry: isSaudi ? 'Integrated Oil & Gas' : 'Consumer Electronics',
    timestamps: { asOf: new Date().toISOString(), source: 'mock-fallback' }
  };
}

async function fetchFinnhubStock(symbol) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return mockStock(symbol);
  const base = "https://finnhub.io/api/v1";

  const [quoteRes, profileRes, metricRes] = await Promise.all([
    fetch(`${base}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`),
    fetch(`${base}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`),
    fetch(`${base}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`)
  ]);

  if (quoteRes.status === 429 || profileRes.status === 429 || metricRes.status === 429) {
    throw new Error("FINNHUB_RATE_LIMIT");
  }

  const quote = await quoteRes.json();
  const profile = await profileRes.json();
  const metricPayload = await metricRes.json();

  return mapStockData({ symbol, quote, profile, metrics: metricPayload.metric || {} });
}

async function fetchTwelveDataStock(symbol) {
  const key = process.env.TWELVEDATA_KEY;
  if (!key) return mockStock(symbol);
  const base = "https://api.twelvedata.com/quote";
  const res = await fetch(`${base}?symbol=${encodeURIComponent(symbol)}&apikey=${key}`);
  if (!res.ok) throw new Error("TWELVEDATA_UNAVAILABLE");
  const td = await res.json();
  return mapStockData({ symbol, td });
}

async function getUnifiedStock(rawSymbol, preferred = "finnhub") {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) throw new Error("INVALID_SYMBOL");

  let stock;
  if (preferred === "twelvedata") {
    stock = await fetchTwelveDataStock(symbol);
    if (!stock.currentPrice) stock = await fetchFinnhubStock(symbol);
  } else {
    try {
      stock = await fetchFinnhubStock(symbol);
      if (!stock.eps || !stock.peRatio) {
        const tdStock = await fetchTwelveDataStock(symbol);
        stock = { ...stock, ...tdStock, symbol };
      }
    } catch (err) {
      if (err.message === "FINNHUB_RATE_LIMIT") stock = await fetchTwelveDataStock(symbol);
      else throw err;
    }
  }

  return stock;
}

async function getNews(rawSymbol, preferred = "finnhub") {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) throw new Error("INVALID_SYMBOL");

  if (preferred === "twelvedata") return [];

  const key = process.env.FINNHUB_KEY;
  if (!key) {
    return [
      { headline: `${symbol}: Earnings outlook updated`, source: 'MockWire', url: 'https://example.com/news/1', publishedAt: new Date().toISOString() }
    ];
  }

  const base = "https://finnhub.io/api/v1";
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `${base}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from.toISOString().slice(0, 10)}&to=${to
      .toISOString()
      .slice(0, 10)}&token=${key}`
  );
  if (!res.ok) return [];

  const payload = await res.json();
  return (Array.isArray(payload) ? payload : []).slice(0, 10).map((item) => ({
    headline: item.headline,
    source: item.source || "unknown",
    url: item.url,
    publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : null
  }));
}

module.exports = { getUnifiedStock, getNews, mapStockData };
