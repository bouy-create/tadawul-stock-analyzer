const {
  normalizeCandidates,
  isValidPositivePrice,
  compute52Week,
  mergeMapped,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary,
  fetchFromFinnhub
} = require("../../../lib/providers");
const { fetchNews } = require("../../../lib/news");

function toUnified(providerResult, news = []) {
  const mapped = providerResult?.mapped || {};
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
    source: providerResult.source,
    news,
    upstream: { provider: providerResult.source, raw: providerResult.raw }
  };
}

export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "missing symbol" });

  const candidates = normalizeCandidates(symbol);
  const upstream = [];

  for (const candidate of candidates) {
    const attempts = [
      { provider: "sahmk", run: async () => fetchFromSahmk(candidate) },
      { provider: "twelvedata", run: async () => fetchFromTwelveData(candidate) },
      {
        provider: "yahoo",
        run: async () => {
          const [chart, summary] = await Promise.all([fetchFromYahooChart(candidate), fetchFromYahooQuoteSummary(candidate)]);
          const merged = mergeMapped(chart.mapped, summary.mapped);
          if (!merged["52WeekHigh"] || !merged["52WeekLow"]) {
            merged["52WeekHigh"] = merged["52WeekHigh"] ?? compute52Week(chart?.mapped?.history || [])["52WeekHigh"];
            merged["52WeekLow"] = merged["52WeekLow"] ?? compute52Week(chart?.mapped?.history || [])["52WeekLow"];
          }
          return {
            ok: (chart.ok || summary.ok) && isValidPositivePrice(merged.currentPrice),
            status: chart.status || summary.status,
            source: "yahoo",
            raw: { chart: chart.raw, quoteSummary: summary.raw },
            mapped: merged
          };
        }
      },
      { provider: "finnhub", run: async () => fetchFromFinnhub(candidate) }
    ];

    for (const attempt of attempts) {
      const result = await attempt.run();
      const validPrice = isValidPositivePrice(result?.mapped?.currentPrice);
      console.log("[stock-api][attempt]", { candidate, provider: attempt.provider, status: result?.status ?? 0, validPrice });

      upstream.push({
        candidate,
        provider: attempt.provider,
        status: result?.status ?? 0,
        validPrice,
        ok: Boolean(result?.ok),
        error: result?.raw?.error || null
      });

      if (result?.ok && validPrice) {
        const news = await fetchNews(result?.mapped?.companyName || candidate, candidate);
        const payload = toUnified(result, news);
        res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
        return res.status(200).json(payload);
      }
    }
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
    upstream
  });
}
