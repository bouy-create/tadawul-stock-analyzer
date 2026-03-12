const endpoints = ["AAPL", "2222", "2222.SR"];

async function run() {
  const rows = [];
  for (const symbol of endpoints) {
    const url = `http://localhost:3000/api/company/${encodeURIComponent(symbol)}`;
    try {
      const res = await fetch(url);
      const body = await res.json();
      rows.push({
        symbol,
        status: res.status,
        currentPricePresent: typeof body.currentPrice === "number" && body.currentPrice > 0,
        provider: body.source || "-"
      });
    } catch (error) {
      rows.push({ symbol, status: "ERROR", currentPricePresent: false, provider: error.message });
    }
  }

  console.table(rows);
}

run();
