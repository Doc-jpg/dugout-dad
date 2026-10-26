import { describe, it, expect } from 'vitest';
import { DugoutDB, createTeam, createPlayer, createGame, appendEvent } from '../src/db/db';
import { buildSqliteDatabase, querySqlite, loadSqlJs } from '../src/io/sqlite';
import { standardStart, threeOuts, myPlayers, oppPlayers, MY, OPP, ELI } from './helpers';

function testDb() {
  return new DugoutDB('test-' + Math.random().toString(36).slice(2));
}

describe('SQLite export', () => {
  it('builds a database the same replay engine agrees with, including the position innings view', async () => {
    let SQL;
    try {
      SQL = await loadSqlJs();
    } catch (e: any) {
      // The wasm engine could not load here; the error must be explicit, never a silent pass.
      expect(e.message).toMatch(/Could not load the SQLite engine/);
      throw e;
    }
    expect(SQL).toBeTruthy();

    const db = testDb();
    await createTeam({ id: MY, name: 'Rattlers', isMine: true }, db);
    await createTeam({ id: OPP, name: 'Opp', isMine: false }, db);
    for (const [i, id] of myPlayers.entries()) await createPlayer({ id, teamId: MY, firstName: `F${i}`, lastName: `L${i}` }, db);
    for (const [i, id] of oppPlayers.entries()) await createPlayer({ id, teamId: OPP, firstName: '', lastName: `B${i}`, isPlaceholder: true }, db);

    // Same scenario as the critical defensive test: Eli SS 4 outs, then CF 5 outs
    const log = standardStart(6);
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    threeOuts(log, 'away');
    log.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [] } });
    log.change('away', [{ position: 8, playerId: ELI }, { position: 6, playerId: 'p8' }], 'swap');
    log.pa('home', 'FO', { fielding: { sequence: [8], errors: [] } });
    log.pa('home', 'K');
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.end('time_limit');

    const { id, revision, createdAt, updatedAt, ...rest } = log.game;
    await createGame({ ...rest, id, status: 'final' }, db);
    for (const ev of log.events) {
      const { id: evId, gameId, seq, ts, ...payload } = ev as any;
      await appendEvent(gameId, { ...payload, id: evId }, db);
    }

    const bytes = await buildSqliteDatabase(db, { appVersion: 'test' });
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    // SQLite file header
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');

    const counts = await querySqlite(bytes, 'SELECT (SELECT count(*) FROM games) AS games, (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM players) AS players, (SELECT count(*) FROM plate_appearances) AS pas');
    expect(counts[0].games).toBe(1);
    expect(counts[0].events).toBe(log.events.length);
    expect(counts[0].players).toBe(myPlayers.length + oppPlayers.length);
    expect(counts[0].pas).toBe(log.events.filter((e) => e.type === 'plate_appearance').length);

    const eli = await querySqlite(bytes, `SELECT position, outs, innings_text FROM v_position_innings WHERE player_id = '${ELI}' ORDER BY position`);
    expect(eli).toEqual([
      { position: 6, outs: 4, innings_text: '1.1' },
      { position: 8, outs: 5, innings_text: '1.2' }
    ]);
    const total = await querySqlite(bytes, `SELECT SUM(outs) AS outs FROM defense_intervals WHERE player_id = '${ELI}'`);
    expect(total[0].outs).toBe(9);

    const game = await querySqlite(bytes, 'SELECT my_runs, opp_runs, result, status FROM games');
    expect(game[0]).toMatchObject({ my_runs: 0, opp_runs: 0, result: 'T', status: 'final' });

    const pitcher = await querySqlite(bytes, `SELECT outs, innings_text, strikeouts FROM pitcher_lines WHERE pitcher_id = 'p1'`);
    expect(pitcher[0]).toMatchObject({ outs: 9, innings_text: '3.0' });
    const info = await querySqlite(bytes, `SELECT value FROM export_info WHERE key = 'generator'`);
    expect(info[0].value).toBe('Dugout Dad');
  });
});
