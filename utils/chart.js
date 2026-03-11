function buildPriceSeries(currentPrice, previousClose) {
  const current = Number(currentPrice);
  const prev = Number(previousClose || currentPrice);
  if (!Number.isFinite(current) || !Number.isFinite(prev) || current <= 0) return [];

  const points = [];
  let price = prev;
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(5, 10);
    const drift = (current - prev) / 30;
    const noise = (Math.sin(i) * current) / 200;
    price = Number((price + drift + noise).toFixed(2));
    points.push({ date, price: Math.max(price, 0.01) });
  }

  points[points.length - 1].price = current;
  return points;
}

module.exports = { buildPriceSeries };
