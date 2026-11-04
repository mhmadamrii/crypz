import { BAR_MS } from '@crypz/exchanges'
import type { Horizon, HorizonConfig } from './types'

// A horizon is read on a finer bar so that its window holds a handful of bars: 5m on 1m bars, 1D on 4H bars. The
// derivatives statistics (open interest, long/short, taker volume) come in the horizon's own period.
export const HORIZON_CONFIG: Record<Horizon, HorizonConfig> = {
  '5m': { bar: '1m', stat: '5m', window: 5, swing: 5 },
  '15m': { bar: '5m', stat: '15m', window: 3, swing: 5 },
  '1H': { bar: '15m', stat: '1H', window: 4, swing: 5 },
  '4H': { bar: '1H', stat: '4H', window: 4, swing: 5 },
  '1D': { bar: '4H', stat: '1D', window: 6, swing: 5 },
}

/** The outcome window in ms. */
export const horizonMs = (h: Horizon) => HORIZON_CONFIG[h].window * BAR_MS[HORIZON_CONFIG[h].bar]
