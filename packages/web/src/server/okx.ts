import { createHmac } from 'node:crypto'

const BASE_URL = 'https://www.okx.com'

export type PositionHistory = {
  instId: string
  instType: string
  mgnMode: string
  posSide: string
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
  ccy: string
  type: string
  cTime: string
  uTime: string
  posId: string
}

function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

async function okxGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const requestPath = query ? `${path}?${query}` : path
  const timestamp = new Date().toISOString()
  const sign = createHmac('sha256', env('OKX_API_SECRET'))
    .update(`${timestamp}GET${requestPath}`)
    .digest('base64')

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': env('OKX_API_KEY'),
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': env('OKX_API_PASSPHRASE'),
    'Content-Type': 'application/json',
  }
  if (process.env.OKX_DEMO === '1') headers['x-simulated-trading'] = '1'

  const res = await fetch(BASE_URL + requestPath, { headers })
  const json = (await res.json()) as { code: string; msg: string; data: T }
  if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg}`)
  return json.data
}

// OKX returns max 100 rows per page, last 3 months only. Paginate backwards via `after` (uTime).
export async function fetchPositionsHistory(maxPages = 10) {
  const all: PositionHistory[] = []
  let after: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await okxGet<PositionHistory[]>('/api/v5/account/positions-history', {
      limit: '100',
      ...(after ? { after } : {}),
    })
    all.push(...page)
    if (page.length < 100) break
    after = page[page.length - 1].uTime
  }
  return all
}
