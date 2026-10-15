import { createHmac } from 'node:crypto'
import type { AccountSnapshot, ExchangeAdapter, Position } from './types'

const BASE_URL = 'https://www.okx.com'

type OkxPositionHistory = {
  instId: string
  instType: string
  mgnMode: string
  direction: string
  lever: string
  openAvgPx: string
  closeAvgPx: string
  closeTotalPos: string
  pnl: string
  realizedPnl: string
  fee: string
  fundingFee: string
  pnlRatio: string
  cTime: string
  uTime: string
  posId: string
}

type OkxAssetValuation = {
  totalBal: string
  details: { classic: string; earn: string; funding: string; trading: string }
}

type OkxBalance = {
  totalEq: string
  details: { ccy: string; upl: string; eqUsd: string }[]
}

// Read env dynamically: bundlers may inline static `process.env.X` references at build time.
function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

async function okxGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const requestPath = query ? `${path}?${query}` : path
  const timestamp = new Date().toISOString()
  const sign = createHmac('sha256', env('OKX_API_SECRET')).update(`${timestamp}GET${requestPath}`).digest('base64')

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': env('OKX_API_KEY'),
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': env('OKX_API_PASSPHRASE'),
    'Content-Type': 'application/json',
  }
  if (process.env['OKX_DEMO'] === '1') headers['x-simulated-trading'] = '1'

  const res = await fetch(BASE_URL + requestPath, { headers })
  const json = (await res.json()) as { code: string; msg: string; data: T }
  if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg}`)
  return json.data
}

const num = (v: string) => (v === '' || v == null ? 0 : Number(v))

function toPosition(r: OkxPositionHistory): Position {
  const base = r.instId.split('-')[0]
  return {
    id: `okx:${r.posId}:${r.uTime}`,
    exchange: 'okx',
    symbol: r.instId,
    base,
    side: r.direction === 'short' ? 'short' : 'long',
    leverage: num(r.lever),
    marginMode: r.mgnMode,
    entryPrice: num(r.openAvgPx),
    exitPrice: num(r.closeAvgPx),
    size: num(r.closeTotalPos),
    pnl: num(r.pnl),
    fee: num(r.fee),
    funding: num(r.fundingFee),
    realizedPnl: num(r.realizedPnl),
    pnlRatio: num(r.pnlRatio),
    openedAt: num(r.cTime),
    closedAt: num(r.uTime),
    tradeUrl: `${BASE_URL}/trade-${r.instType === 'SWAP' ? 'swap' : r.instType === 'FUTURES' ? 'futures' : 'spot'}/${r.instId.toLowerCase()}`,
  }
}

export const okx: ExchangeAdapter = {
  id: 'okx',
  name: 'OKX',
  isConfigured: () => ['OKX_API_KEY', 'OKX_API_SECRET', 'OKX_API_PASSPHRASE'].every((k) => Boolean(process.env[k])),

  // OKX returns max 100 rows per page and only ~3 months. Paginate backwards via `after` (uTime).
  async fetchClosedPositions() {
    const all: OkxPositionHistory[] = []
    let after: string | undefined
    for (let i = 0; i < 10; i++) {
      const page = await okxGet<OkxPositionHistory[]>('/api/v5/account/positions-history', {
        limit: '100',
        ...(after ? { after } : {}),
      })
      all.push(...page)
      if (page.length < 100) break
      after = page[page.length - 1].uTime
    }
    return all.map(toPosition)
  },

  async fetchAccount() {
    const [valuation, balance] = await Promise.all([
      okxGet<OkxAssetValuation[]>('/api/v5/asset/asset-valuation', { ccy: 'USDT' }),
      okxGet<OkxBalance[]>('/api/v5/account/balance'),
    ])
    const v = valuation[0]
    const upl = balance[0]?.details.reduce((s, d) => s + num(d.upl), 0) ?? null
    return {
      exchange: 'okx',
      currency: 'USDT',
      totalEquity: num(v.totalBal),
      buckets: [
        { name: 'Trading', value: num(v.details.trading) },
        { name: 'Funding', value: num(v.details.funding) },
        { name: 'Earn', value: num(v.details.earn) },
      ],
      unrealizedPnl: upl,
    } satisfies AccountSnapshot
  },
}
