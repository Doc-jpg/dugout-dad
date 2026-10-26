# Decisions and lessons

A running log, newest first. Keep adding to it; the point is that the next session starts from here.

## 2026-10-26, pitch-by-pitch (Deren's feedback after trying the practice game)

- Pitch logging is now the default way to score: Ball / Strike / Foul on the game screen, count shown by the batter, ball four opens the walk, strike three asks swinging or looking, the ball in play counts as a strike. Per-game switch "Log every pitch" (off = result-only scoring, nothing invented). Pitch events are their own log entries, so undo works pitch by pitch and the count survives closing the app.
- Pitcher pitch counts and strike percentage update on every pitch for whichever side is pitching. The deciding pitch is never counted twice (if ball four or strike three was logged, the at-bat does not add it again). Catch-up at-bats with no logged pitches get no invented count; with logging on, a first-pitch ball in play is one pitch.
- A side with nobody at pitcher gets a placeholder "Pitcher" when the game starts (unknown opponents), so their pitches have an owner; tap the pitcher's name to fill in name, number, throws.
- Added: "Ball, runners moved" shortcut (ball then wild pitch or passed ball), pickoff attempts by the pitcher and back-picks by the catcher to any base (logged, no movement), Throws L/R on every player (roster editor and quick edit from the game screen), bats shown too.
- Tests: 83. Scripts: `scripts/pitchgame.cjs` (34 checks: counts, fouls at two strikes, auto walk and strikeout, pitch totals and strike percentage both sides, pickoffs, undo of a pitch, placeholder pitcher, quick edit) and `scripts/fullgame.cjs` (59 checks, result-only mode).

## 2026-10-26, hosted and practice mode

- Repository: https://github.com/Doc-jpg/dugout-dad (Deren's personal GitHub, public; no roster data in it). Live app: https://doc-jpg.github.io/dugout-dad/ (GitHub Pages, deploys automatically on every push to main through .github/workflows/pages.yml). Verified on the live address: service worker installs, practice game loads, a play scores, reload with network off works.
- Practice mode (src/db/sample.ts, Help page): loads the roster, a practice opponent, one finished game and one paused in the third inning; all tagged PRACTICE SAMPLE; one button removes them. Eight full games stored on a phone profile used 2.6 MB including the app itself.
- Claude's GitHub connection for this repo is the Claude GitHub app installed on the Doc-jpg account, limited to this one repository.
- The laptop copy under Claude Knowledge is a plain folder; git there is awkward because the mounted folder cannot delete lock files. Prefer: the laptop just opens the live address. The folder is the record.
- Full-game stress test (`scripts/fullgame.cjs`, run with URL=... ): 59 actions over six innings with a double play, bases-loaded walk, caught stealing, pickoff, dropped third strike, sac bunt and fly, intentional walk, wild pitch, passed ball, mid-inning position swap, pitching change with runners on, wrong-batter fix, undo and redo, a missed half-inning credited through Fix, a score adjustment, editing a second-inning home run into a double from the Log in the sixth, end by time limit, reopen, score, end again. Every play's score, outs and runners checked. Bug found and fixed: in edit mode, Back closed the sheet instead of returning to the result choices.
- Lesson: in the acceptance scripts, wait for a URL change after an async button, not for text that may already be on the page.

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
