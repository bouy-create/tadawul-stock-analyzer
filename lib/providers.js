const TWELVEDATA_BASE = process.env.TWELVEDATA_URL || "https://api.twelvedata.com/quote";
const FINNHUB_BASE = process.env.FINNHUB_URL || "https://finnhub.io/api/v1";

function toNumber(value, parser = Number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parser(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCandidates(inputSymbol) {
  if (!inputSymbol) return [];

  const trimmed = String(inputSymbol).trim();
  const withoutPrefix = trimmed.replace(/^TADAWUL:/i, "");
  const numericOnly = /^\d+$/.test(withoutPrefix);

  const candidates = numericOnly
    ? [withoutPrefix, `${withoutPrefix}.SR`, `${withoutPrefix}.SA`]
    : [withoutPrefix, withoutPrefix.toUpperCase()];

  return [...new Set(candidates.filter(Boolean))];
}

function mapTwelveData(data = {}, symbol = null) {
  return {
    symbol,
    companyName: data.name ?? data.pro_name ?? null,
    currentPrice: toNumber(data.close ?? data.price ?? null, parseFloat),
    previousClose: null,
    "52WeekHigh": toNumber(data.fifty_two_week?.high ?? data["52_week_high"] ?? null, parseFloat),
    "52WeekLow": toNumber(data.fifty_two_week?.low ?? data["52_week_low"] ?? null, parseFloat),
    pe: toNumber(data.pe ?? data.pe_ratio ?? null, parseFloat),
    eps: toNumber(data.eps ?? null, parseFloat),
    volume: toNumber(data.volume ?? null, parseInt),
    ipoPrice: null,
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    dividendYield: toNumber(data.dividend_yield ?? null, parseFloat),
    recentDividendAnnouncement: null,
    source: "twelvedata",
    upstream: { provider: "twelvedata", raw: data }
  };
}

function mapFinnhub(quote = {}, profile = {}, symbol = null) {
  return {
    symbol,
    companyName: profile.name ?? profile.ticker ?? null,
    currentPrice: toNumber(quote.c ?? null),
    previousClose: toNumber(quote.pc ?? null),
    "52WeekHigh": toNumber(profile["52WeekHigh"] ?? profile.fiftyTwoWkHigh ?? quote.h ?? null),
    "52WeekLow": toNumber(profile["52WeekLow"] ?? profile.fiftyTwoWkLow ?? quote.l ?? null),
    pe: toNumber(profile.peBasicExclExtraTTM ?? profile.pe ?? null),
    eps: toNumber(profile.eps ?? null),
    volume: toNumber(quote.v ?? profile?.metric?.avg30Volume ?? null),
    ipoPrice: toNumber(profile.ipo ?? null),
    sector: profile.finnhubIndustry ?? profile.sector ?? null,
    industry: profile.industry ?? null,
    dividendYield: toNumber(profile.dividendYieldIndicatedAnnual ?? profile.dividendYield ?? null),
    recentDividendAnnouncement: null,
    source: "finnhub",
    upstream: { provider: "finnhub", raw: { quote, profile } }
  };
}

function hasProviderError(status, payload) {
  if (status !== 200) return true;
  if (!payload || typeof payload !== "object") return false;
  return Boolean(payload.error || payload.message || payload.code || payload.status === "error");
}

function hasValidPrice(unified) {
  return Number.isFinite(unified?.currentPrice);
}

async function fetchFromTwelveData(symbol, fetchImpl = fetch, debug = false) {
  const key = process.env.TWELVEDATA_KEY;
  if (!key) return { provider: "twelvedata", skipped: true, reason: "missing_key" };

  const url = `${TWELVEDATA_BASE}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const response = await fetchImpl(url);
  const raw = await response.json();
  if (debug) console.log("[stock-api][twelvedata]", { symbol, status: response.status, hasPrice: Boolean(raw?.close ?? raw?.price) });

  if (hasProviderError(response.status, raw)) {
    return { provider: "twelvedata", ok: false, raw, status: response.status };
  }

  return { provider: "twelvedata", ok: true, raw, mapped: mapTwelveData(raw, symbol), status: response.status };
}

async function fetchFromFinnhub(symbol, fetchImpl = fetch, debug = false) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return { provider: "finnhub", skipped: true, reason: "missing_key" };

  const quoteUrl = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
  const profileUrl = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;

  const [quoteRes, profileRes] = await Promise.all([fetchImpl(quoteUrl), fetchImpl(profileUrl)]);
  const [quote, profile] = await Promise.all([quoteRes.json(), profileRes.json()]);

  if (debug) {
    console.log("[stock-api][finnhub]", {
      symbol,
      quoteStatus: quoteRes.status,
      profileStatus: profileRes.status,
      hasPrice: Boolean(quote?.c)
    });
  }

  const errored = hasProviderError(quoteRes.status, quote) || hasProviderError(profileRes.status, profile);
  if (errored) {
    return {
      provider: "finnhub",
      ok: false,
      status: quoteRes.status,
      raw: { quote, profile, status: { quote: quoteRes.status, profile: profileRes.status } }
    };
  }

  return {
    provider: "finnhub",
    ok: true,
    status: quoteRes.status,
    raw: { quote, profile },
    mapped: mapFinnhub(quote, profile, symbol)
  };
}

async function fetchUnifiedStock(symbol, options = {}) {
  const { fetchImpl = fetch, debug = false } = options;
  const providers = [];

  if (process.env.TWELVEDATA_KEY) providers.push("twelvedata");
  if (process.env.FINNHUB_KEY) providers.push("finnhub");

  const preferred = process.env.TWELVEDATA_KEY ? "twelvedata" : "finnhub";
  const ordered = [...new Set([preferred, ...providers, "twelvedata", "finnhub"])]
    .filter((provider) => (provider === "twelvedata" ? process.env.TWELVEDATA_KEY : process.env.FINNHUB_KEY));

  const attempts = [];

  for (const provider of ordered) {
    const result = provider === "twelvedata"
      ? await fetchFromTwelveData(symbol, fetchImpl, debug)
      : await fetchFromFinnhub(symbol, fetchImpl, debug);

    attempts.push(result);

    if (result?.mapped && hasValidPrice(result.mapped)) {
      return { success: true, data: result.mapped, attempts };
    }
  }

  return { success: false, attempts };
}



async function getUnifiedStock(rawSymbol) {
  const candidates = normalizeCandidates(rawSymbol);
  for (const candidate of candidates) {
    const result = await fetchUnifiedStock(candidate);
    if (result.success) return result.data;
  }
  return { symbol: rawSymbol, currentPrice: null };
}

async function getNews() {
  return [];
}

module.exports = {
  normalizeCandidates,
  mapTwelveData,
  mapFinnhub,
  fetchUnifiedStock,
  hasValidPrice,
  getUnifiedStock,
  getNews
};
