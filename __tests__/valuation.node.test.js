const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateFairValueFromEPS, estimateFairValueFromDCF } = require('../lib/valuation');

test('estimateFairValueFromEPS works', () => {
  assert.equal(estimateFairValueFromEPS(5, 10), 50);
  assert.equal(estimateFairValueFromEPS(null, 10), null);
});

test('estimateFairValueFromDCF guards invalid', () => {
  assert.equal(estimateFairValueFromDCF({ growthRate: 0.05 }), null);
  assert.ok(estimateFairValueFromDCF({ cashFlow: 100, growthRate: 0.05, discountRate: 0.1, terminalMultiple: 12 }) > 0);
});
