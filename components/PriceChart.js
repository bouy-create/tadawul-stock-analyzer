export default function PriceChart({ data = [] }) {
  if (!data.length) return <div>Data unavailable</div>;

  const width = 600;
  const height = 220;
  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.price - min) / range) * (height - 20);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 220 }}>
      <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={points} />
    </svg>
  );
}
