# Dugout Dad

A private, offline-first baseball scorekeeping, player evaluation and analytics app for one knowledgeable baseball parent. No account, no server, no subscription. Everything lives on your devices and in files you own.

- **Phone**: an installable web app (PWA) for scoring games from the stands, with or without a signal.
- **Computer**: the same app opened in Chrome or Edge on your laptop, holding the permanent database, with the analytics dashboards, the GameChanger importer, and SQLite export.
- **Transfer**: one ZIP per weekend (JSON plus checksums) moved by AirDrop, Files, email, USB, anything.

Built October 2026 for Eli's travel baseball (Oklahoma Rattlers 13U) from the master prompt in `docs/MASTER_PROMPT.md`.

## What works today (version 0.1.0)

| Area | Status |
|---|---|
| Teams and rosters, roster status (regular, pickup, guest, inactive, former), player merge | Working |
| Game setup: date, tournament, venue, home/away, innings, time limit, 50/70, 54/80, 60/90, scoring depth | Working |
| Batting orders for both sides, unknown opponents (Batter 1..9, #12), rename later without losing events | Working |
| Starting defense on a tap-to-assign diamond, defense carried forward, swaps and pitching changes mid-inning | Working |
| Live scoring: hit, out, strikeout, walk, HBP, reached on error, fielder's choice, other, in two to three taps | Working |
| Runner review with proposed advancement, RBI and "scored on error" toggles, warnings for impossible plays | Working |
| Baserunning between at-bats: SB, CS, pickoff, WP, PB, balk, advance on error or throw, other | Working |
| Contact detail: trajectory, soft/medium/hard (observed), tap-the-field location, tags | Working |
| Fielding sequences (6-3, F8, 6-4-3), errors by position, routine/difficult and execution judgments | Working |
| Pitch totals per at-bat (Enhanced) and pitch-by-pitch (Full); manual or scoreboard pitch counts | Working |
| Undo, redo, edit any previous play, delete any event, full audit trail | Working |
| Fix the record: score adjustments, inning/outs/runner sync, end a half-inning with missed outs credited | Working |
| Game end by regulation, time limit, mercy rule, walk-off, weather, forfeit; reopen later | Working |
| Defensive playing time in outs, shown in baseball notation (1.1 = one inning, one out) | Working, tested |
| Errors attributed to the position played at that moment | Working, tested |
| Pitcher lines with inherited runners and earned/unearned reconstruction | Working, tested |
| Batting, pitching, fielding and playing-time tables with denominators and coverage counts | Working |
| Player profile (Eli's dashboard), position comparison, lineup lab, pitching workload, tournaments, box scores | Working |
| Weekend export (ZIP + SHA-256), import with new/update/unchanged/conflict preview, duplicate protection | Working, tested |
| GameChanger season CSV import, section-aware (batting BB vs pitching BB), innings as outs, rollback | Working, tested on the real Fall 2026 file |
| Imported totals kept separate from scored games; "Combined" only when the coverage dates allow it | Working |
| SQLite export of the whole database (tables plus a position-innings view) | Working |
| Offline: full app shell precached by a service worker; verified reloading with the network off | Working |

See `docs/ROADMAP.md` for what is deliberately not built yet.

## Quick start

### On your computer (Windows)

1. Double-click `START_DUGOUT_DAD.cmd`. It starts a tiny local web server and opens `http://localhost:4173`.
2. Leave that black window open while you use the app. Close it when you are done.
3. Your data lives in the browser's storage for `localhost:4173`. Keep using the same port and the same browser.

Needs Node.js (the script also tries Python if Node is missing). If neither is installed, install Node from nodejs.org (LTS), then run the script again. Full notes: `docs/DESKTOP_SETUP.md`.

### On your iPhone

The app is live at **https://doc-jpg.github.io/dugout-dad/**. Open it in Safari, tap Share, then **Add to Home Screen**. Open it once from the home screen while online; after that it works with no signal. Full notes: `docs/IPHONE_SETUP.md`.

### Weekend routine

1. Saturday: open Dugout Dad from the home screen (no signal needed). New game, pick the team and opponent, set the lineup and defense, score.
2. Score as many games as you like. Each finished game is saved on the phone.
3. Sunday night: Transfer, "Export the weekend". Share the ZIP to Files, AirDrop it to the laptop, or email it to yourself.
4. On the laptop: Transfer, drop the ZIP on "Import games". Importing the same ZIP twice changes nothing.
5. Stats, then the player page for Eli, Position comparison, Lineup lab.

## Developing

```
npm install
npm run dev        # http://localhost:5173 with hot reload
npm test           # 76 baseball-specific tests (vitest)
npm run build      # typecheck + production build into dist/
npm run serve      # serve dist/ at http://localhost:4173 (what the .cmd does)
```

Acceptance walkthrough (headless phone browser, scores two games, exports, imports on a fresh profile, imports the GameChanger CSV, checks offline reload): `node scripts/uat.cjs` with `npm run serve` running. It expects the real CSV at `data/private/` (gitignored).

## Where things are

```
src/engine/   types.ts (data model), reducer.ts (event replay), propose.ts (default advancement),
              stats.ts (aggregations), lineup.ts (weighting, recommendation, workload), snapshots.ts (imports)
src/db/       Dexie / IndexedDB schema and repositories (append, undo, edit, delete, merge)
src/io/       csv.ts, gamechanger.ts (importer), archive.ts (ZIP export/import), sqlite.ts, hash.ts
src/ui/       React pages and components (phone-first)
tests/        vitest suites, anonymized GameChanger fixture
docs/         architecture, setup guides, roadmap, decisions, master prompt, screenshots
server.cjs    zero-dependency static server for the laptop
```

## Privacy

No analytics, no network calls from the app, no accounts. Opponent players need nothing more than a number or a placeholder name. The repository ignores `data/private/` where the real GameChanger export lives.
