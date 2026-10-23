import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// The shadcn date picker: a button that opens a calendar in a popover. Values are the strings the app already
// keeps in its URL and drafts ("YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" with a time), in the viewer's zone, so a picker
// drops in where a native date input was. `DateTimePicker` adds a time field under the calendar.

const pad = (n: number) => String(n).padStart(2, '0')
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" as a local Date; undefined when it is neither. */
function parse(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : undefined
}

/** Months the year/month dropdowns reach back: far enough for any replay start. */
const EARLIEST = new Date(2015, 0)

type Common = {
  id?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
  title?: string
}

function Trigger({ id, label, placeholder = 'Pick a date', className, ...rest }: Common & { label: string | null }) {
  return (
    <PopoverTrigger asChild>
      <Button
        id={id}
        variant="outline"
        data-empty={!label}
        aria-label={rest['aria-label']}
        title={rest.title}
        className={cn(
          'w-full min-w-0 justify-start px-3 text-left font-normal data-[empty=true]:text-muted-foreground',
          className,
        )}
      >
        <CalendarIcon />
        <span className="truncate num">{label ?? placeholder}</span>
      </Button>
    </PopoverTrigger>
  )
}

/** A day. `value` is "" when none is chosen; `clearable` adds a Clear button for optional dates. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  clearable,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  /** "YYYY-MM-DD" bounds. */
  min?: string
  max?: string
  clearable?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const date = parse(value)
  const after = max ? parse(max) : undefined
  const before = min ? parse(min) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Trigger {...common} label={date ? format(date, 'd MMM yyyy') : null} />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={before ?? EARLIEST}
          endMonth={after ?? new Date()}
          defaultMonth={date}
          selected={date}
          disabled={[...(after ? [{ after }] : []), ...(before ? [{ before }] : [])]}
          onSelect={(d) => {
            if (!d) return
            onChange(toDay(d))
            setOpen(false)
          }}
        />
        {clearable && value && (
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** A day and a time, to the minute. `max` ("YYYY-MM-DDTHH:mm") is the latest moment that can be chosen. */
export function DateTimePicker({
  value,
  onChange,
  max,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  max?: string
}) {
  const date = parse(value)
  const latest = max ? parse(max) : undefined
  const set = (d: Date) => {
    // a moment later than the latest is not offered; the clock is clamped to it
    const next = latest && d > latest ? latest : d
    onChange(`${toDay(next)}T${toTime(next)}`)
  }
  return (
    <Popover>
      <Trigger {...common} label={date ? `${format(date, 'd MMM yyyy')}, ${toTime(date)}` : null} />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={EARLIEST}
          endMonth={latest ?? new Date()}
          defaultMonth={date}
          selected={date}
          disabled={latest ? { after: latest } : undefined}
          onSelect={(d) => {
            if (!d) return
            // the day changes; the time of day stays
            const base = date ?? new Date()
            d.setHours(base.getHours(), base.getMinutes(), 0, 0)
            set(d)
          }}
        />
        <div className="flex items-center gap-3 border-t border-border px-3 py-2">
          <label htmlFor={`${common.id ?? 'dt'}-time`} className="label">
            Time
          </label>
          <Input
            id={`${common.id ?? 'dt'}-time`}
            type="time"
            value={date ? toTime(date) : ''}
            onChange={(e) => {
              const m = /^(\d{2}):(\d{2})$/.exec(e.target.value)
              if (!m) return
              const d = new Date(date ?? Date.now())
              d.setHours(+m[1], +m[2], 0, 0)
              set(d)
            }}
            className="h-8 w-28 num text-xs [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
