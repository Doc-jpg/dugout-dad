# Roadmap

Version 0.1.0 covers Phases 1 and 2 of the master prompt fully, most of Phase 3, and a first pass at Phase 4. This is what is deliberately left for later, roughly in the order it would pay off.

## Soon (after a few real weekends)

- **Pinch hitters and lineup substitutions from the live screen.** The event type exists (`lineup_change`) and courtesy/pinch runners replay correctly, but the only UI today is "Edit lineups" (which re-issues the whole order). A one-tap "sub in" sheet is the next live-screen feature.
- **Opponent fielding sequences when we bat.** The fielder picker shows the opponent's alignment only if their defense was entered. Add a numbers-only keypad (6-3 typed as digits) for when it was not.
- **Earned-run manual override** (`er_adjustment` event) for the cases the reconstruction cannot know.
- **Playing-time opportunity report** as a formatted printable page (today: the player page prints, which covers it, but a one-page report with the caveats baked in is cleaner for a coach conversation).
- **Quick notes and tags from the live screen** (predefined chips: excellent defensive play, poor route, missed cutoff, great at-bat). Notes exist; the chip list does not yet.
- **Season records** with roster-by-season editing (the `Season` entity exists; games are not yet assigned to seasons in the UI).

## Phase 4 depth

- Run-expectancy lineup simulation with real runner-advancement probabilities from the recorded data instead of fixed rules.
- Pitcher rest-day rules per organization (`PitchingRules` on tournaments) with the full table of pitch thresholds, not just a daily cap.
- Trend charts (OPS by weekend, hard-hit rate over time, innings at SS by weekend). The data is there; the charts are not.
- Team defensive alignment analysis (runs allowed and routine conversion by alignment), with the caveats the prompt calls for.

## Phase 5

- Pitch-by-pitch scoring polish (pitch type, velocity, the dropped-third-strike flow with runner options).
- Photo and video references attached to plays (kept out of the archive by default).
- Optional secure sync: a small service that accepts archives and merges by game id and revision. The archive format and conflict rules are already the contract.

## Housekeeping

- Code-split the analytics pages so the first load on the phone is smaller (sql.js is already lazy).
- A `preflight` data-integrity check that replays every game and reports warnings in one place.
- Automated UI tests beyond the acceptance script.
