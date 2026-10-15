import { createHmac } from 'node:crypto'
import {
  BAR_MS,
  type AccountSnapshot,
  type Bar,
  type Candle,
  type Credentials,
  type ExchangeAdapter,
  type Position,
} from './types'

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

async function okxGet<T>(c: Credentials, path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const requestPath = query ? `${path}?${query}` : path
  const timestamp = new Date().toISOString()
  const sign = createHmac('sha256', c.secret).update(`${timestamp}GET${requestPath}`).digest('base64')

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': c.apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': c.passphrase ?? '',
    'Content-Type': 'application/json',
  }
  if (c.demo) headers['x-simulated-trading'] = '1'

  const res = await fetch(BASE_URL + requestPath, { headers })
  const json = (await res.json()) as { code: string; msg: string; data: T }
  if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg}`)
  return json.data
}

async function okxPublic<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`)
  const json = (await res.json()) as { code: string; msg: string; data: T }
  if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg}`)
  return json.data
}

const instType = (symbol: string) => (symbol.endsWith('-SWAP') ? 'swap' : /-\d{6}$/.test(symbol) ? 'futures' : 'spot')
const tradeUrl = (symbol: string) => `${BASE_URL}/trade-${instType(symbol)}/${symbol.toLowerCase()}`

// OKX's 6H-and-up bars default to Hong Kong time; the -utc variants close on UTC boundaries like every other venue.
const okxBar = (bar: Bar) => (BAR_MS[bar] >= BAR_MS['6H'] ? `${bar}utc` : bar)

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
    tradeUrl: tradeUrl(r.instId),
  }
}

export const okx: ExchangeAdapter = {
  id: 'okx',
  name: 'OKX',
  available: true,
  needsPassphrase: true,

  // perm is a comma list: read_only, trade, withdraw
  async verifyKey(c) {
    const [cfg] = await okxGet<{ perm: string; uid: string; label: string }[]>(c, '/api/v5/account/config')
    const permissions = cfg.perm
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    return {
      permissions,
      readOnly: permissions.length > 0 && permissions.every((p) => p === 'read_only'),
      account: cfg.uid,
    }
  },

  // OKX returns max 100 rows per page and only ~3 months. Paginate backwards via `after` (uTime).
  async fetchClosedPositions(c) {
    const all: OkxPositionHistory[] = []
    let after: string | undefined
    for (let i = 0; i < 10; i++) {
      const page = await okxGet<OkxPositionHistory[]>(c, '/api/v5/account/positions-history', {
        limit: '100',
        ...(after ? { after } : {}),
      })
      all.push(...page)
      if (page.length < 100) break
      after = page[page.length - 1].uTime
    }
    return all.map(toPosition)
  },

  async fetchAccount(c) {
    const [valuation, balance] = await Promise.all([
      okxGet<OkxAssetValuation[]>(c, '/api/v5/asset/asset-valuation', { ccy: 'USDT' }),
      okxGet<OkxBalance[]>(c, '/api/v5/account/balance'),
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

  // Latest bars come from /candles (up to 300); older pages from /history-candles (100 per call).
  async fetchCandles(symbol, bar, before) {
    const rows = await okxPublic<string[][]>(before ? '/api/v5/market/history-candles' : '/api/v5/market/candles', {
      instId: symbol,
      bar: okxBar(bar),
      limit: before ? '100' : '300',
      ...(before ? { after: String(before) } : {}),
    })
    return rows
      .map((r): Candle => ({
        time: num(r[0]),
        open: num(r[1]),
        high: num(r[2]),
        low: num(r[3]),
        close: num(r[4]),
      }))
      .reverse()
  },

  async fetchTicker(symbol) {
    const [t] = await okxPublic<{ last: string; open24h: string; high24h: string; low24h: string; vol24h: string }[]>(
      '/api/v5/market/ticker',
      { instId: symbol },
    )
    return {
      symbol,
      last: num(t.last),
      open24h: num(t.open24h),
      high24h: num(t.high24h),
      low24h: num(t.low24h),
      volume24h: num(t.vol24h),
    }
  },

  tradeUrl,
}
