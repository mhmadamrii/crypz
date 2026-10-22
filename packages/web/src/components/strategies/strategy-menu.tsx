import { ListChecks } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { STRATEGIES, strategyById } from '@/lib/strategies'
import { cn } from '@/lib/utils'

// The replay's strategy picker: one row per strategy with the indicator menu's square (filled = running), and none
// running by default. Which one runs lives in the URL, so a replay link carries it.

export function StrategyMenu({
  value,
  onChange,
  className,
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  className?: string
}) {
  const active = strategyById(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Strategy"
          aria-label={`Strategy${active ? `, ${active.name}` : ''}`}
          className={className}
        >
          <ListChecks />
          <span className="hidden xl:inline">{active ? active.name : 'Strategy'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <h3 className="px-3 pt-2 pb-1 label">Strategy</h3>
        {STRATEGIES.map((s) => {
          const on = s.id === active?.id
          return (
            <button
              key={s.id}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onChange(on ? undefined : s.id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <i
                aria-hidden
                className={cn('size-2.5 shrink-0', on ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]')}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-pretty text-muted-foreground">{s.summary}</span>
              </span>
            </button>
          )
        })}
        <Link
          to="/strategies"
          className="block border-t border-hairline px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Read the rules
        </Link>
      </PopoverContent>
    </Popover>
  )
}
