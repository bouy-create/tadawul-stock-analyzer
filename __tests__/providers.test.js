const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapSahmk,
  mapTwelveData,
  mapYahooChart,
  mapYahooQuoteSummary,
  mapFinnhub,
  isValidPositivePrice,
  compute52WeekFromCloses,
  mergeMissingFields
} = require('../lib/providers');

test('maps SAHMK payload', () => {
  const mapped = mapSahmk({ name_en: 'ACME', price: '11.2', previous_close: '10.8', market_cap: '1000' }, '2222.SR');
  assert.equal(mapped.symbol, '2222.SR');
  assert.equal(mapped.companyName, 'ACME');
  assert.equal(mapped.currentPrice, 11.2);
  assert.equal(mapped.previousClose, 10.8);
  assert.equal(mapped.marketCap, 1000);
});

test('maps TwelveData payload', () => {
  const mapped = mapTwelveData({ name: 'Apple', close: '190.1', fifty_two_week: { high: '199', low: '124' }, pe_ratio: '30.5' }, 'AAPL');
  assert.equal(mapped.currentPrice, 190.1);
  assert.equal(mapped['52WeekHigh'], 199);
  assert.equal(mapped['52WeekLow'], 124);
  assert.equal(mapped.pe, 30.5);
});

test('maps Yahoo chart and computes 52-week from closes', () => {
  const payload = {
    chart: {
      result: [{
        meta: { longName: 'Apple Inc.', regularMarketPrice: 191.5, previousClose: 189.1, regularMarketVolume: 1000 },
        indicators: { quote: [{ close: [180, null, 0, 195, 175] }] }
      }]
    }
  };
  const mapped = mapYahooChart(payload, 'AAPL');
  assert.equal(mapped.currentPrice, 191.5);
  assert.equal(mapped['52WeekHigh'], 195);
  assert.equal(mapped['52WeekLow'], 175);
});

test('maps Yahoo quoteSummary modules', () => {
  const summary = {
    price: { longName: 'Apple Inc.', regularMarketPrice: 191, regularMarketPreviousClose: 189, marketCap: 3000 },
    summaryProfile: { sector: 'Technology', industry: 'Consumer Electronics' },
    financialData: { dividendYield: 0.005 },
    defaultKeyStatistics: { trailingPE: 29.9, trailingEps: 6.4 }
  };

  const mapped = mapYahooQuoteSummary(summary, 'AAPL');
  assert.equal(mapped.marketCap, 3000);
  assert.equal(mapped.pe, 29.9);
  assert.equal(mapped.eps, 6.4);
  assert.equal(mapped.sector, 'Technology');
  assert.equal(mapped.dividendYield, 0.005);
});

test('maps Finnhub quote/profile/metric payloads', () => {
  const mapped = mapFinnhub(
    { c: 33.5, pc: 33.0, v: 100, h: 40, l: 20 },
    { name: 'Company', marketCapitalization: 200, finnhubIndustry: 'Energy' },
    { peTTM: 15.2, epsTTM: 1.7, dividendYieldIndicatedAnnual: 0.03, '52WeekHigh': 50, '52WeekLow': 10 },
    '2222.SR'
  );
  assert.equal(mapped.currentPrice, 33.5);
  assert.equal(mapped.pe, 15.2);
  assert.equal(mapped.eps, 1.7);
  assert.equal(mapped['52WeekHigh'], 50);
  assert.equal(mapped['52WeekLow'], 10);
});

test('validates positive prices and merge-only-missing behavior', () => {
  assert.equal(isValidPositivePrice(0), false);
  assert.equal(isValidPositivePrice(-1), false);
  assert.equal(isValidPositivePrice('5.2'), true);

  const range = compute52WeekFromCloses([0, null, 95, 101]);
  assert.equal(range['52WeekHigh'], 101);
  assert.equal(range['52WeekLow'], 95);

  const merged = mergeMissingFields({ currentPrice: 10, pe: null, eps: 2 }, { pe: 8, eps: 3 });
  assert.equal(merged.pe, 8);
  assert.equal(merged.eps, 2);
});
