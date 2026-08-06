import { useCallback, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Database,
  Landmark,
  Loader2,
  Play,
  SlidersHorizontal,
  Terminal,
  Trophy,
  Vote,
  Zap,
} from 'lucide-react'

import './App.css'
import { DiagnosticCharts } from '@/components/charts/DiagnosticCharts'
import { PcaScatter3d } from '@/components/charts/PcaScatter3d'
import { MarketSelector } from '@/components/MarketSelector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DEFAULT_UNIVERSE_IDS,
  INITIAL_SERIES_PER_UNIVERSE,
  MARKET_UNIVERSES,
  MAX_DISCOVERED_MARKETS,
  MAX_HISTORY_START_TS,
  MAX_KALSHI_BATCH_CANDLESTICKS,
  MAX_MARKETS_PER_SERIES,
  MAX_SELECTED_MARKETS,
  SHOW_MORE_SERIES_STEP,
  type MarketUniverse,
  type MarketUniverseId,
  marketDisplayName,
  shortMarketName,
  universeById,
} from '@/config/marketUniverses'
import { buildMarketDataset, type MarketDataset } from '@/features/analytics/marketDataset'
import { runPca, type PcaResult } from '@/features/analytics/pca'
import { runComponentRegression } from '@/features/analytics/regression'
import {
  fetchMarketCandlesticks,
  fetchMarketsForSeries,
  fetchSeriesByCategory,
  formatContracts,
  marketSearchText,
  parseDollar,
} from '@/services/kalshiApi'
import type { CandlestickPeriod, KalshiMarket, KalshiSeries } from '@/types/kalshi'

type AnalysisState = {
  dataset: MarketDataset
  pca: PcaResult
  generatedAt: string
  historyLabel: string
  periodInterval: CandlestickPeriod
}

const HISTORY_OPTIONS = [
  { label: 'Max available', value: 'max' },
  { label: '3Y', value: '1095' },
  { label: '1Y', value: '365' },
  { label: '90D', value: '90' },
] as const
type HistoryWindow = (typeof HISTORY_OPTIONS)[number]['value']

const PERIOD_OPTIONS: Array<{ label: string; value: CandlestickPeriod }> = [
  { label: '1D', value: 1440 },
  { label: '1H', value: 60 },
]
const UNIVERSE_ICONS: Record<MarketUniverseId, LucideIcon> = {
  elections: Vote,
  politics: Landmark,
  sports: Trophy,
  economics: Activity,
  finance: CircleDollarSign,
}
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
})
const seriesCache = new Map<MarketUniverseId, KalshiSeries[]>()
const marketsBySeriesCache = new Map<string, KalshiMarket[]>()

function marketVolumeScore(market: KalshiMarket) {
  return parseDollar(market.volume_24h_fp) ?? parseDollar(market.volume_fp) ?? 0
}

function sortMarkets(markets: KalshiMarket[]) {
  const universeOrder = new Map(MARKET_UNIVERSES.map((universe, index) => [universe.name, index]))

  return [...markets].sort((a, b) => {
    const groupDelta = (universeOrder.get(a.category ?? '') ?? 99) - (universeOrder.get(b.category ?? '') ?? 99)

    if (groupDelta !== 0) {
      return groupDelta
    }

    const volumeDelta = marketVolumeScore(b) - marketVolumeScore(a)

    if (volumeDelta !== 0) {
      return volumeDelta
    }

    return marketDisplayName(a).localeCompare(marketDisplayName(b))
  })
}

function historyLabel(value: HistoryWindow) {
  return HISTORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Max available'
}

function capStartToKalshiLimit({
  requestedStartTs,
  endTs,
  marketCount,
  periodInterval,
}: {
  requestedStartTs: number
  endTs: number
  marketCount: number
  periodInterval: CandlestickPeriod
}) {
  const intervalSeconds = periodInterval * 60
  const candlesPerMarket = Math.max(1, Math.floor(MAX_KALSHI_BATCH_CANDLESTICKS / marketCount))
  const cappedStartTs = endTs - Math.max(candlesPerMarket - 1, 1) * intervalSeconds

  return {
    startTs: Math.max(requestedStartTs, cappedStartTs),
    wasCapped: requestedStartTs < cappedStartTs,
    candlesPerMarket,
  }
}

function historyCandidates(
  value: HistoryWindow,
  endTs: number,
  marketCount: number,
  periodInterval: CandlestickPeriod,
) {
  const withLimit = (label: string, requestedStartTs: number) => {
    const capped = capStartToKalshiLimit({
      requestedStartTs,
      endTs,
      marketCount,
      periodInterval,
    })

    return {
      label: capped.wasCapped
        ? `${label} capped at ${capped.candlesPerMarket.toLocaleString()} candles/market`
        : label,
      startTs: capped.startTs,
    }
  }

  if (value !== 'max') {
    const days = Number(value)

    return [withLimit(historyLabel(value), endTs - days * 24 * 60 * 60)]
  }

  return [
    withLimit('Max available', MAX_HISTORY_START_TS),
    withLimit('3Y fallback', endTs - 1095 * 24 * 60 * 60),
    withLimit('1Y fallback', endTs - 365 * 24 * 60 * 60),
  ]
}

function categorySummary(ids: MarketUniverseId[]) {
  return ids.map((id) => universeById(id)?.name).filter(Boolean).join(', ')
}

function formatExplained(value?: number) {
  return percentFormatter.format(value ?? 0)
}

async function getSeriesForUniverse(universe: MarketUniverse) {
  const cachedSeries = seriesCache.get(universe.id)

  if (cachedSeries) {
    return cachedSeries
  }

  const series = (await fetchSeriesByCategory({ category: universe.apiCategory }))
    .filter((entry) => (universe.includeSeries ? universe.includeSeries(entry) : true))
    .sort((a, b) => (parseDollar(b.volume_fp) ?? 0) - (parseDollar(a.volume_fp) ?? 0))
    .slice(0, universe.maxSeries)

  seriesCache.set(universe.id, series)

  return series
}

async function getMarketsForSeries(entry: KalshiSeries, universe: MarketUniverse) {
  const cachedMarkets = marketsBySeriesCache.get(entry.ticker)

  if (cachedMarkets) {
    return cachedMarkets
  }

  const markets = (await fetchMarketsForSeries(entry.ticker))
    .slice(0, MAX_MARKETS_PER_SERIES)
    .map((market) => ({
      ...market,
      category: universe.name,
      series_ticker: market.series_ticker ?? entry.ticker,
    }))

  marketsBySeriesCache.set(entry.ticker, markets)

  return markets
}

async function discoverUniverseMarkets(universe: MarketUniverse, seriesLimit: number) {
  const series = (await getSeriesForUniverse(universe)).slice(
    0,
    Math.min(seriesLimit, universe.maxSeries),
  )
  const markets: KalshiMarket[] = []

  for (const entry of series) {
    markets.push(...(await getMarketsForSeries(entry, universe)))
  }

  return markets
}

function formatDecimal(value?: number) {
  if (value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return decimalFormatter.format(value)
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-medium text-foreground">{value}</div>
          {detail ? <div className="truncate text-xs text-muted-foreground">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function UniverseSelector({
  selectedUniverseIds,
  loading,
  loadedUniverseIds,
  seriesLimit,
  onToggle,
  onLoad,
}: {
  selectedUniverseIds: MarketUniverseId[]
  loading: boolean
  loadedUniverseIds: MarketUniverseId[]
  seriesLimit: number
  onToggle: (id: MarketUniverseId) => void
  onLoad: () => void
}) {
  const selected = new Set(selectedUniverseIds)
  const loaded = loadedUniverseIds.length ? categorySummary(loadedUniverseIds) : 'none loaded'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Categories</CardTitle>
        <CardDescription>Choose a universe, then load market names</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          {MARKET_UNIVERSES.map((universe) => {
            const Icon = UNIVERSE_ICONS[universe.id]

            return (
              <label
                key={universe.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/50 p-3 transition-colors hover:bg-accent/10 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/10"
              >
                <input
                  type="checkbox"
                  checked={selected.has(universe.id)}
                  onChange={() => onToggle(universe.id)}
                  className="mt-1 rounded border-input bg-background text-primary focus:ring-ring"
                />
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{universe.name}</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {universe.description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={onLoad}
          disabled={!selectedUniverseIds.length || loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : <Database />}
          Load Market Names
        </Button>
        <div className="font-mono text-[11px] uppercase text-muted-foreground">
          Loaded: {loaded} / {seriesLimit} series each
        </div>
      </CardContent>
    </Card>
  )
}

function App() {
  const [markets, setMarkets] = useState<KalshiMarket[]>([])
  const [selectedTickers, setSelectedTickers] = useState<string[]>([])
  const [selectedRegressionTicker, setSelectedRegressionTicker] = useState('')
  const [selectedUniverseIds, setSelectedUniverseIds] =
    useState<MarketUniverseId[]>(DEFAULT_UNIVERSE_IDS)
  const [loadedUniverseIds, setLoadedUniverseIds] = useState<MarketUniverseId[]>([])
  const [seriesLimit, setSeriesLimit] = useState(INITIAL_SERIES_PER_UNIVERSE)
  const [search, setSearch] = useState('')
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('max')
  const [periodInterval, setPeriodInterval] = useState<CandlestickPeriod>(1440)
  const [loadingMarkets, setLoadingMarkets] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null)

  const selectedUniverseMaxSeries = useMemo(() => {
    return Math.max(
      INITIAL_SERIES_PER_UNIVERSE,
      ...selectedUniverseIds.map((id) => universeById(id)?.maxSeries ?? 0),
    )
  }, [selectedUniverseIds])

  const loadMarkets = useCallback(async (nextSeriesLimit = seriesLimit) => {
    setLoadingMarkets(true)
    setError('')

    try {
      const universes = selectedUniverseIds
        .map((id) => universeById(id))
        .filter((universe): universe is MarketUniverse => Boolean(universe))
      const discoveredMarkets: KalshiMarket[] = []

      for (const universe of universes) {
        discoveredMarkets.push(...(await discoverUniverseMarkets(universe, nextSeriesLimit)))
      }

      const byTicker = new Map<string, KalshiMarket>()

      discoveredMarkets.forEach((market) => {
        byTicker.set(market.ticker, market)
      })

      const nextMarkets = sortMarkets(Array.from(byTicker.values())).slice(0, MAX_DISCOVERED_MARKETS)
      const nextTickers = new Set(nextMarkets.map((market) => market.ticker))

      setMarkets(nextMarkets)
      setSelectedTickers((current) => {
        const preserved = current.filter((ticker) => nextTickers.has(ticker))

        return preserved.length ? preserved : nextMarkets.map((market) => market.ticker)
      })
      setSelectedRegressionTicker((current) =>
        current && nextTickers.has(current) ? current : nextMarkets[0]?.ticker || '',
      )
      setLoadedUniverseIds(selectedUniverseIds)
      setSeriesLimit(nextSeriesLimit)
      setAnalysis(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load markets.')
    } finally {
      setLoadingMarkets(false)
    }
  }, [selectedUniverseIds, seriesLimit])

  const showMoreMarkets = useCallback(() => {
    const nextSeriesLimit = Math.min(
      seriesLimit + SHOW_MORE_SERIES_STEP,
      selectedUniverseMaxSeries,
    )

    void loadMarkets(nextSeriesLimit)
  }, [loadMarkets, selectedUniverseMaxSeries, seriesLimit])

  const toggleUniverse = useCallback((id: MarketUniverseId) => {
    setSelectedUniverseIds((current) => {
      const next = current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]

      return next
    })
    setMarkets([])
    setSelectedTickers([])
    setSelectedRegressionTicker('')
    setLoadedUniverseIds([])
    setSeriesLimit(INITIAL_SERIES_PER_UNIVERSE)
    setAnalysis(null)
    setError('')
  }, [])

  const filteredMarkets = useMemo(() => {
    const needle = search.trim().toLowerCase()

    if (!needle) {
      return markets
    }

    return markets.filter((market) =>
      `${marketSearchText(market)} ${marketDisplayName(market)}`
        .toLowerCase()
        .includes(needle),
    )
  }, [markets, search])

  const selectedMarkets = useMemo(() => {
    const byTicker = new Map(markets.map((market) => [market.ticker, market]))

    return selectedTickers
      .map((ticker) => byTicker.get(ticker))
      .filter((market): market is KalshiMarket => Boolean(market))
  }, [markets, selectedTickers])

  const runAnalysis = useCallback(async () => {
    if (selectedMarkets.length < 3) {
      setError('PCA requires at least 3 selected markets.')

      return
    }

    setAnalysisLoading(true)
    setError('')

    try {
      const endTs = Math.floor(Date.now() / 1000)
      const tickers = selectedMarkets.map((market) => market.ticker)
      let candleData: Awaited<ReturnType<typeof fetchMarketCandlesticks>> | null = null
      let usedHistoryLabel: string = historyLabel(historyWindow)
      let lastError: unknown = null

      for (const candidate of historyCandidates(
        historyWindow,
        endTs,
        selectedMarkets.length,
        periodInterval,
      )) {
        try {
          candleData = await fetchMarketCandlesticks({
            tickers,
            startTs: candidate.startTs,
            endTs,
            periodInterval,
          })
          usedHistoryLabel = candidate.label
          break
        } catch (candidateError) {
          lastError = candidateError
        }
      }

      if (!candleData) {
        throw lastError instanceof Error ? lastError : new Error('Unable to load candlesticks.')
      }

      const dataset = buildMarketDataset(selectedMarkets, candleData)
      const pca = runPca(dataset.matrix, dataset.tickers, 3)

      setAnalysis({
        dataset,
        pca,
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        historyLabel: usedHistoryLabel,
        periodInterval,
      })
      setSelectedRegressionTicker((current) =>
        dataset.tickers.includes(current) ? current : dataset.tickers[0],
      )
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Analysis failed.')
    } finally {
      setAnalysisLoading(false)
    }
  }, [historyWindow, periodInterval, selectedMarkets])

  const regressionState = useMemo(() => {
    if (!analysis) {
      return { regression: null, error: '' }
    }

    const marketIndex = analysis.dataset.tickers.indexOf(selectedRegressionTicker)

    if (marketIndex < 0) {
      return { regression: null, error: 'Select a regression target.' }
    }

    try {
      return {
        regression: runComponentRegression(
          analysis.dataset.matrix.map((row) => row[marketIndex]),
          analysis.pca.scores,
          analysis.dataset.observations.map((observation) => observation.label),
        ),
        error: '',
      }
    } catch (regressionError) {
      return {
        regression: null,
        error: regressionError instanceof Error ? regressionError.message : 'Regression failed.',
      }
    }
  }, [analysis, selectedRegressionTicker])

  const selectedVolume = selectedMarkets.reduce(
    (total, market) => total + marketVolumeScore(market),
    0,
  )
  const canRun = selectedMarkets.length >= 3 && !analysisLoading
  const activeTarget = selectedMarkets.find((market) => market.ticker === selectedRegressionTicker)

  return (
    <div className="terminal-grid min-h-screen">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-4">
        <header className="flex flex-col justify-between gap-4 border-b border-border/80 pb-4 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <Badge className="border-primary/40 bg-primary/10 text-primary">public kalshi api</Badge>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary shadow-[0_0_36px_rgb(57_255_136/0.2)]">
                <Terminal className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-medium tracking-normal text-foreground">
                  PREDICT HUB
                </h1>
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  pick categories / select markets / run component analysis
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-mono text-xs uppercase text-muted-foreground">
              History
              <select
                value={historyWindow}
                onChange={(event) => setHistoryWindow(event.target.value as HistoryWindow)}
                className="h-9 rounded-md border border-input bg-background px-2 text-foreground focus:ring-ring"
              >
                {HISTORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 font-mono text-xs uppercase text-muted-foreground">
              Interval
              <select
                value={periodInterval}
                onChange={(event) => setPeriodInterval(Number(event.target.value) as CandlestickPeriod)}
                className="h-9 rounded-md border border-input bg-background px-2 text-foreground focus:ring-ring"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={runAnalysis} disabled={!canRun}>
              {analysisLoading ? <Loader2 className="animate-spin" /> : <Play />}
              Run PCA
            </Button>
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <main className="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <UniverseSelector
              selectedUniverseIds={selectedUniverseIds}
              loading={loadingMarkets}
              loadedUniverseIds={loadedUniverseIds}
              onToggle={toggleUniverse}
              onLoad={() => void loadMarkets(INITIAL_SERIES_PER_UNIVERSE)}
              seriesLimit={seriesLimit}
            />
            <MarketSelector
              markets={filteredMarkets}
              selectedTickers={selectedTickers}
              search={search}
              loading={loadingMarkets}
              loadedCategoryLabel={loadedUniverseIds.length ? categorySummary(loadedUniverseIds) : ''}
              maxSelected={MAX_SELECTED_MARKETS}
              canShowMore={loadedUniverseIds.length > 0 && seriesLimit < selectedUniverseMaxSeries}
              showMoreLabel={`Show More (${Math.min(
                seriesLimit + SHOW_MORE_SERIES_STEP,
                selectedUniverseMaxSeries,
              )}/${selectedUniverseMaxSeries} series)`}
              onSearchChange={setSearch}
              onRefresh={() => void loadMarkets(seriesLimit)}
              onSelectTop={() => setSelectedTickers(markets.map((market) => market.ticker))}
              onClear={() => setSelectedTickers([])}
              onShowMore={showMoreMarkets}
              onToggle={(ticker) =>
                setSelectedTickers((current) =>
                  current.includes(ticker)
                    ? current.filter((selectedTicker) => selectedTicker !== ticker)
                    : current.length >= MAX_SELECTED_MARKETS
                      ? current
                      : [...current, ticker],
                )
              }
            />
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatTile
                icon={Database}
                label="Markets"
                value={String(selectedMarkets.length)}
                detail={`volume ${formatContracts(String(selectedVolume))}`}
              />
              <StatTile
                icon={Activity}
                label="Observations"
                value={analysis ? String(analysis.dataset.observations.length) : '--'}
                detail={
                  analysis
                    ? `${analysis.dataset.source === 'candlesticks' ? 'candles' : 'quote snapshot'} / ${analysis.historyLabel}`
                    : 'pending'
                }
              />
              <StatTile
                icon={Zap}
                label="Top variance"
                value={analysis ? formatExplained(analysis.pca.explainedVariance[0]) : '--'}
                detail={analysis ? `PC2 ${formatExplained(analysis.pca.explainedVariance[1])}` : 'pending'}
              />
              <StatTile
                icon={BarChart3}
                label="Regression R2"
                value={
                  regressionState.regression ? formatDecimal(regressionState.regression.rSquared) : '--'
                }
                detail={activeTarget ? shortMarketName(activeTarget) : 'target'}
              />
            </div>

            <Card>
              <CardHeader className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <CardTitle>Principal Components</CardTitle>
                  <CardDescription>
                    {analysis
                      ? `generated ${analysis.generatedAt} from ${analysis.dataset.source}`
                      : `${selectedMarkets.length} markets staged`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {analysis?.pca.explainedVariance.slice(0, 3).map((value, index) => (
                    <Badge key={index} className="border-accent/40 bg-accent/10 text-foreground">
                      PC{index + 1} {formatExplained(value)}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {analysis?.dataset.notes.length ? (
                  <div className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-muted-foreground">
                    {analysis.dataset.notes.join(' ')}
                  </div>
                ) : null}
                {analysis ? (
                  <PcaScatter3d dataset={analysis.dataset} pca={analysis.pca} />
                ) : (
                  <div className="flex h-[430px] items-center justify-center rounded-lg border border-border bg-background/55">
                    <div className="text-center">
                      <SlidersHorizontal className="mx-auto mb-3 size-8 text-primary" />
                      <div className="font-mono text-sm uppercase text-muted-foreground">PCA idle</div>
                      <div className="mt-1 text-sm text-muted-foreground">No component scores yet</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-base font-medium tracking-normal text-foreground">
                    Regression Diagnostics
                  </h2>
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    residual checks / component model
                  </p>
                </div>
                <label className="flex items-center gap-2 font-mono text-xs uppercase text-muted-foreground">
                  Target
                  <select
                    value={selectedRegressionTicker}
                    onChange={(event) => setSelectedRegressionTicker(event.target.value)}
                    disabled={!analysis}
                    className="h-9 max-w-[280px] rounded-md border border-input bg-background px-2 text-foreground focus:ring-ring disabled:opacity-45"
                  >
                    {(analysis?.dataset.markets ?? selectedMarkets).map((market) => (
                      <option key={market.ticker} value={market.ticker}>
                        {marketDisplayName(market)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {regressionState.error ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive">
                  {regressionState.error}
                </div>
              ) : null}

              {regressionState.regression ? (
                <DiagnosticCharts regression={regressionState.regression} />
              ) : (
                <Card>
                  <CardContent className="flex h-64 items-center justify-center text-center">
                    <div>
                      <BarChart3 className="mx-auto mb-3 size-8 text-primary" />
                      <div className="font-mono text-sm uppercase text-muted-foreground">
                        Diagnostics idle
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">No residual series yet</div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
