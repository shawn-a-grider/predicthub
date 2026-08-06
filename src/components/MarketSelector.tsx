import { RefreshCw, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { marketOutcomeName, shortMarketName } from '@/config/marketUniverses'
import { formatContracts, formatPrice } from '@/services/kalshiApi'
import type { KalshiMarket } from '@/types/kalshi'

type MarketSelectorProps = {
  markets: KalshiMarket[]
  selectedTickers: string[]
  search: string
  loading: boolean
  loadedCategoryLabel: string
  maxSelected: number
  canShowMore: boolean
  showMoreLabel: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  onToggle: (ticker: string) => void
  onSelectTop: () => void
  onClear: () => void
  onShowMore: () => void
}

export function MarketSelector({
  markets,
  selectedTickers,
  search,
  loading,
  loadedCategoryLabel,
  maxSelected,
  canShowMore,
  showMoreLabel,
  onSearchChange,
  onRefresh,
  onToggle,
  onSelectTop,
  onClear,
  onShowMore,
}: MarketSelectorProps) {
  const selected = new Set(selectedTickers)
  const limitReached = selectedTickers.length >= maxSelected

  return (
    <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Markets</CardTitle>
            <CardDescription>
              {loadedCategoryLabel
                ? `${selectedTickers.length}/${maxSelected} selected`
                : 'Choose categories above first'}
            </CardDescription>
          </div>
          <Button type="button" size="icon" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            <span className="sr-only">Refresh markets</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search market names"
              className="pl-9"
              disabled={!loadedCategoryLabel}
            />
          </div>
          <Button type="button" variant="secondary" onClick={onSelectTop} disabled={!markets.length}>
            All
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClear} disabled={!selectedTickers.length}>
            <X />
            <span className="sr-only">Clear selected markets</span>
          </Button>
        </div>

        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {!loadedCategoryLabel ? (
            <div className="rounded-md border border-border bg-background/50 p-4 text-sm text-muted-foreground">
              Pick one or more categories, then load market names. Candlestick data is fetched only
              when you run PCA.
            </div>
          ) : null}

          {loadedCategoryLabel && !markets.length ? (
            <div className="rounded-md border border-border bg-background/50 p-4 text-sm text-muted-foreground">
              No markets matched the current category/search filter.
            </div>
          ) : null}

          {markets.map((market) => {
            const isSelected = selected.has(market.ticker)
            const disabled = !isSelected && limitReached

            return (
              <label
                key={market.ticker}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-background/50 p-3 transition-colors hover:bg-accent/10 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggle(market.ticker)}
                  className="mt-1 rounded border-input bg-background text-primary focus:ring-ring"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="line-clamp-2 min-w-0 text-sm font-medium leading-5 text-foreground">
                      {shortMarketName(market)}
                    </span>
                    <Badge>{formatPrice(market.last_price_dollars ?? market.yes_bid_dollars)}</Badge>
                  </span>
                  <span className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {marketOutcomeName(market)}
                  </span>
                  <span className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase text-muted-foreground">
                    <span>{market.category ?? 'Kalshi'}</span>
                    <span>vol {formatContracts(market.volume_24h_fp ?? market.volume_fp)}</span>
                    <span>{market.ticker}</span>
                  </span>
                </span>
              </label>
            )
          })}

          {canShowMore ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={onShowMore}
              disabled={loading}
            >
              {loading ? <RefreshCw className="animate-spin" /> : null}
              {showMoreLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
