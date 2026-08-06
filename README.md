# PREDICT HUB

React + TypeScript + Vite frontend for selecting Kalshi public markets by category, fetching candlestick data only when PCA runs, and reviewing PCA/regression diagnostics.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- shadcn/ui-style local components
- Apache ECharts + ECharts GL
- Lucide React

## Run

```bash
npm install
npm run dev -- --host 127.0.0.1
```

The Vite dev server proxies `/kalshi-api/*` to `https://external-api.kalshi.com/trade-api/v2/*` so browser requests can use the public Kalshi API without CORS friction during local development.

## Current Flow

1. Select one or more market categories:
   - Elections
   - Politics
   - Sports: NFL + NBA only
   - Economics
   - Finance
2. Load market names from the selected categories. This discovers a small first batch of series and markets, but does not fetch candlesticks yet.
3. Select markets by readable names while the app maps names to Kalshi tickers internally.
4. Use Show More to load the next small batch of series only when needed.
5. Run PCA. At this point the app requests candlesticks for the selected markets.
6. Default history is "Max available" and default interval is 1D. Before every candlestick request, the app caps lookback by selected-market count and interval so the batch request stays under Kalshi's 10,000-candlestick limit.
7. Align market prices by timestamp and compute probability-point returns.
8. Run PCA and plot the top 3 component scores in 3D.
9. Select a market and regress its return series on PC1, PC2, and PC3.
10. Render residuals vs fitted, Q-Q, scale-location, and Cook's distance charts.
11. If overlapping candles are too sparse, fall back to a clearly marked quote snapshot so the interface still produces an exploratory view.

## Kalshi Request Control

- All Kalshi requests pass through a shared client-side queue with 2 concurrent requests and a 300ms start gap.
- 429 and 503 responses retry with exponential backoff.
- Series and market discovery are cached in memory so switching back to a loaded universe reuses prior responses.
- Show More increases discovery breadth gradually instead of loading every series in a category at once.

## Extension Points

- `src/config/marketUniverses.ts`: readable category configuration, sports filtering, and discovery limits.
- `src/services/kalshiApi.ts`: Kalshi REST access and data formatting.
- `src/features/analytics/`: reusable PCA, OLS, diagnostics, and market dataset logic.
- `src/components/charts/`: ECharts chart surfaces.
- `src/components/ui/`: shadcn/ui-style primitives.
