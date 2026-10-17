---
name: crypz
description: Trading journal where every closed position is one square pixel.
colors:
  ink: 'oklch(0.145 0 0)'
  bone: 'oklch(0.96 0.003 95)'
  ink-raised: 'oklch(0.19 0 0)'
  ink-accent: 'oklch(0.23 0 0)'
  ink-hairline: 'oklch(0.215 0 0)'
  ink-border: 'oklch(0.27 0 0)'
  ink-input: 'oklch(0.32 0 0)'
  ink-muted-text: 'oklch(0.66 0.004 95)'
  paper: 'oklch(0.975 0.002 95)'
  carbon: 'oklch(0.16 0 0)'
  paper-accent: 'oklch(0.92 0.003 95)'
  paper-hairline: 'oklch(0.9 0.003 95)'
  paper-border: 'oklch(0.86 0.003 95)'
  paper-input: 'oklch(0.82 0.003 95)'
  paper-muted-text: 'oklch(0.45 0.004 95)'
  up-dark: 'oklch(0.74 0.15 162)'
  down-dark: 'oklch(0.67 0.2 18)'
  up-light: 'oklch(0.56 0.13 160)'
  down-light: 'oklch(0.56 0.2 20)'
typography:
  display:
    fontFamily: 'Geist Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(3rem, 6vw, 4.5rem)'
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Geist Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '2.25rem'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '-0.03em'
  figure-hero:
    fontFamily: 'Geist Mono Variable, ui-monospace, monospace'
    fontSize: '3rem'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: '-0.01em'
    fontFeature: "'tnum', 'zero'"
  figure:
    fontFamily: 'Geist Mono Variable, ui-monospace, monospace'
    fontSize: '1.5rem'
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: '-0.01em'
    fontFeature: "'tnum', 'zero'"
  title:
    fontFamily: 'Geist Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.015em'
  body:
    fontFamily: 'Geist Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "'ss01'"
  data:
    fontFamily: 'Geist Mono Variable, ui-monospace, monospace'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: '-0.01em'
    fontFeature: "'tnum', 'zero'"
  label:
    fontFamily: 'Geist Mono Variable, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: '0.06em'
rounded:
  none: '0px'
spacing:
  cell-gap: '3px'
  row: '8px'
  panel-pad: '20px'
  gutter-mobile: '16px'
  gutter: '32px'
  block: '32px'
  section: '56px'
components:
  button-primary:
    backgroundColor: '{colors.bone}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '8px 16px'
    height: '36px'
  button-outline:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bone}'
    rounded: '{rounded.none}'
    padding: '0 12px'
    height: '32px'
  button-outline-hover:
    backgroundColor: '{colors.ink-accent}'
  button-ghost:
    textColor: '{colors.ink-muted-text}'
    rounded: '{rounded.none}'
    size: '32px'
  input:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bone}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '4px 12px'
    height: '36px'
  range-toggle-on:
    backgroundColor: '{colors.bone}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    height: '32px'
  stat-cell:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.bone}'
    typography: '{typography.figure}'
    rounded: '{rounded.none}'
    padding: '{spacing.panel-pad}'
  mosaic-cell-win:
    backgroundColor: '{colors.bone}'
    rounded: '{rounded.none}'
  tooltip:
    backgroundColor: '{colors.bone}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    padding: '6px 12px'
  rail-item:
    textColor: '{colors.ink-muted-text}'
    rounded: '{rounded.none}'
    size: '40px'
---

# Design System: crypz

## Overview

**Creative North Star: "The Trade Mosaic"**

Every closed position is one square pixel, and a trader's history becomes their own punk-grid portrait. The system is monochrome ink and bone, built from hard square cells and 1px hairlines with no curves anywhere. Figures are set in tabular mono so columns of numbers read like a ledger. The only colour on screen is the sign of a result.

The world is dense but calm. Panels are flat rectangles separated by hairlines, not floating cards. Information lives in ink density (how solid a square is) and in fill versus outline (a win is a filled square, a loss is a hollow one), so the same vocabulary repeats from the 4x4 pixel logo down to the hour-of-day strip. Motion is small and mechanical: digits roll into fixed cells, mosaic cells pop in, and focus dims what it does not select.

The confirmed rejection is the exchange-clone KPI dashboard: rounded tiles, card stacks, a yellow brand accent.

**Key Characteristics:**

- Ink black ground and bone white ink by default; the light theme inverts to bone paper and carbon ink.
- Zero radius everywhere, 1px hairlines for structure, no drop shadows.
- Fill means positive and outline means negative, in squares, bars and markers alike.
- Green and red appear only on signed PnL figures.
- Geist for words, Geist Mono with tabular, slashed-zero numerals for every figure.
- Corridor focus: selecting an asset dims everything else and rescopes the page.

## Colors

A strictly neutral ramp with a faint warm cast in the light end, plus one green and one red reserved for the sign of a result.

### Primary

- **Bone** (dark theme ink): Every glyph, filled mosaic square, positive bar, primary button and tooltip in the default dark theme. Primary and foreground are the same token, so emphasis comes from fill, not hue.
- **Carbon** (light theme ink): Plays Bone's role when the light theme is on.

### Neutral

- **Ink** (dark ground): The page, panels and cards all share it; panels do not tint themselves to stand apart.
- **Paper** (light ground): Bone paper for the light theme.
- **Ink Raised / Ink Accent** and **Paper Accent**: The hover wash on rail items and edge rows, and the fill of the active edge row.
- **Hairline** (ink-hairline / paper-hairline): Row rules inside tables, edge bars, the streak grid and the mosaic readout. These are the quietest lines in the system.
- **Border** (ink-border / paper-border): Panel frames, the stat strip, the header and rail edges, and the zero axis of diverging bars.
- **Input** (ink-input / paper-input): Field strokes and the scrollbar thumb.
- **Muted Text** (ink-muted-text / paper-muted-text): Labels, counts, timestamps, captions, and the fractional part of the equity figure.

### Signal

- **Up** (up-dark / up-light): Positive signed figures only: realized PnL, uPnL, ROE, average win, per-bucket net.
- **Down** (down-dark / down-light): Negative signed figures only: losses, fees and funding as costs, max drawdown.

### Named Rules

**The Sign-Only Colour Rule.** Green and red mark the sign of a PnL figure and nothing else. The one exception is the replay's trading sessions, which carry their own named hues (see Indicators). Status, selection, focus, the live-connection dot, insights markers and mosaic cells are all foreground ink. A zero result is muted, not coloured.

**The Same-Ground Rule.** Card, popover and page share the ground colour. Structure comes from the border and hairline tokens, never from tinted surfaces.

## Typography

**Body Font:** Geist Variable (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace)

**Character:** A neutral grotesk for words beside an engineered mono for every number. Tabular, slashed-zero numerals keep columns aligned and make a figure look measured rather than designed.

### Hierarchy

- **Display** (600, 48px on phones to 72px, 0.95 line-height, -0.04em): Landing headlines only, in short declarative sentences.
- **Headline** (600, 30–36px, -0.03em): Secondary landing statements and the login title.
- **Figure Hero** (mono, 36px on phones to 48px): The equity number, with the fraction in Muted Text.
- **Figure** (mono, 500, 24px): Stat-strip values, set in fixed rolling cells.
- **Title** (500, 16px, tight tracking): Dashboard section headings. The page title in the top bar is 18px at 600. Sub-blocks use 14px at 500.
- **Body** (400, 14px, 'ss01'): Prose, insight lines and panel copy. Landing ledes are 18px in Muted Text, capped at 44ch.
- **Data** (mono, 13px): Table cells and the phone position list.
- **Label** (mono, 11px, 0.06em, uppercase, Muted Text): Stat names, column headers, definition terms and status text. It labels data and never sits above a heading as a decorative eyebrow.

### Named Rules

**The Every-Figure-Is-Mono Rule.** Any number a trader might compare (price, size, PnL, percent, count, date, timeframe) is set in the mono face with tabular numerals. Words stay in Geist.

**The Fixed-Cell Numeral Rule.** Headline figures use rolling digits. Each character occupies its own cell and rolls up into place when its value changes, staggered 28ms per character.

## Layout

Every app page (`(main)` route group) sits in the shadcn sidebar shell: a 16rem sidebar that collapses to a 3rem icon rail (off-canvas sheet on phones), and a 64px sticky page header (sidebar trigger, title, page controls, theme toggle), over a scrolling column that stretches to the full width beside the sidebar (no max width, no centering). Gutters are 16px on phones and 32px from sm up. The page is a stack of sections, not a single-screen cockpit, with 56px between sections and 32px between panels inside a section.

The story order is fixed: the stat strip (equity first, then realized PnL, win rate, profit factor, fees and funding), then the mosaic beside edge-by-asset (1.15fr : 1fr at xl), then the chart slot beside insights (1.6fr : 1fr), then timing and sizing, then the cumulative curve beside streaks, then position history.

**The Corridor Focus Rule.** Focus lives in the URL (`?asset=`). Clicking a mosaic cell or an edge row sets it. Unselected mosaic cells drop to 12% opacity and unselected edge rows to 35%. The position table filters to the asset, and everything below the overview (timing, curve, streaks, insights) recomputes for that asset alone, with its section titles suffixed `· ASSET`. A clear chip in the top bar removes the focus.

**Responsive.** The mosaic is 16 columns on phones and 24 from sm up. The stat strip is two columns with equity spanning both, and becomes one row of five at lg. On phones, edge-bar rows put the label and figures on one line and the bar on its own full-width line beneath. The position table becomes a two-line list: symbol and realized PnL on the first line, side, leverage, date and ROE on the second, so the result is never off-screen.

The landing page runs full width (no centered container, same 16px/32px gutters as the app) with 5 : 7 splits and the same hairline rules.

## Elevation & Depth

The system is flat. There are no drop shadows. Depth and state come from three sources: hairline and border rules, the Accent wash on hover and selection, and opacity (dimming for focus, ink density for magnitude). The one inset device is the 1px inset outline (`inset 0 0 0 1px`) that draws hollow squares and negative bars. It is part of the mosaic's language, not elevation.

**The Flat Ledger Rule.** Nothing floats. A panel is a ruled rectangle on the same ground as the page.

## Shapes

Every corner is square: the radius scale is 0px at every step. The square is the unit of the world. It appears in the 4x4 pixel logo, the 3x3 pixel insights glyph, mosaic cells, hour and weekday cells, 6–10px status and insight markers, and the legend swatches. Filled versus hollow carries meaning everywhere: a filled square is a win, edge or connected state, and a hollow 1px outline is a loss, leak or disconnected state. A dashed border is used only on placeholder slots that are not wired yet (the chart slot).

**The No-Curve Rule.** Radius is zero on every element, including primitives that ask for rounding by default.

## Components

### Buttons

- **Shape:** square (0px).
- **Primary:** an ink-on-bone inversion (Bone fill, Ink text in dark), 36px tall, or 40px for landing and login CTAs. A trailing arrow icon is allowed.
- **Outline:** a 1px border on the ground. Hover takes the Accent wash. It is used for secondary CTAs, "Show more" and the corridor clear chip.
- **Ghost:** Muted Text, Accent wash on hover. It is used for the theme toggle, the "Show all assets" expander and the chart timeframes.

### Range Toggle

A joined outline segment group (7D / 30D / 90D / ALL) in uppercase mono. The selected segment inverts to a foreground fill with ground-colour text.

### Inputs / Fields

A 1px Input-colour stroke on a transparent ground, 36px tall, square. Focus strengthens the stroke to the ring colour.

### Navigation

The sidebar header carries the pixel logo and wordmark. The Menu group lists one entry per main page (Overview, Trade, Positions); pages not built yet (Analytics, Insights, News) stay listed but disabled with a SOON label. The active entry gets the Accent wash plus a 6px filled square at its right edge. Icons are 1.5-stroke lucide. The Exchanges group sits at the foot: a filled square for connected, hollow for not, with a LIVE / OFF label. The footer holds the account menu. Collapsed to icons, only glyphs and squares remain and every entry has a right-side tooltip.

### Tooltip

An inverted chip: Bone fill with Ink text, 12px, square. It carries per-bucket and per-rail detail.

### Stat Strip (signature)

A bordered strip of cells ruled by hairlines, with 20px padding. Each cell is a Label on top, then a Figure, then a 12px mono footnote. The equity cell is wider (1.6fr) and uses Figure Hero.

### Trade Mosaic (signature)

One square per closed position, oldest first, with 3px gaps. A win is filled foreground at 28–100% ink by magnitude, scaled to the 90th percentile. A loss is a 1px inset outline at matching density. Hover draws a 1px foreground outline offset by 1px and updates the readout row under a hairline: index, symbol, side and leverage, date, signed PnL. Cells pop in over 420ms, staggered 3ms each. The legend uses the same swatches.

### Edge Bars

Diverging bars around a 1px zero axis. Net profit is a filled bar to the right and net loss a hollow outlined bar to the left. Rows are buttons that toggle corridor focus. The active row gets the Accent fill and a 6px square marker.

### Cell Strip

Hour and weekday buckets drawn in the mosaic language: filled for net positive, hollow for net negative, a hairline outline when the bucket is empty. Each has a 10px mono tick below and a tooltip.

### Data Chart

Charts use the shadcn chart primitive (Recharts) so they are interactive, never static drawings. The cumulative PnL curve is a 1.5px foreground step line (`stepAfter`, because PnL changes only when a position closes) over horizontal Hairline gridlines, with a dashed Border zero line and the max drawdown shaded at 5% foreground. Axes are 11px mono Muted Text, the value axis sits on the right, and there are no tick marks. On hover a dotted cursor and a 7px square active dot appear, plus a square tooltip (Popover ground, 1px Border, no shadow) showing the close time, the cumulative value toned by sign, and the trade that moved it.

### Candlestick Chart

Price charts use TradingView lightweight-charts, lazy-loaded on the client. Candles are hollow in the world's two inks: filled bone when close is above open, hollow with a bone outline when below. Price direction is not PnL, so it never takes green or red. Volume is a muted histogram in the bottom fifth. Grid is Hairline, axes are 11px mono Muted Text, and the crosshair is dotted with Foreground labels. A mono OHLC readout sits top-left. The user's own trades are overlaid: an arrow with L or S at entry (up for long, down for short), and a square at exit labelled with realized PnL and toned up or down, which is the one place colour enters the chart. Colours resolve from the theme tokens at runtime and re-apply on theme toggle. Scrolling left pages older history in, and the newest bars refresh every 10s.

### Replay (focus mode)

`/trade/replay` is the one app page without a page header: a 48px toolbar (instrument, timeframe, start, random, exit), the chart filling the rest of a non-scrolling `h-svh` frame, a playback bar under it and a 320px ticket + log column. The sidebar starts collapsed there. Only revealed candles reach the chart; entry, stop and target are dashed price lines (ink, down, up). Keyboard first: Space, →, B, S, X shown as square hairline `kbd` chips.

### Drawing Tools (replay)

A 40px tool rail left of the replay chart: cursor, trend, rectangle, fib, long, short, path, then hide and remove all. The armed tool is solid ink, like every pressed toggle. Drawings are ink only: 1.5px strokes, rectangles at 7% ink fill with a 75% ink border, fib edges (0, 1) muted with the retracement levels in full ink and extensions dotted. Long/short is the one exception, and only because it shows profit and loss: target zone up at 14%, stop zone down at 14%, labels outside each zone. Selected drawings show 7px square handles (background fill, ink border), never round ones.

### Indicators (replay)

An Indicators button in the replay toolbar (beside the interval bar on phones) opens a popover listing each indicator as a row with a square switch: filled = on, hollow = off, the language of the exchange status squares. Options sit indented under their indicator and dim while it is off. The button carries the number switched on. Choices persist in the browser.

- **Sessions:** Asia (Tokyo 09:00–18:00), London (08:00–17:00) and New York (08:00–17:00), each in its own city's clock, so daylight saving moves them as it moves the market; the menu lists today's hours in the viewer's zone. Each session is a box behind the candles from its open to its close, spanning the high and low traded inside it, built only from revealed bars, so in replay it grows bar by bar and stops at the newest one. Sessions are the one place hue names a thing rather than a sign: violet Asia, blue London, lime New York (`--session-asia`, `--session-london`, `--session-ny`, darker in the light theme), all clear of up's teal and down's red. Each box is a 13% wash of its hue with a 60% frame and a 10px uppercase mono label in the full hue above the box (inside it near the top, under the OHLC readout); where London and New York overlap the washes mix. The menu's session switches use the same hues, so it doubles as the legend.
- **Fair value gaps:** the three-candle gap (candle 1's high below candle 3's low, or the mirror for bearish), detected from revealed bars only, so a gap appears when its third candle does. Direction takes `--up` / `--down` as in order flow: an open gap is a 14% wash from its middle candle to the newest bar, with a 55% hairline on the edge price would reach first and a dotted midpoint (50%). As price trades back in, the box shrinks to what is still open; a gap traded through stops at the filling candle and, if "Show filled gaps" is on, stays as a 5% trace. Options: minimum size (Any, 0.25, 0.5, 1 × ATR 14; default 0.25) and show filled. At most the 60 newest are drawn.
- **Market structure:** swing highs and lows with `length` bars each side (3, 5 or 10; default 5), confirmed only once those bars are revealed, so they appear late and never move. Swings are labelled HH / LH / HL / LL in 10px mono Muted Text just beyond the wick (optional). A candle closing beyond the newest unbroken swing draws a break line from that swing to the candle, in the direction it broke (`--up` / `--down` at 85%): dashed for a BOS, solid for a CHoCH, named at its middle on the side it came from. The two swings still unbroken run right as dotted ink lines at 40%, the levels the next break would come from. Wicks through a swing are not breaks; they are sweeps, a later indicator. Structure draws over the candles and under the drawings; sessions and gaps sit beneath the candles.
- **Bias:** which way structure leans, top-down, and the price that would prove it wrong. No probability is shown, because none has been measured; strength is how many factors agree. The bias comes from market structure on a higher timeframe (1H, 4H or 1D; default 4H) read from its closed bars only, or from the chart's own when that timeframe is not above it. Factors: the higher timeframe's structure, the chart's structure, price vs EMA 50, and the nearest open fair value gap (below price = support, above = resistance). Invalidation is the bias timeframe's protective swing (newest unbroken low under a bullish bias, high over a bearish one); a chart candle closing through it makes the bias Neutral ("invalidated") until the higher timeframe turns. A readout panel sits top-left under the OHLC row (Popover ground at 90%, 1px Border): the verdict in uppercase mono toned up/down (Neutral muted), the timeframe it came from, "N of M agree", "Invalid below/above …", then one row per factor in the square language (filled = agrees, hollow = argues against, Border outline = no view yet) with Up/Down toned by direction; phones show the first two lines only. On the chart, the live invalidation is a solid up/down line from its swing to the newest bar labelled "Bias invalid · price"; off the visible range the label pins to that edge with a small triangle toward it. A bias already broken leaves a dashed 50% trace ending in a 7px hollow square and "Invalidated". Labels that do not fit or would collide are dropped. Shown on 2H bars and shorter.

### Landing Replay Band (signature)

The landing's second peak after the mosaic hero: a full-bleed SVG candle chart in the hollow-candle inks, cut by a 1.5px ink replay cursor. Past the cursor is a 45° hairline hatch at 35% background veil with a bordered "Next bar hidden →" tag; the only colour is a long position's target and stop zones (up/down at 13%) and the open R readout. The last 24 candles step in bar by bar via a scroll-driven `clip-path` (`steps(24)`), CSS only, complete by default when unsupported or under reduced motion. A narrower 40-candle crop replaces it below `md` so labels stay legible. Keycap legend underneath mirrors the replay shortcuts.

### Workspace (widget terminal)

`/workspace`: a 24-column grid (28px rows, 8px gaps) of widgets the user drags by their header grip, resizes from the right, bottom and corner, adds from a picker and removes with an inline Keep / Remove confirm. Each widget is a 1px-bordered panel with a 28px header: grip + title on the left, then its own controls, a short instrument picker (coin only), a numbered link group (1–3, `Link2` icon; numbers stand in for TradingView's link colours) and remove. The drag placeholder is ink at 8% with a dashed ink outline; nothing casts a shadow. Below `md` widgets stack in layout order and do not drag.

Order flow is the one place up/down colour means direction rather than result: bids, buy prints and the bid side of the imbalance bar use `--up`, asks and sells `--down`, with depth bars at 12%. Funding is shown neutral, because its meaning depends on the side held. A status pill in the header (filled square = live) reports the OKX feed.

The Add widget picker groups widgets under Market and Order flow. Narrow widgets (book, volume profile) keep secondary toggles in a body strip so the header title survives; wide ones put them in the header. The order-flow widgets:

- **Depth:** cumulative bid and ask step areas (`--up` / `--down` at 12%, 1.5px edge) either side of a dashed mid line. The range is a 1× / 2× / 4× zoom into the depth OKX actually sends (400 levels), with the real ±% in the readout. Hover draws a dotted cursor and a 7px square on the curve.
- **CVD:** hollow candles on top, the cumulative delta as a 2px ink line over a dashed zero below, each period's delta as up/down bars at 60% at the bottom (lightweight-charts panes). History comes from OKX taker volume, not from when the widget opened.
- **Volume profile:** ink density only, because volume has no direction: the point of control is solid ink, the value area (70%) 40%, the tails 15%. The last price is an inverted chip on the right axis.
- **Footprint:** sell × buy per price row and column of time, in 10px mono. Cell ink density is the row's volume, a side outweighing the other 3:1 goes bold in its colour, and the column's point of control carries the 1px inset outline. It is fed by live trades only, so its strip says "Live since".

The derivatives widgets (Derivatives group) share one chart: hollow candles on top, the statistic as a 2px ink line in the middle with a dashed reference level (0 for a delta, 1 for a ratio, 50% for a share), and per-period bars at the bottom in up/down at 60%. Readouts sit top-left in 11px mono and label the period by time today, date and time before today, or date alone for daily periods.

- **Open interest:** USD open interest with each period's change as bars, and the change across the window.
- **Long/short ratio:** all accounts, top traders' accounts or top traders' position size, chosen in a body strip. Long and short shares take up/down only as the two sides of the split.
- **Taker buy/sell:** the buyers' share as the line, buy volume above the axis and sell volume below.
- **Basis:** the premium over the index (about a point a minute), with a live strip of last − index, the index and funding, all neutral because their meaning depends on the side held.
- **Liquidations:** a tape like Trades. A liquidated long is a forced sell and takes `--down`; a liquidated short takes `--up`. Sizes are USD notional, the biggest tenth is bold, and the footer splits longs against shorts since the oldest listed event.

### Public Shell and Tools

Pages reachable without login (`(public)` route group: landing, login, `/tools/*`) share one public header (wordmark, a Tools nav with unbuilt tools marked SOON, theme toggle, Log in) and footer. The app (`(main)` route group) keeps the sidebar shell, whose Tools group links to the same public tool pages. A tool page is a form panel beside one result panel, both 1px bordered, never a grid of cards. Results read as a ledger: mono labels over mono figures, sections split by hairlines, with green and red only on signed money outcomes (loss at stop, profit at target, max risk). Price levels are drawn to scale on a vertical rule: the entry is a filled square, the target and stop are hollow squares. The formula explanation lives in a dialog that substitutes the user's live numbers into every step.

### Tables

Rows are ruled by hairlines. The header row is Label style. Numbers are right-aligned and mono, and signed columns take the Sign-Only colours. Instrument links show an arrow on hover or focus and open the exchange.

## Do's and Don'ts

### Do:

- **Do** keep every corner at 0px and build structure from the hairline and border tokens.
- **Do** encode results as filled versus hollow squares and as ink density before reaching for any other device.
- **Do** set every figure in Geist Mono with tabular, slashed-zero numerals.
- **Do** colour a figure Up or Down only when it is a signed result, and mute zero.
- **Do** route asset focus through `?asset=` so it dims the mosaic and edge rows, filters history, and rescopes everything below the overview.
- **Do** ship both themes from the toggle, dark by default, with the theme script applied before paint.
- **Do** give phones the two-line position list and edge rows with the bar on its own line.

### Don't:

- **Don't** use rounded tiles, KPI card stacks, or a brand accent hue such as exchange yellow.
- **Don't** use green or red for status, connection, selection, focus or decoration. The live dot is foreground.
- **Don't** add drop shadows or tinted panels to separate surfaces.
- **Don't** place uppercase mono labels above headings as eyebrows. Label style names data.
