const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapSahmk,
  mapTwelveData,
  mapYahooChart,
  mapYahooQuoteSummary,
  mapFinnhub,
  isValidPositivePrice,
  compute52Week,
  mergeMapped
} = require("../lib/providers");

describe("provider mapping", () => {
  test("mapSahmk maps core fields", () => {
    const mapped = mapSahmk({ price: "35.2", previous_close: "34.6", volume: "100", name_en: "ACME SA" }, "2222.SR");
    assert.equal(mapped.currentPrice, 35.2);
    assert.equal(mapped.previousClose, 34.6);
    assert.equal(mapped.volume, 100);
    assert.equal(mapped.companyName, "ACME SA");
  });

  test("mapTwelveData maps fifty two week values", () => {
    const mapped = mapTwelveData({ close: "189.4", fifty_two_week: { high: "199", low: "124" } }, "AAPL");
    assert.equal(mapped.currentPrice, 189.4);
    assert.equal(mapped["52WeekHigh"], 199);
    assert.equal(mapped["52WeekLow"], 124);
  });

  test("mapYahooChart computes range from close series", () => {
    const payload = {
      chart: {
        result: [{ timestamp: [1710000000, 1710086400, 1710172800], meta: { regularMarketPrice: 190, previousClose: 188, regularMarketVolume: 10, longName: "Apple Inc." }, indicators: { quote: [{ close: [180, 190, 170] }] } }]
      }
    };
    const mapped = mapYahooChart(payload, "AAPL");
    assert.equal(mapped.currentPrice, 190);
    assert.equal(mapped["52WeekHigh"], 190);
    assert.equal(mapped["52WeekLow"], 170);
  });

  test("mapYahooQuoteSummary maps valuation and profile fields", () => {
    const summary = {
      price: { regularMarketPrice: 191, regularMarketPreviousClose: 189, marketCap: 1000 },
      summaryProfile: { sector: "Technology", industry: "Consumer Electronics" },
      financialData: { dividendYield: 0.006 },
      defaultKeyStatistics: { trailingPE: 30.2, trailingEps: 6.5, sharesOutstanding: 5, lastDividendDate: 1710011111 }
    };
    const mapped = mapYahooQuoteSummary(summary, "AAPL");
    assert.equal(mapped.pe, 30.2);
    assert.equal(mapped.eps, 6.5);
    assert.equal(mapped.sector, "Technology");
    assert.equal(mapped.dividendYield, 0.006);

    const merged = mergeMapped({ currentPrice: 10, marketCap: null }, { sharesOutstanding: 100 });
    assert.equal(merged.marketCap, 1000);
  });

  test("mapFinnhub uses quote/profile/metrics", () => {
    const mapped = mapFinnhub({ c: 33.5, pc: 33.1, v: 100 }, { finnhubIndustry: "Energy", marketCapitalization: 200 }, { peTTM: 20, epsTTM: 2, "52WeekHigh": 50, "52WeekLow": 10 }, "2222.SR");
    assert.equal(mapped.currentPrice, 33.5);
    assert.equal(mapped.pe, 20);
    assert.equal(mapped.eps, 2);
    assert.equal(mapped["52WeekHigh"], 50);
  });

  test("compute52Week and validity checks", () => {
    const range = compute52Week([{ close: 0 }, { close: null }, { close: 95.5 }, { close: 105.25 }]);
    assert.equal(range["52WeekHigh"], 105.25);
    assert.equal(range["52WeekLow"], 95.5);
    assert.equal(isValidPositivePrice(0), false);
    assert.equal(isValidPositivePrice(-1), false);
    assert.equal(isValidPositivePrice("5.2"), true);
  });
});
