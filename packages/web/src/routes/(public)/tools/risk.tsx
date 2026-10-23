import { createFileRoute } from '@tanstack/react-router'
import { seo } from '@/lib/seo'
import { DEFAULT_DRAFT, RiskCalculator, parseDraft } from '@/components/tools/risk-calculator'

export const Route = createFileRoute('/(public)/tools/risk')({
  validateSearch: parseDraft,
  head: () =>
    seo({
      title: 'Trading risk calculator: expectancy, losing streaks and drawdown · crypz',
      description:
        'From your win rate, risk : reward and risk per trade: expectancy, breakeven win rate, the odds of a losing streak, and the drawdown a simulated run can throw at you. Free, no account needed.',
      path: '/tools/risk',
    }),
  component: RiskPage,
})

function RiskPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <main className="flex w-full flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">Risk calculator</h1>
        <p className="text-pretty text-muted-foreground">
          A plan can be right and still hurt. Enter how often you win, what a win pays and what each trade risks; see
          the edge, the losing streaks to expect and the drawdown you will have to sit through.
        </p>
      </div>
      <RiskCalculator
        draft={{ ...DEFAULT_DRAFT, ...search }}
        onChange={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false })}
        onReset={() => navigate({ search: {}, replace: true, resetScroll: false })}
      />
    </main>
  )
}
