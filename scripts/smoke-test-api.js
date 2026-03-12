const endpoints = ['AAPL', '2222.SR'];

async function run() {
  for (const symbol of endpoints) {
    const url = `http://localhost:3000/api/company/${symbol}`;
    try {
      const res = await fetch(url);
      const body = await res.json();
      const hasCurrentPrice = typeof body.currentPrice === 'number' && Number.isFinite(body.currentPrice);
      console.log(JSON.stringify({ endpoint: `/api/company/${symbol}`, status: res.status, hasCurrentPrice, source: body.source ?? null }));
    } catch (error) {
      console.log(JSON.stringify({ endpoint: `/api/company/${symbol}`, status: 'ERROR', hasCurrentPrice: false, source: null, error: error.message }));
    }
  }
}

run();
