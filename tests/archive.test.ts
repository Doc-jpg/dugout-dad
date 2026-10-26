import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DugoutDB, createTeam, createPlayer, createGame, appendEvent } from '../src/db/db';
import { buildArchive, readArchive, planImport, commitImport, ArchiveIntegrityError, ArchiveFormatError, eventsHash } from '../src/io/archive';
import { Log, makeGame, standardStart, threeOuts, myPlayers, oppPlayers, MY, OPP } from './helpers';
import type { Game, GameEvent } from '../src/engine/types';

function testDb() {
  return new DugoutDB('test-' + Math.random().toString(36).slice(2));
}

/** Seed a "phone" database with teams, rosters and two scored games. */
async function seedPhone() {
  const db = testDb();
  await createTeam({ id: MY, name: 'Oklahoma Rattlers 13U', isMine: true }, db);
  await createTeam({ id: OPP, name: 'Opponent', isMine: false }, db);
  for (const [i, id] of myPlayers.entries()) await createPlayer({ id, teamId: MY, firstName: `First${i}`, lastName: `Last${i}`, number: String(i + 1) }, db);
  for (const [i, id] of oppPlayers.entries()) await createPlayer({ id, teamId: OPP, firstName: '', lastName: `Batter ${i + 1}`, isPlaceholder: true }, db);

  async function writeGame(gameOver: Partial<Game>, build: (log: Log) => void) {
    const log = standardStart(6);
    log.game = makeGame({ ...log.game, ...gameOver });
    for (const ev of log.events) ev.gameId = log.game.id;
    build(log);
    const { id, revision, createdAt, updatedAt, ...rest } = log.game;
    await createGame({ ...rest, id }, db);
    for (const ev of log.events) {
      const { id: evId, gameId, seq, ts, ...payload } = ev as any;
      await appendEvent(gameId, { ...payload, id: evId }, db);
    }
    return log.game.id;
  }

  const g1 = await writeGame({ id: 'game-sat-1', date: '2026-10-24', time: '09:00' }, (log) => {
    threeOuts(log, 'away');
    log.pa('home', '1B');
    log.pa('home', 'HR');
    log.pa('home', 'K');
    log.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [] } });
    log.pa('home', 'FO', { fielding: { sequence: [8], errors: [] } });
    log.end('time_limit');
  });
  const g2 = await writeGame({ id: 'game-sat-2', date: '2026-10-24', time: '13:00' }, (log) => {
    log.pa('away', '2B');
    log.pa('away', 'SF', { fielding: { sequence: [9], errors: [] } });
    log.pa('away', 'K');
    log.pa('away', 'K');
    threeOuts(log, 'home');
    log.end('time_limit');
  });
  return { db, g1, g2 };
}

describe('weekend archive: export and import', () => {
  it('round-trips two games into a fresh database and is idempotent on re-import', async () => {
    const { db: phone, g1, g2 } = await seedPhone();
    const srcEvents = await phone.events.count();
    expect(srcEvents).toBeGreaterThan(10);

    const { bytes, fileName, manifest } = await buildArchive(phone, { gameIds: [g1, g2], appVersion: 'test' });
    expect(fileName).toBe('dugout-dad_2026-10-24_2games.zip');
    expect(manifest.counts.games).toBe(2);
    expect(manifest.counts.events).toBe(srcEvents);
    expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(['teams.json', 'players.json', 'games/game-sat-1.json', 'games/game-sat-2.json']));
    // Export marks games and records the transfer
    expect((await phone.games.get(g1))!.lastExportedAt).toBeTruthy();
    expect(await phone.transfers.count()).toBe(1);

    const desktop = testDb();
    const archive = await readArchive(bytes);
    expect(archive.games).toHaveLength(2);
    expect(archive.players).toHaveLength(myPlayers.length + oppPlayers.length);

    const plan1 = await planImport(desktop, archive);
    expect(plan1.games.map((g) => g.disposition)).toEqual(['new', 'new']);
    expect(plan1.players.every((p) => p.disposition === 'new')).toBe(true);
    const res1 = await commitImport(desktop, archive, plan1, { fileName });
    expect(res1.gamesAdded).toBe(2);
    expect(res1.eventsWritten).toBe(srcEvents);
    expect(await desktop.games.count()).toBe(2);
    expect(await desktop.events.count()).toBe(srcEvents);
    expect(await desktop.players.count()).toBe(myPlayers.length + oppPlayers.length);
    expect(await desktop.teams.count()).toBe(2);

    // Second import of the same archive: nothing changes
    const plan2 = await planImport(desktop, archive);
    expect(plan2.games.map((g) => g.disposition)).toEqual(['unchanged', 'unchanged']);
    expect(plan2.players.every((p) => p.disposition === 'unchanged')).toBe(true);
    const res2 = await commitImport(desktop, archive, plan2, { fileName });
    expect(res2.gamesAdded).toBe(0);
    expect(res2.gamesUpdated).toBe(0);
    expect(res2.gamesSkipped).toBe(2);
    expect(await desktop.games.count()).toBe(2);
    expect(await desktop.events.count()).toBe(srcEvents);
    // Event ids are unique; no duplicates slipped in
    const ids = (await desktop.events.toArray()).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Event content identical
    const [h1, h2] = await Promise.all([
      eventsHash(await phone.events.where('gameId').equals(g1).toArray()),
      eventsHash(await desktop.events.where('gameId').equals(g1).toArray())
    ]);
    expect(h1).toBe(h2);
  });

  it('detects a game edited on the phone as an update, leaves the other unchanged, and applies it', async () => {
    const { db: phone, g1, g2 } = await seedPhone();
    const first = await buildArchive(phone, { gameIds: [g1, g2], appVersion: 'test' });
    const desktop = testDb();
    const a1 = await readArchive(first.bytes);
    await commitImport(desktop, a1, await planImport(desktop, a1));

    // Phone: scorer adds a note to game 1 (revision bump)
    const before = (await phone.games.get(g1))!.revision;
    await appendEvent(g1, { type: 'note', text: 'Great defensive play by SS' } as any, phone);
    expect((await phone.games.get(g1))!.revision).toBe(before + 1);

    const second = await buildArchive(phone, { gameIds: [g1, g2], appVersion: 'test' });
    const a2 = await readArchive(second.bytes);
    const plan = await planImport(desktop, a2);
    const byId = Object.fromEntries(plan.games.map((g) => [g.gameId, g.disposition]));
    expect(byId[g1]).toBe('update');
    expect(byId[g2]).toBe('unchanged');
    const res = await commitImport(desktop, a2, plan);
    expect(res.gamesUpdated).toBe(1);
    expect(res.gamesSkipped).toBe(1);
    expect(await desktop.events.where('gameId').equals(g1).count()).toBe(await phone.events.where('gameId').equals(g1).count());
    expect((await desktop.games.get(g1))!.revision).toBe(before + 1);
  });

  it('flags a conflict when the desktop copy is newer and does not overwrite unless told to', async () => {
    const { db: phone, g1 } = await seedPhone();
    const first = await buildArchive(phone, { gameIds: [g1], appVersion: 'test' });
    const desktop = testDb();
    const a1 = await readArchive(first.bytes);
    await commitImport(desktop, a1, await planImport(desktop, a1));
    // Desktop edit
    await appendEvent(g1, { type: 'note', text: 'desktop correction' } as any, desktop);
    const desktopEvents = await desktop.events.where('gameId').equals(g1).count();

    const plan = await planImport(desktop, a1);
    expect(plan.games[0].disposition).toBe('conflict');
    const res = await commitImport(desktop, a1, plan); // default: skip conflicts
    expect(res.gamesSkipped).toBe(1);
    expect(await desktop.events.where('gameId').equals(g1).count()).toBe(desktopEvents);

    const res2 = await commitImport(desktop, a1, plan, { gameDecisions: { [g1]: 'overwrite' } });
    expect(res2.gamesUpdated).toBe(1);
    expect(await desktop.events.where('gameId').equals(g1).count()).toBe(a1.games[0].events.length);
  });

  it('rejects a corrupted archive on checksum and rejects non-archives', async () => {
    const { db: phone, g1 } = await seedPhone();
    const { bytes } = await buildArchive(phone, { gameIds: [g1], appVersion: 'test' });
    const entries = unzipSync(bytes);
    // Flip the result of a plate appearance inside the game file without touching the manifest
    const path = `games/${g1}.json`;
    const text = strFromU8(entries[path]);
    const tampered = text.replace('"result": "HR"', '"result": "1B"');
    expect(tampered).not.toBe(text);
    entries[path] = strToU8(tampered);
    const rezipped = zipSync(entries);
    await expect(readArchive(rezipped)).rejects.toBeInstanceOf(ArchiveIntegrityError);

    await expect(readArchive(zipSync({ 'hello.txt': strToU8('hi') }))).rejects.toBeInstanceOf(ArchiveFormatError);
    await expect(readArchive(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(ArchiveFormatError);
  });

  it('only ships the teams and players the selected games reference', async () => {
    const { db: phone, g1 } = await seedPhone();
    await createTeam({ id: 'team-unrelated', name: 'Unrelated', isMine: false }, phone);
    await createPlayer({ id: 'stranger', teamId: 'team-unrelated', firstName: 'S', lastName: 'T' }, phone);
    const { bytes } = await buildArchive(phone, { gameIds: [g1], appVersion: 'test' });
    const archive = await readArchive(bytes);
    expect(archive.teams.map((t) => t.id).sort()).toEqual([MY, OPP].sort());
    expect(archive.players.some((p) => p.id === 'stranger')).toBe(false);
    const all = await buildArchive(phone, { gameIds: [g1], appVersion: 'test', includeAllTeamsAndPlayers: true });
    expect((await readArchive(all.bytes)).teams).toHaveLength(3);
  });

  it('events in the archive are sorted by seq and the manifest lists every file', async () => {
    const { db: phone, g1 } = await seedPhone();
    const { bytes, manifest } = await buildArchive(phone, { gameIds: [g1], appVersion: 'test' });
    const archive = await readArchive(bytes);
    const seqs = archive.games[0].events.map((e: GameEvent) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(seqs[0]).toBe(0);
    const zipPaths = Object.keys(unzipSync(bytes)).filter((p) => p !== 'manifest.json').sort();
    expect(Object.keys(manifest.files).sort()).toEqual(zipPaths);
  });
});
