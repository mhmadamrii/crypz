import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { DEFAULT_DRAFT, PositionSizeCalculator, parseDraft } from '@/components/tools/position-size-calculator'

export const Route = createFileRoute('/(public)/tools/position-size')({
  validateSearch: parseDraft,
  head: () =>
    seo({
      title: 'Position size calculator for crypto futures · crypz',
      description:
        'Size a crypto trade from your equity, risk %, entry and stop loss: units, notional, leverage needed and the target from your risk : reward. Free, no account needed.',
      path: '/tools/position-size',
    }),
  component: PositionSizePage,
})

function PositionSizePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <main className="flex w-full flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">Position size calculator</h1>
        <p className="text-pretty text-muted-foreground">
          Size the trade from the loss you accept at the stop, not from a hunch. Pick your risk, entry and stop; the
          calculator returns units, notional, leverage needed and the target from your risk : reward.
        </p>
      </div>
      <PositionSizeCalculator
        draft={{ ...DEFAULT_DRAFT, ...search }}
        onChange={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false })}
        onReset={() => navigate({ search: {}, replace: true, resetScroll: false })}
      />
    </main>
  )
}
