# crypz

A trading journal and practice desk built straight from your exchange history. Connect a read-only OKX key and
crypz turns your closed positions into an edge report; open Replay and practise on real historical candles with
the future hidden.

## Features

- **Overview** — win rate, profit factor, streaks, equity curve, drawdown, and breakdowns by instrument, side,
  hour, weekday, leverage and hold time, with plain-language readouts of where you leak and where you earn.
- **Positions** — your full closed-position history with filters.
- **Trade** — live candles (OKX market data) with your own entries and exits marked; click a trade to jump to it.
- **Replay** (`/trade/replay`) — bar-by-bar replay from any date, or a random one:
  - only closed candles up to the replay clock are ever sent to the chart; switching interval keeps your place
  - paper trades with stop, target, leverage (2×–100×), liquidation and compounding equity
  - drawing tools: trend line, rectangle, fib retracement, long/short position, path
  - keyboard first: `Space` play, `→` next bar, `B` long, `S` short, `X` close, `1`–`9` intervals
- **Tools** — a public position-size calculator with shareable URLs.

Replay and Trade need no exchange key: anyone signed in can practise on public market data.

## Stack

| Package              | What                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `packages/web`       | TanStack Start (React 19, Vite), TanStack Query, Tailwind v4, shadcn/ui, lightweight-charts |
| `packages/api`       | Hono on Bun, Better Auth (email + password), typed RPC client for the web app               |
| `packages/db`        | Prisma 7 + PostgreSQL                                                                       |
| `packages/exchanges` | Exchange adapters (OKX; Binance planned) and the analytics behind the Overview              |

```
browser ──► web (Vercel)                 UI only, no secrets
   │
   └──────► api (Bun + Hono, VPS) ──► OKX     every exchange call leaves from the server
                 │
                 └──► Postgres            users, sessions, sealed exchange keys
```

## Getting started

Requirements: Node 22+, pnpm 12, Bun 1.3+, PostgreSQL 16.

```sh
pnpm install

# database
createuser crypz --pwprompt
createdb -O crypz crypz

# env: one .env at the repo root for every package
cp .env.example .env
#   DATABASE_URL       postgresql://crypz:<password>@localhost:5432/crypz?schema=public
#   CREDENTIALS_KEY    openssl rand -base64 32
#   BETTER_AUTH_SECRET openssl rand -base64 32

pnpm db:migrate
pnpm dev              # web on :3000, api on :3001
```

Open http://localhost:3000, create an account, then add a read-only OKX key under **Settings → Exchange keys**
(or skip it and go straight to Replay).

Already have an OKX key in `.env`? Move it into your account once, then delete it from `.env`:

```sh
pnpm --filter @crypz/api import-okx-env you@example.com
```

## Scripts

| Command           | Does                                         |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | web + api in watch mode                      |
| `pnpm dev:web`    | web only                                     |
| `pnpm dev:api`    | api only                                     |
| `pnpm build`      | production build of the web app              |
| `pnpm typecheck`  | type-check web and api                       |
| `pnpm db:migrate` | create/apply Prisma migrations (development) |
| `pnpm db:studio`  | Prisma Studio                                |
| `pnpm format`     | Prettier (with the Tailwind class sorter)    |

## Exchange keys and security

- **Read-only only.** On save, the api asks OKX what the key may do and refuses anything with trade or withdraw
  permission.
- **Encrypted at rest.** Keys are sealed with AES-256-GCM under `CREDENTIALS_KEY`, which lives only in the api's
  environment. Each sealed value is bound to its user and row, so a copied value will not open elsewhere. The
  database alone cannot decrypt anything.
- **Never sent back.** The browser only ever sees the last four characters and the permission list.
- **One egress IP.** All OKX traffic, market data included, goes through the api, so keys can be IP-bound to the
  server.

Back up `CREDENTIALS_KEY` offline: without it, stored keys cannot be recovered and users must re-enter them.

## Deploying

The web app deploys to Vercel (`vercel.json`); the api runs in Docker next to Postgres behind Caddy. See
[`deploy/README.md`](deploy/README.md) for the full runbook: database setup, secrets, compose, Caddy, Vercel env,
backups and key rotation.

## Project notes

- Design system ("Trade Mosaic": monochrome, square, hairlines; green and red only for profit and loss) is
  documented in `packages/web/DESIGN.md`.
- Search params are the source of truth for page state (symbol, interval, replay start, calculator inputs), so
  views are shareable and survive reloads.
