const test = require('node:test');
const assert = require('node:assert/strict');
const { mapTwelveData, mapFinnhub, normalizeCandidates } = require('../lib/providers');

test('maps TwelveData payload to unified format', () => {
  const payload = {
    name: 'Apple Inc',
    close: '195.88',
    volume: '1123456',
    fifty_two_week: { high: '210.5', low: '124.2' },
    pe_ratio: '30.1',
    eps: '6.5',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    dividend_yield: '0.55'
  };

  const mapped = mapTwelveData(payload, 'AAPL');

  assert.equal(mapped.currentPrice, 195.88);
  assert.equal(mapped.volume, 1123456);
  assert.equal(mapped['52WeekHigh'], 210.5);
  assert.equal(mapped['52WeekLow'], 124.2);
  assert.equal(mapped.pe, 30.1);
  assert.equal(mapped.eps, 6.5);
  assert.equal(mapped.source, 'twelvedata');
});

test('maps Finnhub quote + profile to unified format', () => {
  const quote = { c: 32.2, pc: 31.8, v: 998877, h: 40, l: 22 };
  const profile = {
    name: 'Saudi Aramco',
    ticker: '2222.SR',
    peBasicExclExtraTTM: 16.1,
    fiftyTwoWkHigh: 39.5,
    fiftyTwoWkLow: 23.2,
    finnhubIndustry: 'Energy'
  };

  const mapped = mapFinnhub(quote, profile, '2222.SR');

  assert.equal(mapped.currentPrice, 32.2);
  assert.equal(mapped.previousClose, 31.8);
  assert.equal(mapped.companyName, 'Saudi Aramco');
  assert.equal(mapped.volume, 998877);
  assert.equal(mapped['52WeekHigh'], 39.5);
  assert.equal(mapped['52WeekLow'], 23.2);
  assert.equal(mapped.pe, 16.1);
  assert.equal(mapped.source, 'finnhub');
});

test('normalizes Saudi and global symbols', () => {
  assert.deepEqual(normalizeCandidates('2222'), ['2222', '2222.SR', '2222.SA', '2222:Tadawul']);
  assert.deepEqual(normalizeCandidates('TADAWUL:2222'), ['2222', '2222.SR', '2222.SA', '2222:Tadawul']);
  assert.deepEqual(normalizeCandidates('aapl'), ['AAPL', 'aapl']);
});
