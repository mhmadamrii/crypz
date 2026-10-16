import { useState } from 'react'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import { GripVertical, Link2, Link2Off, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useInstruments } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { COLS, GAP, ROW, symbolOf, type LinkGroup, type WidgetConfig, type WorkspaceState } from './model'
import { WIDGETS, isKind, type Settings } from './widgets'

type Props = {
  state: WorkspaceState
  /** Every change is a finished one (drag end, resize end, add, remove): the caller saves each. */
  onChange: (next: WorkspaceState) => void
}

export function WorkspaceGrid({ state, onChange }: Props) {
  const { width, containerRef, mounted } = useContainerWidth()
  // phones get the widgets stacked in layout order, without dragging
  const stacked = mounted && width < 768

  const layout = state.layout
    .filter((l) => state.widgets.some((w) => w.id === l.i))
    .map((l) => {
      const kind = state.widgets.find((w) => w.id === l.i)!.kind
      const size = isKind(kind) ? WIDGETS[kind].size : { minW: 3, minH: 3 }
      return { ...l, minW: size.minW, minH: size.minH }
    })

  const commit = (next: Layout) => onChange({ ...state, layout: next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) })

  const patchWidget = (id: string, patch: Partial<WidgetConfig>) =>
    onChange({ ...state, widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })

  const setSymbol = (w: WidgetConfig, symbol: string) =>
    w.link ? onChange({ ...state, links: { ...state.links, [String(w.link)]: symbol } }) : patchWidget(w.id, { symbol })

  const remove = (id: string) =>
    onChange({
      ...state,
      widgets: state.widgets.filter((w) => w.id !== id),
      layout: state.layout.filter((l) => l.i !== id),
    })

  const frame = (w: WidgetConfig) => (
    <WidgetFrame
      w={w}
      state={state}
      onSymbol={(s) => setSymbol(w, s)}
      onLink={(link) => patchWidget(w.id, { link, symbol: link ? undefined : symbolOf(w, state) })}
      onSettings={(patch) => patchWidget(w.id, { settings: { ...w.settings, ...patch } })}
      onRemove={() => remove(w.id)}
    />
  )

  return (
    <div ref={containerRef} className="min-h-0 w-full">
      {stacked ? (
        <div className="flex flex-col gap-2">
          {[...layout]
            .sort((a, b) => a.y - b.y || a.x - b.x)
            .map((l) => (
              <div key={l.i} style={{ height: l.h * ROW + (l.h - 1) * GAP }}>
                {frame(state.widgets.find((w) => w.id === l.i)!)}
              </div>
            ))}
        </div>
      ) : (
        mounted && (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: COLS, rowHeight: ROW, margin: [GAP, GAP], containerPadding: [0, 0] }}
            dragConfig={{ handle: '.widget-handle', cancel: '.widget-nodrag' }}
            resizeConfig={{ handles: ['se', 'e', 's'] }}
            onDragStop={commit}
            onResizeStop={commit}
            className="crypz-grid"
          >
            {layout.map((l) => (
              <div key={l.i}>{frame(state.widgets.find((w) => w.id === l.i)!)}</div>
            ))}
          </GridLayout>
        )
      )}
    </div>
  )
}

function WidgetFrame({
  w,
  state,
  onSymbol,
  onLink,
  onSettings,
  onRemove,
}: {
  w: WidgetConfig
  state: WorkspaceState
  onSymbol: (s: string) => void
  onLink: (link: LinkGroup | null) => void
  onSettings: (patch: Settings) => void
  onRemove: () => void
}) {
  const instruments = useInstruments()
  const symbol = symbolOf(w, state)
  const options = instruments.includes(symbol) ? instruments : [symbol, ...instruments]
  const entry = isKind(w.kind) ? WIDGETS[w.kind] : null
  const props = { symbol, settings: w.settings ?? {}, set: onSettings }
  const [confirm, setConfirm] = useState(false)

  return (
    <section className="flex h-full flex-col border border-border bg-background" aria-label={entry?.title ?? w.kind}>
      <header className="flex h-7 shrink-0 items-center gap-1 border-b border-border pr-1">
        <span className="widget-handle flex h-full min-w-0 flex-1 cursor-grab items-center gap-1.5 pl-1 active:cursor-grabbing">
          <GripVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-xs font-medium">{entry?.title ?? w.kind}</span>
        </span>
        <div className="widget-nodrag flex items-center gap-1">
          {entry?.Controls && <entry.Controls {...props} />}
          <Select value={symbol} onValueChange={onSymbol}>
            <SelectTrigger
              size="sm"
              className="h-6 w-auto gap-1 border-0 px-1.5 num text-[11px]"
              aria-label="Instrument"
              title={symbol}
            >
              {/* the coin is enough in a narrow header; the full instrument is in the list and the tooltip */}
              <SelectValue>{symbol.replace(/-USDT-SWAP$/, '')}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {options.map((s) => (
                <SelectItem key={s} value={s} className="num text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="grid h-6 min-w-6 place-items-center px-1 num text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={w.link ? `Linked to group ${w.link}` : 'Not linked'}
              title={w.link ? `Follows link group ${w.link}` : 'Own symbol'}
            >
              {w.link ? (
                <span className="flex items-center gap-0.5">
                  <Link2 className="size-3" />
                  {w.link}
                </span>
              ) : (
                <Link2Off className="size-3" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel className="label">Link group</DropdownMenuLabel>
              {([1, 2, 3] as const).map((g) => (
                <DropdownMenuItem key={g} onSelect={() => onLink(g)} className="num text-xs">
                  <Link2 /> Group {g} · {state.links[String(g) as '1']}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => onLink(null)} className="text-xs">
                <Link2Off /> Unlinked, own symbol
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {confirm ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Keep
              </button>
              <button type="button" onClick={onRemove} className="h-6 bg-destructive px-1.5 text-[11px] text-white">
                Remove
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              aria-label="Remove widget"
              className="grid size-6 place-items-center text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>
      <div className={cn('widget-nodrag min-h-0 flex-1 overflow-hidden')}>
        {entry ? (
          <entry.Body {...props} />
        ) : (
          <p className="p-3 text-xs text-muted-foreground">Unknown widget: {w.kind}</p>
        )}
      </div>
    </section>
  )
}
