const {
  normalizeCandidates,
  isValidPositivePrice,
  compute52Week,
  mergeMapped,
  fetchFromSahmk,
  fetchFromTwelveData,
  fetchFromYahooChart,
  fetchFromYahooQuoteSummary,
  fetchFromFinnhubMetrics
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

function onlyMissingFundamentals(mapped = {}, candidateMapped = {}) {
  const fields = ["pe", "eps", "marketCap", "sector", "industry", "dividendYield"];
  return fields.reduce((acc, field) => {
    if (mapped[field] == null && candidateMapped[field] != null) acc[field] = candidateMapped[field];
    return acc;
  }, {});
}

function appendUpstream(upstream, candidate, provider, result, extra = {}) {
  const error = result?.raw?.error || result?.raw?.chart?.error?.description || null;
  const row = {
    candidate,
    provider,
    status: result?.status ?? 0,
    ok: Boolean(result?.ok),
    error,
    ...extra
  };

  if (provider === "yahoo-quoteSummary" && row.status === 401) {
    row.note = "Yahoo 401 suggests network/IP or cookie/crumb blockage";
  }
  upstream.push(row);
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

      appendUpstream(upstream, candidate, attempt.provider, result, { validPrice });

      if (!(result?.ok && validPrice)) continue;

      const primaryMapped = { ...(result?.mapped || {}) };
      const enrichmentRaw = { chart: null, quoteSummary: null, finnhubMetrics: null, twelveData: null };

      if (hasMissing52Week(primaryMapped)) {
        for (const enrichmentCandidate of candidates) {
          const chart = await fetchFromYahooChart(enrichmentCandidate);
          console.log("attempt", enrichmentCandidate, "yahoo-chart", Boolean(chart?.ok), chart?.status ?? 0);
          appendUpstream(upstream, enrichmentCandidate, "yahoo-chart", chart);

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
          appendUpstream(upstream, enrichmentCandidate, "yahoo-quoteSummary", summary);

          Object.assign(primaryMapped, onlyMissingFundamentals(primaryMapped, summary?.mapped || {}));
          enrichmentRaw.quoteSummary = { ...(enrichmentRaw.quoteSummary || {}), [enrichmentCandidate]: summary?.raw || null };
          if (!hasMissingFundamentals(primaryMapped)) break;
        }
      }

      if (hasMissingFundamentals(primaryMapped)) {
        for (const enrichmentCandidate of candidates) {
          const finnhub = await fetchFromFinnhubMetrics(enrichmentCandidate);
          console.log("attempt", enrichmentCandidate, "finnhub-metrics", Boolean(finnhub?.ok), finnhub?.status ?? 0);
          appendUpstream(upstream, enrichmentCandidate, "finnhub-metrics", finnhub);

          Object.assign(primaryMapped, onlyMissingFundamentals(primaryMapped, finnhub?.mapped || {}));
          enrichmentRaw.finnhubMetrics = { ...(enrichmentRaw.finnhubMetrics || {}), [enrichmentCandidate]: finnhub?.raw || null };
          if (!hasMissingFundamentals(primaryMapped)) break;
        }
      }

      if (hasMissingFundamentals(primaryMapped)) {
        for (const enrichmentCandidate of candidates) {
          const td = await fetchFromTwelveData(enrichmentCandidate);
          console.log("attempt", enrichmentCandidate, "twelvedata-fundamentals", Boolean(td?.ok), td?.status ?? 0);
          appendUpstream(upstream, enrichmentCandidate, "twelvedata-fundamentals", td);

          Object.assign(primaryMapped, onlyMissingFundamentals(primaryMapped, td?.mapped || {}));
          enrichmentRaw.twelveData = { ...(enrichmentRaw.twelveData || {}), [enrichmentCandidate]: td?.raw || null };
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

    const chart = await fetchFromYahooChart(candidate);
    console.log("attempt", candidate, "yahoo", Boolean(chart?.ok), chart?.status ?? 0);
    appendUpstream(upstream, candidate, "yahoo", chart, {
      validPrice: isValidPositivePrice(chart?.mapped?.currentPrice)
    });

    if (chart?.ok && isValidPositivePrice(chart?.mapped?.currentPrice)) {
      const summary = await fetchFromYahooQuoteSummary(candidate);
      console.log("attempt", candidate, "yahoo-summary", Boolean(summary?.ok), summary?.status ?? 0);
      appendUpstream(upstream, candidate, "yahoo-summary", summary, {
        validPrice: isValidPositivePrice(summary?.mapped?.currentPrice)
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
