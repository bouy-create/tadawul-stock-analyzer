const { getUnifiedStock } = require("../../../lib/providers");
const { getCache, setCache } = require("../../../lib/cache");

export default async function handler(req, res) {
  const {
    query: { symbol, source = "finnhub" }
  } = req;

  const cacheKey = `stock:${source}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(cached);
  }

  try {
    const data = await getUnifiedStock(symbol, String(source).toLowerCase());
    if (!data?.currentPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }
    setCache(cacheKey, data);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Data unavailable", details: error.message });
  }
}
