// pages/api/company/[symbol].js  (مقتطف)
const { fetchNews } = require('../../../lib/news');

export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'missing symbol' });

  const SAHMK_KEY = process.env.SAHMK_KEY;
  const TD_KEY = process.env.TWELVEDATA_KEY;
  const FH_KEY = process.env.FINNHUB_KEY;

  const isNumeric = /^\d+$/.test(symbol);
  const candidates = isNumeric
    ? [symbol, `${symbol}.SR`, `${symbol}.SA`, `${symbol}:Tadawul`]
    : [symbol.toUpperCase(), symbol];

  const validPrice = (v) => {
    if (v == null) return false;
    const n = Number(v);
    return !isNaN(n) && n > 0;
  };

  async function withNews(payload) {
    try {
      const query = payload.companyName || payload.symbol || symbol;
      const news = await fetchNews(query);
      return { ...payload, news };
    } catch (error) {
      return { ...payload, news: [] };
    }
  }

  // helper to fetch JSON safely
  async function fetchJSON(url, opts = {}) {
    try {
      const r = await fetch(url, opts);
      const body = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, body };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }

  // Try SAHMK first (if key present)
  if (SAHMK_KEY) {
    for (const c of candidates) {
      const u = `https://app.sahmk.sa/api/v1/quote/${encodeURIComponent(c)}/`;
      const resp = await fetchJSON(u, { headers: { 'X-API-Key': SAHMK_KEY }});
      console.log('sahmk try', c, resp.status);
      const b = resp.body || {};
      // adjust field names per SAHMK response (example: price, name_en, high_52w)
      if (resp.ok && validPrice(b.price)) {
        const out = {
          symbol: c,
          companyName: b.name_en || b.name_ar || null,
          currentPrice: Number(b.price),
          previousClose: b.previous_close ? Number(b.previous_close) : null,
          '52WeekHigh': b.high_52w ? Number(b.high_52w) : null,
          '52WeekLow': b.low_52w ? Number(b.low_52w) : null,
          volume: b.volume ? Number(b.volume) : null,
          source: 'sahmk',
          upstream: { provider: 'sahmk', raw: b }
        };
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        return res.status(200).json(await withNews(out));
      }
    }
  }

  // Fallback: TwelveData
  if (TD_KEY) {
    for (const c of candidates) {
      const u = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(c)}&apikey=${TD_KEY}`;
      const resp = await fetchJSON(u);
      console.log('twelvedata try', c, resp.status);
      const b = resp.body || {};
      if (resp.ok && (validPrice(b.close) || validPrice(b.price))) {
        const price = parseFloat(b.close ?? b.price);
        const out = {
          symbol: c,
          companyName: b.name ?? null,
          currentPrice: price,
          previousClose: b.previous_close ? Number(b.previous_close) : null,
          '52WeekHigh': b.fifty_two_week?.high ? Number(b.fifty_two_week.high) : null,
          '52WeekLow': b.fifty_two_week?.low ? Number(b.fifty_two_week.low) : null,
          volume: b.volume ? Number(b.volume) : null,
          source: 'twelvedata',
          upstream: { provider: 'twelvedata', raw: b }
        };
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        return res.status(200).json(await withNews(out));
      }
    }
  }

  // Fallback: Finnhub (quote + profile)
  if (FH_KEY) {
    for (const c of candidates) {
      const qUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(c)}&token=${FH_KEY}`;
      const pUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(c)}&token=${FH_KEY}`;
      const [q,resP] = await Promise.all([fetchJSON(qUrl), fetchJSON(pUrl)]);
      console.log('finnhub try', c, q.status, resP.status);
      const qb = q.body || {}, pb = resP.body || {};
      if (q.ok && validPrice(qb.c)) {
        const out = {
          symbol: c,
          companyName: pb.name ?? pb.ticker ?? null,
          currentPrice: Number(qb.c),
          previousClose: qb.pc ? Number(qb.pc) : null,
          '52WeekHigh': pb['52WeekHigh'] ?? null,
          '52WeekLow': pb['52WeekLow'] ?? null,
          volume: qb.v ?? null,
          source: 'finnhub',
          upstream: { provider: 'finnhub', raw: { quote: qb, profile: pb } }
        };
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        return res.status(200).json(await withNews(out));
      }
    }
  }

  // Nothing found — diagnostic response
  return res.status(404).json({
    error: 'Stock not found',
    tried: candidates,
    env: { SAHMK_KEY_present: !!SAHMK_KEY, TWELVEDATA_KEY_present: !!TD_KEY, FINNHUB_KEY_present: !!FH_KEY },
    upstream: [] // you can populate with logs if desired
  });
}
