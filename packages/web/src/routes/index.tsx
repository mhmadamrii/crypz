import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { fetchPositionsHistory } from '../server/okx'

const getPositionsHistory = createServerFn({ method: 'GET' }).handler(() => fetchPositionsHistory())

export const Route = createFileRoute('/')({
  loader: () => getPositionsHistory(),
  component: Home,
  errorComponent: ({ error }) => (
    <p className="neg">Failed to load positions: {error.message}</p>
  ),
})

const fmtTime = (ms: string) => new Date(Number(ms)).toLocaleString()
const fmtNum = (v: string, digits = 4) => (v === '' ? '-' : Number(v).toFixed(digits))
const pnlClass = (v: string) => (Number(v) >= 0 ? 'pos' : 'neg')

function Home() {
  const rows = Route.useLoaderData()
  const total = rows.reduce((sum, r) => sum + Number(r.realizedPnl || 0), 0)

  return (
    <main>
      <h1>OKX position history</h1>
      <p>
        {rows.length} positions · realized PnL{' '}
        <span className={pnlClass(String(total))}>{total.toFixed(4)}</span>
      </p>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Side</th>
              <th>Lever</th>
              <th>Margin</th>
              <th>Open px</th>
              <th>Close px</th>
              <th>Size</th>
              <th>PnL</th>
              <th>Fee</th>
              <th>Funding</th>
              <th>Realized PnL</th>
              <th>PnL %</th>
              <th>Opened</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.posId}-${r.uTime}`}>
                <td>{r.instId}</td>
                <td className={r.direction === 'long' ? 'pos' : 'neg'}>{r.direction}</td>
                <td>{r.lever}x</td>
                <td>{r.mgnMode}</td>
                <td>{r.openAvgPx}</td>
                <td>{r.closeAvgPx}</td>
                <td>{r.closeTotalPos}</td>
                <td className={pnlClass(r.pnl)}>{fmtNum(r.pnl)}</td>
                <td>{fmtNum(r.fee)}</td>
                <td>{fmtNum(r.fundingFee)}</td>
                <td className={pnlClass(r.realizedPnl)}>{fmtNum(r.realizedPnl)}</td>
                <td className={pnlClass(r.pnlRatio)}>{(Number(r.pnlRatio) * 100).toFixed(2)}%</td>
                <td>{fmtTime(r.cTime)}</td>
                <td>{fmtTime(r.uTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
