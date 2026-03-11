import { useMemo, useState } from "react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PriceChart from "../components/PriceChart";
import { estimateFairValueFromEPS } from "../lib/valuation";
import { buildPriceSeries } from "../utils/chart";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Saudi Stock Analyzer";

export default function Home() {
  const [symbol, setSymbol] = useState("2222");
  const [source, setSource] = useState("finnhub");
  const [assumedPE, setAssumedPE] = useState(14);
  const [stock, setStock] = useState(null);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fairValue = useMemo(() => estimateFairValueFromEPS(stock?.eps, assumedPE), [stock, assumedPE]);
  const marginOfSafety = useMemo(() => {
    if (!fairValue || !stock?.currentPrice) return null;
    return Number((((fairValue - stock.currentPrice) / fairValue) * 100).toFixed(2));
  }, [fairValue, stock]);

  const chartData = useMemo(
    () => buildPriceSeries(stock?.currentPrice, stock?.previousClose),
    [stock?.currentPrice, stock?.previousClose]
  );

  const fetchData = async (e) => {
    e?.preventDefault();
    if (!symbol) return;
    setLoading(true);
    setError("");

    try {
      const [stockRes, newsRes] = await Promise.all([
        fetch(`/api/stock/${encodeURIComponent(symbol)}?source=${source}`),
        fetch(`/api/news/${encodeURIComponent(symbol)}?source=${source}`)
      ]);

      const stockPayload = await stockRes.json();
      const newsPayload = await newsRes.json();

      if (!stockRes.ok) {
        setStock(null);
        setNews([]);
        setError(stockPayload?.error || "Stock not found");
      } else {
        setStock(stockPayload);
        setNews(Array.isArray(newsPayload) ? newsPayload : []);
      }
    } catch (err) {
      setError("Data unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6">
      <header className="mb-6 flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">{appName}</h1>
        <select className="rounded-md border p-2" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="finnhub">Finnhub (primary)</option>
          <option value="twelvedata">TwelveData</option>
        </select>
      </header>

      <form className="rounded-xl bg-white p-4 shadow-sm" onSubmit={fetchData}>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-md border p-2"
            placeholder="2222, 2222.SR, SABIC"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
          <input
            className="rounded-md border p-2"
            type="number"
            min="1"
            value={assumedPE}
            onChange={(e) => setAssumedPE(Number(e.target.value || 1))}
          />
          <button className="rounded-md bg-blue-600 p-2 font-medium text-white" type="submit">
            Analyze
          </button>
        </div>
      </form>

      {loading && <LoadingSkeleton />}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

      {stock && !loading && (
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm md:col-span-2">
            <h2 className="text-lg font-semibold">{stock.companyName} ({stock.symbol})</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p>Current Price: {stock.currentPrice ?? "—"}</p>
              <p>Previous Close: {stock.previousClose ?? "—"}</p>
              <p>52W High: {stock["52WeekHigh"] ?? "—"}</p>
              <p>52W Low: {stock["52WeekLow"] ?? "—"}</p>
              <p>Volume: {stock.volume ?? "—"}</p>
              <p>Market Cap: {stock.marketCap ?? "—"}</p>
              <p>P/E: {stock.peRatio ?? "—"}</p>
              <p>EPS: {stock.eps ?? "—"}</p>
              <p>Dividend Yield: {stock.dividendYield ?? "—"}</p>
              <p>IPO Price: {stock.ipoPrice ?? "—"}</p>
              <p>Sector: {stock.sector ?? "—"}</p>
              <p>Industry: {stock.industry ?? "—"}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="font-semibold">Valuation</h3>
            <p className="mt-2 text-sm">Fair Value (EPS × PE): {fairValue ?? "—"}</p>
            <p className="text-sm">Margin of Safety: {marginOfSafety != null ? `${marginOfSafety}%` : "—"}</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm md:col-span-2">
            <h3 className="mb-2 font-semibold">30-Day Trend</h3>
            <PriceChart data={chartData} />
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-semibold">Latest News</h3>
            <ul className="space-y-2 text-sm">
              {news.length ? (
                news.map((item) => (
                  <li key={item.url}>
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                      {item.headline}
                    </a>
                  </li>
                ))
              ) : (
                <li>Data unavailable</li>
              )}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
