const Parser = require('rss-parser');

const parser = new Parser();
const NEWS_TTL_MS = 60 * 1000;
const newsCache = new Map();

const DEFAULT_FEEDS = [
  'https://www.argaam.com/ar/rss',
  'https://www.alarabiya.net/.mrss/ar.xml'
];

function normalizeNewsItem(item, feedUrl, fallbackSource) {
  const headline = (item?.title || '').trim();
  if (!headline) return null;

  const url = (item?.link || item?.guid || '').trim();
  if (!url) return null;

  const source = (item?.creator || fallbackSource || safeHostname(feedUrl)).trim();
  const publishedAtRaw = item?.isoDate || item?.pubDate || null;
  const publishedAt = toISODate(publishedAtRaw);

  return { headline, source, url, publishedAt };
}

function isRelevantToKeyword(item, keyword) {
  if (!keyword) return true;
  const normalizedKeyword = String(keyword).toLowerCase();
  return item.headline.toLowerCase().includes(normalizedKeyword);
}

function dedupeNews(items) {
  const deduped = [];
  const seen = new Set();

  for (const item of items) {
    const key = item.url || `${item.headline}-${item.publishedAt || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function fetchNews(keyword, options = {}) {
  const cacheKey = JSON.stringify({
    keyword: String(keyword || '').trim().toLowerCase(),
    feedUrls: options.feedUrls || DEFAULT_FEEDS
  });

  const cached = newsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const feedUrls = Array.isArray(options.feedUrls) && options.feedUrls.length > 0
    ? options.feedUrls
    : DEFAULT_FEEDS;

  const responses = await Promise.allSettled(
    feedUrls.map((feedUrl) => parser.parseURL(feedUrl))
  );

  const normalizedItems = [];
  responses.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;

    const feed = result.value;
    const feedUrl = feedUrls[idx];
    const fallbackSource = feed?.title || safeHostname(feedUrl);

    (feed?.items || []).forEach((item) => {
      const normalized = normalizeNewsItem(item, feedUrl, fallbackSource);
      if (normalized) normalizedItems.push(normalized);
    });
  });

  const filtered = normalizedItems.filter((item) => isRelevantToKeyword(item, keyword));
  const deduped = dedupeNews(filtered.length > 0 ? filtered : normalizedItems)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 5);

  newsCache.set(cacheKey, { value: deduped, expiresAt: Date.now() + NEWS_TTL_MS });

  return deduped;
}

function toISODate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url;
  }
}

module.exports = {
  DEFAULT_FEEDS,
  fetchNews
};
