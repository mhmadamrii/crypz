# crypz

## Not done yet

Work we deferred. When asked what's left, remind from here; tick items off (delete them) as they land.

### Housekeeping

- [ ] Revoke the OKX API key leaked in commit `346aec1` (`user/me.md`), then decide whether to purge it from git history.
- [ ] Redeploy web on Vercel if it hasn't picked up the workspace UI yet.
- [ ] VPS: verify Postgres isn't reachable from outside (`nc -zv 43.133.32.143 5432` from a local machine should fail).
- [ ] VPS: `pg_dump` backup cron.
- [ ] Script to re-seal exchange keys when `CREDENTIALS_KEY` rotates.
- [ ] VPS: run `prisma migrate deploy` for `footprint_day` before the api that reads it ships.

### Workspace widgets (later phases)

- [ ] Screener, heatmap, watchlist, announcements
- [ ] Live positions/orders, risk, alerts

### Replay

- [ ] Session notes, saved sessions, step back
- [ ] Persist drawings, magnet snapping, undo, fib levels
- [ ] Reset equity, risk-% position sizing

### Replay indicators (next plan)

Our own implementations, not LuxAlgo ports (theirs are Pine Script, closed or CC BY-NC-SA). They join the Indicators menu (`components/indicators/`, settings in `lib/indicators/store.ts`) as chart primitives like `sessions-layer.ts`. Rules for all of them:

- Replay-safe: compute only from revealed candles and never repaint. Anything that needs bars to its right (a swing point) appears only once those bars are revealed.
- Direction may use `--up` / `--down` at low alpha (bullish/bearish zones), as in order flow; everything else is ink.
- Each one gets a size/sensitivity option and a "show only unmitigated" style toggle so the chart doesn't flood.

Done: fair value gaps (`lib/indicators/fvg.ts`, ATR helper there too) and swing points + market structure (`lib/indicators/structure.ts`: swings, HH/LH/HL/LL, BOS/CHoCH on a close, the unbroken `lastHigh`/`lastLow`). Bias with invalidation is done too (`lib/indicators/bias.ts`; factors from candles only, no CVD since replay has no taker history; no win-rate until measured from replay history). Order blocks are done too (`lib/indicators/order-blocks.ts`: last candle before an impulse of N ATR within 4 bars, optional FVG and with-trend filters, first tap counts, spent on second tap or a close through). Footprint is done too (`lib/footprint.ts`, shared with the workspace widget: diagonal imbalance, stacked, absorption confirmed by the next bar; history from OKX daily trade files built per OKX day on demand by `api/src/footprint.ts` into `footprint_day`). Layers share `components/indicators/pane-layer.ts`. Liquidity pools and sweeps are done too (`lib/indicators/liquidity.ts`: pools of swings within a tolerance in ATRs, strength = touches, taken by a wick beyond tolerance; a sweep is the taking candle closing back; layers `liquidity-layer.ts`, `sweeps-layer.ts`). Replay indicators are complete.

### Product

- [ ] Footprint replay: fill the hours since OKX's last daily file from REST `history-trades` (today is `unpublished` until ~07:30 UTC+8 next day); widget backfill from the same endpoint.
- [ ] Binance adapter in `packages/exchanges`
- [ ] Analytics, Risk pages
- [ ] AI insights: the ask-a-question box (one-shot Gemini read is done, `api/src/insights.ts`); lesson loop once positions sync into the DB (journal note per trade, settled with realized PnL, recent lessons fed into the next read)
- [ ] News: exchange announcements tab (OKX `/api/v5/support/announcements`, public, no key: listings, delistings, suspensions), flagging ones about coins you trade
- [ ] Strategies: the list is static (`lib/strategies/`, one strategy, rules as code, run from the replay's Strategy menu, page at `/strategies`); move it to the DB and let rules be edited. Log each ready setup's outcome in R to measure the strategy from replay.
- [ ] Sync positions into the DB
- [ ] Persist user prefs (interval, layout, etc.)
- [ ] Signup gating / email verification
