# Market Intelligence Engine — Implementation Brief

> **Goal:** Add a new **Market Intelligence** page to the existing OKX trading dashboard. The page should turn the existing 14 market widgets into a concise, explainable view of current market conditions and possible next scenarios. The 14 widgets remain available as drill-down tools; they should not dominate the default experience.

## 1. Product principles

1. **Summary first, evidence on demand.** A user opening this page should understand the market in a few seconds.
2. **Separate observation from forecast.** Clearly distinguish what the market is doing now from what may happen next.
3. **Probabilities must be honest.** Never display arbitrary or LLM-invented percentages as probabilities.
4. **Explain every scenario.** Show supporting evidence, conflicting evidence, key levels, and invalidation conditions.
5. **Respect time horizons.** A 5-minute outlook can differ from a 4-hour outlook.
6. **Graceful degradation.** If a feed is stale, missing, or unavailable, show that limitation and reduce confidence; do not silently use stale data.
7. **No trading guarantees.** The page is an analytical aid, not financial advice or an instruction to buy/sell.

## 2. First inspect the existing project

Before coding:

- Inspect the current framework, routing, design system, state management, charting library, API/client layer, and existing 14 widgets.
- Find the existing OKX WebSocket and REST integrations. Reuse them rather than creating duplicate connections.
- Identify which data is already normalized and which widgets own calculations.
- Follow existing naming, styling, testing, and folder conventions.
- Do not rewrite or break the existing widgets.
- Add the new page using the project's existing architecture. Do not introduce a new UI framework.

If the repository has no established conventions, propose a small implementation plan before making broad architectural changes.

## 3. Page information architecture

Create a new route/page named **Market Intelligence**.

### Default page layout

#### A. Header / controls

- Page title: `Market Intelligence`
- Instrument selector, defaulting to the dashboard's currently selected instrument.
- Market selector where relevant (e.g. spot / perpetual).
- Forecast horizon selector: `5m`, `15m`, `1H`, `4H`, `1D`.
- Show the selected instrument, venue, market type, horizon, last update time, and data freshness.
- Add a manual refresh only if it fits the existing data architecture; live data should otherwise update automatically.

Changing the instrument or horizon must refresh the relevant analysis and must not mix data from different instruments or horizons.

#### B. Current market state

Show a compact state summary, separate from the forecast:

- **Structure:** bullish / bearish / ranging / transitioning / unclear
- **Trend context:** HH/HL, LH/LL, range, or transition, when the swing detector has enough evidence
- **Momentum:** strengthening / weakening / neutral
- **Volatility:** low / normal / high relative to a documented rolling baseline
- **Liquidity condition:** bid-heavy / ask-heavy / balanced / thin / unclear
- **Derivatives condition:** long-crowded / short-crowded / balanced / unavailable, only when supported by the available data

Do not force a label when the evidence is insufficient. Use `Unclear` or `Insufficient data`.

#### C. Next-scenario probability panel (the primary feature)

Display a ranked list of mutually exclusive scenarios for the selected forecast horizon. The probabilities for the complete scenario set must total 100% (allowing for rounding).

Start with these scenario classes, but make definitions configurable and document them:

1. **Bullish continuation** — upward continuation meeting a defined price/structure event.
2. **Bearish continuation** — downward continuation meeting a defined price/structure event.
3. **Bullish reversal** — a defined transition from bearish/ranging structure into bullish structure.
4. **Bearish reversal** — a defined transition from bullish/ranging structure into bearish structure.
5. **Range / consolidation** — price remains within a defined range without a qualifying directional event.
6. **Volatility expansion / breakout failure** — a defined break of a reference level that fails to sustain, or another explicitly defined volatility event.

Important: these labels overlap conceptually unless event definitions and precedence are explicit. Implement a single-label outcome definition for each forecast window, or use a properly designed multi-label model and do not present its outputs as a 100% probability distribution. Prefer the single-label approach for the first version.

For each scenario show:

- Scenario name
- Probability
- Relative rank
- A short plain-language explanation
- Supporting evidence
- Conflicting evidence
- Key trigger / confirmation condition
- Invalidation condition
- Relevant price levels, if available

Do not present a percentage if the model is not calibrated and validated. In that case show **scenario bias** (e.g. favored / possible / less likely) and label it clearly as qualitative, not probabilistic.

#### D. Key levels

Show only a small number of meaningful levels, not every order-book level:

- Nearby support and resistance candidates
- Recent swing high / swing low
- Volume Profile POC, VAH, VAL when available
- Significant resting liquidity zones, clearly labelled as *live resting liquidity*
- Invalidation level for the leading scenario

Every level must include its source and timestamp/freshness. A resting order is not guaranteed support/resistance and can be cancelled.

#### E. Evidence summary

Group evidence into five analytical engines:

1. **Market structure:** Chart, Volume Profile
2. **Liquidity:** Order Book, Depth, OKX Liquidity
3. **Aggressive flow:** Trades, CVD, Footprint, Taker Buy/Sell
4. **Positioning:** Open Interest, Long/Short Ratio, Basis
5. **Forced flows:** Liquidations

For each group show a compact state (bullish / bearish / mixed / neutral / unavailable), a short reason, and a link/button to open the relevant existing widget(s). Avoid double-counting highly correlated metrics as independent evidence.

#### F. Drill-down

Keep the 14 existing widgets accessible from this page, but collapsed or behind an `Explore evidence` / `Open detailed widgets` interaction. Reuse the existing widget components and data feeds.

## 4. Use Gemini for explanation, not for the maths

A Gemini API key can make the summary more natural and readable. It should be used as a **narrative layer**, not as the source of market truth and not as the probability calculator.

### Recommended division of responsibility

**Deterministic/statistical backend:**

- Ingest and validate OKX data.
- Calculate all numeric features and indicators.
- Detect market structure and levels using explicit, testable rules.
- Generate scenario scores/probabilities using a defined statistical model.
- Track model version, data timestamps, horizon, and calibration status.
- Produce a structured analysis object.

**Gemini:**

- Turn that structured analysis into concise human-readable language.
- Explain why the leading scenario is favored.
- Summarize supporting and conflicting evidence.
- Explain what would confirm or invalidate the scenario.
- Explain technical terms in plain language when needed.

**Gemini must not:**

- Invent or modify probabilities, prices, levels, indicator values, timestamps, or data freshness.
- Claim that a signal exists unless it appears in the supplied structured input.
- Treat resting limit orders as executed trades.
- Treat long/short ratio as proof of future direction.
- Claim certainty or guarantee an outcome.
- fill in missing data with guesses.

The UI should render probabilities and levels directly from the backend analysis object. Only the prose explanation should come from Gemini.

### Suggested Gemini input

Send a compact, validated JSON object rather than raw WebSocket messages or the full widget payload. Example:

```json
{
  "instrument": "BTC-USDT-SWAP",
  "venue": "OKX",
  "horizon": "1H",
  "asOf": "2026-11-04T10:00:00Z",
  "dataQuality": {
    "status": "good",
    "staleSources": [],
    "missingSources": []
  },
  "marketState": {
    "structure": "bearish",
    "trend": "lower_highs_lower_lows",
    "momentum": "weakening",
    "volatility": "normal"
  },
  "features": {
    "cvdTrend": "rising",
    "bookImbalance": "ask_heavy",
    "largeAskLiquidity": "nearby",
    "openInterestChangePct": 2.1,
    "fundingState": "positive",
    "liquidationPressure": "neutral"
  },
  "scenarios": [
    {
      "id": "bearish_continuation",
      "probability": 0.48,
      "supportingEvidence": [
        "Market structure remains lower-high/lower-low",
        "Ask-side resting liquidity is concentrated overhead"
      ],
      "conflictingEvidence": [
        "CVD is rising, indicating improving aggressive buy flow"
      ],
      "trigger": "Break and acceptance below the defined swing low",
      "invalidation": "Price reclaims the defined lower-high level"
    }
  ],
  "keyLevels": {
    "support": [],
    "resistance": [],
    "invalidation": []
  }
}
```

This is an illustrative schema. Use real computed fields and values from the application; do not hardcode these sample values.

### Suggested Gemini output contract

Ask Gemini for structured JSON matching a strict schema, for example:

```json
{
  "headline": "Selling pressure remains dominant, but buying flow is improving.",
  "summary": "The market structure is still bearish. Rising CVD is a conflicting signal, so downside continuation is favored but not confirmed.",
  "scenarioExplanations": [
    {
      "scenarioId": "bearish_continuation",
      "explanation": "The broader structure still favors sellers. Improving buy flow is the main reason to avoid treating the downside scenario as high certainty."
    }
  ],
  "confirmation": [
    "A decisive break below the identified swing low"
  ],
  "invalidation": [
    "A reclaim of the identified lower-high level"
  ],
  "caveats": [
    "Resting order-book liquidity can be cancelled before execution."
  ]
}
```

Validate the response against a schema and verify every `scenarioId` exists in the backend input. If Gemini fails, times out, returns invalid JSON, or references unsupported facts, show a deterministic template-based explanation instead.

Keep the Gemini API key on the server. Never expose it in browser code, client bundles, URLs, or logs. Use environment variables / the project's secret-management approach. Add request timeouts, rate limits, caching, and bounded input sizes. Do not send API secrets or user-private information to the model.

## 5. Probability engine: start honest and measurable

Do not make up percentages from manually chosen indicator weights.

### Version 1: qualitative scenario engine

If there is not yet a validated historical model:

- Derive interpretable feature states from the 14 widgets.
- Produce scenario scores or labels such as `Favored`, `Possible`, `Less likely`.
- Clearly label them **qualitative scenario bias — not calibrated probabilities**.
- Explain which signals support and oppose each scenario.

### Version 2: calibrated probability model

Only show numerical probabilities after implementing and testing a model against historical, time-aligned data.

Requirements:

- Define each scenario outcome precisely for every horizon.
- Use time-based train/validation/test splits; do not randomly shuffle time-series samples.
- Prevent look-ahead bias and data leakage.
- Include fees/slippage only if evaluating trade outcomes; scenario forecasting itself should remain distinct from a trading strategy.
- Compare against simple baselines.
- Measure calibration (e.g. reliability diagram, Brier score, log loss) as well as directional accuracy.
- Track performance by instrument, horizon, and market regime.
- Recalibrate when performance drifts.
- Display sample size and out-of-sample evaluation period in model details.
- If data quality is poor or the model is outside its validated regime, suppress numeric probabilities or mark them unavailable.

The probabilities should describe the chance of the defined market event within the selected horizon, not the chance that a user can profit from a trade.

## 6. Data and signal integrity

Implement the following safeguards:

- Use exchange timestamps and local receive timestamps separately.
- Detect stale feeds, missing intervals, out-of-order messages, reconnects, and snapshot/delta gaps.
- Do not calculate derived features from an unsynchronized order book.
- Normalize contract sizes and units before comparing values.
- Distinguish spot, perpetual, index, mark, and last prices.
- Distinguish resting limit liquidity from executed volume.
- Distinguish account-based long/short ratios from position-size ratios.
- Distinguish OI changes from long/short directional flow; every open contract has both a long and a short.
- Avoid double-counting correlated signals (e.g. CVD and taker buy/sell can describe overlapping trade flow).
- Show when a source is unavailable instead of silently substituting another source.
- Keep a clear provenance trail: source widget, calculation, timestamp, and model version.

## 7. Interaction and UX details

- The leading scenario should be visually prominent, but not styled as a buy/sell command.
- Show all scenario probabilities in one consistent visual scale.
- Display the total probability and ensure it sums to 100% after rounding.
- Show `Last analyzed` and `Data freshness`.
- Show a clear `Insufficient data` state.
- Let users expand `Why?` to see evidence and calculations.
- Let users open the exact source widget from an evidence item.
- Changing horizon should update scenario definitions, model output, and relevant evidence.
- Do not use green/red alone to communicate meaning; include text labels and accessible contrast.
- Avoid excessive alerts, badges, and dense indicator panels.
- Make the page responsive, with a clear compact layout on smaller screens.

## 8. Suggested backend/domain interfaces

Adapt these interfaces to the project's conventions. They are conceptual contracts, not a demand to use a particular language.

```ts
type Horizon = "5m" | "15m" | "1H" | "4H" | "1D";

type SignalState =
  | "bullish"
  | "bearish"
  | "mixed"
  | "neutral"
  | "unavailable";

type ScenarioId =
  | "bullish_continuation"
  | "bearish_continuation"
  | "bullish_reversal"
  | "bearish_reversal"
  | "range"
  | "failed_breakout";

interface EvidenceItem {
  id: string;
  sourceWidget: string;
  state: SignalState;
  summary: string;
  observedAt: string;
  freshness: "fresh" | "delayed" | "stale" | "unavailable";
  metric?: string;
  value?: number | string;
  unit?: string;
}

interface Scenario {
  id: ScenarioId;
  probability?: number; // Only populated by a validated/calibrated model.
  qualitativeRank?: "favored" | "possible" | "less_likely";
  explanation?: string; // Narrative from Gemini or deterministic fallback.
  supportingEvidence: string[];
  conflictingEvidence: string[];
  trigger?: string;
  invalidation?: string;
  keyLevelIds?: string[];
}

interface MarketIntelligence {
  instrument: string;
  marketType: string;
  horizon: Horizon;
  asOf: string;
  dataQuality: {
    status: "good" | "degraded" | "insufficient";
    staleSources: string[];
    missingSources: string[];
  };
  marketState: {
    structure: string;
    trend: string;
    momentum: string;
    volatility: string;
  };
  evidence: EvidenceItem[];
  scenarios: Scenario[];
  keyLevels: Array<{
    id: string;
    type: "support" | "resistance" | "poc" | "vah" | "val" | "invalidation" | "liquidity";
    price: number;
    source: string;
    observedAt: string;
  }>;
  model: {
    mode: "qualitative" | "probabilistic";
    version: string;
    calibrated: boolean;
    evaluationPeriod?: string;
    sampleCount?: number;
  };
}
```

## 9. Implementation phases

### Phase 1 — Page foundation

- Add the route and page shell.
- Add instrument and horizon controls.
- Reuse existing data stores and widgets.
- Add data freshness and source availability indicators.

### Phase 2 — Deterministic market state

- Implement or reuse market-structure, liquidity, flow, positioning, and forced-flow feature calculations.
- Add evidence summaries and key levels.
- Add qualitative scenario ranking with explicit rules.
- Add transparent explanations and invalidation conditions.

### Phase 3 — Gemini narrative

- Add a server-side Gemini integration.
- Send only the structured analysis object.
- Validate structured output.
- Add deterministic fallback text and caching.
- Ensure the frontend remains functional without Gemini.

### Phase 4 — Historical probability validation

- Build historical feature/outcome datasets.
- Define horizon-specific outcome labels.
- Train and evaluate a baseline model.
- Calibrate probabilities and test out of sample.
- Only then enable numeric probability display.

### Phase 5 — Polish

- Add drill-down links to all relevant widgets.
- Add responsive behavior, loading, empty, stale, and error states.
- Add tests for scenario totals, horizon isolation, stale data handling, schema validation, and fallback behavior.

## 10. Acceptance criteria

The work is complete when:

- A new Market Intelligence page exists and is reachable through the app's navigation.
- The page uses the currently selected instrument and supports all configured horizons.
- The default view is a concise summary, not 14 simultaneous widgets.
- Current market state and future scenarios are visually and semantically separate.
- Every displayed claim can be traced to input data or a documented rule.
- Scenario outcomes have explicit definitions.
- Numeric probabilities are hidden unless the model is calibrated and validated.
- Gemini only explains supplied facts and cannot alter numeric values.
- Gemini failure does not break the page.
- Stale/missing data is visible and affects analysis availability.
- Users can drill down from evidence into the existing widgets.
- Tests cover the important data-quality and probability invariants.

## 11. Instructions to Claude Code

Work in the existing repository. First inspect the project and report:

1. The current framework and routing approach.
2. Where OKX data is fetched, normalized, and stored.
3. Which of the 14 widgets already expose reusable calculations.
4. The proposed files/components/API changes.

Then implement **Phase 1 and Phase 2** first. Do not fabricate calibrated probabilities. Add Gemini only after the structured analysis contract exists. Keep changes focused, preserve current functionality, and run the project's relevant tests and lint/type checks.

At the end, summarize files changed, implementation decisions, tests run, and any assumptions or missing OKX data fields.
