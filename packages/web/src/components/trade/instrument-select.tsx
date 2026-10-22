import { useInstruments } from '@/lib/queries'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** The Market instrument picker. A symbol the exchange no longer lists (a past trade) stays selectable. */
export function InstrumentSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (symbol: string) => void
  className?: string
}) {
  const symbols = useInstruments()
  const options = symbols.includes(value) ? symbols : [value, ...symbols]
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn('num', className)} aria-label="Instrument">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {options.map((s) => (
          <SelectItem key={s} value={s} className="num">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
