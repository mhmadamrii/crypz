# Market Intelligence

`/intelligence`: the 14 workspace widgets read as one concise view of what the market is doing now and what may
happen next. Phases 1 and 2 of the brief are built (page, deterministic state, evidence, key levels, qualitative
scenario ranking). Gemini narrative (phase 3) and calibrated probabilities (phase 4) are not.

The rule that shapes everything: **code computes, a language model may later explain, the UI shows both
separately.** Nothing on the page is a percentage, because nothing has been measured against history.

## Where things are

| Piece                                                 | File                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Contract (types)                                      | `lib/intelligence/types.ts`                                           |
| Horizon → bar and window                              | `lib/intelligence/horizons.ts`                                        |
| Market state (structure, trend, momentum, volatility) | `lib/intelligence/market-state.ts`                                    |
| What each scenario means, as one rule                 | `lib/intelligence/outcome.ts`                                         |
| The five evidence engines                             | `lib/intelligence/engines.ts`                                         |
| Source freshness limits                               | `lib/intelligence/freshness.ts`                                       |
| Key levels                                            | `lib/intelligence/levels.ts`                                          |
| Qualitative scenario ranking                          | `lib/intelligence/scenarios.ts`                                       |
| The pure analysis (`analyze`)                         | `lib/intelligence/analyze.ts`                                         |
| Feeds → analysis (`useIntelligence`)                  | `lib/intelligence/use-intelligence.ts`                                |
| Page and sections                                     | `routes/(main)/(market)/intelligence.tsx`, `components/intelligence/` |

`analyze` is pure and synchronous: feeds in, a `MarketIntelligence` out. The hook reads the same queries and
WebSocket stores the widgets use, so the page opens no connection of its own. It re-runs once a second so feeds age.

## Horizons

A horizon is read on a finer bar so its outcome window holds a few bars.

| Horizon | Analysis bar | Outcome window | Derivatives period |
| ------- | ------------ | -------------- | ------------------ |
| 5m      | 1m           | 5 bars         | 5m                 |
| 15m     | 5m           | 3 bars         | 15m                |
| 1H      | 15m          | 4 bars         | 1H                 |
| 4H      | 1H           | 4 bars         | 4H                 |
| 1D      | 4H           | 6 bars         | 1D                 |

Changing instrument or horizon never mixes data: every feed carries a tag (`symbol:bar` or `symbol`) and a feed whose
tag is not the one being analysed is treated as missing.

## Market state (`market-state.ts`)

Each label is a rule over the candles and says `unclear` when it cannot be applied (fewer than 60 bars, fewer than 4
swings). Thresholds are named constants in the file.

- **Structure**: from confirmed swing points (`lib/indicators/structure.ts`, closes not wicks). Bullish or bearish
  from the trend after the last break; transitioning when a change of character happened within 3 outcome windows;
  ranging when there is no break, or none for 80 bars while price sits between the last swing high and low.
- **Trend**: how the newest high and low compare with the ones before them (HH+HL, LH+LL, else range or transition).
- **Momentum**: net move of the last n bars against the n before, in ATRs: strengthening (×1.25 or more),
  weakening (×0.75 or less), neutral; under 0.5 ATR has no direction.
- **Volatility**: latest ATR over the median of the ATRs before it (up to 100 bars): under 0.75 low, over 1.35 high.
- **Liquidity**: resting depth within 0.5% of the price, bids against asks: heavy past ±20% imbalance; thin when
  fewer than 10 levels rest in the band. Resting orders can be cancelled.
- **Derivatives**: account long/short ratio, long-crowded at 1.3 or more and short-crowded at the inverse; crowding
  only counts when funding or basis agrees, or cannot be read.

## Scenario outcomes (`outcome.ts`)

Six mutually exclusive outcomes of the next window. At its start we know the reference high and low (the last
unbroken swings) and the prior structure (up, down or range). The window's closes decide, in order:

1. Last close above the high: **bullish continuation** from an up structure, otherwise **bullish reversal**.
2. Last close below the low: **bearish continuation** from a down structure, otherwise **bearish reversal**.
3. Some close beyond either level, but the window ends inside: **failed breakout**.
4. Every close inside: **range**.

Every window gets exactly one label. `outcomeOf` takes plain candles, so the same rule can label history when
scenarios are backtested.

## Evidence engines (`engines.ts`)

Correlated widgets share one vote, so nothing is counted twice.

| Engine           | Widgets                                | Reads                                                                                                                                   |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Market structure | Chart, Volume profile                  | structure and 50-bar average vote; value area is context                                                                                |
| Liquidity        | Order book, Depth, OKX liquidity       | resting imbalance within 0.5%; biggest walls within 1% are context                                                                      |
| Aggressive flow  | Trades, CVD, Footprint, Taker buy/sell | taker buy share over 12 closed periods (CVD and taker are the same flow); the tape is context unless taker volume is missing            |
| Positioning      | Open interest, Long/short, Basis       | OI against price over 6 periods; crowding, funding and basis are context, and a move carried by the crowded side is downgraded to mixed |
| Forced flows     | Liquidations                           | which side was forced out, if at least 5 events and 65% of the USD                                                                      |

An engine whose source is stale or missing is `unavailable`: its reason says why, it casts no vote, and nothing is
substituted. Footprint is listed for drill-down but not read here (it only has data once opened).

## Scenario ranking (`scenarios.ts`)

Ordinal, hand-chosen rules, **not measured**, so the page only ever shows favored / possible / less likely, labelled
qualitative. `lean` is engines voting bullish minus bearish (excluding structure). Points: continuation needs the
matching structure (2 ± lean); a reversal gets 1 ± lean plus 2 for a recent change of character; range scores
ranging structure, low volatility and balanced votes; failed breakout scores a level being tested, flow divergence, a
crowded side and a resting wall beyond the level. Favored needs a score of at least 2, a lead of 1, and at least 3 of
the 5 engines readable; possible needs a score within 1 of the best and at least one supporting line.

## Data quality

| Source                | Fresh  | Delayed | Then                                                    |
| --------------------- | ------ | ------- | ------------------------------------------------------- |
| Candles               | 30 s   | 2 min   | stale                                                   |
| Live price            | 15 s   | 1 min   | stale                                                   |
| Order book            | live   |         | any other state is stale or unavailable                 |
| Taker volume          | 45 s   | 3 min   | stale                                                   |
| Open interest, basis  | 90 s   | 6 min   | stale                                                   |
| Long/short            | 3 min  | 10 min  | stale                                                   |
| Funding, liquidations | pushed |         | current while the socket is live, unavailable otherwise |

Stale and missing sources are named on the page. With no usable candles the status is `insufficient` and no
scenario is shown; with any source or engine missing it is `degraded`. Exchange timestamps are used for the live
price; polled series are aged by when their query last succeeded.

## Limits

- Resting liquidity is not executed volume and can be cancelled.
- The latest (forming) candle counts as the latest close, as on the live chart.
- Funding, tape and liquidity pushes have no receive time, so they are judged by the socket being live.
- No account of fees or of whether a user could profit: scenarios describe a market event, not a trade.

## Next (deferred, see CLAUDE.md)

- **Gemini narrative**: server-side only, input is the validated `MarketIntelligence`, output schema-checked, every
  `scenarioId` verified against the input, deterministic text on any failure. It may never change a number.
- **Calibrated probabilities**: label history with `outcomeOf`, time-split train/validation/test, compare to
  baselines, measure calibration (Brier, log loss) per instrument and horizon, and only then show a number, with
  sample size and evaluation period.

## Tests

```sh
pnpm test
```

`lib/intelligence/*.test.ts` cover the outcome rule, market state, horizon and instrument isolation, stale data,
the no-probability and one-vote-per-engine invariants; `components/intelligence/intelligence.test.tsx` renders the
sections.
