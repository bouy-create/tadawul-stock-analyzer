// pages/api/company/[symbol].js
export default async function handler(req, res) {
  const {
    query: { symbol, source, assumedPE },
  } = req;

  if (!symbol) {
    return res.status(400).json({ error: "Symbol missing" });
  }

  const src = (source || "twelvedata").toLowerCase();
  const assumedPEnum = Number(assumedPE) || 12;

  try {
    let unified = {
      symbol,
      companyName: null,
      currentPrice: null,
      "52WeekHigh": null,
      "52WeekLow": null,
      pe: null,
      eps: null,
      volume: null,
      ipoPrice: null,
      sector: null,
      industry: null,
      dividendYield: null,
      recentDividendAnnouncement: null,
      news: [],
      raw: null,
      assumedPE: assumedPEnum,
      fairValue: null,
      marginOfSafetyPercent: null,
    };

    if (src === "twelvedata") {
      const base = process.env.TWELVEDATA_URL || "https://api.twelvedata.com/quote";
      const key = process.env.TWELVEDATA_KEY;
      if (!key) return res.status(500).json({ error: "Missing TWELVEDATA_KEY in env" });

      const url = `${base}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
      const r = await fetch(url);
      const data = await r.json();
      unified.raw = data;

      unified.companyName = data.name ?? data.symbol;
      unified.currentPrice = data.price ? Number(data.price) : null;
      unified.pe = data.pe ? Number(data.pe) : null;
      unified.eps = data.eps ? Number(data.eps) : null;
      unified.volume = data.volume ? Number(data.volume) : null;
      // try extract 52-week from possible fields
      unified["52WeekHigh"] = data["52_week_high"] ?? data["52WeekHigh"] ?? data.high_52w ?? null;
      unified["52WeekLow"] = data["52_week_low"] ?? data["52WeekLow"] ?? data.low_52w ?? null;
      unified.sector = data.sector ?? null;
      unified.industry = data.industry ?? null;
      unified.ipoPrice = data.ipoPrice ?? data.ipo_price ?? null;
      unified.dividendYield = data.dividendYield ?? data.dividend_yield ?? null;

      // news: Twelve Data may not provide news on quote; leave empty
    } else if (src === "finnhub") {
      const base = process.env.FINNHUB_URL || "https://finnhub.io/api/v1";
      const key = process.env.FINNHUB_KEY;
      if (!key) return res.status(500).json({ error: "Missing FINNHUB_KEY in env" });

      // quote
      const qres = await fetch(`${base}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`);
      const q = await qres.json();

      // profile
      const pres = await fetch(`${base}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`);
      const p = await pres.json();

      // company news (last 30 days)
      const to = new Date();
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fstr = from.toISOString().slice(0,10);
      const tstr = to.toISOString().slice(0,10);
      const nres = await fetch(`${base}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fstr}&to=${tstr}&token=${encodeURIComponent(key)}`);
      const newsArr = await nres.json();

      unified.raw = { quote: q, profile: p, news: newsArr };

      unified.companyName = p.name || p.ticker || symbol;
      unified.currentPrice = q.c ?? null; // current price
      unified.volume = q.v ?? null;
      unified.sector = p.finnhubIndustry ?? null;
      unified.industry = p.industry ?? null;
      unified.pe = null;
      unified.eps = null;

      unified.news = (Array.isArray(newsArr) ? newsArr.slice(0,10) : []).map((n) => ({
        headline: n.headline,
        url: n.url,
        source: n.source || "news",
        date: n.datetime ? new Date(n.datetime * 1000).toISOString().slice(0,10) : null,
      }));

      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const recentDiv = unified.news.find((x) => {
        if (!x.headline || !x.date) return false;
        const headlineLower = x.headline.toLowerCase();
        const ts = new Date(x.date).getTime();
        return ts >= tenDaysAgo && (headlineLower.includes("dividend") || headlineLower.includes("distribution") || headlineLower.includes("توزيعات"));
      });
      unified.recentDividendAnnouncement = recentDiv ? `${recentDiv.headline} — ${recentDiv.source}` : null;
    } else {
      return res.status(400).json({ error: "Unknown source" });
    }

    // Compute fairValue if possible
    let fv = null;
    if (unified.eps != null && !isNaN(unified.eps)) {
      fv = Number(unified.eps) * Number(assumedPEnum);
    } else if (unified.pe != null && unified.currentPrice != null && unified.pe > 0) {
      const impliedEps = unified.currentPrice / unified.pe;
      fv = impliedEps * Number(assumedPEnum);
    } else {
      const raw = unified.raw || {};
      const analystTarget = raw.analystTargetPrice ?? raw.target ?? null;
      if (analystTarget) {
        fv = Number(analystTarget);
      }
    }

    unified.fairValue = fv != null ? Number(fv.toFixed(4)) : null;

    if (unified.fairValue && unified.currentPrice) {
      const mos = ((unified.fairValue - Number(unified.currentPrice)) / unified.fairValue) * 100;
      unified.marginOfSafetyPercent = Number(mos);
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(unified);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
