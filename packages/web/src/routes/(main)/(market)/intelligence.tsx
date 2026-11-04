import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/app/page-header'
import { DrillDown } from '@/components/intelligence/drill-down'
import { EvidenceList } from '@/components/intelligence/evidence-list'
import { LevelsLadder } from '@/components/intelligence/levels-ladder'
import { MarketStateStrip } from '@/components/intelligence/market-state'
import { ScenarioList } from '@/components/intelligence/scenario-list'
import { StatusBar } from '@/components/intelligence/status-bar'
import { Segmented } from '@/components/segmented'
import { InstrumentSelect } from '@/components/trade/instrument-select'
import type { WidgetKind } from '@/components/workspace/model'
import { HORIZON_CONFIG } from '@/lib/intelligence/horizons'
import { MIN_BARS } from '@/lib/intelligence/market-state'
import { HORIZONS, type Horizon } from '@/lib/intelligence/types'
import { useIntelligence } from '@/lib/intelligence/use-intelligence'
import { DEFAULT_SYMBOL, MARKET_EXCHANGE_NAME, symbolBarSearch } from '@/lib/market'
import { usePortfolio } from '@/lib/queries'

type Search = { symbol?: string; horizon?: Horizon }

export const Route = createFileRoute('/(main)/(market)/intelligence')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    symbol: symbolBarSearch(s).symbol,
    horizon: (HORIZONS as readonly string[]).includes(String(s.horizon)) ? (s.horizon as Horizon) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Market Intelligence · crypz' }] }),
  component: Intelligence,
})

function Intelligence() {
  const data = usePortfolio()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (patch: Search) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true })

  // the instrument you trade most is where the analysis starts, as on the Trade page
  const symbol = search.symbol ?? data.positions[0]?.symbol ?? DEFAULT_SYMBOL
  const horizon = search.horizon ?? '1H'
  const { analysis: a, loading } = useIntelligence(symbol, horizon)

  const [drillOpen, setDrillOpen] = useState(false)
  const [selected, setSelected] = useState<WidgetKind[]>([])
  const drillRef = useRef<HTMLDivElement>(null)
  const open = (kinds: WidgetKind[]) => {
    setSelected(kinds)
    setDrillOpen(true)
    // the panel mounts on this state change; scroll once it is there
    requestAnimationFrame(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <>
      <PageHeader title="Market Intelligence" source={`${MARKET_EXCHANGE_NAME} data`}>
        <InstrumentSelect value={symbol} onChange={(v) => set({ symbol: v })} className="w-40 sm:w-52" />
        <Segmented
          label="Forecast horizon"
          options={HORIZONS}
          value={horizon}
          onChange={(h) => set({ horizon: h })}
          format={(h) => h}
        />
      </PageHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
        <StatusBar a={a} />

        {a.dataQuality.status === 'insufficient' ? (
          <section aria-label="Insufficient data" className="flex flex-col gap-2 border border-border p-6">
            <h2 className="text-base font-medium">{loading ? 'Loading candles…' : 'Insufficient data'}</h2>
            {!loading && (
              <p className="max-w-prose text-sm text-pretty text-muted-foreground">
                The {HORIZON_CONFIG[horizon].bar} candles for {symbol} are missing, stale, or fewer than {MIN_BARS}, so
                nothing is analysed and no scenario is shown. This clears when the feed recovers.
              </p>
            )}
          </section>
        ) : (
          <>
            <MarketStateStrip a={a} />
            <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ScenarioList a={a} />
              <LevelsLadder a={a} />
            </div>
            <EvidenceList a={a} onOpen={open} />
          </>
        )}

        <DrillDown
          symbol={symbol}
          open={drillOpen}
          onToggle={() => setDrillOpen((v) => !v)}
          selected={selected}
          onSelect={setSelected}
          anchor={drillRef}
        />

        <p className="max-w-prose border-t border-border pt-4 text-xs text-pretty text-muted-foreground">
          An analytical aid, not financial advice and not an instruction to buy or sell. Every claim above comes from a
          fixed rule over the data shown; nothing is guaranteed, and resting orders can be cancelled at any moment.
        </p>
      </main>
    </>
  )
}
