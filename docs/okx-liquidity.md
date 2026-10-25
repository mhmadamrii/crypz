# OKX liquidity

Live resting limit orders from OKX's order book, as a chart indicator on `/trade` and a widget on `/workspace`.
It shows what is on the book right now. It is not traded volume, not history, and not a forecast.

## Data

| What                                                 | Source                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Order book                                           | WebSocket `wss://ws.okx.com:8443/ws/v5/public`, channel `books` (400 levels a side, a snapshot then incremental updates) |
| Instrument spec (tick size, contract value and type) | `GET /api/v5/public/instruments`, public and CORS-open, so the browser asks directly                                     |
| Market price (widget)                                | WebSocket `tickers`, the last trade; the middle of the touch when there is none                                          |

No key is used and the api is not involved. A REST `market/books` snapshot is not fetched: the `books` channel opens
with a full snapshot, and a REST one would race the stream's sequence numbers for no gain.

## How the book is kept (`lib/okx-ws.ts`)

- One socket for the whole app. Every consumer of an instrument shares one store (`bookFeed(instId)`), so a chart and
  a widget on the same instrument cost one OKX subscription; the last one to leave unsubscribes. Updates reach React
  at most once per animation frame.
- A snapshot replaces the book; an update is applied level by level, and a size of `0` removes the level.
- Integrity is by sequence: each update's `prevSeqId` must equal the previous message's `seqId`. A gap, or an
  update before any snapshot, or a push that cannot be read, empties the book and re-subscribes for a fresh snapshot.
  (OKX no longer fills the CRC checksum, so it cannot be used.)
- The socket reconnects with backoff and re-subscribes; a book older than the new connection waits for its snapshot.
- If OKX refuses a subscription (unknown instrument), the book carries the reason (`error`).
- Each book records when this browser last heard about it (`at`, heartbeats included).

## When a book may be shown (`bookState`)

Only `live` is ever drawn or summed as current liquidity.

| State          | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `loading`      | No snapshot yet, or the connection re-opened and the new snapshot has not arrived       |
| `disconnected` | The socket is down; the last book is hidden                                             |
| `stale`        | Connected but silent for more than 75 s (OKX sends an empty update about once a minute) |
| `live`         | Connected, sequence unbroken, heard from recently                                       |

Zero liquidity (an empty or out-of-range book) is shown as zero or "empty", never as unavailable.

## Units (`lib/book.ts`)

OKX sizes are contracts on a swap and base coin on spot. From the instrument spec:

- Linear swap (`BTC-USDT-SWAP`): base = size × `ctVal` × `ctMult`; notional = base × price (quote currency).
- Inverse swap (`BTC-USD-SWAP`): notional = size × `ctVal` × `ctMult`; base = notional ÷ price.
- Spot: size is base coin.

Nothing is sized until the spec has loaded.

## Metrics

- **Bucket**: levels grouped to a price step, never finer than the tick. Bids bucket down and asks up, and a bucket's
  price is its outer edge, so an order is never shown nearer the market than it is. Buckets are never wider than the
  setting: levels from unrelated prices are not merged.
- **Depth**: resting size within a band of the reference price (±1% by default), bids from the price down and asks
  from it up. The band is the same for both sides. Summed over raw levels, so grouping does not move its edge.
- **Reference price**: the widget measures from the last trade (the middle of the touch if there is none). The chart
  layer uses the middle of the touch.
- **Imbalance**: `(bid − ask) ÷ (bid + ask)` over the band, in notional or base coin as chosen: +100% all bids,
  −100% all asks, none when both are zero.
- **Largest levels**: bucketed levels in the band ranked by notional or base coin.
- **Distance**: a level's price minus the reference price, in price and as a share of it (negative is below).

## Chart indicator

Indicators menu on `/trade` → **OKX liquidity**. Bars at the right edge of the chart, from each level's price, reaching
left in proportion to its notional (bids up-coloured under the market, asks down-coloured above). Settings, saved in
this browser with the other indicators:

| Setting    | Options                                        | Default |
| ---------- | ---------------------------------------------- | ------- |
| Sides      | Both, Bids, Asks                               | Both    |
| Range      | ±0.5%, ±1%, ±2%, ±5% from the market           | ±2%     |
| Hide under | None, 10%, 25%, 50% of the biggest level drawn | 10%     |
| Levels     | 5, 10, 20, 40 per side (the biggest are kept)  | 10      |
| Group      | Fine, 10×, 100× the finest step for the price  | 10×     |
| Labels     | price and notional on the biggest five a side  | on      |

It subscribes to the book only while switched on. The layer follows pan, zoom and timeframe changes without
rebuilding; it starts when the chart opens, and the replay (which has no live book) does not offer it.

## Workspace widget

`/workspace` → Add widget → **Order flow → OKX liquidity**. It follows its link group's instrument like any widget
and shows connection state, last update age, the price it measures from, bid and ask depth over the band, the
imbalance, and the five largest levels each side with their distance. Header: range (±0.5% to ±5%). Strip: rank by
USD or coin, and grouping. Settings persist with the workspace.

## Limits

- Visible liquidity on one exchange only, and orders can be pulled at any moment (spoofing is possible).
- No depth history: the book exists from when the feed opens. Nothing is reconstructed from candles.
- A larger bid or ask does not predict price.

## Tests

```sh
pnpm test              # vitest: book maths, feed, chart layer, widget view
pnpm typecheck
```

Tests use a scripted WebSocket and fake timers; none touch OKX.
