import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DugoutDB, createPlayer, createTeam } from '../src/db/db';
import {
  parseGameChangerCsv, suggestPlayerMatches, importGameChangerSnapshot, rollbackSnapshot, DuplicateImportError,
  GameChangerFormatError, battingValue, pitchingValue, fieldingOuts, pitchingOuts, snapshotToLines, parseStatValue,
  GC_BATTING_KEYS, GC_PITCHING_KEYS, GC_FIELDING_KEYS
} from '../src/io/gamechanger';
import { parseCsv, toCsv } from '../src/io/csv';
import { sha256Hex } from '../src/io/hash';

const FIXTURE = readFileSync(resolve(__dirname, 'fixtures/gamechanger_sample.csv'), 'utf8');

function testDb() {
  return new DugoutDB('test-' + Math.random().toString(36).slice(2));
}

describe('csv parser', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and trailing newline', () => {
    const text = '﻿a,b,c\r\n"x, y","he said ""hi""",3\r\n\r\nlast,,\n';
    const rows = parseCsv(text);
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['x, y', 'he said "hi"', '3']);
    expect(rows[2]).toEqual([]); // blank line kept as empty row
    expect(rows[3]).toEqual(['last', '', '']);
    expect(rows).toHaveLength(4); // trailing newline does not add a row
  });
  it('round-trips through toCsv', () => {
    const rows = [['a', 'b,c', 'd"e'], ['1', '', 'x\ny']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('sha256', () => {
  it('matches a known digest', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('stat value parsing', () => {
  it('distinguishes na, counts, rates and innings', () => {
    expect(parseStatValue('-', false)).toMatchObject({ value: null, kind: 'na' });
    expect(parseStatValue('', false)).toMatchObject({ value: null, kind: 'na' });
    expect(parseStatValue('13', false)).toMatchObject({ value: 13, kind: 'count' });
    expect(parseStatValue('.600', false)).toMatchObject({ value: 0.6, kind: 'rate' });
    expect(parseStatValue('50.00', false)).toMatchObject({ value: 50, kind: 'rate' });
    expect(parseStatValue('2.7', false)).toMatchObject({ value: 2.7, kind: 'rate' });
    // Innings notation: the digit after the point is OUTS
    expect(parseStatValue('1.2', true)).toMatchObject({ outs: 5, kind: 'innings' });
    expect(parseStatValue('75.1', true)).toMatchObject({ outs: 226, kind: 'innings' });
    expect(parseStatValue('1.2', true).value).toBeCloseTo(5 / 3);
    expect(parseStatValue('0.0', true)).toMatchObject({ outs: 0, kind: 'innings' });
  });
});

describe('CRITICAL import test: GameChanger Fall 2026 export', () => {
  const parsed = parseGameChangerCsv(FIXTURE);
  const eli = parsed.rows.find((r) => r.last === 'Flesher' && r.first === 'Eli')!;

  it('detects 181 columns and the four sections by position', () => {
    expect(parsed.detected).toBe(true);
    expect(parsed.headers).toHaveLength(181);
    expect(parsed.columnSections).toEqual([
      { section: 'identity', start: 0, end: 2 },
      { section: 'batting', start: 3, end: 53 },
      { section: 'pitching', start: 54, end: 154 },
      { section: 'fielding', start: 155, end: 180 }
    ]);
    expect(GC_BATTING_KEYS).toHaveLength(51);
    expect(GC_PITCHING_KEYS).toHaveLength(101);
    expect(GC_FIELDING_KEYS).toHaveLength(26);
    expect(parsed.headers.slice(3, 54)).toEqual([...GC_BATTING_KEYS]);
    expect(parsed.headers.slice(54, 155)).toEqual([...GC_PITCHING_KEYS]);
    expect(parsed.headers.slice(155, 181)).toEqual([...GC_FIELDING_KEYS]);
  });

  it('finds 12 players, keeps Totals separate, parses the glossary', () => {
    expect(parsed.rows).toHaveLength(12);
    expect(parsed.rows.some((r) => r.last.toLowerCase() === 'totals' || r.number.toLowerCase() === 'totals')).toBe(false);
    expect(parsed.totals).toBeDefined();
    expect(battingValue(parsed.totals!, 'PA')).toBe(444);
    expect(fieldingOuts(parsed.totals!, 'Total')).toBe(676 * 3 + 2); // 676.2
    expect(parsed.glossary['PA']).toContain('Plate appearances');
    expect(parsed.glossary['INN']).toContain('Innings caught');
    expect(parsed.glossary['SS']).toContain('shortstop');
    expect(parsed.warnings).toEqual([]);
  });

  it('maps repeated column names to the correct section (batting BB vs pitching BB, etc.)', () => {
    expect(eli).toBeDefined();
    expect(eli.number).toBe('1');
    // Batting section
    expect(battingValue(eli, 'BB')).toBe(11);
    expect(battingValue(eli, 'SO')).toBe(5);
    expect(battingValue(eli, 'K-L')).toBe(4);
    expect(battingValue(eli, 'H')).toBe(13);
    expect(battingValue(eli, 'HR')).toBe(0);
    expect(battingValue(eli, 'SB')).toBe(15);
    expect(battingValue(eli, 'GP')).toBe(21);
    expect(battingValue(eli, 'LOB')).toBe(12);
    expect(battingValue(eli, 'AVG')).toBeCloseTo(0.325);
    expect(eli.batting['AB/HR']).toMatchObject({ value: null, kind: 'na', raw: '-' });
    // Pitching section, same abbreviations, different numbers
    expect(pitchingValue(eli, 'BB')).toBe(21);
    expect(pitchingValue(eli, 'SO')).toBe(15);
    expect(pitchingValue(eli, 'K-L')).toBe(4);
    expect(pitchingValue(eli, 'H')).toBe(20);
    expect(pitchingValue(eli, 'HR')).toBe(1);
    expect(pitchingValue(eli, 'SB')).toBe(10);
    expect(pitchingValue(eli, 'GP')).toBe(9);
    expect(pitchingValue(eli, 'LOB')).toBe(18);
    expect(pitchingValue(eli, 'R')).toBe(31);
    expect(pitchingValue(eli, 'ER')).toBe(18);
    expect(pitchingValue(eli, 'ERA')).toBeCloseTo(9.692);
    expect(eli.pitching['SV%']).toMatchObject({ value: null, kind: 'na' });
    // Fielding section: its own SB / CS / PIK (as catcher)
    expect(eli.fielding['SB'].value).toBe(0);
    expect(eli.fielding['E'].value).toBe(4);
    expect(eli.fielding['TC'].value).toBe(22);
    expect(eli.fielding['CS%']).toMatchObject({ value: null, kind: 'na' });
  });

  it('parses innings-style columns to outs (never decimal)', () => {
    expect(pitchingOuts(eli, 'IP')).toBe(39); // 13.0
    expect(fieldingOuts(eli, 'SS')).toBe(56); // 18.2
    expect(fieldingOuts(eli, 'CF')).toBe(118); // 39.1
    expect(fieldingOuts(eli, 'P')).toBe(39); // 13.0
    expect(fieldingOuts(eli, '3B')).toBe(4); // 1.1
    expect(fieldingOuts(eli, 'Total')).toBe(226); // 75.1
    expect(fieldingOuts(eli, 'INN')).toBe(0); // innings caught
    expect(eli.fielding['SS'].kind).toBe('innings');
    expect(eli.fielding['SS'].raw).toBe('18.2');
    // Sum of the position columns equals Total for Eli (13.0 + 1.0 + 1.1 + 18.2 + 1.0 + 39.1 + 1.0)
    const sum = (['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const).reduce((acc, k) => acc + (fieldingOuts(eli, k) ?? 0), 0);
    expect(sum).toBe(226);
  });

  it('snapshotToLines gives position outs by position number', async () => {
    const db = testDb();
    const team = await createTeam({ name: 'Test Team', isMine: true }, db);
    const { snapshot } = await importGameChangerSnapshot(db, {
      text: FIXTURE, fileName: 'x.csv', teamId: team.id, label: 'L', asOfDate: '2026-10-25', playerIdByRow: {}, createMissingPlayers: true
    });
    const lines = snapshotToLines(snapshot);
    const eliLine = lines.find((l) => l.name === 'Eli Flesher')!;
    expect(eliLine.positionOuts[6]).toBe(56);
    expect(eliLine.positionOuts[8]).toBe(118);
    expect(eliLine.totalDefensiveOuts).toBe(226);
    expect(eliLine.inningsPitchedOuts).toBe(39);
  });

  it('rejects files that are not GameChanger exports', () => {
    expect(() => parseGameChangerCsv('a,b,c\n1,2,3\n')).toThrow(GameChangerFormatError);
    expect(() => parseGameChangerCsv('Number,Last,First,GP\n1,A,B,2\n')).toThrow(GameChangerFormatError);
  });
});

describe('player matching', () => {
  it('matches exact names, aliases and lastname+number; never number alone', async () => {
    const parsed = parseGameChangerCsv(FIXTURE);
    const db = testDb();
    const team = await createTeam({ name: 'Rattlers', isMine: true }, db);
    const eli = await createPlayer({ teamId: team.id, firstName: 'Eli', lastName: 'Flesher', number: '1' }, db);
    const aliasGuy = await createPlayer({ teamId: team.id, firstName: 'Tester', lastName: 'Two', aliases: ['Test Player02'] }, db);
    const lastNum = await createPlayer({ teamId: team.id, firstName: 'Someone', lastName: 'Player03', number: '0' }, db);
    const otherZero = await createPlayer({ teamId: team.id, firstName: 'Nobody', lastName: 'Else', number: '0' }, db);
    const players = await db.players.toArray();
    const matches = suggestPlayerMatches(parsed.rows, players);
    const byName = (last: string) => matches[parsed.rows.findIndex((r) => r.last === last)];
    expect(byName('Flesher')).toMatchObject({ playerId: eli.id, confidence: 'exact' });
    expect(byName('Player02')).toMatchObject({ playerId: aliasGuy.id, confidence: 'alias' });
    expect(byName('Player03')).toMatchObject({ playerId: lastNum.id, confidence: 'lastname_number' });
    // Player01 also wears #0 but has no name match: must NOT be matched to otherZero by number alone
    expect(byName('Player01')).toMatchObject({ playerId: null, confidence: 'none' });
    expect(matches.filter((m) => m.playerId === otherZero.id)).toHaveLength(0);
  });

  it('fuzzy-matches small misspellings', () => {
    const rows = parseGameChangerCsv(FIXTURE).rows;
    const players = [{ id: 'x', teamId: 't', firstName: 'Eli', lastName: 'Fleshur', status: 'regular', aliases: [], createdAt: '', updatedAt: '' } as any];
    const m = suggestPlayerMatches(rows, players).find((s) => s.playerId === 'x');
    expect(m?.confidence).toBe('fuzzy');
  });
});

describe('snapshot import, duplicate protection and rollback', () => {
  it('imports once, refuses the identical file, rolls back', async () => {
    const db = testDb();
    const team = await createTeam({ name: 'Rattlers', isMine: true }, db);
    const eli = await createPlayer({ teamId: team.id, firstName: 'Eli', lastName: 'Flesher', number: '1', isFocus: true }, db);
    const parsed = parseGameChangerCsv(FIXTURE);
    const eliRow = parsed.rows.findIndex((r) => r.last === 'Flesher');
    const { snapshot, createdPlayers } = await importGameChangerSnapshot(db, {
      text: FIXTURE,
      fileName: 'Oklahoma_Rattlers_13U_Fall_2026_Stats.csv',
      teamId: team.id,
      label: 'GameChanger Fall 2026',
      asOfDate: '2026-10-25',
      playerIdByRow: { [eliRow]: eli.id },
      createMissingPlayers: true
    });
    expect(createdPlayers).toHaveLength(11);
    expect(snapshot.rows.find((r) => r.last === 'Flesher')!.playerId).toBe(eli.id);
    expect(snapshot.rows.every((r) => r.playerId)).toBe(true);
    expect(snapshot.rawText).toBe(FIXTURE); // verbatim
    expect(snapshot.fileSha256).toBe(await sha256Hex(FIXTURE));
    expect(snapshot.totals).toBeDefined();
    expect(snapshot.createdPlayerIds).toHaveLength(11);
    expect(await db.players.count()).toBe(12);

    await expect(
      importGameChangerSnapshot(db, { text: FIXTURE, fileName: 'again.csv', teamId: team.id, label: 'dup', asOfDate: '2026-10-26', playerIdByRow: {}, createMissingPlayers: false })
    ).rejects.toBeInstanceOf(DuplicateImportError);
    expect(await db.snapshots.count()).toBe(1);

    const rb = await rollbackSnapshot(db, snapshot.id);
    expect(rb.removed).toBe(true);
    expect(rb.createdPlayerIds).toHaveLength(11);
    expect(await db.snapshots.count()).toBe(0);
    // After rollback the same file may be imported again
    const again = await importGameChangerSnapshot(db, { text: FIXTURE, fileName: 'again.csv', teamId: team.id, label: 'second', asOfDate: '2026-10-26', playerIdByRow: {}, createMissingPlayers: false });
    expect(again.createdPlayers).toHaveLength(0);
    expect(again.snapshot.rows.filter((r) => r.playerId)).toHaveLength(0);
  });
});
