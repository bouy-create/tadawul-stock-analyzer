const {
  normalizeCandidates,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahoo,
  fetchFromFinnhub,
  fetchHistorical,
  compute52Week,
  isValidPositivePrice
} = require("../../../lib/providers");
const { fetchNews } = require("../../../lib/news");

function toUnified(symbol, providerResult, news) {
  const mapped = providerResult.mapped || {};
  return {
    symbol: mapped.symbol ?? symbol,
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
    dividendRate: mapped.dividendRate ?? null,
    exDividendDate: mapped.exDividendDate ?? null,
    dividends: mapped.dividends ?? null,
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
  const providers = [];
  const upstream = [];

  if (process.env.SAHMK_KEY) providers.push({ name: "sahmk", run: fetchFromSahmk });
  if (process.env.TWELVEDATA_KEY) providers.push({ name: "twelvedata", run: fetchFromTwelveData });
  providers.push({ name: "yahoo", run: fetchFromYahoo });
  if (process.env.FINNHUB_KEY) providers.push({ name: "finnhub", run: fetchFromFinnhub });

  for (const candidate of candidates) {
    for (const provider of providers) {
      const result = await provider.run(candidate);
      const validPrice = isValidPositivePrice(result?.mapped?.currentPrice);
      console.log("[stock-api][attempt]", { candidate, provider: provider.name, status: result?.status ?? 0, validPrice });
      console.log("[stock-api][mapped]", { candidate, provider: provider.name, currentPrice: result?.mapped?.currentPrice ?? null });

      upstream.push({
        candidate,
        provider: provider.name,
        status: result?.status ?? 0,
        ok: result?.ok ?? false,
        validPrice,
        raw: result?.raw ?? null
      });

      if (result?.ok && validPrice) {
        const historical = await fetchHistorical(candidate);
        const computed52Week = compute52Week(historical);
        const mapped = {
          ...result.mapped,
          ...computed52Week
        };
        const companyName = result?.mapped?.companyName;
        const news = await fetchNews(companyName || symbol);
        const payload = toUnified(candidate, { ...result, mapped }, news);
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
      SAHMK_KEY: Boolean(process.env.SAHMK_KEY),
      TWELVEDATA_KEY: Boolean(process.env.TWELVEDATA_KEY),
      FINNHUB_KEY: Boolean(process.env.FINNHUB_KEY)
    },
    upstream
  });
}
