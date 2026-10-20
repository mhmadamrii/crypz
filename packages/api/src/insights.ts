import { z } from 'zod'
import { computeStats, deriveInsights, type Bucket, type Position, type Stats } from '@crypz/exchanges'
import { optionalEnv } from './env'

// AI insights over the user's own closed positions, from Gemini. Borrowed from TradingAgents' grounding habits
// (github.com/TauricResearch/TradingAgents, Apache-2.0), not its multi-agent debate:
// - the evidence is in the prompt and the model may use nothing else; what it would need but lacks goes in `missing`
// - output is structured (responseSchema), then validated here; an answer we cannot parse is reported as "review",
//   never replaced by a made-up default
// - confidence follows how many trades sit behind a finding, enforced here whatever the model said
// - every number an insight cites is checked against the evidence, and the insight says whether it passed
// It reviews process (coins, sides, timing, leverage, holding, fees); it never calls a trade or a price.
// Only computed statistics leave the server: no keys, no order ids.

export const insightsConfigured = () => !!optionalEnv('GEMINI_API_KEY')
const model = () => optionalEnv('GEMINI_MODEL') ?? 'gemini-2.5-flash'

export type AiInsight = {
  tone: 'leak' | 'edge' | 'note'
  finding: string
  evidence: string[]
  change: string
  confidence: 'low' | 'medium' | 'high'
  /** Trades behind the finding. */
  basis: number
  /** Every number in `evidence` was found in the statistics we sent. */
  checked: boolean
}

export type InsightsResult =
  | { status: 'ok'; insights: AiInsight[]; missing: string[]; model: string; trades: number; at: number }
  | { status: 'review'; reason: string; model: string; trades: number; at: number }
  | { status: 'empty'; trades: number; at: number }

const r2 = (n: number) => Math.round(n * 100) / 100
const bucket = (b: Bucket) => ({
  label: b.label,
  trades: b.count,
  winRate: r2(b.winRate * 100),
  realizedUsdt: r2(b.realized),
  feesUsdt: r2(b.fees),
})
const minutes = (ms: number) => Math.round(ms / 60_000)

/** The statistics the model sees: everything the dashboard shows, rounded, buckets with no trades left out. */
function evidenceFor(s: Stats, scope: { days: number | null; asset: string | null }) {
  const nonEmpty = (bs: Bucket[]) => bs.filter((b) => b.count > 0).map(bucket)
  return {
    scope: {
      period: scope.days ? `last ${scope.days} days` : 'all history we have (OKX keeps about 3 months)',
      asset: scope.asset ?? 'all coins',
      market: 'USDT-margined perpetual swaps',
      hourBuckets: 'open time, UTC',
    },
    summary: {
      trades: s.count,
      wins: s.wins,
      losses: s.losses,
      winRate: r2(s.winRate * 100),
      realizedUsdt: r2(s.realized),
      grossUsdt: r2(s.gross),
      feesUsdt: r2(s.fees),
      fundingUsdt: r2(s.funding),
      avgWinUsdt: r2(s.avgWin),
      avgLossUsdt: r2(s.avgLoss),
      payoff: r2(s.payoff),
      profitFactor: r2(s.profitFactor),
      expectancyUsdt: r2(s.expectancy),
      maxDrawdownUsdt: r2(s.maxDrawdown),
      maxWinStreak: s.maxWinStreak,
      maxLossStreak: s.maxLossStreak,
      avgHoldMinutes: minutes(s.avgHoldMs),
      avgHoldWinMinutes: minutes(s.avgHoldWinMs),
      avgHoldLossMinutes: minutes(s.avgHoldLossMs),
    },
    byCoin: nonEmpty(s.byInstrument),
    bySide: nonEmpty(s.bySide),
    byOpenHourUtc: nonEmpty(s.byHour),
    byWeekday: nonEmpty(s.byWeekday),
    byLeverage: nonEmpty(s.byLeverage),
    byHoldTime: nonEmpty(s.byHold),
    ruleReadouts: deriveInsights(s, { singleAsset: !!scope.asset }).map((i) => i.text),
  }
}

const SYSTEM = `You review a crypto trader's own closed USDT perpetual-swap positions. You are given statistics as JSON.

Rules:
- Use only the numbers in the evidence. Never estimate, extrapolate or bring in outside market knowledge.
- In "evidence", quote the exact figures you rely on, written as they appear in the JSON (units: USDT, %, minutes).
- If the evidence cannot support a finding, leave it out. If you would need data that is not there, say what in "missing".
- Do not predict prices, give trade signals, or tell the trader to buy or sell anything. Suggest changes to their own process: which coins or sides to cut or keep, timing, leverage, holding time, fees.
- "basis" is the number of trades behind the finding, taken from the bucket you used.
- Confidence: low under 15 trades behind it, medium 15 to 39, high 40 or more.
- Give 3 to 5 insights, biggest USDT impact first. Plain words; one or two sentences per finding; "change" is one concrete thing to try next session.
- Small samples are not findings: a bucket under 5 trades is noise unless you say so.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    insights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tone: { type: 'STRING', enum: ['leak', 'edge', 'note'] },
          finding: { type: 'STRING' },
          evidence: { type: 'ARRAY', items: { type: 'STRING' } },
          change: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
          basis: { type: 'INTEGER' },
        },
        required: ['tone', 'finding', 'evidence', 'change', 'confidence', 'basis'],
        propertyOrdering: ['tone', 'finding', 'evidence', 'change', 'basis', 'confidence'],
      },
    },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['insights', 'missing'],
}

const Answer = z.object({
  insights: z
    .array(
      z.object({
        tone: z.enum(['leak', 'edge', 'note']),
        finding: z.string().min(1),
        evidence: z.array(z.string()),
        change: z.string(),
        confidence: z.enum(['low', 'medium', 'high']),
        basis: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  missing: z.array(z.string()),
})

/** Every figure in the evidence, in the forms a sentence may quote it. */
function figures(evidence: unknown) {
  const out = new Set<string>()
  const add = (n: number) => {
    for (const v of [n, Math.abs(n)]) for (const d of [0, 1, 2]) out.add(String(Number(v.toFixed(d))))
  }
  const walk = (v: unknown) => {
    if (typeof v === 'number') add(v)
    else if (typeof v === 'string') for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) add(Number(m[0].replace(/,/g, '')))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(evidence)
  return out
}

const cited = (text: string) =>
  [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => String(Number(m[0].replace(/,/g, ''))))

const capFor = (basis: number): AiInsight['confidence'] => (basis < 15 ? 'low' : basis < 40 ? 'medium' : 'high')
const RANK = { low: 0, medium: 1, high: 2 } as const

async function ask(evidence: unknown) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': optionalEnv('GEMINI_API_KEY')! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `Evidence:\n${JSON.stringify(evidence)}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) {
    // the body can echo the request; log the status only
    throw new Error(`Gemini answered HTTP ${res.status}`)
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

export async function generateInsights(
  positions: Position[],
  scope: { days: number | null; asset: string | null },
): Promise<InsightsResult> {
  const at = Date.now()
  const stats = computeStats(positions)
  if (stats.count < 5) return { status: 'empty', trades: stats.count, at }
  const evidence = evidenceFor(stats, scope)
  const text = await ask(evidence)

  let parsed: z.infer<typeof Answer>
  try {
    parsed = Answer.parse(JSON.parse(text))
  } catch {
    return { status: 'review', reason: 'The answer did not match the expected shape.', model: model(), trades: stats.count, at }
  }

  const known = figures(evidence)
  const insights = parsed.insights
    // a finding cannot rest on more trades than exist
    .filter((i) => i.basis <= stats.count)
    .slice(0, 5)
    .map((i) => {
      const cap = capFor(i.basis)
      return {
        ...i,
        confidence: RANK[i.confidence] > RANK[cap] ? cap : i.confidence,
        checked: i.evidence.length > 0 && i.evidence.every((e) => cited(e).every((n) => known.has(n))),
      }
    })
  if (!insights.length)
    return { status: 'review', reason: 'No finding was backed by the trades in range.', model: model(), trades: stats.count, at }
  return { status: 'ok', insights, missing: parsed.missing, model: model(), trades: stats.count, at }
}
