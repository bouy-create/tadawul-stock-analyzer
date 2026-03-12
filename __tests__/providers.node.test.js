const test = require('node:test');
const assert = require('node:assert/strict');
const { mapFinnhub } = require('../lib/providers');

test('mapFinnhub maps source payload', () => {
  const mapped = mapFinnhub(
    { c: 30, pc: 29, v: 1000 },
    { name: 'Aramco', ticker: '2222.SR', pe: 15, eps: 2, fiftyTwoWkHigh: 40, fiftyTwoWkLow: 22 },
    '2222.SR'
  );

  assert.equal(mapped.companyName, 'Aramco');
  assert.equal(mapped.pe, 15);
  assert.equal(mapped.symbol, '2222.SR');
});
