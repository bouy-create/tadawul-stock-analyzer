const { normalizeCandidates, fetchUnifiedStock } = require("../../../lib/providers");

const CACHE_TTL_MS = 60 * 1000;
const companyCache = new Map();

function getCached(key) {
  const entry = companyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    companyCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  companyCache.set(key, { ts: Date.now(), value });
}

function normalizeResponse(symbol, payload) {
  return {
    symbol,
    companyName: payload.companyName ?? null,
    currentPrice: payload.currentPrice ?? null,
    previousClose: payload.previousClose ?? null,
    "52WeekHigh": payload["52WeekHigh"] ?? null,
    "52WeekLow": payload["52WeekLow"] ?? null,
    pe: payload.pe ?? null,
    eps: payload.eps ?? null,
    volume: payload.volume ?? null,
    ipoPrice: payload.ipoPrice ?? null,
    sector: payload.sector ?? null,
    industry: payload.industry ?? null,
    dividendYield: payload.dividendYield ?? null,
    recentDividendAnnouncement: payload.recentDividendAnnouncement ?? null,
    source: payload.source,
    upstream: payload.upstream
  };
}

export default async function handler(req, res) {
  const {
    query: { symbol }
  } = req;

  if (!symbol) {
    return res.status(400).json({ error: "Symbol missing" });
  }

  const debug = process.env.DEBUG_STOCK_API === "1";
  const candidates = normalizeCandidates(symbol);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  const cacheKey = `company:${String(symbol).trim()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    if (debug) console.log("[stock-api] cache hit", { symbol, cacheKey });
    return res.status(200).json(cached);
  }

  const attemptedUpstream = [];

  try {
    for (const candidate of candidates) {
      const result = await fetchUnifiedStock(candidate, { debug });

      if (result.success) {
        const unified = normalizeResponse(candidate, result.data);
        setCached(cacheKey, unified);
        return res.status(200).json(unified);
      }

      attemptedUpstream.push({
        symbol: candidate,
        attempts: result.attempts.map((attempt) => ({
          provider: attempt.provider,
          status: attempt.status ?? null,
          error: attempt.ok === false ? attempt.raw : null,
          skipped: attempt.skipped || false,
          reason: attempt.reason ?? null
        }))
      });
    }

    return res.status(404).json({
      error: "Stock not found",
      tried: candidates,
      env: {
        TWELVEDATA_KEY_present: Boolean(process.env.TWELVEDATA_KEY),
        FINNHUB_KEY_present: Boolean(process.env.FINNHUB_KEY)
      },
      upstream: attemptedUpstream
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
