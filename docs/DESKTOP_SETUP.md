# Dugout Dad on your computer

The laptop runs the same app. Its browser database is the permanent store; the ZIP archives and SQLite exports are the backups.

## Start it

- **Windows**: double-click `START_DUGOUT_DAD.cmd`. It opens `http://localhost:4173` in your default browser and keeps a server window open. Close the window to stop.
- **Mac / Linux**: `node server.cjs` in this folder, then open `http://localhost:4173`.
- **If the app is hosted** (GitHub Pages): just open the same URL you use on the phone in Chrome or Edge on the laptop. Nothing to run. The laptop's copy of the data is separate from the phone's; move games with the export/import.

Use one browser and one address consistently. Browser storage belongs to the exact address (`localhost:4173` and `127.0.0.1:4173` are two different stores).

## First time

1. Teams: add the Rattlers and the roster (or import a weekend ZIP from the phone, which brings the roster with it).
2. Transfer, "Import a GameChanger season export": drop the CSV, check the detected sections, match the players, set "stats current as of" and the last covered game date, import.
3. Stats: switch between "Scored in Dugout Dad", "Imported totals" and "Combined" (Combined only turns on when the coverage dates make it safe).

## Every weekend

1. Transfer, drop the ZIP from the phone onto "Import games". Review the preview (new, update, unchanged, conflict) and import.
2. Stats, Player page, Position comparison, Lineup lab, Pitching workload, Tournaments.
3. Transfer, "Full backup (ZIP)" every so often and keep it somewhere outside the browser (OneDrive, Drive, a USB stick).

## SQLite

Transfer, "Export SQLite database" writes `dugout-dad_<date>.sqlite`. Open it with DB Browser for SQLite (free), DBeaver, Python (`sqlite3`), R, or Excel through an ODBC driver. Tables: `teams`, `players`, `games`, `events` (raw log as JSON), `plate_appearances`, `baserunning`, `defense_intervals`, `pitcher_lines`, `fielding_plays`, `runs`, `score_adjustments`, `snapshots`, `snapshot_values`; views `v_position_innings` and `v_player_position_innings_by_game`. Innings are stored as outs with an `innings_text` column.

Example: innings at shortstop by player

```sql
SELECT p.first_name, p.last_name, v.innings_text
FROM v_position_innings v JOIN players p ON p.id = v.player_id
WHERE v.position = 6 ORDER BY v.outs DESC;
```

## Restore

Transfer, "Import games" with a full backup ZIP restores teams, players, games and snapshots. Games already present are matched by id.

## Developer commands

```
npm install
npm run dev      # live-reload development server
npm test         # 76 tests
npm run build    # typecheck + build dist/
npm run serve    # serve dist/ on port 4173
```
