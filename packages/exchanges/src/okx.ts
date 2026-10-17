import { createHmac } from 'node:crypto'
import {
  BAR_MS,
  type AccountSnapshot,
  type Bar,
  type Candle,
  type TakerFlow,
  type LongShortKind,
  type Liquidation,
  type OpenInterest,
  type Credentials,
  type ExchangeAdapter,
  type Position,
} from './types'

const BASE_URL = 'https://www.okx.com'

const LONG_SHORT_PATH: Record<LongShortKind, string> = {
  accounts: 'long-short-account-ratio-contract',
  'top-accounts': 'long-short-account-ratio-contract-top-trader',
  'top-positions': 'long-short-position-ratio-contract-top-trader',
}

// Contract specs barely ever change; one lookup per instrument per process.
const contractValues = new Map<string, Promise<number>>()
function contractValue(symbol: string) {
  let v = contractValues.get(symbol)
  if (!v) {
    v = okxPublic<{ ctVal: string }[]>('/api/v5/public/instruments', { instType: 'SWAP', instId: symbol }).then(([i]) =>
      num(i?.ctVal ?? '1'),
    )
    v.catch(() => contractValues.delete(symbol))
    contractValues.set(symbol, v)
  }
  return v
}

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
  // OKX occasionally holds a request open; give up before the server's own 10s idle cut so the caller gets an
  // error it can retry instead of a dropped connection
  const res = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(8000) })
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
        volume: num(r[5]),
      }))
      .reverse()
  },

  // OKX's trading-statistics series: 100 periods of taker volume, rows of [ts, sellVol, buyVol] in contracts.
  async fetchTakerFlow(symbol, bar) {
    const rows = await okxPublic<string[][]>('/api/v5/rubik/stat/taker-volume-contract', {
      instId: symbol,
      period: bar,
      limit: '100',
    })
    return rows.map((r): TakerFlow => ({ time: num(r[0]), sell: num(r[1]), buy: num(r[2]) })).reverse()
  },

  // Rows of [ts, oi (contracts), oiCcy, oiUsd].
  async fetchOpenInterest(symbol, bar) {
    const rows = await okxPublic<string[][]>('/api/v5/rubik/stat/contracts/open-interest-history', {
      instId: symbol,
      period: bar,
      limit: '100',
    })
    return rows.map((r): OpenInterest => ({ time: num(r[0]), contracts: num(r[1]), usd: num(r[3]) })).reverse()
  },

  async fetchLongShort(symbol, bar, kind) {
    const rows = await okxPublic<string[][]>(`/api/v5/rubik/stat/contracts/${LONG_SHORT_PATH[kind]}`, {
      instId: symbol,
      period: bar,
      limit: '100',
    })
    return rows.map((r) => ({ time: num(r[0]), ratio: num(r[1]) })).reverse()
  },

  // The newest 100 filled liquidations of the instrument's family; `side` is the closing order, so a sell closes a long.
  async fetchLiquidations(symbol) {
    const family = symbol.replace(/-SWAP$/, '')
    const [orders, instruments] = await Promise.all([
      okxPublic<{ instId: string; details: { side: string; bkPx: string; sz: string; ts: string }[] }[]>(
        '/api/v5/public/liquidation-orders',
        { instType: 'SWAP', instFamily: family, state: 'filled', limit: '100' },
      ),
      contractValue(symbol),
    ])
    const events = (orders.find((o) => o.instId === symbol)?.details ?? orders[0]?.details ?? []).map(
      (d): Liquidation => ({
        time: num(d.ts),
        side: d.side === 'sell' ? 'long' : 'short',
        price: num(d.bkPx),
        size: num(d.sz),
      }),
    )
    return { contractValue: instruments, events }
  },

  async fetchPremium(symbol) {
    const rows = await okxPublic<{ premium: string; ts: string }[]>('/api/v5/public/premium-history', {
      instId: symbol,
    })
    return rows.map((r) => ({ time: num(r.ts), premium: num(r.premium) })).reverse()
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
