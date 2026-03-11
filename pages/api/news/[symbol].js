const { getNews } = require("../../../lib/providers");
const { getCache, setCache } = require("../../../lib/cache");

export default async function handler(req, res) {
  const {
    query: { symbol, source = "finnhub" }
  } = req;

  const cacheKey = `news:${source}:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(cached);
  }

  try {
    const news = await getNews(symbol, String(source).toLowerCase());
    setCache(cacheKey, news);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(news);
  } catch (error) {
    return res.status(500).json({ error: "Data unavailable", details: error.message });
  }
}
