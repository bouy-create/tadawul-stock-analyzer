const test = require('node:test');
const assert = require('node:assert/strict');
const { mapFinnhub } = require('../lib/providers');

test('mapFinnhub maps source payload', () => {
  const mapped = mapFinnhub(
    { c: 30, pc: 29, v: 1000 },
    { name: 'Aramco', ticker: '2222.SR' },
    { peTTM: 15, epsTTM: 2, '52WeekHigh': 40, '52WeekLow': 22 },
    '2222.SR'
  );

  assert.equal(mapped.companyName, 'Aramco');
  assert.equal(mapped.pe, 15);
  assert.equal(mapped.symbol, '2222.SR');
});


test('normalizeCandidates includes saudi variants', () => {
  const { normalizeCandidates } = require('../lib/providers');
  const candidates = normalizeCandidates('2222');

  assert.deepEqual(candidates, ['2222', '2222.SR', '2222.SA', '2222:Tadawul']);
});

test('mapYahooChart computes 52 week range from close history', () => {
  const { mapYahooChart } = require('../lib/providers');
  const mapped = mapYahooChart({
    chart: {
      result: [{
        meta: { regularMarketPrice: 31, shortName: 'Aramco' },
        timestamp: [1700000000, 1700003600, 1700007200],
        indicators: { quote: [{ close: [20, 40, 30] }] }
      }]
    }
  }, '2222.SR');

  assert.equal(mapped.currentPrice, 31);
  assert.equal(mapped['52WeekHigh'], 40);
  assert.equal(mapped['52WeekLow'], 20);
});
