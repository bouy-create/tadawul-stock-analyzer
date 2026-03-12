const yahooFinance = require("yahoo-finance2").default;
const { getCache, setCache } = require("./cache");

const SAHMK_BASE = process.env.SAHMK_URL || "https://app.sahmk.sa/api/v1/quote";
const SAHMK_HISTORICAL_BASE = process.env.SAHMK_HISTORICAL_URL || "https://app.sahmk.sa/api/v1/historical";
const TWELVEDATA_BASE = process.env.TWELVEDATA_URL || "https://api.twelvedata.com/quote";
const FINNHUB_BASE = process.env.FINNHUB_URL || "https://finnhub.io/api/v1";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    if (typeof value.raw === "number") return Number.isFinite(value.raw) ? value.raw : null;
    if (typeof value.fmt === "string") {
      const parsed = Number(value.fmt.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidPositivePrice(value) {
  const num = toNumber(value);
  return Number.isFinite(num) && num > 0;
}

function normalizeCandidates(symbol) {
  if (!symbol) return [];
  const raw = String(symbol).trim();
  const value = raw.replace(/^TADAWUL:/i, "");
  if (/^\d+$/.test(value)) {
    return [value, `${value}.SR`, `${value}.SA`, `${value}:Tadawul`];
  }
  return [value.toUpperCase(), value];
}

async function fetchJSON(url, options = {}, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, options);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: error.message } };
  }
}

function mapHistoricalPoint(point = {}) {
  const dateRaw = point.date ?? point.datetime ?? point.timestamp ?? null;
  const date = typeof dateRaw === "number" ? new Date(dateRaw * 1000).toISOString().slice(0, 10) : dateRaw;

  return {
    date: date ?? null,
    close: toNumber(point.close ?? point.c),
    high: toNumber(point.high ?? point.h),
    low: toNumber(point.low ?? point.l),
    volume: toNumber(point.volume ?? point.v)
  };
}

function compute52Week(history = []) {
  const closes = history
    .map((item) => toNumber(item?.close))
    .filter((item) => Number.isFinite(item) && item > 0)
    .slice(-365);

  if (!closes.length) return { "52WeekHigh": null, "52WeekLow": null };
  return { "52WeekHigh": Math.max(...closes), "52WeekLow": Math.min(...closes) };
}

function mapSahmk(data = {}, symbol) {
  return {
    symbol,
    companyName: data.name_en ?? data.name ?? null,
    currentPrice: toNumber(data.price),
    previousClose: toNumber(data.previous_close),
    "52WeekHigh": toNumber(data.high_52w),
    "52WeekLow": toNumber(data.low_52w),
    pe: toNumber(data.pe),
    eps: toNumber(data.eps),
    volume: toNumber(data.volume),
    marketCap: toNumber(data.market_cap),
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    ipoPrice: toNumber(data.ipo_price),
    dividendYield: toNumber(data.dividend_yield),
    recentDividendAnnouncement: data.recent_dividend_announcement ?? null
  };
}

function mapTwelveData(data = {}, symbol) {
  return {
    symbol,
    companyName: data.name ?? data.pro_name ?? null,
    currentPrice: toNumber(data.close ?? data.price),
    previousClose: toNumber(data.previous_close),
    "52WeekHigh": toNumber(data.fifty_two_week?.high ?? data["52_week_high"]),
    "52WeekLow": toNumber(data.fifty_two_week?.low ?? data["52_week_low"]),
    pe: toNumber(data.pe ?? data.pe_ratio),
    eps: toNumber(data.eps),
    volume: toNumber(data.volume),
    marketCap: toNumber(data.market_cap),
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    dividendYield: toNumber(data.dividend_yield),
    recentDividendAnnouncement: data.recent_dividend_announcement ?? null
  };
}

function mapYahooChart(payload = {}, symbol) {
  const result = payload?.chart?.result?.[0] || {};
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const history = closes
    .map((close, index) => ({ close: toNumber(close), timestamp: result?.timestamp?.[index] }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .slice(-365)
    .map(mapHistoricalPoint);

  const range = compute52Week(history);
  return {
    symbol,
    companyName: meta.longName ?? meta.shortName ?? null,
    currentPrice: toNumber(meta.regularMarketPrice),
    previousClose: toNumber(meta.previousClose ?? meta.chartPreviousClose),
    "52WeekHigh": range["52WeekHigh"],
    "52WeekLow": range["52WeekLow"],
    pe: null,
    eps: null,
    volume: toNumber(meta.regularMarketVolume),
    marketCap: null,
    sector: null,
    industry: null,
    dividendYield: null,
    recentDividendAnnouncement: null,
    history
  };
}

function mapYahooQuoteSummary(summary = {}, symbol) {
  return {
    symbol,
    companyName: summary.price?.longName ?? summary.price?.shortName ?? null,
    currentPrice: toNumber(summary.price?.regularMarketPrice),
    previousClose: toNumber(summary.price?.regularMarketPreviousClose),
    "52WeekHigh": toNumber(summary.price?.fiftyTwoWeekHigh),
    "52WeekLow": toNumber(summary.price?.fiftyTwoWeekLow),
    pe: toNumber(summary.defaultKeyStatistics?.trailingPE ?? summary.financialData?.currentPrice),
    eps: toNumber(summary.defaultKeyStatistics?.trailingEps ?? summary.defaultKeyStatistics?.forwardEps),
    volume: toNumber(summary.price?.regularMarketVolume),
    marketCap: toNumber(summary.price?.marketCap),
    sector: summary.summaryProfile?.sector ?? null,
    industry: summary.summaryProfile?.industry ?? null,
    dividendYield: toNumber(summary.financialData?.dividendYield ?? summary.defaultKeyStatistics?.lastDividendValue),
    recentDividendAnnouncement: summary.defaultKeyStatistics?.lastDividendDate ?? null,
    sharesOutstanding: toNumber(summary.defaultKeyStatistics?.sharesOutstanding)
  };
}

function mapFinnhub(quote = {}, profile = {}, metrics = {}, symbol) {
  return {
    symbol,
    companyName: profile.name ?? profile.ticker ?? null,
    currentPrice: toNumber(quote.c),
    previousClose: toNumber(quote.pc),
    "52WeekHigh": toNumber(metrics["52WeekHigh"] ?? quote.h),
    "52WeekLow": toNumber(metrics["52WeekLow"] ?? quote.l),
    pe: toNumber(metrics.peTTM ?? metrics.peBasicExclExtraTTM),
    eps: toNumber(metrics.epsTTM),
    volume: toNumber(quote.v),
    marketCap: toNumber(profile.marketCapitalization),
    sector: profile.finnhubIndustry ?? profile.sector ?? null,
    industry: profile.industry ?? null,
    dividendYield: toNumber(metrics.dividendYieldIndicatedAnnual),
    recentDividendAnnouncement: null
  };
}

function mergeMapped(base = {}, enrich = {}) {
  const out = { ...base };
  for (const [k, v] of Object.entries(enrich)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  if (!toNumber(out.marketCap) && toNumber(out.sharesOutstanding) && toNumber(out.currentPrice)) {
    out.marketCap = toNumber(out.sharesOutstanding) * toNumber(out.currentPrice);
  }
  return out;
}

async function fetchHistoricalFromSahmk(symbol, fetchImpl = fetch) {
  if (!process.env.SAHMK_KEY) return [];
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const headers = { "X-API-Key": process.env.SAHMK_KEY };
  const urls = [
    `${SAHMK_HISTORICAL_BASE}/${encodeURIComponent(symbol)}?from=${since}&to=${today}`,
    `${SAHMK_BASE}/${encodeURIComponent(symbol)}/historical?from=${since}&to=${today}`
  ];

  for (const url of urls) {
    const response = await fetchJSON(url, { headers }, fetchImpl);
    if (!response.ok) continue;
    const rows = response.body?.data ?? response.body?.historical ?? response.body;
    if (!Array.isArray(rows) || !rows.length) continue;
    const history = rows.map(mapHistoricalPoint).filter((point) => Number.isFinite(point.close) && point.close > 0);
    if (history.length) return history;
  }
  return [];
}

async function fetchFromSahmk(symbol, fetchImpl = fetch) {
  if (!process.env.SAHMK_KEY) return { ok: false, source: "sahmk", raw: null, mapped: mapSahmk({}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:sahmk:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${SAHMK_BASE}/${encodeURIComponent(symbol)}/`;
  const response = await fetchJSON(url, { headers: { "X-API-Key": process.env.SAHMK_KEY } }, fetchImpl);
  const mapped = mapSahmk(response.body || {}, symbol);
  const history = await fetchHistoricalFromSahmk(symbol, fetchImpl);
  const out = {
    ok: response.ok && isValidPositivePrice(mapped.currentPrice),
    source: "sahmk",
    raw: response.body,
    mapped: mergeMapped(mapped, compute52Week(history)),
    status: response.status
  };
  setCache(cacheKey, out);
  return out;
}

async function fetchFromTwelveData(symbol, fetchImpl = fetch) {
  if (!process.env.TWELVEDATA_KEY) return { ok: false, source: "twelvedata", raw: null, mapped: mapTwelveData({}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:twelvedata:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${TWELVEDATA_BASE}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(process.env.TWELVEDATA_KEY)}`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const out = {
    ok: response.ok && isValidPositivePrice(mapTwelveData(response.body || {}, symbol).currentPrice),
    source: "twelvedata",
    raw: response.body,
    mapped: mapTwelveData(response.body || {}, symbol),
    status: response.status
  };
  setCache(cacheKey, out);
  return out;
}

async function fetchFromYahooChart(symbol, fetchImpl = fetch) {
  const cacheKey = `provider:yahoo-chart:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const mapped = mapYahooChart(response.body || {}, symbol);
  const out = {
    ok: response.ok && isValidPositivePrice(mapped.currentPrice),
    source: "yahoo",
    raw: response.body,
    mapped: {
      ...mapped,
      currentPrice: mapped.currentPrice,
      "52WeekHigh": mapped["52WeekHigh"],
      "52WeekLow": mapped["52WeekLow"]
    },
    status: response.status
  };
  setCache(cacheKey, out);
  return out;
}

async function fetchFromYahooQuoteSummary(symbol) {
  const cacheKey = `provider:yahoo-summary:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["price", "summaryProfile", "financialData", "defaultKeyStatistics"]
    });
    const mapped = mapYahooQuoteSummary(summary, symbol);
    const out = { ok: isValidPositivePrice(mapped.currentPrice), source: "yahoo", raw: summary, mapped, status: 200 };
    setCache(cacheKey, out);
    return out;
  } catch (error) {
    const out = { ok: false, source: "yahoo", raw: { error: error.message }, mapped: mapYahooQuoteSummary({}, symbol), status: 0 };
    setCache(cacheKey, out);
    return out;
  }
}

async function fetchFromFinnhub(symbol, fetchImpl = fetch) {
  if (!process.env.FINNHUB_KEY) return { ok: false, source: "finnhub", raw: null, mapped: mapFinnhub({}, {}, {}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:finnhub:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const key = encodeURIComponent(process.env.FINNHUB_KEY);
    const quoteUrl = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const profileUrl = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const metricUrl = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`;

    const [quoteResp, profileResp, metricResp] = await Promise.all([
      fetchJSON(quoteUrl, {}, fetchImpl),
      fetchJSON(profileUrl, {}, fetchImpl),
      fetchJSON(metricUrl, {}, fetchImpl)
    ]);
    const mapped = mapFinnhub(quoteResp.body || {}, profileResp.body || {}, metricResp.body?.metric || {}, symbol);
    const out = {
      ok: quoteResp.ok && isValidPositivePrice(mapped.currentPrice),
      source: "finnhub",
      raw: { quote: quoteResp.body, profile: profileResp.body, metric: metricResp.body },
      mapped,
      status: quoteResp.status
    };
    setCache(cacheKey, out);
    return out;
  } catch (error) {
    const out = { ok: false, source: "finnhub", raw: { error: error.message }, mapped: mapFinnhub({}, {}, {}, symbol), status: 0 };
    setCache(cacheKey, out);
    return out;
  }
}

module.exports = {
  normalizeCandidates,
  toNumber,
  isValidPositivePrice,
  compute52Week,
  mapSahmk,
  mapTwelveData,
  mapYahooChart,
  mapYahooQuoteSummary,
  mapFinnhub,
  mergeMapped,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary,
  fetchFromFinnhub
};
