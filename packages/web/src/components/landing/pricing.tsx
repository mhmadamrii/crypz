import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

// The landing page's pricing band. Placeholder tiers until pricing is decided: the band says so in its own caption,
// the same way the illustrations say their candles are synthetic. Three columns on one hairline grid, no cards; the
// middle tier is the one in full ink.

type Billing = 'monthly' | 'yearly'

type Tier = {
  name: string
  /** USD per month, billed monthly. Yearly is two months free. */
  price: number
  pitch: string
  features: { text: string; soon?: boolean }[]
  cta: string
  featured?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Replay',
    price: 0,
    pitch: 'Practise on real candles. No exchange key needed.',
    features: [
      { text: 'Bar-by-bar replay of any day' },
      { text: 'Fib, trend lines and position zones' },
      { text: 'Sessions, FVG and market structure' },
      { text: 'Position size calculator' },
    ],
    cta: 'Start free',
  },
  {
    name: 'Journal',
    price: 12,
    pitch: 'Your own history, turned into an edge report.',
    features: [
      { text: 'Everything in Replay' },
      { text: 'One exchange, read-only key' },
      { text: 'Edge by coin, hour, leverage and side' },
      { text: 'Your entries and exits on the chart' },
      { text: 'Plain-language readouts' },
    ],
    cta: 'Create account',
    featured: true,
  },
  {
    name: 'Desk',
    price: 29,
    pitch: 'Every account in one mosaic.',
    features: [
      { text: 'Everything in Journal' },
      { text: 'OKX and Binance together', soon: true },
      { text: 'History kept past the exchange’s 3 months', soon: true },
      { text: 'AI insights on your own trades', soon: true },
    ],
    cta: 'Create account',
  },
]

const monthly = (t: Tier, billing: Billing) => (billing === 'yearly' ? (t.price * 10) / 12 : t.price)

export function Pricing() {
  const [billing, setBilling] = useState<Billing>('monthly')

  return (
    <section className="border-t border-border">
      <div className="flex flex-col items-start justify-between gap-6 px-4 pt-20 pb-10 sm:px-8 md:flex-row md:items-end">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
            Pay for the journal, not the practice.
          </h2>
          <p className="max-w-[52ch] text-pretty text-muted-foreground">
            Replay stays free. Connect an exchange when you want your own trades read back to you.
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={billing}
          // a single toggle group clears on a second click; billing always has a value
          onValueChange={(v) => v && setBilling(v as Billing)}
          aria-label="Billing period"
        >
          <ToggleGroupItem value="monthly" className="px-3">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="yearly" className="px-3">
            Yearly <span className="num text-xs text-muted-foreground">−2 mo</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-px border-y border-border bg-border lg:grid-cols-3">
        {TIERS.map((t) => (
          <article
            key={t.name}
            className={cn(
              'flex flex-col gap-8 p-6 sm:p-8',
              t.featured ? 'bg-foreground text-background' : 'bg-background',
            )}
          >
            <header className="flex flex-col gap-3">
              <h3 className="text-xl font-medium tracking-tight">{t.name}</h3>
              <p className={cn('text-sm', t.featured ? 'text-background/70' : 'text-muted-foreground')}>{t.pitch}</p>
            </header>

            <p className="flex items-baseline gap-2">
              <span className="num text-5xl font-medium tracking-tight">
                ${monthly(t, billing).toFixed(monthly(t, billing) % 1 ? 2 : 0)}
              </span>
              <span className={cn('num text-xs', t.featured ? 'text-background/70' : 'text-muted-foreground')}>
                {t.price === 0 ? 'forever' : billing === 'yearly' ? `/ mo · $${t.price * 10} a year` : '/ mo'}
              </span>
            </p>

            <ul className={cn('flex flex-col border-t text-sm', t.featured ? 'border-background/20' : 'border-hairline')}>
              {t.features.map((f) => (
                <li
                  key={f.text}
                  className={cn(
                    'flex items-center gap-3 border-b py-3',
                    t.featured ? 'border-background/20' : 'border-hairline',
                  )}
                >
                  <i
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0',
                      f.soon
                        ? t.featured
                          ? 'shadow-[inset_0_0_0_1px_var(--background)]'
                          : 'shadow-[inset_0_0_0_1px_var(--foreground)]'
                        : t.featured
                          ? 'bg-background'
                          : 'bg-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1">{f.text}</span>
                  {f.soon && <span className={cn('label', t.featured && 'text-background/70')}>Soon</span>}
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              variant={t.featured ? 'default' : 'outline'}
              className={cn('mt-auto', t.featured && 'bg-background text-foreground hover:bg-background/90')}
            >
              <Link to="/login" search={{ mode: 'signup' }}>
                {t.cta} <ArrowRight />
              </Link>
            </Button>
          </article>
        ))}
      </div>
      <p className="px-4 py-3 label sm:px-8">Placeholder pricing · not final</p>
    </section>
  )
}
