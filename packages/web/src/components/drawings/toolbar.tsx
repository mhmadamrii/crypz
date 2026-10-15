import type { LucideIcon } from 'lucide-react'
import {
  Eye,
  EyeOff,
  MousePointer2,
  RectangleHorizontal,
  Rows3,
  Slash,
  Trash,
  TrendingDown,
  TrendingUp,
  Waypoints,
} from 'lucide-react'
import type { Tool } from '@/lib/drawings/model'
import { drawings, useDrawings } from '@/lib/drawings/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const TOOLS: { tool: Tool; label: string; keys?: string; icon: LucideIcon }[] = [
  { tool: 'cursor', label: 'Cursor', keys: 'Esc', icon: MousePointer2 },
  { tool: 'trend', label: 'Trend line', keys: '⌥T', icon: Slash },
  { tool: 'rect', label: 'Rectangle', keys: '⌥R', icon: RectangleHorizontal },
  { tool: 'fib', label: 'Fib retracement', keys: '⌥F', icon: Rows3 },
  { tool: 'long', label: 'Long position', keys: '⌥L', icon: TrendingUp },
  { tool: 'short', label: 'Short position', keys: '⌥S', icon: TrendingDown },
  { tool: 'path', label: 'Path · double-click or Enter to finish', keys: '⌥P', icon: Waypoints },
]

/** Vertical tool rail beside the chart. */
export function DrawingToolbar({ symbol, className }: { symbol: string; className?: string }) {
  const s = useDrawings()
  const count = s.bySymbol[symbol]?.length ?? 0
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Drawing tools"
      className={cn('flex flex-col gap-0.5 p-1', className)}
    >
      {TOOLS.map(({ tool, label, keys, icon: Icon }) => (
        <RailButton
          key={tool}
          label={label}
          keys={keys}
          pressed={s.tool === tool}
          onClick={() => drawings.setTool(s.tool === tool && tool !== 'cursor' ? 'cursor' : tool)}
        >
          <Icon />
        </RailButton>
      ))}
      <div className="my-1 h-px bg-border" />
      <RailButton
        label={s.hidden ? 'Show drawings' : 'Hide drawings'}
        pressed={s.hidden}
        onClick={drawings.toggleHidden}
        disabled={!count}
      >
        {s.hidden ? <EyeOff /> : <Eye />}
      </RailButton>
      <RailButton label="Remove all drawings" onClick={() => drawings.clear(symbol)} disabled={!count}>
        <Trash />
      </RailButton>
    </div>
  )
}

function RailButton({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  keys?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
            pressed && 'bg-foreground text-background hover:bg-foreground hover:text-background',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        {keys && <span className="num text-[11px] opacity-60">{keys}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
