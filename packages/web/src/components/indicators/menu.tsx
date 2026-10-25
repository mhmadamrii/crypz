import { ChartSpline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SESSIONS, localHours, type SessionId } from '@/lib/indicators/sessions'
import {
  BIAS_FRAMES,
  BOOK_GROUPS,
  BOOK_MAX_LEVELS,
  BOOK_MIN_SHARES,
  BOOK_RANGES,
  BOOK_SIDES,
  BOOK_STYLES,
  FOOTPRINT_ABSORB,
  FOOTPRINT_CELLS,
  FOOTPRINT_IMBALANCE,
  FOOTPRINT_ROWS,
  FVG_SIZES,
  LIQUIDITY_TOLERANCES,
  OB_STRENGTHS,
  SWING_LENGTHS,
  activeCount,
  indicators,
  useIndicators,
} from '@/lib/indicators/store'
import { BAR_MS } from '@crypz/exchanges'
import { Segmented } from '@/components/segmented'
import { cn } from '@/lib/utils'
import { FOOTPRINT_MAX_BAR } from './footprint-layer'
import { SESSION_MAX_BAR } from './sessions-layer'

// The chart's indicator menu. Each indicator is one row with a square switch (filled = on, hollow = off, the same
// language as the exchange status squares); its options sit indented under it. More indicators join this list.

const TINT: Record<SessionId, string> = {
  asia: 'var(--session-asia)',
  london: 'var(--session-london)',
  newYork: 'var(--session-ny)',
}

function Switch({
  on,
  onToggle,
  label,
  tint = 'var(--foreground)',
  children,
}: {
  on: boolean
  onToggle: () => void
  label: string
  /** The square's colour: ink, or the hue the indicator draws in, so the menu doubles as its legend. */
  tint?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <i
        aria-hidden
        className="size-2.5 shrink-0"
        style={on ? { backgroundColor: tint } : { boxShadow: `inset 0 0 0 1px ${tint}` }}
      />
      {children}
    </button>
  )
}

/** One indicator below the first: its switch with a one-line blurb, and its options indented under it. */
function Section({
  on,
  onToggle,
  title,
  blurb,
  children,
}: {
  on: boolean
  onToggle: () => void
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-1 border-t border-hairline pt-1">
      <Switch on={on} onToggle={onToggle} label={title}>
        <Blurb title={title} blurb={blurb} />
      </Switch>
      <div className={cn('flex flex-col gap-1 pb-2 pl-5', !on && 'opacity-50')}>{children}</div>
    </div>
  )
}

const Blurb = ({ title, blurb }: { title: string; blurb: string }) => (
  <span className="flex min-w-0 flex-col gap-0.5">
    <span className="text-sm font-medium">{title}</span>
    <span className="text-xs text-pretty text-muted-foreground">{blurb}</span>
  </span>
)

/** A labelled option: the name (its tooltip explains it) on the left, the choices on the right. */
const Row = ({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-1">
    <span className="text-sm" title={hint}>
      {text}
    </span>
    {children}
  </div>
)

const Note = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <p className={cn('px-3 text-xs text-pretty text-muted-foreground', strong && 'text-foreground')}>{children}</p>
)

export function IndicatorMenu({
  barMs,
  footprint = true,
  book = false,
  className,
}: {
  barMs: number
  /** False on charts with no footprint history to draw (the live trade chart): hides its section and its count. */
  footprint?: boolean
  /** True on live charts, which can draw the OKX order book; replays have no book to show. */
  book?: boolean
  className?: string
}) {
  const s = useIndicators()
  const count = activeCount(s) - Number(!footprint && s.footprint.on) - Number(!book && s.book.on)
  const tooLong = barMs > SESSION_MAX_BAR
  const footprintTooLong = barMs > FOOTPRINT_MAX_BAR

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Indicators"
          aria-label={`Indicators${count ? `, ${count} on` : ''}`}
          className={className}
        >
          <ChartSpline />
          <span className="hidden xl:inline">Indicators</span>
          {count > 0 && <span className="num text-[11px] text-muted-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[80svh] w-80 overflow-y-auto p-1">
        <h3 className="px-3 pt-2 pb-1 label">Indicators</h3>
        <Switch
          on={s.sessions.on}
          onToggle={() => indicators.setSessions({ on: !s.sessions.on })}
          label="Trading sessions"
        >
          <Blurb title="Sessions" blurb="Asia, London and New York as boxes over each session’s high and low." />
        </Switch>
        <div className={cn('pb-1 pl-5', !s.sessions.on && 'opacity-50')}>
          {SESSIONS.map((x) => (
            <Switch
              key={x.id}
              on={s.sessions[x.id]}
              onToggle={() => indicators.setSessions({ [x.id]: !s.sessions[x.id], on: true })}
              label={`${x.name} session`}
              tint={TINT[x.id]}
            >
              <span className="flex flex-1 items-baseline justify-between gap-3">
                <span className="text-sm">{x.name}</span>
                <span className="num text-[11px] text-muted-foreground" title="Today, in your time zone">
                  {localHours(x.id)}
                </span>
              </span>
            </Switch>
          ))}
          <p className={cn('px-3 pt-1 text-xs text-muted-foreground', tooLong && s.sessions.on && 'text-foreground')}>
            {tooLong && s.sessions.on
              ? 'Switch to 2H or shorter to see them; on longer bars a session is a candle or two.'
              : 'Shown on 2H bars and shorter. Hours follow each city’s daylight saving.'}
          </p>
        </div>
        <Section
          on={s.fvg.on}
          onToggle={() => indicators.setFvg({ on: !s.fvg.on })}
          title="Fair value gaps"
          blurb="Price ranges a three-candle move skipped, open until price trades back through them."
        >
          <Row text="Min size">
            <Segmented
              label="Minimum gap size, in ATR"
              options={FVG_SIZES}
              value={s.fvg.minAtr}
              onChange={(minAtr) => indicators.setFvg({ minAtr, on: true })}
              format={(v) => (v ? `${v} ATR` : 'Any')}
              size="strip"
            />
          </Row>
          <Switch
            on={s.fvg.showFilled}
            onToggle={() => indicators.setFvg({ showFilled: !s.fvg.showFilled, on: true })}
            label="Show filled gaps"
          >
            <span className="text-sm">Show filled gaps</span>
          </Switch>
        </Section>
        <Section
          on={s.orderBlocks.on}
          onToggle={() => indicators.setOrderBlocks({ on: !s.orderBlocks.on })}
          title="Order blocks"
          blurb="The last candle before an impulsive move, as a supply or demand zone. Strongest on its first tap."
        >
          <Row text="Impulse" hint="How far the move away from the zone must travel, in ATR">
            <Segmented
              label="Minimum impulse, in ATR"
              options={OB_STRENGTHS}
              value={s.orderBlocks.strength}
              onChange={(strength) => indicators.setOrderBlocks({ strength, on: true })}
              format={(v) => `${v} ATR`}
              size="strip"
            />
          </Row>
          <Switch
            on={s.orderBlocks.imbalance}
            onToggle={() => indicators.setOrderBlocks({ imbalance: !s.orderBlocks.imbalance, on: true })}
            label="Require imbalance"
          >
            <span className="text-sm">Require an imbalance (FVG) in the move</span>
          </Switch>
          <Switch
            on={s.orderBlocks.withTrend}
            onToggle={() => indicators.setOrderBlocks({ withTrend: !s.orderBlocks.withTrend, on: true })}
            label="With the trend only"
          >
            <span className="text-sm">With the trend only</span>
          </Switch>
          <Switch
            on={s.orderBlocks.showSpent}
            onToggle={() => indicators.setOrderBlocks({ showSpent: !s.orderBlocks.showSpent, on: true })}
            label="Show spent zones"
          >
            <span className="text-sm">Show spent zones</span>
          </Switch>
          <Note>
            A zone is spent on its second tap or a close through it. The trend follows Market structure’s swing length.
          </Note>
        </Section>
        <Section
          on={s.structure.on}
          onToggle={() => indicators.setStructure({ on: !s.structure.on })}
          title="Market structure"
          blurb="Swing highs and lows, with each break of structure (BOS) and change of character (CHoCH) on a close."
        >
          <Row text="Swing length" hint="Bars on each side of a swing. Longer swings are fewer and confirm later.">
            <Segmented
              label="Swing length, bars each side"
              options={SWING_LENGTHS}
              value={s.structure.length}
              onChange={(length) => indicators.setStructure({ length, on: true })}
              format={(v) => `${v} bars`}
              size="strip"
            />
          </Row>
          <Switch
            on={s.structure.labels}
            onToggle={() => indicators.setStructure({ labels: !s.structure.labels, on: true })}
            label="Swing labels"
          >
            <span className="text-sm">Swing labels (HH, HL, LH, LL)</span>
          </Switch>
        </Section>
        <Section
          on={s.liquidity.on}
          onToggle={() => indicators.setLiquidity({ on: !s.liquidity.on })}
          title="Liquidity pools"
          blurb="Equal highs and equal lows, where stops rest, as levels that run right until price takes them."
        >
          <Row
            text="Tolerance"
            hint="How close highs or lows must be to pool, and how far a wick must go to take one, in ATR"
          >
            <Segmented
              label="Pooling tolerance, in ATR"
              options={LIQUIDITY_TOLERANCES}
              value={s.liquidity.tolerance}
              onChange={(tolerance) => indicators.setLiquidity({ tolerance, on: true })}
              format={(v) => `${v} ATR`}
              size="strip"
            />
          </Row>
          <Switch
            on={s.liquidity.showTaken}
            onToggle={() => indicators.setLiquidity({ showTaken: !s.liquidity.showTaken, on: true })}
            label="Show taken pools"
          >
            <span className="text-sm">Show taken pools</span>
          </Switch>
          <Note>The number is its touches. Swing length follows Market structure.</Note>
        </Section>
        <Section
          on={s.sweeps.on}
          onToggle={() => indicators.setSweeps({ on: !s.sweeps.on })}
          title="Liquidity sweeps"
          blurb="A candle whose wick runs through a level and closes back, so the orders were taken and price left."
        >
          <Switch
            on={s.sweeps.swings}
            onToggle={() => indicators.setSweeps({ swings: !s.sweeps.swings, on: true })}
            label="Include single swings"
          >
            <span className="text-sm">Include single swing highs and lows</span>
          </Switch>
          <Note>Pools only by default. Uses the pool tolerance; a close beyond the level is a break, not a sweep.</Note>
        </Section>
        <Section
          on={s.bias.on}
          onToggle={() => indicators.setBias({ on: !s.bias.on })}
          title="Bias"
          blurb="Which way structure leans, top-down, with the price that would prove it wrong drawn on the chart."
        >
          <Row text="Read from">
            <Segmented
              label="Higher timeframe for the bias"
              options={BIAS_FRAMES}
              value={s.bias.higher}
              onChange={(higher) => indicators.setBias({ higher, on: true })}
              size="strip"
            />
          </Row>
          <Note>
            {BAR_MS[s.bias.higher] > barMs
              ? `Bias from ${s.bias.higher} structure, timed on the chart. Swing length follows Market structure.`
              : `${s.bias.higher} is not above this chart, so the bias reads the chart’s own structure.`}
          </Note>
        </Section>
        {footprint && (
          <Section
            on={s.footprint.on}
            onToggle={() => indicators.setFootprint({ on: !s.footprint.on })}
            title="Footprint"
            blurb="Taker sell × buy at each price inside every bar, with diagonal imbalances and absorption, from OKX trade history."
          >
            <Row
              text="Cells"
              hint="Bars: sell grows left and buy right from the cell's middle. Volume: one grey, darker the busier the row. Zoomed out, rows are always grey."
            >
              <Segmented
                label="How a cell shows its size"
                options={FOOTPRINT_CELLS}
                value={s.footprint.cells}
                onChange={(cells) => indicators.setFootprint({ cells, on: true })}
                format={(v) => (v === 'bars' ? 'Bars' : 'Volume')}
                size="strip"
              />
            </Row>
            <Row
              text="Imbalance"
              hint="Diagonal: buying at a price against selling one row below it (the two sides of the spread, who faced each other), selling against buying one row above. One row: buy against sell at the same price. Bold number at 3:1; three in a row add a rail."
            >
              <Segmented
                label="What an imbalance weighs a row against"
                options={FOOTPRINT_IMBALANCE}
                value={s.footprint.imbalance}
                onChange={(imbalance) => indicators.setFootprint({ imbalance, on: true })}
                format={(v) => (v === 'diagonal' ? 'Diagonal' : v === 'row' ? 'One row' : 'Off')}
                size="strip"
              />
            </Row>
            <Row text="Rows" hint="Price row size, over the finest row (BTC: $1, $10, $100)">
              <Segmented
                label="Price row size, over the finest row"
                options={FOOTPRINT_ROWS}
                value={s.footprint.rows}
                onChange={(rows) => indicators.setFootprint({ rows, on: true })}
                format={(v) => (v ? `${10 ** v}×` : 'Fine')}
                size="strip"
              />
            </Row>
            <Row
              text="Absorption"
              hint="Aggressive size into the top or bottom third of a bar, in multiples of its median row, that the bar closed back out of and the next bar did not trade past"
            >
              <Segmented
                label="Absorption threshold, times the bar's median row"
                options={FOOTPRINT_ABSORB}
                value={s.footprint.absorb}
                onChange={(absorb) => indicators.setFootprint({ absorb, on: true })}
                format={(v) => (v ? `${v}×` : 'Off')}
                size="strip"
              />
            </Row>
            <Note strong={footprintTooLong && s.footprint.on}>
              {footprintTooLong && s.footprint.on
                ? 'Switch to 1H or shorter to see it.'
                : 'Each OKX day is built on first use, in a few seconds. Zoom in to read the numbers; absorption is marked once the next bar closes.'}
            </Note>
          </Section>
        )}
        {book && (
          <Section
            on={s.book.on}
            onToggle={() => indicators.setBook({ on: !s.book.on })}
            title="OKX liquidity"
            blurb="Resting limit orders in OKX’s live order book, as bars at the right edge. Walls show where size is waiting."
          >
            <Row
              text="Style"
              hint="Lines: each level a line from when it appeared until it went. Bars: the book as it is now, at the right edge."
            >
              <Segmented
                label="How the book is drawn"
                options={BOOK_STYLES}
                value={s.book.style}
                onChange={(style) => indicators.setBook({ style, on: true })}
                format={(v) => (v === 'lines' ? 'Lines' : 'Bars')}
                size="strip"
              />
            </Row>
            <Row text="Sides">
              <Segmented
                label="Which sides of the book to draw"
                options={BOOK_SIDES}
                value={s.book.sides}
                onChange={(sides) => indicators.setBook({ sides, on: true })}
                format={(v) => (v === 'both' ? 'Both' : v === 'bids' ? 'Bids' : 'Asks')}
                size="strip"
              />
            </Row>
            <Row text="Range" hint="How far from the market price to look">
              <Segmented
                label="Distance from the market, each way"
                options={BOOK_RANGES}
                value={s.book.range}
                onChange={(range) => indicators.setBook({ range, on: true })}
                format={(v) => `±${+(v * 100).toFixed(1)}%`}
                size="strip"
              />
            </Row>
            <Row text="Hide under" hint="Levels smaller than this share of the biggest one drawn are left out">
              <Segmented
                label="Threshold, as a share of the biggest level"
                options={BOOK_MIN_SHARES}
                value={s.book.minShare}
                onChange={(minShare) => indicators.setBook({ minShare, on: true })}
                format={(v) => (v ? `${v * 100}%` : 'None')}
                size="strip"
              />
            </Row>
            <Row text="Levels" hint="The most levels drawn on each side; the biggest are kept">
              <Segmented
                label="Maximum levels per side"
                options={BOOK_MAX_LEVELS}
                value={s.book.maxLevels}
                onChange={(maxLevels) => indicators.setBook({ maxLevels, on: true })}
                size="strip"
              />
            </Row>
            <Row text="Group" hint="Price bucket width: orders inside one bucket are summed, none are merged beyond it">
              <Segmented
                label="Price grouping"
                options={BOOK_GROUPS}
                value={s.book.group}
                onChange={(group) => indicators.setBook({ group, on: true })}
                format={(v) => (v ? `${10 ** v}×` : 'Fine')}
                size="strip"
              />
            </Row>
            {s.book.style === 'lines' && (
              <Switch
                on={s.book.ended}
                onToggle={() => indicators.setBook({ ended: !s.book.ended, on: true })}
                label="Keep ended levels"
              >
                <span className="text-sm">Keep levels that went, faded</span>
              </Switch>
            )}
            <Switch
              on={s.book.labels}
              onToggle={() => indicators.setBook({ labels: !s.book.labels, on: true })}
              label="Level labels"
            >
              <span className="text-sm">Label the biggest levels</span>
            </Switch>
            <Note>
              Resting orders, not traded volume. OKX keeps no book history, so a line starts when this chart first saw
              the level, and orders can be pulled at any moment. Hidden while the feed is offline or silent.
            </Note>
          </Section>
        )}
      </PopoverContent>
    </Popover>
  )
}
