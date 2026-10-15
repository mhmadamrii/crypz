# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user today: the owner, an active crypto derivatives trader running USDT perpetual swaps on OKX (mostly isolated margin, ~10x leverage, many short-hold trades across BTC, ETH, SOL, DOGE, ZEC, HYPE, XRP and smaller alts). Later: other retail traders who connect their own exchange API keys. The landing page must eventually persuade those traders; the dashboard serves the trader reviewing their own performance.

## Product Purpose

crypz is a trading journal and performance cockpit fed directly by exchange APIs. Opening it should show: current account equity/funds, a price chart, and a diagnosis of edge — which instruments, sides (long/short), times, and leverage settings win or lose money — plus the full closed-position history. Review mindset first: success is the trader spotting what is leaking money and changing behavior.

## Positioning

No manual trade logging: history is pulled straight from the exchange (OKX now, Binance next) and turned into an honest edge breakdown, with an AI insight layer planned on top.

## Operating Context

- Trader opens the dashboard between or after sessions to review closed positions.
- Exchange is the source of truth; every instrument row should link out to the matching OKX trade page.
- OKX positions-history API returns only ~3 months of closed positions.

## Capabilities and Constraints

- Stack: pnpm monorepo, `packages/web` = TanStack Start (React, Vite), shadcn/ui component layer.
- Live: OKX closed positions history via signed server-side requests (keys in root `.env`).
- Planned: OKX account equity/balance; Binance connection alongside OKX (exchange layer must be pluggable); price chart (TradingView widget vs lightweight-charts, undecided); AI insight widget backed by Gemini with RAG over trade history (dummy UI until wired); real authentication (dummy login button for now).
- Undecided: whether keys are strictly read-only, where user keys are stored once public, and instrument scope beyond USDT perpetuals.

## Evidence on Hand

- Real data: 333 closed OKX positions (Jul–Oct 2026), cumulative realized PnL about -74 USDT, mostly 10x isolated USDT swaps.
- No testimonials, user counts, logos, or performance claims exist. Do not fabricate them on the landing page.

## Product Principles

1. Truth over comfort: losses, fees, and funding are shown as plainly as wins.
2. Exchange data is authoritative; never require manual entry.
3. Diagnose, don't decorate: every number should answer "where is my edge or leak?"
4. Exchange-agnostic: OKX is the first adapter, not the architecture.
