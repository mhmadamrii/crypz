import { useEffect, useMemo, useRef, useState } from 'react'
import type { Candle } from '@crypz/exchanges'
import type { IChartApi, IPriceLine, ISeriesApi } from 'lightweight-charts'
import { buildOutlookPaths, type OutlookPath } from '@/lib/intelligence/outlook-paths'
import { SCENARIOS } from '@/lib/intelligence/scenarios'
import type { MarketIntelligence } from '@/lib/intelligence/types'
import { cn } from '@/lib/utils'
import { monoFont, palette, precisionFor, toBar, toChart, type Palette } from '@/components/trade/chart-kit'
import { Section } from './kit'

type Props = { a: MarketIntelligence; candles: Candle[]; className?: string }

const RANK_STYLE: Record<OutlookPath['rank'], { width: 1 | 2 | 3 | 4; opacity: number; dashed: boolean }> = {
  favored: { width: 3, opacity: 1, dashed: false },
  possible: { width: 2, opacity: 0.7, dashed: true },
  less_likely: { width: 1, opacity: 0.4, dashed: true },
}

function toneColor(p: Palette, tone: OutlookPath['tone']) {
  return tone === 'up' ? p.up : tone === 'down' ? p.down : tone === 'risk' ? p.risk : p.muted
}

type ChartHandle = {
  chart: IChartApi
  candleSeries: ISeriesApi<'Candlestick'>
  lines: ISeriesApi<'Line'>[]
  priceLines: IPriceLine[]
}

/**
 * Real candles on the left, a fan of schematic projected paths on the right: one per scenario the engine thinks is
 * applicable right now, favoured one bold and solid, the rest fainter and dashed by rank. Every path starts at the
 * one real point (the live price) and is shaped like its archetype, including the retrace each one has — never a
 * claim about an exact future price.
 */
export function OutlookChart({ a, candles, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartHandle | null>(null)
  const [ready, setReady] = useState(false)
  const paths = useMemo(() => buildOutlookPaths(a), [a])

  // 1. Create the chart once.
  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    ;(async () => {
      const lw = await import('lightweight-charts')
      if (disposed || !box.current) return
      const p = palette()
      const chart = lw.createChart(box.current, {
        autoSize: true,
        layout: {
          background: { type: lw.ColorType.Solid, color: 'transparent' },
          textColor: p.muted,
          fontFamily: monoFont(),
          fontSize: 11,
          attributionLogo: false,
        },
        grid: { vertLines: { color: p.hairline }, horzLines: { color: p.hairline } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border, secondsVisible: false, rightOffset: 2 },
        crosshair: { mode: lw.CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      })
      const candleSeries = chart.addSeries(lw.CandlestickSeries, {
        upColor: p.up,
        downColor: p.down,
        borderUpColor: p.up,
        borderDownColor: p.down,
        wickUpColor: p.up,
        wickDownColor: p.down,
      })
      candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } })
      chartRef.current = { chart, candleSeries, lines: [], priceLines: [] }

      const observer = new MutationObserver(() => {
        const q = palette()
        chart.applyOptions({
          layout: { textColor: q.muted },
          grid: { vertLines: { color: q.hairline }, horzLines: { color: q.hairline } },
        })
        candleSeries.applyOptions({
          upColor: q.up,
          downColor: q.down,
          borderUpColor: q.up,
          borderDownColor: q.down,
          wickUpColor: q.up,
          wickDownColor: q.down,
        })
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      dispose = () => {
        observer.disconnect()
        chart.remove()
      }
      setReady(true)
    })()
    return () => {
      disposed = true
      dispose()
      chartRef.current = null
    }
  }, [])

  // 2. Candles.
  useEffect(() => {
    const c = chartRef.current
    if (!c || !candles.length) return
    c.candleSeries.applyOptions({ priceFormat: precisionFor(candles.at(-1)!.close) })
    c.candleSeries.setData(candles.map(toBar))
  }, [ready, candles])

  // 3. Key levels and the scenario fan, redrawn together since both key off the same analysis.
  useEffect(() => {
    if (!ready || !candles.length || a.price === null) return
    let cancelled = false
    ;(async () => {
      const lw = await import('lightweight-charts')
      const c = chartRef.current
      if (cancelled || !c) return
      const p = palette()

      for (const line of c.priceLines) c.candleSeries.removePriceLine(line)
      c.priceLines = a.keyLevels
        .filter((l) => l.type === 'support' || l.type === 'resistance' || l.type === 'invalidation')
        .map((l) =>
          c.candleSeries.createPriceLine({
            price: l.price,
            color: l.type === 'support' ? p.up : l.type === 'resistance' ? p.down : p.risk,
            lineWidth: 1,
            lineStyle: lw.LineStyle.LargeDashed,
            axisLabelVisible: true,
            title: l.type === 'invalidation' ? 'Invalid' : l.type === 'support' ? 'Support' : 'Resistance',
          }),
        )

      for (const line of c.lines) c.chart.removeSeries(line)
      // favoured added last so it paints over the fainter alternates at the point they all share
      const ordered = [...paths].sort((x) => (x.rank === 'favored' ? 1 : -1))
      c.lines = ordered.map((path) => {
        const style = RANK_STYLE[path.rank]
        const series = c.chart.addSeries(lw.LineSeries, {
          color: toneColor(p, path.tone),
          lineWidth: style.width,
          lineStyle: style.dashed ? lw.LineStyle.Dashed : lw.LineStyle.Solid,
          lineType: lw.LineType.Curved,
          crosshairMarkerVisible: false,
          lastValueVisible: path.rank === 'favored',
          priceLineVisible: false,
        })
        series.applyOptions({ color: toneColor(p, path.tone) })
        series.setData(path.points.map((pt) => ({ time: toChart(pt.time), value: pt.price })))
        return series
      })

      const lastIdx = candles.length - 1
      c.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, lastIdx - 36), to: lastIdx + 18 })
    })()
    return () => {
      cancelled = true
    }
  }, [ready, paths, a.keyLevels, a.price, candles])

  return (
    <Section
      title="Scenario outlook"
      note="A schematic fan, not a forecast: each applicable scenario drawn as its archetype shape from the live price, favoured one solid, the rest fainter by rank. No path claims an exact future price."
    >
      <div className={cn('flex flex-col gap-3', className)}>
        <div ref={box} className="h-64 w-full sm:h-80" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          {a.scenarios
            .filter((s) => s.applicable)
            .map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <i
                  className="h-0.5 w-4 shrink-0"
                  style={{
                    background: s.id.startsWith('bullish')
                      ? 'var(--up)'
                      : s.id.startsWith('bearish')
                        ? 'var(--down)'
                        : s.id === 'failed_breakout'
                          ? 'var(--accent-risk)'
                          : 'var(--muted-foreground)',
                    opacity: RANK_STYLE[s.qualitativeRank].opacity,
                  }}
                />
                {SCENARIOS[s.id].name}
                {s.qualitativeRank === 'favored' && <span className="text-foreground">· favored</span>}
              </span>
            ))}
        </div>
      </div>
    </Section>
  )
}
