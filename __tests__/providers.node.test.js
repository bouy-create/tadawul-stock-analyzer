const test = require('node:test');
const assert = require('node:assert/strict');
const { mapStockData } = require('../lib/providers');

test('mapStockData maps source payload', () => {
  const mapped = mapStockData({
    symbol: '2222.SR',
    quote: { c: 30, pc: 29, v: 1000 },
    profile: { name: 'Aramco', marketCapitalization: 100000, finnhubIndustry: 'Energy' },
    metrics: { peNormalizedAnnual: 15, epsNormalizedAnnual: 2, dividendYieldIndicatedAnnual: 0.04, '52WeekHigh': 40, '52WeekLow': 22 }
  });

  assert.equal(mapped.companyName, 'Aramco');
  assert.equal(mapped.peRatio, 15);
  assert.equal(mapped.symbol, '2222.SR');
});
