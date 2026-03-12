const yahooFinance = require("yahoo-finance2").default;
const { getCache, setCache } = require("./cache");

const SAHMK_BASE = process.env.SAHMK_URL || "https://app.sahmk.sa/api/v1/quote";
const TWELVEDATA_BASE = process.env.TWELVEDATA_URL || "https://api.twelvedata.com/quote";
const FINNHUB_BASE = process.env.FINNHUB_URL || "https://finnhub.io/api/v1";

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
  const numeric = /^\d+$/.test(value);
  if (numeric) return [value, `${value}.SR`, `${value}.SA`, `${value}:Tadawul`];
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

function mapSahmk(data = {}, symbol) {
  return {
    symbol,
    companyName: data.name_en ?? data.name_ar ?? null,
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
    recentDividendAnnouncement: data.recent_dividend_announcement ?? null,
    source: "sahmk"
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
    source: "twelvedata"
  };
}

function mapYahoo(quote = {}, summary = {}, symbol) {
  const currentPrice = quote.regularMarketPrice ?? quote.price?.regularMarketPrice;
  const previousClose = quote.regularMarketPreviousClose ?? quote.price?.regularMarketPreviousClose;

  return {
    symbol,
    companyName: quote.longName ?? quote.shortName ?? summary.price?.longName ?? null,
    currentPrice: toNumber(currentPrice),
    previousClose: toNumber(previousClose),
    "52WeekHigh": toNumber(quote.price?.fiftyTwoWeekHigh ?? summary.price?.fiftyTwoWeekHigh),
    "52WeekLow": toNumber(quote.price?.fiftyTwoWeekLow ?? summary.price?.fiftyTwoWeekLow),
    pe: toNumber(summary.defaultKeyStatistics?.trailingPE ?? summary.financialData?.currentPrice),
    eps: toNumber(summary.defaultKeyStatistics?.trailingEps ?? null),
    volume: toNumber(quote.volume ?? quote.regularMarketVolume),
    marketCap: toNumber(quote.marketCap ?? summary.price?.marketCap),
    sector: summary.summaryProfile?.sector ?? null,
    industry: summary.summaryProfile?.industry ?? null,
    source: "yahoo"
  };
}

function mapFinnhub(quote = {}, profile = {}, symbol) {
  return {
    symbol,
    companyName: profile.name ?? profile.ticker ?? null,
    currentPrice: toNumber(quote.c),
    previousClose: toNumber(quote.pc),
    "52WeekHigh": toNumber(profile["52WeekHigh"] ?? profile.fiftyTwoWkHigh ?? quote.h),
    "52WeekLow": toNumber(profile["52WeekLow"] ?? profile.fiftyTwoWkLow ?? quote.l),
    pe: toNumber(profile.peBasicExclExtraTTM ?? profile.pe),
    eps: toNumber(profile.eps),
    volume: toNumber(quote.v),
    marketCap: toNumber(profile.marketCapitalization),
    sector: profile.finnhubIndustry ?? profile.sector ?? null,
    industry: profile.industry ?? null,
    source: "finnhub"
  };
}

async function fetchFromSahmk(symbol, fetchImpl = fetch) {
  if (!process.env.SAHMK_KEY) return { ok: false, source: "sahmk", raw: null, mapped: mapSahmk({}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:${"sahmk"}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${SAHMK_BASE}/${encodeURIComponent(symbol)}/`;
  const response = await fetchJSON(url, { headers: { "X-API-Key": process.env.SAHMK_KEY } }, fetchImpl);
  const mapped = mapSahmk(response.body || {}, symbol);
  const out = { ok: response.ok && isValidPositivePrice(mapped.currentPrice), source: "sahmk", raw: response.body, mapped, status: response.status };
  setCache(cacheKey, out);
  return out;
}

async function fetchFromTwelveData(symbol, fetchImpl = fetch) {
  if (!process.env.TWELVEDATA_KEY) return { ok: false, source: "twelvedata", raw: null, mapped: mapTwelveData({}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:${"twelvedata"}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `${TWELVEDATA_BASE}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(process.env.TWELVEDATA_KEY)}`;
  const response = await fetchJSON(url, {}, fetchImpl);
  const mapped = mapTwelveData(response.body || {}, symbol);
  const out = { ok: response.ok && isValidPositivePrice(mapped.currentPrice), source: "twelvedata", raw: response.body, mapped, status: response.status };
  setCache(cacheKey, out);
  return out;
}

async function fetchFromYahoo(symbol) {
  const cacheKey = `provider:${"yahoo"}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const quote = await yahooFinance.quote(symbol);
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["price", "summaryProfile", "summaryDetail", "financialData", "defaultKeyStatistics"]
    });
    const mapped = mapYahoo(quote, summary, symbol);
    const out = { ok: isValidPositivePrice(mapped.currentPrice), source: "yahoo", raw: { quote, summary }, mapped, status: 200 };
    setCache(cacheKey, out);
    return out;
  } catch (error) {
    const out = { ok: false, source: "yahoo", raw: { error: error.message }, mapped: mapYahoo({}, {}, symbol), status: 0 };
    setCache(cacheKey, out);
    return out;
  }
}

async function fetchFromFinnhub(symbol, fetchImpl = fetch) {
  if (!process.env.FINNHUB_KEY) return { ok: false, source: "finnhub", raw: null, mapped: mapFinnhub({}, {}, symbol), status: 0, skipped: true };
  const cacheKey = `provider:${"finnhub"}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const quoteUrl = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(process.env.FINNHUB_KEY)}`;
    const profileUrl = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(process.env.FINNHUB_KEY)}`;
    const [quoteResp, profileResp] = await Promise.all([fetchImpl(quoteUrl), fetchImpl(profileUrl)]);
    const [quoteBody, profileBody] = await Promise.all([quoteResp.json(), profileResp.json()]);
    const mapped = mapFinnhub(quoteBody, profileBody, symbol);
    const out = {
      ok: quoteResp.ok && profileResp.ok && isValidPositivePrice(mapped.currentPrice),
      source: "finnhub",
      raw: { quote: quoteBody, profile: profileBody },
      mapped,
      status: quoteResp.status
    };
    setCache(cacheKey, out);
    return out;
  } catch (error) {
    const out = { ok: false, source: "finnhub", raw: { error: error.message }, mapped: mapFinnhub({}, {}, symbol), status: 0 };
    setCache(cacheKey, out);
    return out;
  }
}

async function getUnifiedStock(rawSymbol) {
  const candidates = normalizeCandidates(rawSymbol);
  for (const candidate of candidates) {
    const providers = [fetchFromSahmk, fetchFromTwelveData, fetchFromYahoo, fetchFromFinnhub];
    for (const provider of providers) {
      const res = await provider(candidate);
      if (res.ok) return res.mapped;
    }
  }
  return { symbol: rawSymbol, currentPrice: null };
}

module.exports = {
  normalizeCandidates,
  isValidPositivePrice,
  mapTwelveData,
  mapYahoo,
  mapFinnhub,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahoo,
  fetchFromFinnhub,
  getUnifiedStock
};
