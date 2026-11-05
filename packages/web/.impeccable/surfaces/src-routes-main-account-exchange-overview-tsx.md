---
version: 1
slug: "src-routes-main-account-exchange-overview-tsx"
primary_target: "src/routes/(main)/(account)/$exchange/overview.tsx"
related_targets: ["src/styles.css","src/components/dashboard/stat-strip.tsx","src/components/dashboard/mosaic.tsx","src/components/dashboard/edge-bars.tsx"]
---

## Direction contract

THESIS: crypz stops reading as a monochrome pixel-grid ledger and starts reading as a pit-wall session debrief — every closed trading session gets the same read a race engineer gives a driver after a stint: sectors, deltas against your own best, and the one number that should change what you do next session. Refuses the exchange-clone KPI dashboard (rounded tiles, card stacks, a single generic brand accent) and refuses its own prior world (zero-radius squares, everything in mono, colour reserved only for PnL sign).

OWN-WORLD: Graphite ground (`oklch` near `#15181d`), off-white ink. A real accent set with named jobs, not one brand colour: violet marks a personal-best session or the single most load-bearing flagged metric on screen (scarce, never decorative); amber flags elevated leverage/risk; teal and coral (the existing up/down hues, brightened) stay reserved for PnL sign as before. Soft-radius cards (10–12px) replace the hard square; a 3px coloured top tab on a stat card is the only place a border carries meaning, and only when that card is flagged. Geist / Geist Mono stay (already self-hosted, already a confident neutral grotesk + engineered mono) but every size step grows: body 15–16px, section titles 18–20px, stat figures 28–40px, labels 12–13px — nothing under 12px. Numbers stay tabular mono; words stay Geist.

STORY: The trader opens Overview and immediately sees this session's shape, not a wall of identical tiles: equity and realized PnL lead, the session trace shows where today sits against their own personal-best and worst sessions (violet / muted), amber calls out any session run at elevated leverage, and edge-by-instrument reads like a sector-time sheet (which instrument gained time, which lost it). The ask is the same as before — where is my edge, where is my leak — but the first read is "how did this session go" before "here is a grid of numbers."

FIRST VIEWPORT: Sidebar and 64px top bar keep their structure (unchanged navigation model, per Operate-mode rule that the world never supplies navigation). Content column: a 6-cell stat row (equity wide at 1.6fr, then realized PnL, win rate, profit factor, fees, funding), each card with generous padding and a coloured top tab only when flagged (personal-best violet, high-leverage amber). Below it, a two-column row: the session trace (a coloured bar-per-session strip, violet for personal best, coral/teal for loss/win, amber ring on high-leverage sessions) beside Edge by Instrument (a ranked list reading like sector deltas, signed figures right-aligned in mono). Positions table and remaining sections (timing, sizing, curve, streaks, insights) inherit the same card/radius/type system below the fold.

FORM: Candidate 3 of 7 on the grounded list (ranked: athlete training log, forensic audit ledger, pit-wall race debrief, boxing/MMA record book, horse-racing form guide, storm-tracking weather desk, clinical vitals chart), assigned by the roll. Raised by two declined challengers: the split-flap concourse board's mechanical-update discipline (every live figure updates as a visible event, never a silent re-render) and the centre-rail reference-setting's one-scarce-accent discipline (violet spent only on the single most load-bearing number per screen). Seed key `2a802ba4`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
