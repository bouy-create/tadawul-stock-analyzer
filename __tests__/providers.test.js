const test = require("node:test");
const assert = require("node:assert/strict");

const { mapYahoo, mapTwelveData, mapFinnhub, isValidPositivePrice, compute52Week } = require("../lib/providers");

test("mapYahoo maps quote + summary modules into unified shape", () => {
  const quote = {
    regularMarketPrice: 189.44,
    regularMarketPreviousClose: 188.9,
    volume: 889900,
    marketCap: 2000000000000,
    longName: "Apple Inc"
  };
  const summary = {
    price: { fiftyTwoWeekHigh: 199.2, fiftyTwoWeekLow: 124.1, marketCap: 1999999999999 },
    summaryProfile: { sector: "Technology", industry: "Consumer Electronics" },
    defaultKeyStatistics: { trailingPE: 30.1, trailingEps: 6.4 },
    summaryDetail: { dividendYield: 0.005 }
  };

  const mapped = mapYahoo(quote, summary, "AAPL");

  assert.equal(mapped.symbol, "AAPL");
  assert.equal(mapped.currentPrice, 189.44);
  assert.equal(mapped.previousClose, 188.9);
  assert.equal(mapped["52WeekHigh"], 199.2);
  assert.equal(mapped["52WeekLow"], 124.1);
  assert.equal(mapped.pe, 30.1);
  assert.equal(mapped.eps, 6.4);
  assert.equal(mapped.dividendYield, 0.005);
  assert.equal(mapped.dividends.rate, null);
  assert.equal(mapped.source, "yahoo");
});

test("mapTwelveData handles string numbers", () => {
  const mapped = mapTwelveData({ close: "34.7", previous_close: "34.0", volume: "1000" }, "2222.SR");
  assert.equal(mapped.currentPrice, 34.7);
  assert.equal(mapped.previousClose, 34);
  assert.equal(mapped.volume, 1000);
});

test("mapFinnhub maps quote/profile fallback values", () => {
  const mapped = mapFinnhub({ c: 33.5, pc: 33.1, v: 120 }, { ticker: "2222.SR", fiftyTwoWkHigh: 40, fiftyTwoWkLow: 20 }, "2222.SR");
  assert.equal(mapped.currentPrice, 33.5);
  assert.equal(mapped["52WeekHigh"], 40);
  assert.equal(mapped["52WeekLow"], 20);
});



test("compute52Week calculates high/low from fixture", () => {
  const fixture = require("./fixtures/historical.sample.json");

  const result = compute52Week(fixture);

  assert.equal(result["52WeekHigh"], 105.25);
  assert.equal(result["52WeekLow"], 95.5);
});
test("isValidPositivePrice rejects zero and negative numbers", () => {
  assert.equal(isValidPositivePrice(0), false);
  assert.equal(isValidPositivePrice(-1), false);
  assert.equal(isValidPositivePrice("5.2"), true);
});
