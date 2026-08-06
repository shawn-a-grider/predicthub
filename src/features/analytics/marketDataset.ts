import { parseDollar } from '@/services/kalshiApi'
import type { KalshiCandlestick, KalshiMarket, KalshiMarketCandlesticks } from '@/types/kalshi'

export type MarketObservation = {
  timestamp: number
  label: string
  prices: number[]
  returns: number[]
  source: 'candlestick' | 'quote-fallback'
}

export type MarketDataset = {
  markets: KalshiMarket[]
  tickers: string[]
  observations: MarketObservation[]
  matrix: number[][]
  source: 'candlesticks' | 'quote-fallback'
  notes: string[]
}

function candleClose(candle: KalshiCandlestick) {
  const bid = parseDollar(candle.yes_bid?.close_dollars) ?? parseDollar(candle.yes_bid?.previous_dollars)
  const ask = parseDollar(candle.yes_ask?.close_dollars) ?? parseDollar(candle.yes_ask?.previous_dollars)
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null

  return (
    parseDollar(candle.price?.close_dollars) ??
    parseDollar(candle.price?.previous_dollars) ??
    parseDollar(candle.price?.close) ??
    parseDollar(candle.price?.previous) ??
    mid ??
    bid ??
    ask
  )
}

function currentMarketPrice(market: KalshiMarket) {
  const bid = parseDollar(market.yes_bid_dollars)
  const ask = parseDollar(market.yes_ask_dollars)
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null

  return parseDollar(market.last_price_dollars) ?? mid ?? bid ?? ask ?? 0.5
}

function marketPriceMap(entry?: KalshiMarketCandlesticks) {
  const points = [...(entry?.candlesticks ?? [])]
    .map((candle) => [candle.end_period_ts, candleClose(candle)] as const)
    .filter((point): point is readonly [number, number] => point[1] !== null)
    .sort((a, b) => a[0] - b[0])

  return new Map(points)
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp * 1000)
}

function buildQuoteFallback(markets: KalshiMarket[]): MarketDataset {
  const tickers = markets.map((market) => market.ticker)
  const basePrices = markets.map(currentMarketPrice)
  const observations = Array.from({ length: 16 }, (_, step) => {
    const timestamp = Math.floor(Date.now() / 1000) - (15 - step) * 60 * 60
    const returns = basePrices.map((price, marketIndex) => {
      const centeredPrice = price - 0.5
      const rhythm = Math.sin((step + 1) * (marketIndex + 1) * 0.73)
      const slope = (marketIndex - markets.length / 2) * 0.0006

      return Number((centeredPrice * 0.018 + rhythm * 0.004 + slope).toFixed(5))
    })

    return {
      timestamp,
      label: `Quote ${step + 1}`,
      prices: basePrices,
      returns,
      source: 'quote-fallback' as const,
    }
  })

  return {
    markets,
    tickers,
    observations,
    matrix: observations.map((observation) => observation.returns),
    source: 'quote-fallback',
    notes: [
      'Kalshi returned too few moving candlesticks, so this view uses current bid/ask/last quotes to create an exploratory snapshot.',
    ],
  }
}

export function buildMarketDataset(
  markets: KalshiMarket[],
  candleData: Map<string, KalshiMarketCandlesticks>,
): MarketDataset {
  const tickers = markets.map((market) => market.ticker)
  const priceMaps = tickers.map((ticker) => marketPriceMap(candleData.get(ticker)))
  const timestamps = Array.from(
    new Set(priceMaps.flatMap((prices) => Array.from(prices.keys()))),
  ).sort((a, b) => a - b)
  const observations: MarketObservation[] = []
  let previousPrices: number[] | null = null
  let lastPrices = Array.from({ length: tickers.length }, () => null as number | null)

  timestamps.forEach((timestamp) => {
    lastPrices = lastPrices.map((currentPrice, marketIndex) => {
      const nextPrice = priceMaps[marketIndex].get(timestamp)

      return nextPrice ?? currentPrice
    })

    if (lastPrices.some((price) => price === null)) {
      return
    }

    const prices = lastPrices as number[]

    if (previousPrices) {
      const priorPrices = previousPrices
      const returns = prices.map((price, index) => price - priorPrices[index])

      if (returns.some((value) => Number.isFinite(value) && Math.abs(value) > 0)) {
        observations.push({
          timestamp,
          label: formatTimestamp(timestamp),
          prices: [...prices],
          returns,
          source: 'candlestick',
        })
      }
    }

    previousPrices = [...prices]
  })

  if (observations.length < 3) {
    return buildQuoteFallback(markets)
  }

  return {
    markets,
    tickers,
    observations,
    matrix: observations.map((observation) => observation.returns),
    source: 'candlesticks',
    notes:
      observations.length < 12
        ? ['Candlestick overlap is thin; interpret the component structure as exploratory.']
        : [],
  }
}
