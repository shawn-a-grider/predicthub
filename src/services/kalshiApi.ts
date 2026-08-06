import type {
  CandlestickPeriod,
  KalshiBatchCandlesticksResponse,
  KalshiMarket,
  KalshiMarketCandlesticks,
  KalshiMarketsResponse,
  KalshiSeries,
  KalshiSeriesResponse,
} from '@/types/kalshi'

const API_BASE = import.meta.env.VITE_KALSHI_API_BASE ?? '/kalshi-api'
const REQUEST_CONCURRENCY = 2
const REQUEST_SPACING_MS = 300
const MAX_RETRIES = 3
const RETRY_BASE_MS = 900

let activeRequests = 0
let lastRequestStartedAt = 0
const requestQueue: Array<() => void> = []

type MarketQuery = {
  status?: 'unopened' | 'open' | 'closed' | 'settled'
  limit?: number
  cursor?: string
  seriesTicker?: string
}

type CandleQuery = {
  tickers: string[]
  startTs: number
  endTs: number
  periodInterval: CandlestickPeriod
}

type SeriesQuery = {
  category: string
  limit?: number
  cursor?: string
}

function withParams(path: string, params: Record<string, string | number | boolean>) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  })

  return url.origin === window.location.origin ? url.pathname + url.search : url.toString()
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function pumpQueue() {
  if (activeRequests >= REQUEST_CONCURRENCY || !requestQueue.length) {
    return
  }

  const next = requestQueue.shift()

  if (!next) {
    return
  }

  activeRequests += 1

  const delay = Math.max(0, lastRequestStartedAt + REQUEST_SPACING_MS - Date.now())

  window.setTimeout(() => {
    lastRequestStartedAt = Date.now()
    next()
  }, delay)
}

function queuedFetch(path: string) {
  return new Promise<Response>((resolve, reject) => {
    requestQueue.push(() => {
      fetch(path, {
        headers: {
          accept: 'application/json',
        },
      })
        .then(resolve, reject)
        .finally(() => {
          activeRequests -= 1
          pumpQueue()
        })
    })

    pumpQueue()
  })
}

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await queuedFetch(path)

    if (response.ok) {
      return response.json() as Promise<T>
    }

    const message = await response.text()

    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * 2 ** attempt)
      continue
    }

    throw new Error(`Kalshi request failed (${response.status}): ${message}`)
  }

  throw new Error('Kalshi request failed after retries.')
}

export async function fetchOpenMarkets({
  status = 'open',
  limit = 100,
  cursor,
  seriesTicker,
}: MarketQuery = {}): Promise<KalshiMarket[]> {
  const path = withParams('/markets', {
    status,
    limit: Math.min(Math.max(limit, 1), 1000),
    cursor: cursor ?? '',
    series_ticker: seriesTicker ?? '',
  })
  const data = await getJson<KalshiMarketsResponse>(path)

  return data.markets ?? []
}

export async function fetchMarketsForSeries(seriesTicker: string) {
  return fetchOpenMarkets({ seriesTicker, limit: 1000 })
}

export async function fetchSeriesByCategory({
  category,
  limit = 1000,
  cursor,
}: SeriesQuery): Promise<KalshiSeries[]> {
  const path = withParams('/series', {
    category,
    limit: Math.min(Math.max(limit, 1), 1000),
    cursor: cursor ?? '',
    include_volume: true,
  })
  const data = await getJson<KalshiSeriesResponse>(path)

  return data.series ?? []
}

export async function fetchMarketCandlesticks({
  tickers,
  startTs,
  endTs,
  periodInterval,
}: CandleQuery): Promise<Map<string, KalshiMarketCandlesticks>> {
  if (!tickers.length) {
    return new Map()
  }

  const path = withParams('/markets/candlesticks', {
    market_tickers: tickers.slice(0, 100).join(','),
    start_ts: startTs,
    end_ts: endTs,
    period_interval: periodInterval,
    include_latest_before_start: true,
  })
  const data = await getJson<KalshiBatchCandlesticksResponse>(path)
  const byTicker = new Map<string, KalshiMarketCandlesticks>()

  data.markets?.forEach((entry) => {
    byTicker.set(entry.market_ticker, entry)
  })

  return byTicker
}

export function parseDollar(value?: string | null) {
  if (!value) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

export function formatPrice(value?: string | null) {
  const parsed = parseDollar(value)

  return parsed === null ? '--' : `${Math.round(parsed * 100)}c`
}

export function formatContracts(value?: string | null) {
  const parsed = parseDollar(value)

  if (parsed === null) {
    return '--'
  }

  return Intl.NumberFormat('en-US', {
    notation: parsed >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: parsed >= 10_000 ? 1 : 0,
  }).format(parsed)
}

export function marketSearchText(market: KalshiMarket) {
  return [
    market.ticker,
    market.event_ticker,
    market.series_ticker,
    market.title,
    market.subtitle,
    market.yes_sub_title,
    market.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
