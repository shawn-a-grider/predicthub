import type { KalshiMarket, KalshiSeries } from '@/types/kalshi'

export type MarketUniverseId = 'elections' | 'politics' | 'sports' | 'economics' | 'finance'

export type MarketUniverse = {
  id: MarketUniverseId
  name: string
  apiCategory: string
  description: string
  maxSeries: number
  includeSeries?: (series: KalshiSeries) => boolean
}

const sportsNeedle = /\bNFL\b|\bNBA\b|KXNFL|KXNBA|National Football League|National Basketball Association/i
const excludedSportsNeedle = /\bWNBA\b|\bNCAA\b|college|MLB|NHL|soccer|tennis|cricket|golf|nascar/i

export const MARKET_UNIVERSES: MarketUniverse[] = [
  {
    id: 'elections',
    name: 'Elections',
    apiCategory: 'Elections',
    description: 'Election, nomination, turnout, and race markets',
    maxSeries: 8,
  },
  {
    id: 'politics',
    name: 'Politics',
    apiCategory: 'Politics',
    description: 'Government, policy, approvals, and political events',
    maxSeries: 8,
  },
  {
    id: 'sports',
    name: 'Sports: NFL + NBA',
    apiCategory: 'Sports',
    description: 'Only NFL and NBA series from Kalshi Sports',
    maxSeries: 10,
    includeSeries: (series) => {
      const text = seriesSearchText(series)

      return sportsNeedle.test(text) && !excludedSportsNeedle.test(text)
    },
  },
  {
    id: 'economics',
    name: 'Economics',
    apiCategory: 'Economics',
    description: 'Rates, inflation, macro, labor, and central-bank markets',
    maxSeries: 10,
  },
  {
    id: 'finance',
    name: 'Finance',
    apiCategory: 'Financials',
    description: 'Index, yield, crypto, equity, and market-move contracts',
    maxSeries: 10,
  },
]

export const DEFAULT_UNIVERSE_IDS: MarketUniverseId[] = ['economics']
export const MAX_SELECTED_MARKETS = 36
export const INITIAL_SERIES_PER_UNIVERSE = 3
export const SHOW_MORE_SERIES_STEP = 3
export const MAX_MARKETS_PER_SERIES = 32
export const MAX_DISCOVERED_MARKETS = 260
export const MAX_HISTORY_START_TS = Math.floor(Date.UTC(2019, 0, 1) / 1000)
export const MAX_KALSHI_BATCH_CANDLESTICKS = 10_000

export function universeById(id: MarketUniverseId) {
  return MARKET_UNIVERSES.find((universe) => universe.id === id)
}

export function seriesSearchText(series: KalshiSeries) {
  return [
    series.ticker,
    series.title,
    series.category,
    ...(series.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
}

export function marketDisplayName(market: KalshiMarket) {
  const category = market.category ? `${market.category}: ` : ''
  const action = market.yes_sub_title || market.subtitle

  if (action && !market.title.toLowerCase().includes(action.toLowerCase())) {
    return `${category}${market.title} / ${action}`
  }

  return `${category}${market.title || action || market.ticker}`
}

export function shortMarketName(market: KalshiMarket) {
  return market.title || market.yes_sub_title || market.subtitle || market.ticker
}

export function marketOutcomeName(market: KalshiMarket) {
  return market.yes_sub_title || market.subtitle || market.ticker
}
