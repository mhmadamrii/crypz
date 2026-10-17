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

### Product

- [ ] Binance adapter in `packages/exchanges`
- [ ] AI insights, News, Analytics, Risk pages
- [ ] Sync positions into the DB
- [ ] Persist user prefs (interval, layout, etc.)
- [ ] Signup gating / email verification
