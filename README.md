# Saudi Stock Analyzer (Tadawul Focus)

Professional Next.js dashboard for Saudi equities with unified quote/news APIs, fallback data providers, valuation helpers, and CI.

## Tech stack
- Next.js pages router
- Global CSS (utility-style class usage in JSX)
- Lightweight SVG mini-chart component
- Node test runner for unit coverage

## Environment setup
Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Variables:
- `FINNHUB_KEY`: primary market/news provider
- `TWELVEDATA_KEY`: fallback provider for quote fundamentals
- `NEXT_PUBLIC_APP_NAME`: app title shown in header

## Run locally
```bash
npm install
npm run dev
```

## Build & test
```bash
npm test
npm run build
```

## API endpoints
- `GET /api/stock/[symbol]?source=finnhub|twelvedata`
- `GET /api/news/[symbol]?source=finnhub|twelvedata`

Sample request:
```bash
curl "http://localhost:3000/api/stock/2222"
```

## Deploy
1. Push to GitHub.
2. Import project in Vercel.
3. Add environment variables from `.env.example`.
4. Deploy using default Next.js settings (`vercel.json` included for API cache headers).

## Manual smoke test
1. Open `/`.
2. Search `2222` and verify quote panel + valuation card + trend chart render.
3. Search `AAPL` and verify APIs return JSON.
4. Try invalid symbol and verify clear error state.
