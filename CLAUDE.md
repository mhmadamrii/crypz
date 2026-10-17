# crypz

## Not done yet

Work we deferred. When asked what's left, remind from here; tick items off (delete them) as they land.

### Housekeeping

- [ ] Revoke the OKX API key leaked in commit `346aec1` (`user/me.md`), then decide whether to purge it from git history.
- [ ] Redeploy web on Vercel if it hasn't picked up the workspace UI yet.
- [ ] VPS: verify Postgres isn't reachable from outside (`nc -zv 43.133.32.143 5432` from a local machine should fail).
- [ ] VPS: `pg_dump` backup cron.
- [ ] Script to re-seal exchange keys when `CREDENTIALS_KEY` rotates.

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

Done: fair value gaps (`lib/indicators/fvg.ts`, ATR helper there too) and swing points + market structure (`lib/indicators/structure.ts`: swings, HH/LH/HL/LL, BOS/CHoCH on a close, the unbroken `lastHigh`/`lastLow`). Bias with invalidation is done too (`lib/indicators/bias.ts`; factors from candles only, no CVD since replay has no taker history; no win-rate until measured from replay history). Layers share `components/indicators/pane-layer.ts`. Build the rest in this order:

1. [ ] **Liquidity pools** (plausible). Clusters of equal highs / equal lows: swing points within a tolerance (e.g. 0.1 × ATR) of each other, drawn as a level extending right until price takes it. Pool strength = number of touches.
2. [ ] **Liquidity sweeps** (plausible, small once 1 exists). A candle whose wick runs through a pool or prior swing level but closes back on the other side: mark the sweep on that candle; the pool counts as taken.
3. [ ] **Order block detector** (plausible, most subjective, do last). Last opposite-colour candle before a displacement move that breaks structure (uses market structure's BOS): bullish OB = last down candle before an up-move that makes a BOS; zone = that candle's range (or body). Mitigated when price returns into it. Options: body vs full range, require an FVG in the displacement (`lib/indicators/fvg.ts`). Expect tuning, since definitions differ between traders.

### Product

- [ ] Binance adapter in `packages/exchanges`
- [ ] AI insights, News, Analytics, Risk pages
- [ ] Sync positions into the DB
- [ ] Persist user prefs (interval, layout, etc.)
- [ ] Signup gating / email verification
