/**
 * Weekend export / import archive.
 *
 * Format: a ZIP containing pretty-printed JSON plus a manifest with a SHA-256 for every file.
 *   manifest.json
 *   teams.json, players.json, seasons.json, tournaments.json
 *   games/<gameId>.json      { game, events (sorted by seq), audit }
 *   snapshots/<id>.json      optional imported aggregate snapshots
 *   settings.json            optional
 *
 * Importing is id-keyed and idempotent: the same archive imported twice changes nothing.
 * A game edited on the phone after an export shows up as an "update" (its revision is higher);
 * a game edited on the desktop since the export shows up as a "conflict" and is never silently
 * overwritten.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { DugoutDB } from '../db/db';
import type {
  Team, Player, Season, Tournament, Game, GameEvent, AuditEntry, StatSnapshot, Settings, TransferRecord
} from '../engine/types';
import { newId, nowIso } from '../engine/types';
import { sha256Hex } from './hash';

export const ARCHIVE_FORMAT = 'dugout-dad-archive';
export const ARCHIVE_FORMAT_VERSION = 1;

export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  deviceLabel?: string;
  counts: { teams: number; players: number; seasons: number; tournaments: number; games: number; events: number; snapshots: number };
  /** path -> sha256 hex of the file bytes */
  files: Record<string, string>;
}

export interface ArchiveGame {
  game: Game;
  events: GameEvent[];
  audit: AuditEntry[];
}

export interface ArchiveContents {
  manifest: ArchiveManifest;
  teams: Team[];
  players: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  games: ArchiveGame[];
  snapshots: StatSnapshot[];
  settings?: Settings;
}

export class ArchiveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

export class ArchiveIntegrityError extends Error {
  path: string;
  constructor(path: string, message?: string) {
    super(message ?? `Checksum mismatch for ${path}; the archive is corrupted or was altered`);
    this.name = 'ArchiveIntegrityError';
    this.path = path;
  }
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

function sortEvents(events: GameEvent[]): GameEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

/** Stable content hash of a game's events (ids, order and payloads). */
export async function eventsHash(events: GameEvent[]): Promise<string> {
  const normalized = sortEvents(events).map((e) => {
    const { ts: _ts, ...rest } = e as any; // device clock is informational, not content
    return rest;
  });
  return sha256Hex(JSON.stringify(normalized));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildArchiveOptions {
  gameIds: string[];
  includeSnapshots?: boolean;
  includeAllTeamsAndPlayers?: boolean;
  appVersion: string;
  deviceLabel?: string;
}

export async function buildArchive(
  database: DugoutDB,
  opts: BuildArchiveOptions
): Promise<{ bytes: Uint8Array; fileName: string; manifest: ArchiveManifest }> {
  const games = (await database.games.bulkGet(opts.gameIds)).filter((g): g is Game => !!g);
  if (!games.length) throw new Error('No games selected for export');
  games.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));

  const archiveGames: ArchiveGame[] = [];
  const referencedPlayerIds = new Set<string>();
  const referencedTeamIds = new Set<string>();
  const referencedSeasonIds = new Set<string>();
  const referencedTournamentIds = new Set<string>();
  let eventTotal = 0;
  const allPlayers = await database.players.toArray();

  for (const game of games) {
    const events = sortEvents(await database.events.where('gameId').equals(game.id).toArray());
    const audit = await database.audit.where('gameId').equals(game.id).toArray();
    eventTotal += events.length;
    archiveGames.push({ game, events, audit });
    referencedTeamIds.add(game.teamId);
    referencedTeamIds.add(game.opponentTeamId);
    if (game.seasonId) referencedSeasonIds.add(game.seasonId);
    if (game.tournamentId) referencedTournamentIds.add(game.tournamentId);
    // Any player id mentioned anywhere in the events (lineups, batters, runners, defense, notes)
    const text = JSON.stringify(events);
    for (const p of allPlayers) if (text.includes(p.id)) referencedPlayerIds.add(p.id);
  }

  let teams: Team[];
  let players: Player[];
  if (opts.includeAllTeamsAndPlayers) {
    teams = await database.teams.toArray();
    players = await database.players.toArray();
  } else {
    // Also include every player on the referenced teams so rosters travel with the games.
    teams = (await database.teams.bulkGet([...referencedTeamIds])).filter((t): t is Team => !!t);
    const teamPlayers = await database.players.where('teamId').anyOf([...referencedTeamIds]).toArray();
    for (const p of teamPlayers) referencedPlayerIds.add(p.id);
    players = (await database.players.bulkGet([...referencedPlayerIds])).filter((p): p is Player => !!p);
  }
  const seasons = (await database.seasons.bulkGet([...referencedSeasonIds])).filter((s): s is Season => !!s);
  const tournaments = (await database.tournaments.bulkGet([...referencedTournamentIds])).filter((t): t is Tournament => !!t);
  const snapshots = opts.includeSnapshots ? await database.snapshots.toArray() : [];
  const settings = await database.settings.get('settings');

  const files: Record<string, Uint8Array> = {
    'teams.json': json(teams),
    'players.json': json(players),
    'seasons.json': json(seasons),
    'tournaments.json': json(tournaments)
  };
  for (const ag of archiveGames) files[`games/${ag.game.id}.json`] = json(ag);
  for (const s of snapshots) files[`snapshots/${s.id}.json`] = json(s);
  if (settings) files['settings.json'] = json(settings);

  const hashes: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) hashes[path] = await sha256Hex(bytes);

  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    appVersion: opts.appVersion,
    createdAt: nowIso(),
    deviceLabel: opts.deviceLabel,
    counts: {
      teams: teams.length,
      players: players.length,
      seasons: seasons.length,
      tournaments: tournaments.length,
      games: archiveGames.length,
      events: eventTotal,
      snapshots: snapshots.length
    },
    files: hashes
  };
  files['manifest.json'] = json(manifest);

  const bytes = zipSync(files, { level: 6 });

  const first = games[0].date;
  const last = games[games.length - 1].date;
  const range = first === last ? first : `${first}_to_${last}`;
  const fileName = `dugout-dad_${range}_${games.length}game${games.length === 1 ? '' : 's'}.zip`;

  const at = nowIso();
  // Hash outside the transaction: awaiting non-IndexedDB work inside one commits it early.
  const archiveSha = await sha256Hex(bytes);
  const rec: TransferRecord = {
    id: newId(),
    direction: 'export',
    at,
    fileName,
    sha256: archiveSha,
    gameIds: games.map((g) => g.id),
    summary: `Exported ${games.length} game(s), ${eventTotal} events, ${players.length} players`
  };
  await database.transaction('rw', database.games, database.transfers, async () => {
    for (const g of games) await database.games.update(g.id, { lastExportedAt: at });
    await database.transfers.put(rec);
  });

  return { bytes, fileName, manifest };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readArchive(bytes: Uint8Array): Promise<ArchiveContents> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new ArchiveFormatError('This file is not a readable ZIP archive');
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new ArchiveFormatError('manifest.json is missing; this is not a Dugout Dad archive');
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new ArchiveFormatError('manifest.json is not valid JSON');
  }
  if (manifest.format !== ARCHIVE_FORMAT) throw new ArchiveFormatError(`Unknown archive format "${manifest.format}"`);
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveFormatError(`Archive format version ${manifest.formatVersion} is newer than this app supports (${ARCHIVE_FORMAT_VERSION}). Update Dugout Dad.`);
  }
  // Verify every listed file, and make sure no listed file is missing.
  for (const [path, expected] of Object.entries(manifest.files)) {
    const data = entries[path];
    if (!data) throw new ArchiveIntegrityError(path, `${path} is listed in the manifest but missing from the archive`);
    const actual = await sha256Hex(data);
    if (actual !== expected) throw new ArchiveIntegrityError(path);
  }
  const read = <T>(path: string, fallback: T): T => (entries[path] ? (JSON.parse(strFromU8(entries[path])) as T) : fallback);

  const games: ArchiveGame[] = [];
  const snapshots: StatSnapshot[] = [];
  for (const path of Object.keys(entries)) {
    if (!(path in manifest.files)) {
      if (path !== 'manifest.json') throw new ArchiveIntegrityError(path, `${path} is in the archive but not in the manifest`);
      continue;
    }
    if (path.startsWith('games/')) {
      const ag = JSON.parse(strFromU8(entries[path])) as ArchiveGame;
      ag.events = sortEvents(ag.events ?? []);
      ag.audit = ag.audit ?? [];
      games.push(ag);
    } else if (path.startsWith('snapshots/')) {
      snapshots.push(JSON.parse(strFromU8(entries[path])) as StatSnapshot);
    }
  }
  games.sort((a, b) => a.game.date.localeCompare(b.game.date));

  return {
    manifest,
    teams: read<Team[]>('teams.json', []),
    players: read<Player[]>('players.json', []),
    seasons: read<Season[]>('seasons.json', []),
    tournaments: read<Tournament[]>('tournaments.json', []),
    games,
    snapshots,
    settings: entries['settings.json'] ? read<Settings>('settings.json', undefined as unknown as Settings) : undefined
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type GameDisposition = 'new' | 'unchanged' | 'update' | 'conflict';
export type RecordDisposition = 'new' | 'unchanged' | 'update' | 'keep';

export interface GamePlan {
  gameId: string;
  label: string; // "2026-10-24 vs Opponent"
  disposition: GameDisposition;
  incomingRevision: number;
  existingRevision?: number;
  incomingEvents: number;
  existingEvents?: number;
  detail: string;
}

export interface RecordPlan {
  id: string;
  label: string;
  disposition: RecordDisposition;
}

export interface SnapshotPlan {
  id: string;
  label: string;
  disposition: 'new' | 'unchanged' | 'duplicate_file';
}

export interface ImportPlan {
  games: GamePlan[];
  teams: RecordPlan[];
  players: RecordPlan[];
  seasons: RecordPlan[];
  tournaments: RecordPlan[];
  snapshots: SnapshotPlan[];
  summary: string;
}

function planRecords<T extends { id: string; updatedAt?: string }>(incoming: T[], existing: Map<string, T>, label: (t: T) => string): RecordPlan[] {
  return incoming.map((inc) => {
    const cur = existing.get(inc.id);
    if (!cur) return { id: inc.id, label: label(inc), disposition: 'new' };
    if (JSON.stringify(cur) === JSON.stringify(inc)) return { id: inc.id, label: label(inc), disposition: 'unchanged' };
    const incAt = inc.updatedAt ?? '';
    const curAt = cur.updatedAt ?? '';
    if (incAt > curAt) return { id: inc.id, label: label(inc), disposition: 'update' };
    return { id: inc.id, label: label(inc), disposition: 'keep' };
  });
}

export async function planImport(database: DugoutDB, archive: ArchiveContents): Promise<ImportPlan> {
  const teamNames = new Map<string, string>();
  for (const t of archive.teams) teamNames.set(t.id, t.name);
  for (const t of await database.teams.toArray()) if (!teamNames.has(t.id)) teamNames.set(t.id, t.name);

  const games: GamePlan[] = [];
  for (const ag of archive.games) {
    const existing = await database.games.get(ag.game.id);
    const label = `${ag.game.date} vs ${teamNames.get(ag.game.opponentTeamId) ?? 'opponent'}`;
    if (!existing) {
      games.push({ gameId: ag.game.id, label, disposition: 'new', incomingRevision: ag.game.revision, incomingEvents: ag.events.length, detail: 'New game' });
      continue;
    }
    const existingEvents = await database.events.where('gameId').equals(ag.game.id).toArray();
    const [hIn, hCur] = await Promise.all([eventsHash(ag.events), eventsHash(existingEvents)]);
    let disposition: GameDisposition;
    let detail: string;
    if (ag.game.revision === existing.revision && hIn === hCur) {
      disposition = 'unchanged';
      detail = 'Already imported, identical';
    } else if (ag.game.revision > existing.revision) {
      disposition = 'update';
      detail = `Edited since last import (revision ${existing.revision} to ${ag.game.revision})`;
    } else if (ag.game.revision === existing.revision) {
      disposition = 'conflict';
      detail = 'Same revision number but different content; review before overwriting';
    } else {
      disposition = 'conflict';
      detail = `The copy here is newer (revision ${existing.revision}) than the archive (revision ${ag.game.revision})`;
    }
    games.push({ gameId: ag.game.id, label, disposition, incomingRevision: ag.game.revision, existingRevision: existing.revision, incomingEvents: ag.events.length, existingEvents: existingEvents.length, detail });
  }

  const toMap = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x] as const));
  const teams = planRecords(archive.teams, toMap(await database.teams.toArray()), (t) => t.name);
  const players = planRecords(archive.players, toMap(await database.players.toArray()), (p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.id);
  const seasons = planRecords(archive.seasons as Array<Season & { updatedAt?: string }>, toMap(await database.seasons.toArray()), (s) => s.name);
  const tournaments = planRecords(archive.tournaments as Array<Tournament & { updatedAt?: string }>, toMap(await database.tournaments.toArray()), (t) => t.name);

  const snapshots: SnapshotPlan[] = [];
  for (const s of archive.snapshots) {
    const byId = await database.snapshots.get(s.id);
    if (byId) {
      snapshots.push({ id: s.id, label: s.label, disposition: 'unchanged' });
      continue;
    }
    const byHash = await database.snapshots.where('fileSha256').equals(s.fileSha256).first();
    snapshots.push({ id: s.id, label: s.label, disposition: byHash ? 'duplicate_file' : 'new' });
  }

  const count = (arr: Array<{ disposition: string }>, d: string) => arr.filter((x) => x.disposition === d).length;
  const parts = [
    `${count(games, 'new')} new game(s)`,
    `${count(games, 'update')} updated`,
    `${count(games, 'unchanged')} unchanged`,
    `${count(games, 'conflict')} conflict(s)`,
    `${count(players, 'new')} new player(s)`,
    `${count(teams, 'new')} new team(s)`
  ];
  if (snapshots.length) parts.push(`${count(snapshots, 'new')} new snapshot(s)`);
  return { games, teams, players, seasons, tournaments, snapshots, summary: parts.join(', ') };
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export type GameDecision = 'apply' | 'skip' | 'overwrite';

export interface ImportDecisions {
  /** Per game. Default: 'apply' for new/update, 'skip' for unchanged/conflict. */
  gameDecisions?: Record<string, GameDecision>;
  importSnapshots?: boolean;
  importSettings?: boolean;
  fileName?: string;
  sha256?: string;
}

export interface ImportResult {
  gamesAdded: number;
  gamesUpdated: number;
  gamesSkipped: number;
  eventsWritten: number;
  teamsUpserted: number;
  playersUpserted: number;
  snapshotsAdded: number;
  transferId: string;
}

export function defaultDecisions(plan: ImportPlan): Record<string, GameDecision> {
  const out: Record<string, GameDecision> = {};
  for (const g of plan.games) out[g.gameId] = g.disposition === 'new' || g.disposition === 'update' ? 'apply' : 'skip';
  return out;
}

export async function commitImport(
  database: DugoutDB,
  archive: ArchiveContents,
  plan: ImportPlan,
  decisions: ImportDecisions = {}
): Promise<ImportResult> {
  const gameDecisions = { ...defaultDecisions(plan), ...(decisions.gameDecisions ?? {}) };
  const result: ImportResult = {
    gamesAdded: 0,
    gamesUpdated: 0,
    gamesSkipped: 0,
    eventsWritten: 0,
    teamsUpserted: 0,
    playersUpserted: 0,
    snapshotsAdded: 0,
    transferId: newId()
  };
  const appliedGameIds: string[] = [];

  await database.transaction(
    'rw',
    [database.teams, database.players, database.seasons, database.tournaments, database.games, database.events, database.audit, database.snapshots, database.settings, database.transfers],
    async () => {
      // Teams / players / seasons / tournaments: upsert new and updated, never delete.
      for (const [list, table, plans] of [
        [archive.teams, database.teams, plan.teams],
        [archive.players, database.players, plan.players],
        [archive.seasons, database.seasons, plan.seasons],
        [archive.tournaments, database.tournaments, plan.tournaments]
      ] as const) {
        const planById = new Map(plans.map((p) => [p.id, p.disposition] as const));
        for (const rec of list as Array<{ id: string }>) {
          const d = planById.get(rec.id) ?? 'new';
          if (d === 'new' || d === 'update') {
            await (table as any).put(rec);
            if (table === database.teams) result.teamsUpserted++;
            if (table === database.players) result.playersUpserted++;
          }
        }
      }

      for (const ag of archive.games) {
        const gp = plan.games.find((g) => g.gameId === ag.game.id);
        const decision = gameDecisions[ag.game.id] ?? 'skip';
        const existed = !!(await database.games.get(ag.game.id));
        const allowed = decision === 'overwrite' || (decision === 'apply' && gp && gp.disposition !== 'conflict' && gp.disposition !== 'unchanged');
        if (!allowed) {
          result.gamesSkipped++;
          continue;
        }
        // Replace the event log wholesale: the archive's log is authoritative for this game.
        await database.events.where('gameId').equals(ag.game.id).delete();
        await database.audit.where('gameId').equals(ag.game.id).delete();
        await database.events.bulkPut(sortEvents(ag.events));
        if (ag.audit.length) await database.audit.bulkPut(ag.audit);
        await database.games.put({ ...ag.game });
        result.eventsWritten += ag.events.length;
        if (existed) result.gamesUpdated++;
        else result.gamesAdded++;
        appliedGameIds.push(ag.game.id);
      }

      if (decisions.importSnapshots) {
        for (const s of archive.snapshots) {
          const sp = plan.snapshots.find((x) => x.id === s.id);
          if (sp?.disposition === 'new') {
            await database.snapshots.put(s);
            result.snapshotsAdded++;
          }
        }
      }
      if (decisions.importSettings && archive.settings) {
        await database.settings.put({ ...archive.settings, id: 'settings' });
      }

      const rec: TransferRecord = {
        id: result.transferId,
        direction: 'import',
        at: nowIso(),
        fileName: decisions.fileName ?? 'archive.zip',
        sha256: decisions.sha256,
        gameIds: appliedGameIds,
        summary: `Imported ${result.gamesAdded} new, ${result.gamesUpdated} updated, ${result.gamesSkipped} skipped; ${result.eventsWritten} events`
      };
      await database.transfers.put(rec);
    }
  );
  return result;
}

// ---------------------------------------------------------------------------
// Getting the file off the phone
// ---------------------------------------------------------------------------

/**
 * Share (iOS share sheet: AirDrop, Files, Mail) when the browser can share files,
 * otherwise download. Returns which path was used.
 */
export async function shareOrDownload(bytes: Uint8Array, fileName: string, mime = 'application/zip'): Promise<'shared' | 'downloaded'> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('shareOrDownload needs a browser');
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const nav: any = navigator;
  try {
    if (typeof File !== 'undefined' && nav.share && nav.canShare) {
      const file = new File([blob], fileName, { type: mime });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: fileName });
        return 'shared';
      }
    }
  } catch (e: any) {
    // User cancelled the share sheet: do not fall through to a download they did not ask for.
    if (e && e.name === 'AbortError') throw e;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return 'downloaded';
}
