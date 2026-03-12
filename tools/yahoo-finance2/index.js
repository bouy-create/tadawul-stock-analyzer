async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Yahoo request failed with status ${response.status}`);
  return response.json();
}

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const payload = await fetchJson(url);
  return payload?.quoteResponse?.result?.[0] || {};
}

async function quoteSummary(symbol, options = {}) {
  const modules = Array.isArray(options.modules) ? options.modules.join(",") : "price";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;
  const payload = await fetchJson(url);
  return payload?.quoteSummary?.result?.[0] || {};
}

module.exports = { default: { quote, quoteSummary }, quote, quoteSummary };
