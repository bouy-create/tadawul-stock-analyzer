const endpoints = ["AAPL", "2222", "2222.SR"];

async function fetchRow(symbol) {
  const url = `http://localhost:3000/api/company/${encodeURIComponent(symbol)}`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    return {
      symbol,
      status: res.status,
      currentPricePresent: Boolean(body?.currentPrice && Number(body.currentPrice) > 0),
      provider: body?.upstream?.provider || body?.source || "-"
    };
  } catch (error) {
    return { symbol, status: "ERR", currentPricePresent: false, provider: error.message };
  }
}

async function run() {
  const rows = [];
  for (const symbol of endpoints) rows.push(await fetchRow(symbol));
  console.table(rows);
}

run();
