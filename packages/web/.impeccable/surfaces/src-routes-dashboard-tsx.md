---
version: 1
slug: "src-routes-dashboard-tsx"
primary_target: "src/routes/dashboard.tsx"
related_targets: ["src/routes/index.tsx","src/routes/login.tsx"]
---

# Surface brief: dashboard (/dashboard), plus landing (/) and login (/login) in the same world

Mode: Operate (dashboard). Landing is Persuade but inherits this world; login is a dummy gate.
Audience/job: the owner reviewing closed OKX swap positions after sessions; diagnose edge by instrument, side, time, leverage. Later public traders.
Constraints: black/white monochrome, mysterious; colour only where it carries information (PnL sign). Light + dark themes with toggle. Sections scroll (not one-screen cockpit). shadcn/ui components. Chart slot is a placeholder (TradingView vs lightweight-charts undecided). AI insight widget (Gemini) is dummy UI. OKX deep links per instrument. Exchange layer pluggable for Binance.
Unresolved: real auth, equity endpoint wired (OKX /account/balance), chart lib.

## Direction contract

THESIS: Every closed position is one square pixel; the trader's history becomes their own punk-grid portrait. Refuses the exchange-clone KPI-card dashboard with yellow accent and rounded tiles.

OWN-WORLD: Ink black #0a0a0a ground / bone white #f4f4f2 ink, greys between; light theme inverts. Green #2ebd85 / red #f6465d only for PnL sign. Hard square cells, 1px hairlines, zero radius everywhere. Geist for UI, Geist Mono tabular numerals for every figure. Logo is a 4x4 pixel glyph.

STORY: The trader sees equity and verdict (realized PnL, win rate, profit factor, fees) first, then the mosaic shows the whole 90-day history at once, then the edge breakdowns say where the money leaks, then the table lets them audit any trade and jump to OKX.

FIRST VIEWPORT: 64px left icon rail with pixel logo; top bar with title, period tabs (7D/30D/90D/ALL), exchange status, theme toggle. Hairline-ruled equity strip (equity large, then realized, win rate, fees, profit factor). Below: mosaic panel (24-col grid, 333 cells, filled=win, hollow=loss, opacity=magnitude) left; edge-by-instrument diverging bars right; chart slot under it.

FORM: Trade Mosaic (on-chain pixel art grid), candidate 3 of 7, seed key d7254700. Signature move: the mosaic; hover a cell = that trade, click an instrument = corridor focus across mosaic, breakdown and table (others dim). Raises: fixed-cell numerals (split-flap); hairline state marks, no radius (centre-rail); corridor focus (transit); one reserved colour per job (orienteering).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
