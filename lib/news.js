const Parser = require("rss-parser");
const { getCache, setCache } = require("./cache");

const parser = new Parser();
const NEWS_CACHE_TTL_MS = 60 * 1000;

const BASE_FEEDS = [
  { source: "Argaam", url: "https://www.argaam.com/en/rss" },
  { source: "Al Arabiya", url: "https://english.alarabiya.net/feed/rss2/en/business.xml" }
];

function normalizeItem(item = {}, source) {
  return {
    headline: item.title ?? null,
    source: source || item.source || "rss",
    url: item.link ?? item.guid ?? null,
    publishedAt: item.isoDate ?? item.pubDate ?? item.published ?? null
  };
}

function keywordMatch(item, keyword) {
  if (!keyword) return true;
  const q = String(keyword).toLowerCase();
  const haystack = `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`.toLowerCase();
  return haystack.includes(q);
}

function feedUrl(url, params = {}) {
  return url
    .replace("{keyword}", encodeURIComponent(params.keyword || ""))
    .replace("{symbol}", encodeURIComponent(params.symbol || ""))
    .replace("{query}", encodeURIComponent(params.query || ""));
}

function dedupeNews(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.url || ""}::${item.headline || ""}`.toLowerCase();
    if (!item.url || !item.headline || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function parseFeed(feed, params) {
  try {
    const parsed = await parser.parseURL(feedUrl(feed.url, params));
    return (parsed?.items || [])
      .filter((item) => keywordMatch(item, params.keyword) || keywordMatch(item, params.symbol))
      .map((item) => normalizeItem(item, feed.source || parsed?.title));
  } catch (error) {
    console.log("[stock-api][news]", { provider: feed.source, status: 0, error: error.message });
    return [];
  }
}

async function fetchNews(keyword, symbol) {
  const normalizedKeyword = String(keyword || symbol || "").trim();
  if (!normalizedKeyword) return [];

  const dynamicFeeds = [
    { source: "Yahoo Finance", url: "https://finance.yahoo.com/rss/headline?s={symbol}" },
    { source: "Google News", url: "https://news.google.com/rss/search?q={query}" }
  ];
  const feeds = [...BASE_FEEDS, ...dynamicFeeds];

  const params = {
    keyword: normalizedKeyword,
    symbol: String(symbol || normalizedKeyword).trim(),
    query: `${normalizedKeyword} ${symbol || ""}`.trim()
  };

  const cacheKey = `news:${params.keyword.toLowerCase()}:${params.symbol.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const collected = [];
  for (const feed of feeds) {
    const items = await parseFeed(feed, params);
    collected.push(...items);
  }

  const news = dedupeNews(collected)
    .sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0))
    .slice(0, 5);

  setCache(cacheKey, news, NEWS_CACHE_TTL_MS);
  return news;
}

module.exports = { fetchNews, normalizeItem, dedupeNews, NEWS_CACHE_TTL_MS, BASE_FEEDS };
