const {
  normalizeCandidates,
  isValidPositivePrice,
  compute52Week,
  mergeMapped,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary
} = require("../../../lib/providers");
const { fetchNews } = require("../../../lib/news");

function toUnified(providerResult, news = [], upstream = []) {
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
    upstream
  };
}

function hasMissing52Week(mapped = {}) {
  return mapped["52WeekHigh"] == null || mapped["52WeekLow"] == null;
}

function hasMissingFundamentals(mapped = {}) {
  const fields = ["pe", "eps", "marketCap", "sector", "industry", "dividendYield"];
  return fields.some((field) => mapped[field] == null);
}

export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "missing symbol" });

  const candidates = normalizeCandidates(symbol);
  const upstream = [];

  for (const candidate of candidates) {
    const initialAttempts = [
      { provider: "sahmk", run: async () => fetchFromSahmk(candidate) },
      { provider: "twelvedata", run: async () => fetchFromTwelveData(candidate) }
    ];

    for (const attempt of initialAttempts) {
      const result = await attempt.run();
      const validPrice = isValidPositivePrice(result?.mapped?.currentPrice);
      console.log("attempt", candidate, attempt.provider, Boolean(result?.ok), result?.status ?? 0);

      upstream.push({
        candidate,
        provider: attempt.provider,
        status: result?.status ?? 0,
        validPrice,
        ok: Boolean(result?.ok),
        error: result?.raw?.error || null
      });

      if (result?.ok && validPrice) {
        const primaryMapped = { ...(result?.mapped || {}) };
        const enrichmentRaw = { chart: null, quoteSummary: null };

        if (hasMissing52Week(primaryMapped)) {
          for (const enrichmentCandidate of candidates) {
            const chart = await fetchFromYahooChart(enrichmentCandidate);
            console.log("attempt", enrichmentCandidate, "yahoo-chart", Boolean(chart?.ok), chart?.status ?? 0);
            upstream.push({
              candidate: enrichmentCandidate,
              provider: "yahoo-chart",
              status: chart?.status ?? 0,
              ok: Boolean(chart?.ok),
              error: chart?.raw?.chart?.error?.description || chart?.raw?.error || null
            });

            if (!chart?.ok) continue;

            const computed = compute52Week(chart?.mapped?.history || []);
            Object.assign(primaryMapped, mergeMapped(primaryMapped, {
              "52WeekHigh": computed["52WeekHigh"],
              "52WeekLow": computed["52WeekLow"]
            }));
            enrichmentRaw.chart = { ...(enrichmentRaw.chart || {}), [enrichmentCandidate]: chart?.raw || null };

            if (!hasMissing52Week(primaryMapped)) break;
          }
        }

        if (hasMissingFundamentals(primaryMapped)) {
          for (const enrichmentCandidate of candidates) {
            const summary = await fetchFromYahooQuoteSummary(enrichmentCandidate);
            console.log("attempt", enrichmentCandidate, "yahoo-quoteSummary", Boolean(summary?.ok), summary?.status ?? 0);
            upstream.push({
              candidate: enrichmentCandidate,
              provider: "yahoo-quoteSummary",
              status: summary?.status ?? 0,
              ok: Boolean(summary?.ok),
              error: summary?.raw?.error || null
            });

            Object.assign(primaryMapped, mergeMapped(primaryMapped, {
              pe: summary?.mapped?.pe,
              eps: summary?.mapped?.eps,
              marketCap: summary?.mapped?.marketCap,
              sector: summary?.mapped?.sector,
              industry: summary?.mapped?.industry,
              dividendYield: summary?.mapped?.dividendYield
            }));
            enrichmentRaw.quoteSummary = { ...(enrichmentRaw.quoteSummary || {}), [enrichmentCandidate]: summary?.raw || null };

            if (!hasMissingFundamentals(primaryMapped)) break;
          }
        }

        const accepted = {
          ...result,
          mapped: primaryMapped,
          raw: {
            primary: result?.raw || null,
            enrichment: enrichmentRaw
          }
        };
        const news = await fetchNews(accepted?.mapped?.companyName || candidate, candidate);
        const payload = toUnified(accepted, news, upstream);
        res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
        return res.status(200).json(payload);
      }
    }

    const chart = await fetchFromYahooChart(candidate);
    console.log("attempt", candidate, "yahoo", Boolean(chart?.ok), chart?.status ?? 0);
    upstream.push({
      candidate,
      provider: "yahoo",
      status: chart?.status ?? 0,
      validPrice: isValidPositivePrice(chart?.mapped?.currentPrice),
      ok: Boolean(chart?.ok),
      error: chart?.raw?.chart?.error?.description || chart?.raw?.error || null
    });

    if (chart?.ok && isValidPositivePrice(chart?.mapped?.currentPrice)) {
      const summary = await fetchFromYahooQuoteSummary(candidate);
      console.log("attempt", candidate, "yahoo-summary", Boolean(summary?.ok), summary?.status ?? 0);

      upstream.push({
        candidate,
        provider: "yahoo-summary",
        status: summary?.status ?? 0,
        validPrice: isValidPositivePrice(summary?.mapped?.currentPrice),
        ok: Boolean(summary?.ok),
        error: summary?.raw?.error || null
      });

      const enriched = mergeMapped(chart.mapped, {
        pe: summary?.mapped?.pe,
        eps: summary?.mapped?.eps,
        marketCap: summary?.mapped?.marketCap
      });
      if (!enriched["52WeekHigh"] || !enriched["52WeekLow"]) {
        const computed = compute52Week(chart?.mapped?.history || []);
        enriched["52WeekHigh"] = enriched["52WeekHigh"] ?? computed["52WeekHigh"];
        enriched["52WeekLow"] = enriched["52WeekLow"] ?? computed["52WeekLow"];
      }

      const accepted = {
        ...chart,
        mapped: enriched,
        raw: { chart: chart.raw, quoteSummary: summary?.raw || null }
      };

      const news = await fetchNews(accepted?.mapped?.companyName || candidate, candidate);
      const payload = toUnified(accepted, news, upstream);
      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json(payload);
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
