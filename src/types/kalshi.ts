export type KalshiMarket = {
  ticker: string
  event_ticker: string
  series_ticker?: string
  title: string
  subtitle?: string
  yes_sub_title?: string
  no_sub_title?: string
  category?: string
  status: string
  close_time?: string
  open_time?: string
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  no_bid_dollars?: string
  no_ask_dollars?: string
  last_price_dollars?: string
  volume_fp?: string
  volume_24h_fp?: string
  open_interest_fp?: string
}

export type KalshiMarketsResponse = {
  markets: KalshiMarket[]
  cursor?: string
}

export type KalshiSeries = {
  ticker: string
  title: string
  category?: string
  tags?: string[] | null
  volume_fp?: string
  last_updated_ts?: string
}

export type KalshiSeriesResponse = {
  series: KalshiSeries[]
  cursor?: string
}

export type KalshiPriceBlock = {
  open_dollars?: string | null
  low_dollars?: string | null
  high_dollars?: string | null
  close_dollars?: string | null
  mean_dollars?: string | null
  previous_dollars?: string | null
  open?: string | null
  low?: string | null
  high?: string | null
  close?: string | null
  mean?: string | null
  previous?: string | null
}

export type KalshiCandlestick = {
  end_period_ts: number
  yes_bid?: KalshiPriceBlock
  yes_ask?: KalshiPriceBlock
  price?: KalshiPriceBlock
  volume_fp?: string
  volume?: string
  open_interest_fp?: string
  open_interest?: string
}

export type KalshiMarketCandlesticks = {
  market_ticker: string
  ticker?: string
  candlesticks: KalshiCandlestick[]
}

export type KalshiBatchCandlesticksResponse = {
  markets: KalshiMarketCandlesticks[]
}

export type CandlestickPeriod = 1 | 60 | 1440
