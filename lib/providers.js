const yahooFinance = require("yahoo-finance2").default;
const { getCache, setCache } = require("./cache");

const SAHMK_BASE = process.env.SAHMK_URL || "https://app.sahmk.sa/api/v1/quote";
const TWELVEDATA_BASE = process.env.TWELVEDATA_URL || "https://api.twelvedata.com";
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
  const price = toNumber(value);
  return Number.isFinite(price) && price > 0;
}

function normalizeCandidates(symbol) {
  const sym = String(symbol || "").trim().replace(/^TADAWUL:/i, "");
  if (!sym) return [];
  if (/^\d+$/.test(sym)) return [sym, `${sym}.SR`, `${sym}.SA`, `${sym}:Tadawul`];
  return [sym.toUpperCase(), sym];
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

function baseMapped(symbol) {
  return {
    symbol,
    companyName: null,
    currentPrice: null,
    previousClose: null,
    "52WeekHigh": null,
    "52WeekLow": null,
    pe: null,
    eps: null,
    volume: null,
    marketCap: null,
    sector: null,
    industry: null,
    dividendYield: null,
    recentDividendAnnouncement: null,
    ipoPrice: null
  };
}

function compute52WeekFromCloses(closes = []) {
  const values = closes.map(toNumber).filter((close) => Number.isFinite(close) && close > 0).slice(-365);
  if (!values.length) return { "52WeekHigh": null, "52WeekLow": null };
  return { "52WeekHigh": Math.max(...values), "52WeekLow": Math.min(...values) };
}

function mapSahmk(data = {}, symbol) {
  return {
    ...baseMapped(symbol),
    companyName: data.name_en || data.name || null,
    currentPrice: toNumber(data.price),
    previousClose: toNumber(data.previous_close),
    "52WeekHigh": toNumber(data.high_52w),
    "52WeekLow": toNumber(data.low_52w),
    pe: toNumber(data.pe),
    eps: toNumber(data.eps),
    volume: toNumber(data.volume),
    marketCap: toNumber(data.market_cap),
    sector: data.sector || null,
    industry: data.industry || null,
    dividendYield: toNumber(data.dividend_yield),
    recentDividendAnnouncement: data.recent_dividend_announcement || null,
    ipoPrice: toNumber(data.ipo_price)
  };
}

function mapTwelveData(data = {}, symbol) {
  return {
    ...baseMapped(symbol),
    companyName: data.name || data.instrument_name || null,
    currentPrice: toNumber(data.close || data.price),
    previousClose: toNumber(data.previous_close),
    "52WeekHigh": toNumber(data.fifty_two_week?.high || data["52_week_high"]),
    "52WeekLow": toNumber(data.fifty_two_week?.low || data["52_week_low"]),
    pe: toNumber(data.pe || data.pe_ratio),
    eps: toNumber(data.eps),
    volume: toNumber(data.volume),
    marketCap: toNumber(data.market_cap),
    sector: data.sector || null,
    industry: data.industry || null,
    dividendYield: toNumber(data.dividend_yield),
    recentDividendAnnouncement: data.recent_dividend_announcement || null
  };
}

function mapYahooChart(payload = {}, symbol) {
  const result = payload?.chart?.result?.[0] || {};
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const range = compute52WeekFromCloses(closes);

  return {
    ...baseMapped(symbol),
    companyName: meta.longName || meta.shortName || null,
    currentPrice: toNumber(meta.regularMarketPrice),
    previousClose: toNumber(meta.previousClose || meta.chartPreviousClose),
    "52WeekHigh": range["52WeekHigh"],
    "52WeekLow": range["52WeekLow"],
    volume: toNumber(meta.regularMarketVolume)
  };
}

function mapYahooQuoteSummary(summary = {}, symbol) {
  return {
    ...baseMapped(symbol),
    companyName: summary?.price?.longName || summary?.price?.shortName || null,
    currentPrice: toNumber(summary?.price?.regularMarketPrice),
    previousClose: toNumber(summary?.price?.regularMarketPreviousClose),
    "52WeekHigh": toNumber(summary?.price?.fiftyTwoWeekHigh),
    "52WeekLow": toNumber(summary?.price?.fiftyTwoWeekLow),
    pe: toNumber(summary?.defaultKeyStatistics?.trailingPE || summary?.financialData?.forwardPE),
    eps: toNumber(summary?.defaultKeyStatistics?.trailingEps || summary?.defaultKeyStatistics?.forwardEps),
    volume: toNumber(summary?.price?.regularMarketVolume),
    marketCap: toNumber(summary?.price?.marketCap),
    sector: summary?.summaryProfile?.sector || null,
    industry: summary?.summaryProfile?.industry || null,
    dividendYield: toNumber(summary?.summaryDetail?.dividendYield || summary?.financialData?.dividendYield),
    recentDividendAnnouncement: summary?.defaultKeyStatistics?.lastDividendDate || null
  };
}

function mapFinnhub(quote = {}, profile = {}, metrics = {}, symbol) {
  return {
    ...baseMapped(symbol),
    companyName: profile.name || profile.ticker || null,
    currentPrice: toNumber(quote.c),
    previousClose: toNumber(quote.pc),
    "52WeekHigh": toNumber(metrics["52WeekHigh"] || quote.h),
    "52WeekLow": toNumber(metrics["52WeekLow"] || quote.l),
    pe: toNumber(metrics.peTTM || metrics.peBasicExclExtraTTM),
    eps: toNumber(metrics.epsTTM),
    volume: toNumber(quote.v),
    marketCap: toNumber(profile.marketCapitalization),
    sector: profile.finnhubIndustry || profile.sector || null,
    industry: profile.industry || null,
    dividendYield: toNumber(metrics.dividendYieldIndicatedAnnual)
  };
}

function mergeMissingFields(base = {}, patch = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if ((out[key] === null || out[key] === undefined) && value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function toProviderResult({ ok, source, candidate, status, raw, mapped }) {
  return { ok, source, candidate, status, raw, mapped };
}

async function fetchFromSahmk(candidate, fetchImpl = fetch) {
  if (!process.env.SAHMK_KEY) {
    return toProviderResult({ ok: false, source: "sahmk", candidate, status: null, raw: null, mapped: mapSahmk({}, candidate) });
  }
  const cacheKey = `provider:${candidate}:sahmk`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${SAHMK_BASE}/${encodeURIComponent(candidate)}/`;
  const response = await fetchJSON(url, { headers: { "X-API-Key": process.env.SAHMK_KEY } }, fetchImpl);
  const mapped = mapSahmk(response.body || {}, candidate);
  const out = toProviderResult({
    ok: response.ok && isValidPositivePrice(mapped.currentPrice),
    source: "sahmk",
    candidate,
    status: response.status || null,
    raw: response.body,
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

async function fetchFromTwelveData(candidate, fetchImpl = fetch) {
  if (!process.env.TWELVEDATA_KEY) {
    return toProviderResult({ ok: false, source: "twelvedata", candidate, status: null, raw: null, mapped: mapTwelveData({}, candidate) });
  }

  const cacheKey = `provider:${candidate}:twelvedata`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${TWELVEDATA_BASE}/quote?symbol=${encodeURIComponent(candidate)}&apikey=${encodeURIComponent(process.env.TWELVEDATA_KEY)}`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const mapped = mapTwelveData(response.body || {}, candidate);
  const out = toProviderResult({
    ok: response.ok && isValidPositivePrice(mapped.currentPrice),
    source: "twelvedata",
    candidate,
    status: response.status || null,
    raw: response.body,
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

async function fetchFromTwelveDataHistory(candidate, fetchImpl = fetch) {
  if (!process.env.TWELVEDATA_KEY) {
    return toProviderResult({ ok: false, source: "twelvedata-history", candidate, status: null, raw: null, mapped: baseMapped(candidate) });
  }

  const cacheKey = `provider:${candidate}:twelvedata-history`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${TWELVEDATA_BASE}/time_series?symbol=${encodeURIComponent(candidate)}&interval=1day&outputsize=365&apikey=${encodeURIComponent(process.env.TWELVEDATA_KEY)}`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const values = Array.isArray(response.body?.values) ? response.body.values : [];
  const closes = values.map((item) => item?.close);
  const range = compute52WeekFromCloses(closes);
  const mapped = { ...baseMapped(candidate), ...range };
  const out = toProviderResult({
    ok: response.ok && (range["52WeekHigh"] !== null || range["52WeekLow"] !== null),
    source: "twelvedata-history",
    candidate,
    status: response.status || null,
    raw: response.body,
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

async function fetchFromYahooChart(candidate, fetchImpl = fetch) {
  const cacheKey = `provider:${candidate}:yahoo-chart`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(candidate)}?range=1y&interval=1d`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const mapped = mapYahooChart(response.body || {}, candidate);
  const out = toProviderResult({
    ok: response.ok && isValidPositivePrice(mapped.currentPrice),
    source: "yahoo-chart",
    candidate,
    status: response.status || null,
    raw: response.body,
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

async function fetchFromYahooQuoteSummary(candidate) {
  const cacheKey = `provider:${candidate}:yahoo-summary`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const request = (headers) => yahooFinance.quoteSummary(candidate, {
    modules: ["price", "summaryProfile", "financialData", "defaultKeyStatistics"],
    ...(headers ? { headers } : {})
  });

  try {
    let raw;
    try {
      raw = await request();
    } catch (error) {
      const firstStatus = Number(error?.statusCode || error?.status || 0);
      if (firstStatus !== 401) throw error;
      try {
        raw = await request();
      } catch (retryError) {
        const retryStatus = Number(retryError?.statusCode || retryError?.status || 0);
        if (retryStatus !== 401) throw retryError;
        raw = await request({ "User-Agent": "Mozilla/5.0 (compatible; TadawulStockAnalyzer/1.0)" });
      }
    }
    const mapped = mapYahooQuoteSummary(raw || {}, candidate);
    const out = toProviderResult({
      ok: isValidPositivePrice(mapped.currentPrice),
      source: "yahoo-summary",
      candidate,
      status: 200,
      raw,
      mapped
    });
    setCache(cacheKey, out);
    return out;
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || error?.response?.status || 0) || null;
    const out = toProviderResult({
      ok: false,
      source: "yahoo-summary",
      candidate,
      status,
      raw: { error: error.message },
      mapped: mapYahooQuoteSummary({}, candidate)
    });
    setCache(cacheKey, out);
    return out;
  }
}

async function fetchFromFinnhub(candidate, fetchImpl = fetch) {
  if (!process.env.FINNHUB_KEY) {
    return toProviderResult({ ok: false, source: "finnhub", candidate, status: null, raw: null, mapped: mapFinnhub({}, {}, {}, candidate) });
  }

  const cacheKey = `provider:${candidate}:finnhub`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const key = encodeURIComponent(process.env.FINNHUB_KEY);
  const quoteUrl = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(candidate)}&token=${key}`;
  const profileUrl = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(candidate)}&token=${key}`;
  const metricUrl = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(candidate)}&metric=all&token=${key}`;

  const [quoteResp, profileResp, metricResp] = await Promise.all([
    fetchJSON(quoteUrl, {}, fetchImpl),
    fetchJSON(profileUrl, {}, fetchImpl),
    fetchJSON(metricUrl, {}, fetchImpl)
  ]);
  const mapped = mapFinnhub(quoteResp.body || {}, profileResp.body || {}, metricResp.body?.metric || {}, candidate);
  const out = toProviderResult({
    ok: quoteResp.ok && isValidPositivePrice(mapped.currentPrice),
    source: "finnhub",
    candidate,
    status: quoteResp.status || null,
    raw: { quote: quoteResp.body, profile: profileResp.body, metrics: metricResp.body },
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

async function fetchFromFinnhubMetrics(candidate, fetchImpl = fetch) {
  if (!process.env.FINNHUB_KEY) {
    return toProviderResult({ ok: false, source: "finnhub-metrics", candidate, status: null, raw: null, mapped: mapFinnhub({}, {}, {}, candidate) });
  }

  const cacheKey = `provider:${candidate}:finnhub-metrics`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const key = encodeURIComponent(process.env.FINNHUB_KEY);
  const profileUrl = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(candidate)}&token=${key}`;
  const metricUrl = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(candidate)}&metric=all&token=${key}`;
  const [profileResp, metricResp] = await Promise.all([
    fetchJSON(profileUrl, {}, fetchImpl),
    fetchJSON(metricUrl, {}, fetchImpl)
  ]);
  const mapped = mapFinnhub({}, profileResp.body || {}, metricResp.body?.metric || {}, candidate);
  const out = toProviderResult({
    ok: profileResp.ok || metricResp.ok,
    source: "finnhub-metrics",
    candidate,
    status: metricResp.status || profileResp.status || null,
    raw: { profile: profileResp.body, metrics: metricResp.body },
    mapped
  });
  setCache(cacheKey, out);
  return out;
}

module.exports = {
  normalizeCandidates,
  toNumber,
  isValidPositivePrice,
  compute52WeekFromCloses,
  mapSahmk,
  mapTwelveData,
  mapYahooChart,
  mapYahooQuoteSummary,
  mapFinnhub,
  mergeMissingFields,
  mergeMapped: mergeMissingFields,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromTwelveDataHistory,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary,
  fetchFromFinnhub,
  fetchFromFinnhubMetrics,
  compute52Week: compute52WeekFromCloses
};
