const { fetchNews } = require("../../../lib/news");
const { getCache, setCache } = require("../../../lib/cache");

export default async function handler(req, res) {
  const {
    query: { symbol }
  } = req;

  const cacheKey = `news:rss:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(cached);
  }

  try {
    const news = await fetchNews(symbol);
    setCache(cacheKey, news);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(news);
  } catch (error) {
    return res.status(500).json({ error: "Data unavailable", details: error.message });
  }
}
