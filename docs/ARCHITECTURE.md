# Dugout Dad architecture

## The one-sentence version

One React + TypeScript web app, installed on the phone and opened on the laptop, with an append-only event log per game in IndexedDB; every number on every screen is recomputed from that log, and a weekend's games travel as a ZIP of JSON with checksums.

## Why this shape

The master prompt suggested a PWA on the phone plus SQLite and a local API on the desktop. Two things argued for a simpler shape:

1. **Simplicity of maintenance** was a stated priority. A local API means something that has to be running before the dashboards work. The same app in the laptop's browser needs nothing running (double-click a file, or just open a URL if it is hosted).
2. **One engine, one truth.** Phone and laptop replay the same event log with the same code, so a box score on the phone and a season table on the laptop can never disagree.

SQLite is still there as an export: one click produces a `.sqlite` file with the raw events and every derived table (plate appearances, defensive intervals, pitcher lines, fielding plays, runs), so outside tools can query the data without Dugout Dad.

If a hosted sync is ever wanted (Phase 5), the archive format is already the unit of transfer: a server would simply accept and merge archives by game id and revision.

## Stack

| Layer | Choice | Reason |
|---|---|---|
| UI | React 18, TypeScript, Vite 5, hand-written CSS | Proven, small, no design-system weight on a phone |
| Routing | react-router (hash routes) | Works on any static host without server rewrites |
| Storage | IndexedDB through Dexie 4, `dexie-react-hooks` live queries | Durable, transactional, reactive; works on iOS Safari |
| Offline | vite-plugin-pwa (Workbox) precaching the whole shell | Opens with no network; verified in the acceptance script |
| Export | fflate ZIP + WebCrypto SHA-256 | Tiny, no server, checksums catch corruption |
| SQLite | sql.js (WASM), loaded only when asked | Keeps the phone download small |
| Tests | vitest + fake-indexeddb | 76 baseball-specific tests run in two seconds |

## Data model (src/engine/types.ts)

- **Team, Player, Season, Tournament**: plain documents keyed by UUID. A player's identity is the id, never the jersey number. Placeholder opponents (`isPlaceholder`) can be renamed; events reference the id, so nothing is lost. `mergePlayers` rewrites event references when two entries turn out to be one kid.
- **Game**: metadata and rules (scheduled innings, time limit, field size, ERA basis), scoring level (A quick, B enhanced, C full), opponent scoring depth, `revision` (bumped on every write; used by import conflict detection), `lastExportedAt`.
- **GameEvent** (the log): `lineup_set`, `defense_set`, `defense_change`, `lineup_change` (subs, pinch and courtesy runners), `plate_appearance`, `baserunning`, `pitch_count`, `score_adjustment`, `state_correction`, `half_inning_end`, `note`, `game_end`. Each has a dense `seq`; undo removes the last one, edits replace in place, deletes renumber, and an `audit` table keeps before/after.
- **Plate appearance**: result (`1B`, `2B`, `3B`, `HR`, `BB`, `IBB`, `HBP`, `K`, `KL`, `D3K`, `GO`, `FO`, `LO`, `PO`, `FC`, `SAC`, `SF`, `DP`, `TP`, `ROE`, `CI`, `OTHER_OUT`, `OTHER_SAFE`), explicit runner moves (batter and each runner: destination, RBI flag, how), optional batted ball (trajectory, hardness, zone, tap point, tags), optional fielding record (position sequence, errors with kind and difficulty, execution judgment), optional pitch detail, RBI total, QAB judgment.
- **StatSnapshot**: an imported season export, stored with the verbatim file text, its SHA-256 (duplicate protection), section-aware values per player (`batting`, `pitching`, `fielding` maps keyed by the original header), the Totals row and the glossary.

## The replay engine (src/engine/reducer.ts)

`replayGame(game, events)` walks the log once and produces:

- live state: inning, half, outs, score by inning, runners (with the responsible pitcher and whether they reached on an error), next batter per side, defensive alignment per side;
- `paLog`: every plate appearance with its context (outs and bases before, RISP, runs scored, batter outcome, runners left on base, batted ball, fielding, pitches);
- `baserunningLog`, `runLog` (each run with pitcher and earned/unearned reason);
- `pitcherLines`: outs, batters faced, hits, runs, earned runs (with the basis), walks, strikeouts, pitch count and its source, inherited and bequeathed runners, appearance intervals;
- `intervals`: defensive assignment intervals measured in the fielding side's cumulative **outs**;
- `fieldingPlays`: putouts, assists, errors and observational judgments resolved to the player at that position at that moment;
- `warnings`: anything inconsistent (four outs, a move for an empty base, batting out of turn, manual corrections).

### Defensive time in outs

Each (side, player, position) interval records `startOuts` and `endOuts` on the fielding side's out counter. A substitution closes the old interval at the current counter and opens a new one. Position innings are `sum(endOuts - startOuts)`, displayed with `outsToInnings` (4 outs = `1.1`). Nothing is ever converted to decimal innings. A game that ends mid-inning simply stops the counter.

### Error attribution

A fielding error carries the position where it happened. At replay the player is looked up from the alignment at that point in the log, so correcting a substitution also corrects attribution. The second critical test covers this: a throwing error after moving from CF to SS lands on the SS appearance.

### Earned runs

Unearned when the runner reached on an error or passed ball, when the scoring move itself was on an error or passed ball, or when the half-inning should already have ended (outs plus error-caused lost outs since this pitcher entered the half reach three). Games scored at level A without any fielding detail mark pitcher lines `assumed_no_errors` and the tables show an asterisk. A manual basis is reserved for a future `er_adjustment` event.

### Proposals, not assumptions

`propose.ts` suggests runner advancement and RBI credit for each result (walk forces, groundout moves forced runners, sac fly scores from third, double play takes the lead runner). The scorer sees and can change every move before it is saved; the reducer applies only what was saved.

## Statistics (src/engine/stats.ts, lineup.ts, snapshots.ts)

- Every rate carries its denominator and is `null` when the denominator is zero. Coverage counts (trajectory recorded for 38 of 45 balls in play, and so on) are part of each line.
- Batting lines follow the GameChanger categories plus contact-quality rates labeled observational. QAB is a settings-driven definition. BA/RISP, two-out RBI, LOB, GIDP and BABIP come from the PA context.
- Pitching: ERA on a configurable innings basis (7 by default), WHIP, BAA, BB/INN, K/BF, pitch totals only when every appearance has a known count.
- Fielding: one line per (player, position) with chances, errors, errors per 10 innings, routine and difficult opportunities, execution tallies, and an observational-confidence label by sample size.
- Playing time: outs by position, share of the player's time and of the team's defensive innings, starts, games appeared, per-game grid, current streaks without an appearance.
- Lineup lab: season rates with the last N games overweighted (documented as an overweight, not a double count), shrunk toward the team mean with 20 PA of prior; composite = adjusted OBP x 1.8 + adjusted SLG; recommendation with reasons, alternatives, expected PA per slot, weak stretches, sample-size caveats; a seeded Monte Carlo for rough comparison.
- Snapshots: imported totals are read by section; position innings come from the fielding columns; position-level errors are never invented. `canCombine` allows a combined view only when the snapshot's last covered date precedes every scored game.

## Transfer (src/io)

- `buildArchive` writes `manifest.json` (format, version, app version, counts, SHA-256 per file), `teams.json`, `players.json`, `seasons.json`, `tournaments.json`, `games/<id>.json` (game, events, audit), optional snapshots and settings.
- `readArchive` verifies every checksum and rejects unknown formats.
- `planImport` classifies each game as new, unchanged (same revision and same event hash), update (incoming revision higher) or conflict (local is newer or same revision with different content); teams and players are upserted, never deleted.
- `commitImport` is transactional and records a `TransferRecord`.
- The GameChanger importer detects the two-row header, splits identity/batting/pitching/fielding by the section row, parses `-` as not available, innings-style columns as outs, keeps the Totals row and glossary, suggests player matches (exact, alias, last name plus number, fuzzy), refuses the same file twice, and can roll back.

## Reliability notes

- Every write is a Dexie transaction. Never await non-IndexedDB work inside a transaction (it commits early); hashes are computed before the transaction starts.
- The app asks for persistent storage on launch and shows the status in Settings and on the home screen. iOS grants it to installed apps.
- The home screen reminds you to export when finished games have not been exported.
- Known iOS limit: Safari may evict storage for sites not used in a while; an installed home-screen app is treated better, and the weekend export is the real backup.
