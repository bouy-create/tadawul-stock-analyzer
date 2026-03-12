const test = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('rss-parser');

function freshNewsModule() {
  delete require.cache[require.resolve('../lib/news')];
  return require('../lib/news');
}

test('fetchNews normalizes, de-duplicates, and limits items', async () => {
  const originalParseURL = Parser.prototype.parseURL;
  let callCount = 0;

  Parser.prototype.parseURL = async (url) => {
    callCount += 1;
    if (url === 'https://feed-1') {
      return {
        title: 'Argaam',
        items: [
          { title: 'أرامكو تعلن أرباحًا', link: 'https://news/1', pubDate: '2026-01-02T12:00:00Z' },
          { title: 'أرامكو تعلن أرباحًا', link: 'https://news/1', pubDate: '2026-01-02T12:00:00Z' }
        ]
      };
    }

    return {
      title: 'Al Arabiya',
      items: [
        { title: 'خبر 2', link: 'https://news/2', pubDate: '2026-01-02T11:00:00Z' },
        { title: 'خبر 3', link: 'https://news/3', pubDate: '2026-01-02T10:00:00Z' },
        { title: 'خبر 4', link: 'https://news/4', pubDate: '2026-01-02T09:00:00Z' },
        { title: 'خبر 5', link: 'https://news/5', pubDate: '2026-01-02T08:00:00Z' },
        { title: 'خبر 6', link: 'https://news/6', pubDate: '2026-01-02T07:00:00Z' }
      ]
    };
  };

  try {
    const { fetchNews } = freshNewsModule();
    const news = await fetchNews('', { feedUrls: ['https://feed-1', 'https://feed-2'] });

    assert.equal(news.length, 5);
    assert.equal(news[0].headline, 'أرامكو تعلن أرباحًا');
    assert.equal(news[0].url, 'https://news/1');
    assert.equal(callCount, 2);
  } finally {
    Parser.prototype.parseURL = originalParseURL;
  }
});

test('fetchNews uses in-memory cache for 60 seconds', async () => {
  const originalParseURL = Parser.prototype.parseURL;
  let callCount = 0;

  Parser.prototype.parseURL = async () => {
    callCount += 1;
    return {
      title: 'Argaam',
      items: [{ title: 'خبر 1', link: 'https://news/1', pubDate: '2026-01-02T12:00:00Z' }]
    };
  };

  try {
    const { fetchNews } = freshNewsModule();
    await fetchNews('سابك', { feedUrls: ['https://feed-1'] });
    await fetchNews('سابك', { feedUrls: ['https://feed-1'] });

    assert.equal(callCount, 1);
  } finally {
    Parser.prototype.parseURL = originalParseURL;
  }
});
