import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("twelvedata");
  const [assumedPE, setAssumedPE] = useState("12");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function search(e) {
    e?.preventDefault();
    if (!query) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/company/${encodeURIComponent(query)}?source=${encodeURIComponent(
          source
        )}&assumedPE=${encodeURIComponent(assumedPE)}`
      );
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: "system-ui, sans-serif", maxWidth: 900 }}>
      <h1>محلل أسهم مبدئي — أدخل رمز أو اسم الشركة</h1>

      <form onSubmit={search} style={{ marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="مثال: 2222 أو SABIC أو 2222.SR"
          style={{ padding: 8, width: 320 }}
        />

        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          style={{ marginLeft: 8, padding: 8 }}
        >
          <option value="twelvedata">Twelve Data</option>
          <option value="finnhub">Finnhub</option>
        </select>

        <label style={{ marginLeft: 8 }}>
          افتراض مكرر الربحية (PE):
          <input
            value={assumedPE}
            onChange={(e) => setAssumedPE(e.target.value)}
            style={{ width: 70, marginLeft: 6, padding: 6 }}
            type="number"
            min="1"
          />
        </label>

        <button type="submit" style={{ marginLeft: 8, padding: "8px 12px" }}>
          بحث
        </button>
      </form>

      {loading && <p>جاري البحث... (قد تحتاج وضع مفاتيح API في إعدادات Vercel)</p>}

      {result && result.error && (
        <div style={{ color: "red" }}>
          <strong>خطأ:</strong> {result.error}
        </div>
      )}

      {result && !result.error && (
        <section style={{ marginTop: 10 }}>
          <h2>
            {result.companyName ?? "—"} ({result.symbol ?? "—"})
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <div>
              <b>السعر الحالي</b>
              <div>{result.currentPrice ?? "—"}</div>
            </div>

            <div>
              <b>سعر خلال 52 أسبوع</b>
              <div>High: {result["52WeekHigh"] ?? "—"}</div>
              <div>Low: {result["52WeekLow"] ?? "—"}</div>
            </div>

            <div>
              <b>مكرر الربحية (P/E)</b>
              <div>{result.pe ?? "—"}</div>
            </div>

            <div>
              <b>حجم التداول</b>
              <div>{result.volume ?? "—"}</div>
            </div>

            <div>
              <b>القيمة العادلة (بافتراض PE = {result.assumedPE ?? assumedPE})</b>
              <div>{result.fairValue ?? "—"}</div>
            </div>

            <div>
              <b>نسبة هامش الأمان</b>
              <div>
                {result.marginOfSafetyPercent != null
                  ? `${result.marginOfSafetyPercent.toFixed(1)}%`
                  : "—"}
              </div>
            </div>

            <div>
              <b>سعر الاكتتاب</b>
              <div>{result.ipoPrice ?? "—"}</div>
            </div>

            <div>
              <b>قطاع / صناعة</b>
              <div>
                {result.sector ?? "-"} / {result.industry ?? "-"}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <b>التوزيعات (إن أعلنت خلال 10 أيام)</b>
              <div>{result.recentDividendAnnouncement ? result.recentDividendAnnouncement : "لا"}</div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3>أخبار متعلقة</h3>
            {result.news && result.news.length ? (
              <ul>
                {result.news.map((n, i) => (
                  <li key={i}>
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.headline}
                    </a>{" "}
                    <small>— {n.source} ({n.date})</small>
                  </li>
                ))}
              </ul>
            ) : (
              <div>لا توجد أخبار قيد العرض.</div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <h3>البيانات الخام (debug)</h3>
            <pre style={{ background: "#f5f5f5", padding: 10, maxHeight: 300, overflow: "auto" }}>
              {JSON.stringify(result.raw ?? {}, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </main>
  );
}
