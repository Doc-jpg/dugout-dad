/**
 * SQLite export.
 *
 * Builds a self-contained .sqlite file from the IndexedDB store so the records can be opened
 * in any SQLite tool (DB Browser for SQLite, DBeaver, Python, R) and queried independently
 * of Dugout Dad. The event log is kept verbatim (events.payload_json) and the derived tables
 * are produced by the same replay engine the app uses, so numbers match what the dashboards show.
 *
 * Innings are stored as OUTS plus an innings_text column in baseball notation (1.2 = five outs).
 *
 * sql.js (SQLite compiled to WebAssembly) is loaded lazily so the phone never downloads it.
 */
import type { DugoutDB } from '../db/db';
import { replayGame, positionOuts } from '../engine/reducer';
import type { Game, GameEvent, Position } from '../engine/types';
import { outsToInnings, POSITION_LABEL } from '../engine/types';

type SqlJsStatic = import('sql.js').SqlJsStatic;
type SqlDatabase = import('sql.js').Database;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/** Load sql.js once. In the browser the wasm is served by Vite; in Node it comes from node_modules. */
export async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const mod = await import('sql.js');
      const initSqlJs = (mod as any).default ?? mod;
      if (typeof window === 'undefined') {
        // Node (tests, scripts): point at the wasm file inside node_modules.
        const { createRequire } = await import('node:module');
        const req = createRequire(import.meta.url);
        const wasmPath = req.resolve('sql.js/dist/sql-wasm.wasm');
        return initSqlJs({ locateFile: () => wasmPath });
      }
      const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default as string;
      return initSqlJs({ locateFile: () => wasmUrl });
    })().catch((e) => {
      sqlJsPromise = null;
      throw new Error(`Could not load the SQLite engine (sql.js): ${e?.message ?? e}`);
    });
  }
  return sqlJsPromise;
}

export const SQLITE_SCHEMA = `
CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT, is_mine INTEGER NOT NULL, color TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT, last_name TEXT, number TEXT, bats TEXT, throws TEXT, status TEXT, is_focus INTEGER, is_placeholder INTEGER, aliases_json TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE seasons (id TEXT PRIMARY KEY, team_id TEXT, name TEXT, start_date TEXT, end_date TEXT);
CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT, venue TEXT, pitching_rules_json TEXT);
CREATE TABLE games (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, opponent_team_id TEXT NOT NULL, my_side TEXT, date TEXT, time TEXT, season_id TEXT, tournament_id TEXT, venue TEXT, age_division TEXT, game_type TEXT, scheduled_innings INTEGER, time_limit_minutes INTEGER, field_config TEXT, era_innings INTEGER, scoring_level TEXT, status TEXT, end_reason TEXT, opponent_scoring_depth TEXT, notes TEXT, revision INTEGER, last_exported_at TEXT, created_at TEXT, updated_at TEXT, home_runs INTEGER, away_runs INTEGER, my_runs INTEGER, opp_runs INTEGER, result TEXT, warnings_json TEXT);
CREATE TABLE events (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, ts TEXT, payload_json TEXT NOT NULL);
CREATE INDEX idx_events_game ON events(game_id, seq);
CREATE TABLE plate_appearances (event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, seq INTEGER, side TEXT, inning INTEGER, half TEXT, slot INTEGER, batter_id TEXT, pitcher_id TEXT, catcher_id TEXT, result TEXT, outs_before INTEGER, runner_on_1b TEXT, runner_on_2b TEXT, runner_on_3b TEXT, risp INTEGER, rbi INTEGER, runs_scored INTEGER, batter_out INTEGER, batter_reached INTEGER, batter_destination TEXT, outs_on_play INTEGER, runners_left_on_base INTEGER, ended_inning INTEGER, trajectory TEXT, hardness TEXT, zone TEXT, contact_tags_json TEXT, fielding_sequence TEXT, error_count INTEGER, difficulty TEXT, execution TEXT, pitches_total INTEGER, qab INTEGER, uncertain INTEGER, note TEXT);
CREATE TABLE baserunning (event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, seq INTEGER, side TEXT, inning INTEGER, half TEXT, kind TEXT, runners_json TEXT, pitcher_id TEXT, catcher_id TEXT, runs_scored INTEGER, outs_on_play INTEGER);
CREATE TABLE defense_intervals (game_id TEXT NOT NULL, side TEXT, player_id TEXT NOT NULL, position INTEGER NOT NULL, position_label TEXT, start_outs INTEGER, end_outs INTEGER, outs INTEGER NOT NULL, innings_text TEXT, start_inning INTEGER, start_half TEXT, is_start INTEGER);
CREATE INDEX idx_intervals_player ON defense_intervals(player_id, position);
CREATE TABLE pitcher_lines (game_id TEXT NOT NULL, side TEXT, pitcher_id TEXT NOT NULL, started INTEGER, outs INTEGER, innings_text TEXT, batters_faced INTEGER, hits INTEGER, runs INTEGER, earned_runs INTEGER, er_basis TEXT, walks INTEGER, intentional_walks INTEGER, strikeouts INTEGER, strikeouts_looking INTEGER, hit_batters INTEGER, home_runs INTEGER, wild_pitches INTEGER, balks INTEGER, pickoffs INTEGER, stolen_bases_allowed INTEGER, caught_stealing INTEGER, pitches INTEGER, pitch_source TEXT, strikes INTEGER, first_pitch_strikes INTEGER, first_pitch_batters INTEGER, inherited_runners INTEGER, bequeathed_runners INTEGER, PRIMARY KEY (game_id, pitcher_id));
CREATE TABLE fielding_plays (game_id TEXT NOT NULL, event_id TEXT, seq INTEGER, side TEXT, inning INTEGER, half TEXT, player_id TEXT, position INTEGER, position_label TEXT, putout INTEGER, assist INTEGER, error INTEGER, error_kind TEXT, error_official INTEGER, double_play INTEGER, triple_play INTEGER, difficulty TEXT, execution TEXT, is_primary INTEGER, trajectory TEXT, hardness TEXT, zone TEXT, outcome TEXT);
CREATE TABLE runs (game_id TEXT NOT NULL, seq INTEGER, side TEXT, inning INTEGER, half TEXT, runner_id TEXT, responsible_pitcher_id TEXT, earned INTEGER, reason TEXT);
CREATE TABLE score_adjustments (game_id TEXT NOT NULL, seq INTEGER, side TEXT, runs INTEGER, reason TEXT);
CREATE TABLE snapshots (id TEXT PRIMARY KEY, source TEXT, team_id TEXT, season_id TEXT, label TEXT, as_of_date TEXT, coverage_start TEXT, coverage_end TEXT, file_name TEXT, file_sha256 TEXT, imported_at TEXT, row_count INTEGER);
CREATE TABLE snapshot_values (snapshot_id TEXT NOT NULL, row_index INTEGER NOT NULL, player_id TEXT, number TEXT, last_name TEXT, first_name TEXT, section TEXT NOT NULL, stat TEXT NOT NULL, raw TEXT, value REAL, outs INTEGER, kind TEXT, is_totals INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_snapshot_values ON snapshot_values(snapshot_id, section, stat);
CREATE TABLE transfers (id TEXT PRIMARY KEY, direction TEXT, at TEXT, file_name TEXT, sha256 TEXT, game_ids_json TEXT, summary TEXT);
CREATE TABLE export_info (key TEXT PRIMARY KEY, value TEXT);
CREATE VIEW v_position_innings AS
  SELECT player_id, position, SUM(outs) AS outs,
         (SUM(outs) / 3) || '.' || (SUM(outs) % 3) AS innings_text
  FROM defense_intervals GROUP BY player_id, position;
CREATE VIEW v_player_position_innings_by_game AS
  SELECT game_id, player_id, position, SUM(outs) AS outs,
         (SUM(outs) / 3) || '.' || (SUM(outs) % 3) AS innings_text
  FROM defense_intervals GROUP BY game_id, player_id, position;
`;

function b(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  return v ? 1 : 0;
}
function s(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return String(v);
}
function n(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function j(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

function insert(sql: SqlDatabase, table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const stmt = sql.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  try {
    for (const row of rows) stmt.run(cols.map((c) => (row[c] === undefined ? null : (row[c] as any))));
  } finally {
    stmt.free();
  }
}

export interface SqliteBuildOptions {
  appVersion?: string;
}

/** Build a complete SQLite database file (bytes) from the store. */
export async function buildSqliteDatabase(database: DugoutDB, opts: SqliteBuildOptions = {}): Promise<Uint8Array> {
  const SQL = await loadSqlJs();
  const sql = new SQL.Database();
  try {
    sql.exec('PRAGMA journal_mode = MEMORY;');
    sql.exec(SQLITE_SCHEMA);

    const [teams, players, seasons, tournaments, games, snapshots, transfers] = await Promise.all([
      database.teams.toArray(),
      database.players.toArray(),
      database.seasons.toArray(),
      database.tournaments.toArray(),
      database.games.toArray(),
      database.snapshots.toArray(),
      database.transfers.toArray()
    ]);

    sql.exec('BEGIN;');
    insert(sql, 'teams', teams.map((t) => ({
      id: t.id, name: t.name, short_name: s(t.shortName), is_mine: b(t.isMine), color: s(t.color), notes: s(t.notes), created_at: t.createdAt, updated_at: t.updatedAt
    })));
    insert(sql, 'players', players.map((p) => ({
      id: p.id, team_id: p.teamId, first_name: p.firstName, last_name: p.lastName, number: s(p.number), bats: s(p.bats), throws: s(p.throws), status: p.status,
      is_focus: b(p.isFocus), is_placeholder: b(p.isPlaceholder), aliases_json: j(p.aliases ?? []), created_at: p.createdAt, updated_at: p.updatedAt
    })));
    insert(sql, 'seasons', seasons.map((x) => ({ id: x.id, team_id: x.teamId, name: x.name, start_date: x.startDate, end_date: s(x.endDate) })));
    insert(sql, 'tournaments', tournaments.map((x) => ({ id: x.id, name: x.name, start_date: x.startDate, end_date: s(x.endDate), venue: s(x.venue), pitching_rules_json: j(x.pitchingRules) })));

    for (const game of games) {
      const events: GameEvent[] = (await database.events.where('gameId').equals(game.id).toArray()).sort((a, c) => a.seq - c.seq);
      const r = replayGame(game, events);
      const myRuns = game.mySide === 'home' ? r.state.home.runs : r.state.away.runs;
      const oppRuns = game.mySide === 'home' ? r.state.away.runs : r.state.home.runs;
      const result = game.status === 'final' ? (myRuns > oppRuns ? 'W' : myRuns < oppRuns ? 'L' : 'T') : null;
      insert(sql, 'games', [gameRow(game, r.state.home.runs, r.state.away.runs, myRuns, oppRuns, result, r.warnings)]);
      insert(sql, 'events', events.map((e) => ({ id: e.id, game_id: e.gameId, seq: e.seq, type: e.type, ts: s(e.ts), payload_json: JSON.stringify(e) })));
      insert(sql, 'plate_appearances', r.paLog.map((p) => ({
        event_id: p.eventId, game_id: game.id, seq: p.seq, side: p.side, inning: p.inning, half: p.half, slot: p.slot, batter_id: p.batterId,
        pitcher_id: s(p.pitcherId), catcher_id: s(p.catcherId), result: p.result, outs_before: p.outsBefore,
        runner_on_1b: s(p.basesBefore[1]), runner_on_2b: s(p.basesBefore[2]), runner_on_3b: s(p.basesBefore[3]),
        risp: b(p.risp), rbi: p.rbi, runs_scored: p.runsScored, batter_out: b(p.batterOut), batter_reached: b(p.batterReached),
        batter_destination: String(p.batterDestination), outs_on_play: p.outsOnPlay, runners_left_on_base: p.runnersLeftOnBase, ended_inning: b(p.endedInning),
        trajectory: s(p.battedBall?.trajectory), hardness: s(p.battedBall?.hardness), zone: s(p.battedBall?.zone), contact_tags_json: j(p.battedBall?.tags),
        fielding_sequence: p.fielding?.sequence?.length ? p.fielding.sequence.join('-') : null, error_count: p.fielding ? p.fielding.errors.filter((e) => e.official).length : null,
        difficulty: s(p.fielding?.difficulty), execution: s(p.fielding?.execution), pitches_total: n(p.pitches?.total), qab: b(p.qab), uncertain: b(p.uncertain), note: s(p.note)
      })));
      insert(sql, 'baserunning', r.baserunningLog.map((x) => ({
        event_id: x.eventId, game_id: game.id, seq: x.seq, side: x.side, inning: x.inning, half: x.half, kind: x.kind, runners_json: JSON.stringify(x.runners),
        pitcher_id: s(x.pitcherId), catcher_id: s(x.catcherId), runs_scored: x.runsScored, outs_on_play: x.outsOnPlay
      })));
      insert(sql, 'defense_intervals', r.intervals.map((iv) => {
        const ss = iv.side === 'home' ? r.state.home : r.state.away;
        const end = iv.endOuts ?? ss.defensiveOuts;
        const outs = Math.max(0, end - iv.startOuts);
        return {
          game_id: game.id, side: iv.side, player_id: iv.playerId, position: iv.position, position_label: POSITION_LABEL[iv.position as Position],
          start_outs: iv.startOuts, end_outs: end, outs, innings_text: outsToInnings(outs), start_inning: iv.startInning, start_half: iv.startHalf, is_start: b(iv.isStart)
        };
      }));
      insert(sql, 'pitcher_lines', r.pitcherLines.map((l) => ({
        game_id: game.id, side: l.side, pitcher_id: l.pitcherId, started: b(l.started), outs: l.outs, innings_text: outsToInnings(l.outs), batters_faced: l.battersFaced,
        hits: l.hits, runs: l.runs, earned_runs: l.earnedRuns, er_basis: l.erBasis, walks: l.walks, intentional_walks: l.intentionalWalks, strikeouts: l.strikeouts,
        strikeouts_looking: l.strikeoutsLooking, hit_batters: l.hitBatters, home_runs: l.homeRuns, wild_pitches: l.wildPitches, balks: l.balks, pickoffs: l.pickoffs,
        stolen_bases_allowed: l.stolenBasesAllowed, caught_stealing: l.caughtStealing, pitches: n(l.pitches), pitch_source: l.pitchSource, strikes: n(l.strikes),
        first_pitch_strikes: n(l.firstPitchStrikes), first_pitch_batters: n(l.firstPitchBatters), inherited_runners: l.inheritedRunners, bequeathed_runners: l.bequeathedRunners
      })));
      insert(sql, 'fielding_plays', r.fieldingPlays.map((f) => ({
        game_id: game.id, event_id: f.eventId, seq: f.seq, side: f.side, inning: f.inning, half: f.half, player_id: s(f.playerId), position: f.position,
        position_label: POSITION_LABEL[f.position as Position], putout: b(f.putout), assist: b(f.assist), error: b(f.error), error_kind: s(f.errorKind),
        error_official: b(f.errorOfficial), double_play: b(f.doublePlay), triple_play: b(f.triplePlay), difficulty: s(f.difficulty), execution: s(f.execution),
        is_primary: b(f.primary), trajectory: s(f.battedBall?.trajectory), hardness: s(f.battedBall?.hardness), zone: s(f.battedBall?.zone), outcome: f.outcome
      })));
      insert(sql, 'runs', r.runLog.map((x) => ({
        game_id: game.id, seq: x.seq, side: x.side, inning: x.inning, half: x.half, runner_id: x.runnerId, responsible_pitcher_id: s(x.responsiblePitcherId), earned: b(x.earned), reason: s(x.reason)
      })));
      insert(sql, 'score_adjustments', r.state.scoreAdjustments.map((a) => ({ game_id: game.id, seq: a.seq, side: a.side, runs: a.runs, reason: a.reason })));
    }

    insert(sql, 'snapshots', snapshots.map((x) => ({
      id: x.id, source: x.source, team_id: x.teamId, season_id: s(x.seasonId), label: x.label, as_of_date: x.asOfDate, coverage_start: s(x.coverageStart), coverage_end: s(x.coverageEnd),
      file_name: x.fileName, file_sha256: x.fileSha256, imported_at: x.importedAt, row_count: x.rows.length
    })));
    for (const snap of snapshots) {
      const rows: Array<Record<string, unknown>> = [];
      const pushRow = (row: typeof snap.rows[number], rowIndex: number, isTotals: boolean) => {
        for (const section of ['batting', 'pitching', 'fielding'] as const) {
          for (const [stat, v] of Object.entries(row[section])) {
            rows.push({
              snapshot_id: snap.id, row_index: rowIndex, player_id: row.playerId, number: row.number, last_name: row.last, first_name: row.first,
              section, stat, raw: v.raw, value: v.value, outs: n(v.outs), kind: v.kind, is_totals: isTotals ? 1 : 0
            });
          }
        }
      };
      snap.rows.forEach((row, i) => pushRow(row, i, false));
      if (snap.totals) pushRow(snap.totals, -1, true);
      insert(sql, 'snapshot_values', rows);
    }
    insert(sql, 'transfers', transfers.map((t) => ({ id: t.id, direction: t.direction, at: t.at, file_name: t.fileName, sha256: s(t.sha256), game_ids_json: JSON.stringify(t.gameIds), summary: t.summary })));
    insert(sql, 'export_info', [
      { key: 'generator', value: 'Dugout Dad' },
      { key: 'app_version', value: opts.appVersion ?? 'dev' },
      { key: 'exported_at', value: new Date().toISOString() },
      { key: 'innings_note', value: 'All innings are stored as outs; innings_text uses baseball notation where the digit after the point is outs (1.2 = 5 outs).' }
    ]);
    sql.exec('COMMIT;');
    return sql.export();
  } finally {
    sql.close();
  }
}

function gameRow(game: Game, homeRuns: number, awayRuns: number, myRuns: number, oppRuns: number, result: string | null, warnings: string[]) {
  return {
    id: game.id, team_id: game.teamId, opponent_team_id: game.opponentTeamId, my_side: game.mySide, date: game.date, time: s(game.time), season_id: s(game.seasonId),
    tournament_id: s(game.tournamentId), venue: s(game.venue), age_division: s(game.ageDivision), game_type: s(game.gameType), scheduled_innings: game.rules.scheduledInnings,
    time_limit_minutes: n(game.rules.timeLimitMinutes), field_config: s(game.rules.fieldConfig), era_innings: game.rules.eraInnings, scoring_level: game.scoringLevel,
    status: game.status, end_reason: s(game.endReason), opponent_scoring_depth: game.opponentScoringDepth, notes: s(game.notes), revision: game.revision,
    last_exported_at: s(game.lastExportedAt), created_at: game.createdAt, updated_at: game.updatedAt, home_runs: homeRuns, away_runs: awayRuns, my_runs: myRuns, opp_runs: oppRuns,
    result, warnings_json: warnings.length ? JSON.stringify(warnings) : null
  };
}

/** Open an exported database (bytes) read-only and run a query; used by tests and the desktop "query" page. */
export async function querySqlite(bytes: Uint8Array, query: string): Promise<Array<Record<string, unknown>>> {
  const SQL = await loadSqlJs();
  const sql = new SQL.Database(bytes);
  try {
    const out: Array<Record<string, unknown>> = [];
    const stmt = sql.prepare(query);
    try {
      while (stmt.step()) out.push(stmt.getAsObject() as Record<string, unknown>);
    } finally {
      stmt.free();
    }
    return out;
  } finally {
    sql.close();
  }
}
