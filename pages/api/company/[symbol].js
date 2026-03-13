const {
  normalizeCandidates,
  isValidPositivePrice,
  mergeMissingFields,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromTwelveDataHistory,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary,
  fetchFromFinnhub
} = require("../../../lib/providers");
const { fetchNews } = require("../../../lib/news");

function diagnostic(candidate, provider, result) {
  const validPrice = isValidPositivePrice(result?.mapped?.currentPrice);
  const error = result?.raw?.error || result?.raw?.chart?.error?.description || null;
  return {
    candidate,
    provider,
    status: result?.status ?? null,
    ok: Boolean(result?.ok),
    validPrice,
    error
  };
}

function toUnified(mapped, source, primaryRaw, news, primaryProvider, diagnostics) {
  return {
    symbol: mapped.symbol ?? null,
    companyName: mapped.companyName ?? null,
    currentPrice: mapped.currentPrice ?? null,
    previousClose: mapped.previousClose ?? null,
    "52WeekHigh": mapped["52WeekHigh"] ?? null,
    "52WeekLow": mapped["52WeekLow"] ?? null,
    pe: mapped.pe ?? null,
    eps: mapped.eps ?? null,
    volume: mapped.volume ?? null,
    ipoPrice: mapped.ipoPrice ?? null,
    sector: mapped.sector ?? null,
    industry: mapped.industry ?? null,
    dividendYield: mapped.dividendYield ?? null,
    recentDividendAnnouncement: mapped.recentDividendAnnouncement ?? null,
    marketCap: mapped.marketCap ?? null,
    source,
    news: news || [],
    upstream: {
      provider: primaryProvider,
      raw: primaryRaw,
      diagnostics
    }
  };
}

function logAttempt(provider, candidate, result) {
  const validPrice = isValidPositivePrice(result?.mapped?.currentPrice);
  console.log("attempt", provider, candidate, result?.status ?? null, validPrice);
}

export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "missing symbol" });

  const candidates = normalizeCandidates(symbol);
  const diagnostics = [];

  const providerOrder = [
    { provider: "sahmk", run: fetchFromSahmk },
    { provider: "twelvedata", run: fetchFromTwelveData },
    { provider: "yahoo-chart", run: fetchFromYahooChart },
    { provider: "yahoo-summary", run: fetchFromYahooQuoteSummary },
    { provider: "finnhub", run: fetchFromFinnhub }
  ];

  for (const candidate of candidates) {
    let primary = null;

    for (const step of providerOrder) {
      const result = await step.run(candidate);
      logAttempt(step.provider, candidate, result);
      diagnostics.push(diagnostic(candidate, step.provider, result));

      if (result?.status === 401 && step.provider === "yahoo-summary") {
        diagnostics[diagnostics.length - 1].error = diagnostics[diagnostics.length - 1].error || "Yahoo quoteSummary blocked/unauthorized";
      }

      if (isValidPositivePrice(result?.mapped?.currentPrice)) {
        primary = { ...result, provider: step.provider };
        break;
      }
    }

    if (!primary) continue;

    let enriched = { ...(primary.mapped || {}) };
    const enrichers = [
      { provider: "yahoo-chart", run: fetchFromYahooChart },
      { provider: "yahoo-summary", run: fetchFromYahooQuoteSummary },
      { provider: "finnhub", run: fetchFromFinnhub },
      { provider: "twelvedata-history", run: fetchFromTwelveDataHistory }
    ];

    for (const step of enrichers) {
      const result = await step.run(candidate);
      logAttempt(step.provider, candidate, result);
      diagnostics.push(diagnostic(candidate, step.provider, result));
      enriched = mergeMissingFields(enriched, result?.mapped || {});
    }

    const news = await fetchNews(enriched.companyName || candidate, candidate);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(
      toUnified(enriched, primary.source, primary.raw, news, primary.provider, diagnostics)
    );
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res.status(404).json({
    error: "Stock not found",
    tried: candidates,
    env: {
      SAHMK_KEY_present: Boolean(process.env.SAHMK_KEY),
      TWELVEDATA_KEY_present: Boolean(process.env.TWELVEDATA_KEY),
      FINNHUB_KEY_present: Boolean(process.env.FINNHUB_KEY)
    },
    upstream: diagnostics
  });
}
