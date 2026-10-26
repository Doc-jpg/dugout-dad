/**
 * GameChanger season-export importer.
 *
 * A GameChanger team "stats" CSV has TWO header rows:
 *   row 0: section labels, blank except where a section begins ("Batting", "Pitching", "Fielding")
 *   row 1: column names (Number, Last, First, then the stat abbreviations)
 * followed by one row per player, a "Totals" row, a blank row, and a "Glossary" row whose cells
 * hold "ABBR = definition" text.
 *
 * Many abbreviations repeat across sections (GP, H, BB, SO, K-L, HBP, SB, CS, PIK, LOB, HR,
 * LD%, FB%, GB%, BABIP, BA/RISP, ...). They mean different things in each section, so every
 * value is stored under its SECTION, located by column position, never by the name alone.
 *
 * Innings-style columns (pitching IP, fielding INN and the per-position innings) use baseball
 * notation where the digit after the point is OUTS (18.2 = 18 innings and 2 outs = 56 outs).
 * They are parsed to outs and never treated as decimals.
 *
 * A season export is an AGGREGATE. It is stored as a dated snapshot with the original text kept
 * verbatim. No games or plays are invented from it.
 */
import type { DugoutDB } from '../db/db';
import { createPlayer } from '../db/db';
import type { Player, StatSnapshot, SnapshotRow, StatValue, ISODate } from '../engine/types';
import { inningsToOuts, newId, nowIso } from '../engine/types';
import { parseCsv } from './csv';
import { sha256Hex } from './hash';

export type SectionName = 'identity' | 'batting' | 'pitching' | 'fielding';

export interface ColumnSection {
  section: SectionName;
  start: number; // inclusive column index
  end: number; // inclusive column index
}

export interface ParsedRow {
  number: string;
  last: string;
  first: string;
  batting: Record<string, StatValue>;
  pitching: Record<string, StatValue>;
  fielding: Record<string, StatValue>;
}

export interface ParsedGameChanger {
  detected: boolean;
  columnSections: ColumnSection[];
  headers: string[];
  rows: ParsedRow[];
  totals?: ParsedRow;
  glossary: Record<string, string>;
  warnings: string[];
}

/** Real GameChanger headers, in file order, for each section (Fall 2026 export). */
export const GC_BATTING_KEYS = [
  'GP', 'PA', 'AB', 'AVG', 'OBP', 'OPS', 'SLG', 'H', '1B', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'SO', 'K-L', 'HBP',
  'SAC', 'SF', 'ROE', 'FC', 'SB', 'SB%', 'CS', 'PIK', 'QAB', 'QAB%', 'PA/BB', 'BB/K', 'C%', 'HHB', 'LD%', 'FB%',
  'GB%', 'BABIP', 'BA/RISP', 'LOB', '2OUTRBI', 'XBH', 'TB', 'PS', 'PS/PA', '2S+3', '2S+3%', '6+', '6+%', 'AB/HR',
  'GIDP', 'GITP', 'CI'
] as const;

export const GC_PITCHING_KEYS = [
  'IP', 'GP', 'GS', 'BF', '#P', 'W', 'L', 'SV', 'SVO', 'BS', 'SV%', 'H', 'R', 'ER', 'BB', 'SO', 'K-L', 'HBP', 'ERA',
  'WHIP', 'LOB', 'BK', 'PIK', 'CS', 'SB', 'SB%', 'WP', 'BAA', 'P/IP', 'P/BF', '<3%', 'LOO', '1ST2OUT', '123INN',
  '<13', 'FIP', 'S%', 'FPS%', 'FPSO%', 'FPSW%', 'FPSH%', 'BB/INN', '0BBINN', 'BBS', 'LOBB', 'LOBBS', 'SM%', 'K/BF',
  'K/BB', 'WEAK%', 'HHB%', 'GO/AO', 'HR', 'LD%', 'FB%', 'GB%', 'BABIP', 'BA/RISP', 'TopMPH', 'FB', 'FBS', 'FBS%',
  'FBSW%', 'FBSM%', 'MPHFB', 'TopFB', 'CB', 'CBS', 'CBS%', 'CBSW%', 'CBSM%', 'MPHCB', 'TopCB', 'CT', 'CTS', 'CTS%',
  'CTSW%', 'CTSM%', 'MPHCT', 'TopCT', 'SL', 'SLS', 'SLS%', 'SLSW%', 'SLSM%', 'MPHSL', 'TopSL', 'CH', 'CHS', 'CHS%',
  'CHSW%', 'CHSM%', 'MPHCH', 'TopCH', 'OS', 'OSS', 'OSS%', 'OSSW%', 'OSSM%', 'MPHOS', 'TopOS'
] as const;

export const GC_FIELDING_KEYS = [
  'TC', 'A', 'PO', 'FPCT', 'E', 'DP', 'TP', 'INN', 'PB', 'SB', 'SBATT', 'CS', 'CS%', 'PIK', 'CI',
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF', 'Total'
] as const;

/** Columns whose values are innings in baseball notation (outs after the point). */
const INNINGS_COLUMNS: Record<Exclude<SectionName, 'identity'>, ReadonlySet<string>> = {
  batting: new Set<string>(),
  pitching: new Set(['IP']),
  // Fielding INN is "innings caught" per the GameChanger glossary; the position columns are
  // innings played at that position; Total is total defensive innings.
  fielding: new Set(['INN', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF', 'Total'])
};

export class GameChangerFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameChangerFormatError';
  }
}

export class DuplicateImportError extends Error {
  existingSnapshotId: string;
  constructor(existingSnapshotId: string, message = 'This exact file has already been imported') {
    super(message);
    this.name = 'DuplicateImportError';
    this.existingSnapshotId = existingSnapshotId;
  }
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

export function parseStatValue(raw: string, isInnings: boolean): StatValue {
  const text = (raw ?? '').trim();
  if (text === '' || text === '-' || text === '--' || text.toUpperCase() === 'N/A') {
    return { raw: text, value: null, kind: 'na' };
  }
  if (isInnings) {
    try {
      const outs = inningsToOuts(text);
      return { raw: text, value: outs / 3, outs, kind: 'innings' };
    } catch {
      return { raw: text, value: null, kind: 'text' };
    }
  }
  if (/^-?\d+$/.test(text)) {
    return { raw: text, value: parseInt(text, 10), kind: 'count' };
  }
  if (/^-?(\d+)?\.\d+$/.test(text) || /^-?\d+\.\d*$/.test(text)) {
    return { raw: text, value: parseFloat(text), kind: 'rate' };
  }
  return { raw: text, value: null, kind: 'text' };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h.trim();
}

function detectSections(sectionRow: string[], headerRow: string[]): ColumnSection[] {
  const width = headerRow.length;
  const starts: Array<{ section: SectionName; index: number }> = [];
  sectionRow.forEach((label, i) => {
    const l = label.trim().toLowerCase();
    if (l === 'batting' || l === 'pitching' || l === 'fielding') starts.push({ section: l, index: i });
  });
  if (!starts.length) return [];
  starts.sort((a, b) => a.index - b.index);
  const sections: ColumnSection[] = [];
  if (starts[0].index > 0) sections.push({ section: 'identity', start: 0, end: starts[0].index - 1 });
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].index - 1 : width - 1;
    sections.push({ section: s.section, start: s.index, end });
  });
  return sections;
}

function isTotalsRow(row: string[]): boolean {
  const a = (row[0] ?? '').trim().toLowerCase();
  const b = (row[1] ?? '').trim().toLowerCase();
  return a === 'totals' || a === 'total' || b === 'totals' || b === 'total';
}

function isGlossaryRow(row: string[]): boolean {
  const a = (row[0] ?? '').trim().toLowerCase();
  const b = (row[1] ?? '').trim().toLowerCase();
  return a === 'glossary' || b === 'glossary';
}

function rowToParsed(row: string[], headers: string[], sections: ColumnSection[], identity: { number: number; last: number; first: number }): ParsedRow {
  const out: ParsedRow = {
    number: (row[identity.number] ?? '').trim(),
    last: (row[identity.last] ?? '').trim(),
    first: (row[identity.first] ?? '').trim(),
    batting: {},
    pitching: {},
    fielding: {}
  };
  for (const sec of sections) {
    if (sec.section === 'identity') continue;
    const target = out[sec.section];
    const inningsCols = INNINGS_COLUMNS[sec.section];
    for (let i = sec.start; i <= sec.end; i++) {
      const header = headers[i];
      if (!header) continue;
      target[header] = parseStatValue(row[i] ?? '', inningsCols.has(header));
    }
  }
  return out;
}

export function parseGameChangerCsv(text: string): ParsedGameChanger {
  const grid = parseCsv(text);
  const warnings: string[] = [];
  if (grid.length < 3) throw new GameChangerFormatError('File is too short to be a GameChanger stats export');

  // Locate the header row: the row that starts with Number / Last / First (case-insensitive).
  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const r = grid[i].map((c) => c.trim().toLowerCase());
    if (r[0] === 'number' && r[1] === 'last' && r[2] === 'first') {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new GameChangerFormatError('Could not find the "Number, Last, First" header row. This does not look like a GameChanger team stats export.');
  }
  if (headerIndex === 0) {
    throw new GameChangerFormatError('The section row (Batting / Pitching / Fielding) above the column names is missing. Export the full team stats CSV from GameChanger.');
  }
  const sectionRow = grid[headerIndex - 1];
  const headerRow = grid[headerIndex].map(normalizeHeader);
  const sections = detectSections(sectionRow, headerRow);
  const named = sections.filter((s) => s.section !== 'identity').map((s) => s.section);
  if (!named.includes('batting') && !named.includes('pitching') && !named.includes('fielding')) {
    throw new GameChangerFormatError('No Batting, Pitching or Fielding section labels were found above the column names.');
  }
  for (const want of ['batting', 'pitching', 'fielding'] as const) {
    if (!named.includes(want)) warnings.push(`No ${want} section in this file`);
  }

  const identity = { number: 0, last: 1, first: 2 };
  const rows: ParsedRow[] = [];
  let totals: ParsedRow | undefined;
  const glossary: Record<string, string> = {};

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row.length || row.every((c) => c.trim() === '')) continue;
    if (isGlossaryRow(row)) {
      for (const cell of row) {
        const m = /^\s*(.+?)\s*=\s*(.+?)\s*$/.exec(cell);
        if (m) glossary[m[1]] = m[2];
      }
      continue;
    }
    if (row.length !== headerRow.length) {
      warnings.push(`Row ${i + 1} has ${row.length} columns, expected ${headerRow.length}; values were aligned by position`);
    }
    const parsed = rowToParsed(row, headerRow, sections, identity);
    if (isTotalsRow(row)) {
      totals = parsed;
      continue;
    }
    if (!parsed.last && !parsed.first) {
      warnings.push(`Row ${i + 1} has no player name and was skipped`);
      continue;
    }
    rows.push(parsed);
  }
  if (!rows.length) warnings.push('No player rows were found');

  return { detected: true, columnSections: sections, headers: headerRow, rows, totals, glossary, warnings };
}

// ---------------------------------------------------------------------------
// Player matching
// ---------------------------------------------------------------------------

export type MatchConfidence = 'exact' | 'alias' | 'lastname_number' | 'fuzzy' | 'none';

export interface PlayerMatchSuggestion {
  rowIndex: number;
  playerId: string | null;
  confidence: MatchConfidence;
  reason: string;
}

export function normalizeName(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function suggestPlayerMatches(rows: ParsedRow[], players: Player[]): PlayerMatchSuggestion[] {
  const byFull = new Map<string, Player[]>();
  const byAlias = new Map<string, Player[]>();
  const byLast = new Map<string, Player[]>();
  const push = (m: Map<string, Player[]>, k: string, p: Player) => {
    if (!k) return;
    const arr = m.get(k) ?? [];
    arr.push(p);
    m.set(k, arr);
  };
  for (const p of players) {
    push(byFull, normalizeName(`${p.firstName} ${p.lastName}`), p);
    push(byLast, normalizeName(p.lastName), p);
    for (const a of p.aliases ?? []) push(byAlias, normalizeName(a), p);
  }

  const used = new Set<string>();
  return rows.map((row, rowIndex) => {
    const full = normalizeName(`${row.first} ${row.last}`);
    const fullReversed = normalizeName(`${row.last} ${row.first}`);
    const exact = (byFull.get(full) ?? []).filter((p) => !used.has(p.id));
    if (exact.length === 1) {
      used.add(exact[0].id);
      return { rowIndex, playerId: exact[0].id, confidence: 'exact', reason: 'Name matches exactly' };
    }
    const alias = [...(byAlias.get(full) ?? []), ...(byAlias.get(fullReversed) ?? [])].filter((p) => !used.has(p.id));
    if (alias.length >= 1) {
      used.add(alias[0].id);
      return { rowIndex, playerId: alias[0].id, confidence: 'alias', reason: `Matches a known alias of ${alias[0].firstName} ${alias[0].lastName}` };
    }
    // Last name plus jersey number (number alone is never identity)
    const lastCands = (byLast.get(normalizeName(row.last)) ?? []).filter((p) => !used.has(p.id));
    if (row.number && lastCands.length) {
      const withNumber = lastCands.filter((p) => (p.number ?? '').trim() === row.number.trim());
      if (withNumber.length === 1) {
        used.add(withNumber[0].id);
        return { rowIndex, playerId: withNumber[0].id, confidence: 'lastname_number', reason: `Last name and #${row.number} match` };
      }
    }
    // Fuzzy on the full name
    let best: { p: Player; d: number } | null = null;
    for (const p of players) {
      if (used.has(p.id)) continue;
      const d = levenshtein(full, normalizeName(`${p.firstName} ${p.lastName}`));
      if (d <= 2 && (!best || d < best.d)) best = { p, d };
    }
    if (best) {
      used.add(best.p.id);
      return { rowIndex, playerId: best.p.id, confidence: 'fuzzy', reason: `Close spelling of ${best.p.firstName} ${best.p.lastName} (${best.d} letter${best.d === 1 ? '' : 's'} off)` };
    }
    return { rowIndex, playerId: null, confidence: 'none', reason: 'No matching player; a new player can be created' };
  });
}

// ---------------------------------------------------------------------------
// Import / rollback
// ---------------------------------------------------------------------------

export interface ImportGameChangerOptions {
  text: string;
  fileName: string;
  teamId: string;
  label: string;
  asOfDate: ISODate;
  coverageStart?: ISODate;
  coverageEnd?: ISODate;
  seasonId?: string;
  /** rowIndex -> playerId (null = unmatched). Rows missing from the map are treated as unmatched. */
  playerIdByRow: Record<number, string | null>;
  createMissingPlayers: boolean;
}

function parsedToSnapshotRow(row: ParsedRow, playerId: string | null): SnapshotRow {
  return {
    number: row.number,
    last: row.last,
    first: row.first,
    playerId,
    batting: row.batting,
    pitching: row.pitching,
    fielding: row.fielding
  };
}

export async function importGameChangerSnapshot(
  database: DugoutDB,
  opts: ImportGameChangerOptions
): Promise<{ snapshot: StatSnapshot; createdPlayers: Player[] }> {
  const parsed = parseGameChangerCsv(opts.text);
  const fileSha256 = await sha256Hex(opts.text);
  const existing = await database.snapshots.where('fileSha256').equals(fileSha256).first();
  if (existing) throw new DuplicateImportError(existing.id, `This exact file was already imported as "${existing.label}" on ${existing.importedAt.slice(0, 10)}`);

  const createdPlayers: Player[] = [];
  const rows: SnapshotRow[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    let playerId = opts.playerIdByRow[i] ?? null;
    if (!playerId && opts.createMissingPlayers) {
      const p = await createPlayer(
        {
          teamId: opts.teamId,
          firstName: row.first,
          lastName: row.last,
          number: row.number || undefined,
          status: 'regular',
          aliases: []
        },
        database
      );
      createdPlayers.push(p);
      playerId = p.id;
    }
    rows.push(parsedToSnapshotRow(row, playerId));
  }

  const snapshot: StatSnapshot = {
    id: newId(),
    source: 'gamechanger',
    teamId: opts.teamId,
    seasonId: opts.seasonId,
    label: opts.label,
    asOfDate: opts.asOfDate,
    coverageStart: opts.coverageStart,
    coverageEnd: opts.coverageEnd,
    fileName: opts.fileName,
    fileSha256,
    rawText: opts.text,
    importedAt: nowIso(),
    rows,
    totals: parsed.totals ? parsedToSnapshotRow(parsed.totals, null) : undefined,
    glossary: parsed.glossary,
    columnSections: parsed.columnSections,
    createdPlayerIds: createdPlayers.map((p) => p.id)
  };
  await database.snapshots.put(snapshot);
  return { snapshot, createdPlayers };
}

/** Delete a snapshot. Players it created are left in place; their ids are returned so the UI can offer to remove them. */
export async function rollbackSnapshot(database: DugoutDB, snapshotId: string): Promise<{ removed: boolean; createdPlayerIds: string[] }> {
  const snap = await database.snapshots.get(snapshotId);
  if (!snap) return { removed: false, createdPlayerIds: [] };
  await database.snapshots.delete(snapshotId);
  return { removed: true, createdPlayerIds: snap.createdPlayerIds ?? [] };
}

// ---------------------------------------------------------------------------
// Section-aware readers
// ---------------------------------------------------------------------------

export type GcBattingKey = (typeof GC_BATTING_KEYS)[number];
export type GcPitchingKey = (typeof GC_PITCHING_KEYS)[number];
export type GcFieldingKey = (typeof GC_FIELDING_KEYS)[number];

export function battingValue(row: SnapshotRow | ParsedRow, key: GcBattingKey | string): number | null {
  return row.batting[key]?.value ?? null;
}
export function pitchingValue(row: SnapshotRow | ParsedRow, key: GcPitchingKey | string): number | null {
  return row.pitching[key]?.value ?? null;
}
export function fieldingValue(row: SnapshotRow | ParsedRow, key: GcFieldingKey | string): number | null {
  return row.fielding[key]?.value ?? null;
}
/** Outs for an innings-style column (pitching IP, fielding INN / position columns). null when not recorded. */
export function pitchingOuts(row: SnapshotRow | ParsedRow, key: 'IP' = 'IP'): number | null {
  const v = row.pitching[key];
  return v && v.kind === 'innings' && v.outs != null ? v.outs : null;
}
export function fieldingOuts(row: SnapshotRow | ParsedRow, key: 'INN' | 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'SF' | 'Total'): number | null {
  const v = row.fielding[key];
  return v && v.kind === 'innings' && v.outs != null ? v.outs : null;
}
export function rawValue(row: SnapshotRow | ParsedRow, section: 'batting' | 'pitching' | 'fielding', key: string): string | undefined {
  return row[section][key]?.raw;
}

export interface SnapshotLine {
  playerId: string | null;
  number: string;
  name: string;
  batting: Record<string, StatValue>;
  pitching: Record<string, StatValue>;
  fielding: Record<string, StatValue>;
  /** Position outs by standard position number (1..9), null when not recorded. */
  positionOuts: Record<number, number | null>;
  totalDefensiveOuts: number | null;
  inningsPitchedOuts: number | null;
}

const POSITION_KEYS: Array<[number, 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF']> = [
  [1, 'P'], [2, 'C'], [3, '1B'], [4, '2B'], [5, '3B'], [6, 'SS'], [7, 'LF'], [8, 'CF'], [9, 'RF']
];

/** Flatten a snapshot into convenient per-player lines (section-aware). */
export function snapshotToLines(snapshot: StatSnapshot): SnapshotLine[] {
  return snapshot.rows.map((row) => {
    const positionOuts: Record<number, number | null> = {};
    for (const [pos, key] of POSITION_KEYS) positionOuts[pos] = fieldingOuts(row, key);
    return {
      playerId: row.playerId,
      number: row.number,
      name: [row.first, row.last].filter(Boolean).join(' '),
      batting: row.batting,
      pitching: row.pitching,
      fielding: row.fielding,
      positionOuts,
      totalDefensiveOuts: fieldingOuts(row, 'Total'),
      inningsPitchedOuts: pitchingOuts(row, 'IP')
    };
  });
}
