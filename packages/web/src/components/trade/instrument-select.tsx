import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useInstruments } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** The Market instrument picker. A symbol the exchange no longer lists (a past trade) stays selectable. Type to search. */
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
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Instrument"
          className={cn('justify-between num font-normal', className)}
        >
          <span className="truncate">{value}</span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search instrument…" className="num" />
          <CommandList className="max-h-80">
            <CommandEmpty>No instrument found.</CommandEmpty>
            <CommandGroup>
              {options.map((s) => (
                <CommandItem
                  key={s}
                  value={s}
                  onSelect={(v) => {
                    onChange(v)
                    setOpen(false)
                  }}
                  className="num"
                >
                  <Check className={cn('size-4', s === value ? 'opacity-100' : 'opacity-0')} />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
