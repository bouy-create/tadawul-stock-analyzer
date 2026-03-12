const endpoints = ["2222"];

async function run() {
  for (const symbol of endpoints) {
    const url = `http://localhost:3000/api/company/${encodeURIComponent(symbol)}`;
    try {
      const res = await fetch(url);
      const body = await res.json();
      console.log(`symbol=${symbol} status=${res.status}`);
      console.log('upstream:', body.upstream || []);
    } catch (error) {
      console.error(`symbol=${symbol} status=ERROR`, error.message);
    }
  }
}

run();
