# Decisions and lessons

A running log, newest first. Keep adding to it; the point is that the next session starts from here.

## 2026-10-25, initial build

1. **One app for phone and laptop instead of PWA + SQLite + local API.** Reason: nothing has to be running for the dashboards, and one replay engine means the phone and laptop can never disagree. SQLite stays as an export. See ARCHITECTURE.md.
2. **Event sourcing for games.** Every number is derived from the log; corrections are edits to the log. Undo is removing the last event. This is what makes "edit a previous play and everything recalculates" trivial.
3. **Outs are the unit of defensive time.** Never decimal innings. `outsToInnings(4) === '1.1'`.
4. **Errors carry the position; the player is resolved at replay.** Fixing a substitution fixes attribution.
5. **Proposals are visible and editable.** The app suggests runner advancement and RBIs; the scorer confirms. The reducer never invents moves.
6. **Imported totals are snapshots, not events.** No fake games are created from a season CSV. Combination with scored games is allowed only when the dates make it safe.
7. **Repeated GameChanger headers are read by section.** Batting BB and pitching BB are different columns and are stored separately (verified on the real file: Eli 11 vs 21).
8. **The real CSV is kept out of git.** `data/private/` is ignored; tests use an anonymized fixture.
9. **Hash routes** so the app works on GitHub Pages or any static host without rewrite rules.
10. **Settings reads are side-effect free.** A Dexie live query cannot write; the first version tried to seed defaults inside one and crashed on first load.
11. **Defaults that depend on live data are set in effects, not initial state.** Two screens (New game, GameChanger import) initialized a team id before the team list had loaded and stayed disabled. Pattern: `useEffect(() => { if (!value && list.length) setValue(list[0].id) }, [list])`.
12. **Role-based selectors with exact names in the acceptance script.** `text=Hit` also matches "Hit by pitch" and the big "Record at-bat hit · out" button.

## Lessons for scoring real games (to confirm after the first weekend)

- Two or three taps per routine at-bat is real: Strikeout, Swinging, Confirm. Hit, Single, Confirm (Quick level) or Skip, Confirm (Enhanced).
- The "Our defense for next half" button while batting is the right moment to set the next inning's alignment so the first pitch of the half is attributed correctly.
- If a play was missed, use Fix: "Opponent scored two runs that I missed" is a score adjustment, not fake hits.
