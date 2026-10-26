/**
 * IndexedDB storage via Dexie. Same schema on phone and desktop.
 *
 * Tables are plain documents keyed by UUID so an export archive is just the
 * tables serialized to JSON, and an import is an id-keyed upsert.
 */
import Dexie, { type Table } from 'dexie';
import type {
  Team, Player, Season, Tournament, Game, GameEvent, AuditEntry, StatSnapshot, TransferRecord, Settings
} from '../engine/types';
import { DEFAULT_SETTINGS, newId, nowIso } from '../engine/types';

export class DugoutDB extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  seasons!: Table<Season, string>;
  tournaments!: Table<Tournament, string>;
  games!: Table<Game, string>;
  events!: Table<GameEvent, string>;
  audit!: Table<AuditEntry, string>;
  snapshots!: Table<StatSnapshot, string>;
  transfers!: Table<TransferRecord, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'dugout-dad') {
    super(name);
    this.version(1).stores({
      teams: 'id, name, isMine',
      players: 'id, teamId, lastName, status, isFocus',
      seasons: 'id, teamId, startDate',
      tournaments: 'id, startDate',
      games: 'id, teamId, date, status, tournamentId, seasonId, [teamId+date]',
      events: 'id, gameId, [gameId+seq], type',
      audit: 'id, gameId, at',
      snapshots: 'id, teamId, fileSha256, asOfDate',
      transfers: 'id, at, direction',
      settings: 'id'
    });
  }
}

export const db = new DugoutDB();

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Read-only (safe inside live queries): returns stored settings merged over defaults. */
export async function getSettings(database: DugoutDB = db): Promise<Settings> {
  const s = await database.settings.get('settings');
  if (s) return { ...DEFAULT_SETTINGS, ...s, qab: { ...DEFAULT_SETTINGS.qab, ...(s.qab ?? {}) }, lineupWeights: { ...DEFAULT_SETTINGS.lineupWeights, ...(s.lineupWeights ?? {}) } };
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>, database: DugoutDB = db): Promise<Settings> {
  const cur = await getSettings(database);
  const next = { ...cur, ...patch, id: 'settings' as const };
  await database.settings.put(next);
  return next;
}

// ---------------------------------------------------------------------------
// Teams and players
// ---------------------------------------------------------------------------

export async function createTeam(input: Pick<Team, 'name'> & Partial<Team>, database: DugoutDB = db): Promise<Team> {
  const team: Team = {
    id: input.id ?? newId(),
    name: input.name,
    shortName: input.shortName,
    isMine: input.isMine ?? false,
    color: input.color,
    notes: input.notes,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await database.teams.put(team);
  return team;
}

export async function createPlayer(
  input: Pick<Player, 'teamId' | 'firstName' | 'lastName'> & Partial<Player>,
  database: DugoutDB = db
): Promise<Player> {
  const p: Player = {
    id: input.id ?? newId(),
    teamId: input.teamId,
    firstName: input.firstName,
    lastName: input.lastName,
    number: input.number,
    bats: input.bats,
    throws: input.throws,
    status: input.status ?? 'regular',
    isFocus: input.isFocus,
    isPlaceholder: input.isPlaceholder,
    aliases: input.aliases ?? [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await database.players.put(p);
  return p;
}

export async function updatePlayer(id: string, patch: Partial<Player>, database: DugoutDB = db) {
  await database.players.update(id, { ...patch, updatedAt: nowIso() });
}

export function playerName(p?: Player | null, style: 'full' | 'short' | 'last' | 'first' = 'full'): string {
  if (!p) return 'Unknown';
  const first = p.firstName?.trim() ?? '';
  const last = p.lastName?.trim() ?? '';
  if (style === 'last') return last || first || 'Unknown';
  if (style === 'first') return first || last || 'Unknown';
  if (style === 'short') {
    if (!last) return first || 'Unknown';
    return first ? `${first[0]}. ${last}` : last;
  }
  return [first, last].filter(Boolean).join(' ') || 'Unknown';
}

/** Create a placeholder opponent such as "#12" or "Batter 4" that can be renamed later. */
export async function createPlaceholderPlayer(teamId: string, label: string, number?: string, database: DugoutDB = db) {
  return createPlayer({ teamId, firstName: '', lastName: label, number, isPlaceholder: true, status: 'regular' }, database);
}

/** Merge player `fromId` into `intoId`: rewrite event references and remove the duplicate. */
export async function mergePlayers(fromId: string, intoId: string, database: DugoutDB = db) {
  if (fromId === intoId) return;
  await database.transaction('rw', database.players, database.events, database.snapshots, database.games, async () => {
    const from = await database.players.get(fromId);
    const into = await database.players.get(intoId);
    if (!from || !into) throw new Error('Player not found');
    const events = await database.events.toArray();
    const touched: GameEvent[] = [];
    const gameIds = new Set<string>();
    for (const ev of events) {
      const json = JSON.stringify(ev);
      if (!json.includes(fromId)) continue;
      const replaced = JSON.parse(json.split(fromId).join(intoId)) as GameEvent;
      touched.push(replaced);
      gameIds.add(ev.gameId);
    }
    if (touched.length) await database.events.bulkPut(touched);
    for (const gid of gameIds) {
      const g = await database.games.get(gid);
      if (g) await database.games.update(gid, { revision: g.revision + 1, updatedAt: nowIso() });
    }
    const snaps = await database.snapshots.toArray();
    for (const s of snaps) {
      let changed = false;
      for (const row of s.rows) if (row.playerId === fromId) { row.playerId = intoId; changed = true; }
      if (changed) await database.snapshots.put(s);
    }
    const aliases = new Set([...(into.aliases ?? []), ...(from.aliases ?? []), playerName(from)]);
    await database.players.update(intoId, { aliases: [...aliases].filter(Boolean), updatedAt: nowIso() });
    await database.players.delete(fromId);
  });
}

// ---------------------------------------------------------------------------
// Games and events
// ---------------------------------------------------------------------------

export async function createGame(input: Omit<Game, 'id' | 'revision' | 'createdAt' | 'updatedAt'> & { id?: string }, database: DugoutDB = db): Promise<Game> {
  const g: Game = {
    ...input,
    id: input.id ?? newId(),
    revision: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await database.games.put(g);
  return g;
}

export async function loadEvents(gameId: string, database: DugoutDB = db): Promise<GameEvent[]> {
  const evs = await database.events.where('gameId').equals(gameId).toArray();
  return evs.sort((a, b) => a.seq - b.seq);
}

async function bumpGame(gameId: string, database: DugoutDB) {
  const g = await database.games.get(gameId);
  if (!g) return;
  const status = g.status === 'setup' ? 'in_progress' : g.status;
  await database.games.update(gameId, { revision: g.revision + 1, updatedAt: nowIso(), status });
}

/** Append an event at the end of the game's log. Transactional. */
export async function appendEvent<T extends GameEvent>(
  gameId: string,
  partial: Omit<T, 'id' | 'gameId' | 'seq' | 'ts'> & Partial<Pick<T, 'id'>>,
  database: DugoutDB = db
): Promise<T> {
  return database.transaction('rw', database.events, database.games, database.audit, async () => {
    const last = await database.events.where('[gameId+seq]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).last();
    const seq = last ? last.seq + 1 : 0;
    const ev = { ...(partial as any), id: (partial as any).id ?? newId(), gameId, seq, ts: nowIso() } as T;
    await database.events.put(ev);
    await database.audit.put({ id: newId(), gameId, at: nowIso(), action: 'insert', eventId: ev.id, after: ev });
    await bumpGame(gameId, database);
    return ev;
  });
}

/** Remove the last event (undo). Returns the removed event so it can be redone. */
export async function undoLastEvent(gameId: string, database: DugoutDB = db): Promise<GameEvent | null> {
  return database.transaction('rw', database.events, database.games, database.audit, async () => {
    const last = await database.events.where('[gameId+seq]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).last();
    if (!last) return null;
    // Never undo the game's setup events through "undo"; use edit instead.
    if (last.type === 'lineup_set' || last.type === 'defense_set') {
      const count = await database.events.where('gameId').equals(gameId).count();
      if (count <= 4) return null;
    }
    await database.events.delete(last.id);
    await database.audit.put({ id: newId(), gameId, at: nowIso(), action: 'undo', eventId: last.id, before: last });
    await bumpGame(gameId, database);
    return last;
  });
}

/** Replace an existing event in place (edit previous play). */
export async function editEvent(ev: GameEvent, database: DugoutDB = db) {
  await database.transaction('rw', database.events, database.games, database.audit, async () => {
    const before = await database.events.get(ev.id);
    await database.events.put(ev);
    await database.audit.put({ id: newId(), gameId: ev.gameId, at: nowIso(), action: 'edit', eventId: ev.id, before: before ?? undefined, after: ev });
    await bumpGame(ev.gameId, database);
  });
}

/** Delete an event anywhere in the log and renumber the rest. */
export async function deleteEvent(eventId: string, database: DugoutDB = db) {
  await database.transaction('rw', database.events, database.games, database.audit, async () => {
    const ev = await database.events.get(eventId);
    if (!ev) return;
    await database.events.delete(eventId);
    const rest = await database.events.where('gameId').equals(ev.gameId).toArray();
    rest.sort((a, b) => a.seq - b.seq);
    const renumbered = rest.map((e, i) => ({ ...e, seq: i }));
    await database.events.bulkPut(renumbered);
    await database.audit.put({ id: newId(), gameId: ev.gameId, at: nowIso(), action: 'delete', eventId, before: ev });
    await bumpGame(ev.gameId, database);
  });
}

/** Insert an event at a given seq, shifting later events (used for redo and corrections). */
export async function insertEventAt(ev: GameEvent, seq: number, database: DugoutDB = db) {
  await database.transaction('rw', database.events, database.games, database.audit, async () => {
    const rest = await database.events.where('gameId').equals(ev.gameId).toArray();
    rest.sort((a, b) => a.seq - b.seq);
    const without = rest.filter((e) => e.id !== ev.id);
    without.splice(Math.min(seq, without.length), 0, { ...ev });
    const renumbered = without.map((e, i) => ({ ...e, seq: i }));
    await database.events.bulkPut(renumbered);
    await database.audit.put({ id: newId(), gameId: ev.gameId, at: nowIso(), action: 'redo', eventId: ev.id, after: ev });
    await bumpGame(ev.gameId, database);
  });
}

export async function setGameStatus(gameId: string, status: Game['status'], endReason?: Game['endReason'], database: DugoutDB = db) {
  await database.games.update(gameId, { status, endReason, updatedAt: nowIso() });
}

/** Delete a game and everything attached to it. */
export async function deleteGame(gameId: string, database: DugoutDB = db) {
  await database.transaction('rw', database.games, database.events, database.audit, async () => {
    await database.events.where('gameId').equals(gameId).delete();
    await database.audit.where('gameId').equals(gameId).delete();
    await database.games.delete(gameId);
  });
}

// ---------------------------------------------------------------------------
// Storage health
// ---------------------------------------------------------------------------

export interface StorageHealth {
  persisted: boolean | null; // null = API unavailable
  usageBytes: number | null;
  quotaBytes: number | null;
  supported: boolean;
}

export async function storageHealth(): Promise<StorageHealth> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  const supported = typeof indexedDB !== 'undefined';
  let persisted: boolean | null = null;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (nav?.storage?.persisted) persisted = await nav.storage.persisted();
    if (nav?.storage?.estimate) {
      const est = await nav.storage.estimate();
      usageBytes = est.usage ?? null;
      quotaBytes = est.quota ?? null;
    }
  } catch {
    /* ignore */
  }
  return { persisted, usageBytes, quotaBytes, supported };
}

/** Ask the browser to protect our data from eviction. iOS grants this for installed PWAs. */
export async function requestPersistence(): Promise<boolean | null> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  try {
    if (nav?.storage?.persist) return await nav.storage.persist();
  } catch {
    /* ignore */
  }
  return null;
}
