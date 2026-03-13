const test = require('node:test');
const assert = require('node:assert/strict');

function loadProvidersWithYahooMock(quoteSummaryImpl) {
  const providersPath = require.resolve('../lib/providers');
  const yahooPath = require.resolve('yahoo-finance2');
  delete require.cache[providersPath];
  const originalYahoo = require.cache[yahooPath];
  require.cache[yahooPath] = {
    id: yahooPath,
    filename: yahooPath,
    loaded: true,
    exports: { default: { quoteSummary: quoteSummaryImpl } }
  };
  const providers = require('../lib/providers');
  if (originalYahoo) {
    require.cache[yahooPath] = originalYahoo;
  } else {
    delete require.cache[yahooPath];
  }
  return providers;
}

test('fetchFromYahooQuoteSummary retries on 401 and succeeds', async () => {
  let calls = 0;
  const providers = loadProvidersWithYahooMock(async (_symbol, options) => {
    calls += 1;
    if (calls < 3) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    }
    assert.ok(options.headers);
    return {
      price: { regularMarketPrice: 10, marketCap: 1000 },
      summaryProfile: { sector: 'Energy', industry: 'Oil & Gas' },
      defaultKeyStatistics: { trailingPE: 12, trailingEps: 1.2 }
    };
  });

  const result = await providers.fetchFromYahooQuoteSummary(`YHOO-401-SUCCESS-${Date.now()}`);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.mapped.pe, 12);
  assert.equal(calls, 3);
});

test('fetchFromYahooQuoteSummary returns 401 failure payload when blocked', async () => {
  const providers = loadProvidersWithYahooMock(async () => {
    const err = new Error('Unauthorized blocked');
    err.statusCode = 401;
    throw err;
  });

  const result = await providers.fetchFromYahooQuoteSummary(`YHOO-401-FAIL-${Date.now()}`);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.raw.error, /Unauthorized/);
});

test('fetchFromFinnhubMetrics maps metrics-only fields', async () => {
  process.env.FINNHUB_KEY = 'test-key';
  const { fetchFromFinnhubMetrics } = require('../lib/providers');

  const fetchImpl = async (url) => {
    if (String(url).includes('/stock/profile2')) {
      return { ok: true, status: 200, json: async () => ({ finnhubIndustry: 'Technology', marketCapitalization: 1234 }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ metric: { peTTM: 22.5, epsTTM: 4.2 } })
    };
  };

  const result = await fetchFromFinnhubMetrics(`AAPL-${Date.now()}`, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.mapped.pe, 22.5);
  assert.equal(result.mapped.eps, 4.2);
  assert.equal(result.mapped.marketCap, 1234);
  assert.equal(result.mapped.sector, 'Technology');
});
