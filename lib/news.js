const Parser = require("rss-parser");
const { getCache, setCache } = require("./cache");

const parser = new Parser();
const NEWS_CACHE_TTL_MS = 60 * 1000;

const DEFAULT_RSS_FEEDS = [
  {
    source: "Argaam",
    url: "https://www.argaam.com/en/rss"
  },
  {
    source: "Al Arabiya",
    url: "https://english.alarabiya.net/feed/rss2/en/business.xml"
  },
  {
    source: "Google News",
    url: "https://news.google.com/rss/search?q={keyword}"
  }
];

function normalizeItem(item = {}, source) {
  return {
    headline: item.title ?? null,
    source: source || item.source || item.creator || item["dc:creator"] || "rss",
    url: item.link ?? item.guid ?? null,
    publishedAt: item.isoDate ?? item.pubDate ?? item.published ?? null
  };
}

function keywordMatch(item, keyword) {
  if (!keyword) return true;
  const target = String(keyword).toLowerCase();
  const haystack = `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`.toLowerCase();
  return haystack.includes(target);
}

function dedupeNews(items = []) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = `${item.url || ""}::${item.headline || ""}`.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function feedUrl(url, keyword) {
  if (!url) return url;
  return url.replace("{keyword}", encodeURIComponent(keyword));
}

async function parseFeed(feed, keyword) {
  try {
    const parsed = await parser.parseURL(feedUrl(feed.url, keyword));
    const items = parsed?.items || [];
    return items.filter((item) => keywordMatch(item, keyword)).map((item) => normalizeItem(item, feed.source || parsed?.title));
  } catch (error) {
    console.log("[stock-api][news]", { keyword, provider: feed.source || "rss", status: 0, error: error.message });
    return [];
  }
}

async function fetchNews(keyword, options = {}) {
  const normalizedKeyword = String(keyword || "").trim();
  if (!normalizedKeyword) return [];

  const feeds = Array.isArray(options.feeds) && options.feeds.length > 0 ? options.feeds : DEFAULT_RSS_FEEDS;
  const limit = Number.isFinite(options.limit) ? options.limit : 5;

  const cacheKey = `news:${normalizedKeyword.toLowerCase()}:${feeds.map((feed) => feed.url).join("|")}:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const allNews = [];
  for (const feed of feeds) {
    const items = await parseFeed(feed, normalizedKeyword);
    allNews.push(...items);
  }

  const sorted = dedupeNews(allNews)
    .filter((item) => item.url && item.headline)
    .sort((a, b) => {
      const first = Date.parse(a.publishedAt || 0) || 0;
      const second = Date.parse(b.publishedAt || 0) || 0;
      return second - first;
    })
    .slice(0, limit);

  setCache(cacheKey, sorted, NEWS_CACHE_TTL_MS);
  return sorted;
}

module.exports = {
  DEFAULT_RSS_FEEDS,
  NEWS_CACHE_TTL_MS,
  fetchNews,
  dedupeNews,
  normalizeItem
};
