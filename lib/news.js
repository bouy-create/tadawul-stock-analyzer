const Parser = require("rss-parser");
const { getCache, setCache } = require("./cache");

const parser = new Parser();
const NEWS_CACHE_TTL_MS = 60 * 1000;

const FEEDS = [
  { source: "Argaam", url: "https://www.argaam.com/en/rss" },
  { source: "Argaam Markets", url: "https://www.argaam.com/ar/rss/market-news" },
  { source: "Al Arabiya", url: "https://www.alarabiya.net/.mrss/ar/business.xml" },
  { source: "Al Arabiya English", url: "https://english.alarabiya.net/feed/rss2/en/business.xml" },
  { source: "Yahoo Finance", url: "https://finance.yahoo.com/rss/headline?s={symbol}" },
  { source: "Google News", url: "https://news.google.com/rss/search?q={query}" }
];

function normalizeItem(item = {}, source) {
  return {
    headline: item.title || null,
    source: source || "rss",
    url: item.link || item.guid || null,
    publishedAt: item.isoDate || item.pubDate || item.published || null
  };
}

function feedUrl(url, { symbol, query }) {
  return url
    .replace("{symbol}", encodeURIComponent(symbol || ""))
    .replace("{query}", encodeURIComponent(query || ""));
}

function dedupeNews(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.url || ""}:${item.headline || ""}`.toLowerCase();
    if (!item.url || !item.headline || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function parseFeed(feed, params) {
  try {
    const parsed = await parser.parseURL(feedUrl(feed.url, params));
    return (parsed?.items || []).map((item) => normalizeItem(item, feed.source));
  } catch (error) {
    console.log("[news]", feed.source, error.message);
    return [];
  }
}

async function fetchNews(keyword, symbol) {
  const key = String(keyword || symbol || "").trim();
  if (!key) return [];

  const cacheKey = `news:${key.toLowerCase()}:${String(symbol || "").toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const params = {
    symbol: String(symbol || key).trim(),
    query: `${key} ${symbol || ""}`.trim()
  };

  const collected = [];
  for (const feed of FEEDS) {
    const items = await parseFeed(feed, params);
    collected.push(...items);
  }

  const result = dedupeNews(collected)
    .sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0))
    .slice(0, 5);

  setCache(cacheKey, result, NEWS_CACHE_TTL_MS);
  return result;
}

module.exports = { fetchNews, FEEDS, NEWS_CACHE_TTL_MS, normalizeItem, dedupeNews };
