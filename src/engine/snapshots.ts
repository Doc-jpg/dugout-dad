/**
 * Historical aggregate snapshots (for example a GameChanger season export).
 *
 * A season-total CSV has no game or play history, so these rows are shown as imported
 * aggregates, never turned into invented events. Headers are read per SECTION (batting,
 * pitching, fielding) because GameChanger repeats names such as BB, SO, H, GP and SB.
 *
 * Percent-style columns in GameChanger exports are 0 to 100 (QAB%, GB%, C%, S%, ...);
 * they are converted to 0 to 1 here so they line up with Dugout Dad's computed rates.
 * AVG, OBP, SLG, OPS, BABIP and BA/RISP are already decimals and are kept as is.
 */
import type { SnapshotRow, StatSnapshot, StatValue, Position } from './types';
import { inningsToOuts, outsToInnings } from './types';
import type { ReplayResult } from './reducer';
import { emptyBattingLine, finalizeBattingLine, type BattingLine, type PitchingLine, type FieldingLine } from './stats';

export type Provenance = 'imported' | 'scored' | 'combined';

function val(section: Record<string, StatValue> | undefined, header: string): number | null {
  const v = section?.[header];
  if (!v) return null;
  return v.value;
}

function count(section: Record<string, StatValue> | undefined, header: string): number {
  return val(section, header) ?? 0;
}

function pct(section: Record<string, StatValue> | undefined, header: string): number | null {
  const v = val(section, header);
  return v == null ? null : v / 100;
}

function outsOf(section: Record<string, StatValue> | undefined, header: string): number | null {
  const v = section?.[header];
  if (!v) return null;
  if (v.outs != null) return v.outs;
  if (v.raw == null || v.raw.trim() === '' || v.raw.trim() === '-') return null;
  try {
    return inningsToOuts(v.raw);
  } catch {
    return null;
  }
}

export type ImportedBattingLine = Partial<Omit<BattingLine, 'playerId'>> & { playerId: string | null; source: 'imported' };

export function snapshotBattingLine(row: SnapshotRow): ImportedBattingLine {
  const b = row.batting;
  const psPa = val(b, 'PS/PA');
  return {
    source: 'imported',
    playerId: row.playerId,
    games: count(b, 'GP'),
    pa: count(b, 'PA'),
    ab: count(b, 'AB'),
    h: count(b, 'H'),
    singles: count(b, '1B'),
    doubles: count(b, '2B'),
    triples: count(b, '3B'),
    hr: count(b, 'HR'),
    rbi: count(b, 'RBI'),
    r: count(b, 'R'),
    bb: count(b, 'BB'),
    so: count(b, 'SO'),
    soLooking: count(b, 'K-L'),
    hbp: count(b, 'HBP'),
    sac: count(b, 'SAC'),
    sf: count(b, 'SF'),
    roe: count(b, 'ROE'),
    fc: count(b, 'FC'),
    sb: count(b, 'SB'),
    cs: count(b, 'CS'),
    pik: count(b, 'PIK'),
    qab: count(b, 'QAB'),
    qabPct: pct(b, 'QAB%'),
    paPerBb: val(b, 'PA/BB'),
    bbPerK: val(b, 'BB/K'),
    contactPct: pct(b, 'C%'),
    hard: count(b, 'HHB'),
    ldPct: pct(b, 'LD%'),
    fbPct: pct(b, 'FB%'),
    gbPct: pct(b, 'GB%'),
    babip: val(b, 'BABIP'),
    baRisp: val(b, 'BA/RISP'),
    lob: count(b, 'LOB'),
    twoOutRbi: count(b, '2OUTRBI'),
    xbh: count(b, 'XBH'),
    tb: count(b, 'TB'),
    pitchesSeen: val(b, 'PS'),
    psPerPa: psPa,
    twoStrikeThreePlus: count(b, '2S+3'),
    sixPlus: count(b, '6+'),
    sixPlusPct: pct(b, '6+%'),
    gidp: count(b, 'GIDP'),
    avg: val(b, 'AVG'),
    obp: val(b, 'OBP'),
    slg: val(b, 'SLG'),
    ops: val(b, 'OPS')
  };
}

export type ImportedPitchingLine = Partial<Omit<PitchingLine, 'playerId'>> & { playerId: string | null; source: 'imported' };

export function snapshotPitchingLine(row: SnapshotRow): ImportedPitchingLine {
  const p = row.pitching;
  const outs = outsOf(p, 'IP');
  return {
    source: 'imported',
    playerId: row.playerId,
    outs: outs ?? 0,
    ipText: outs == null ? '0.0' : outsToInnings(outs),
    games: count(p, 'GP'),
    gs: count(p, 'GS'),
    bf: count(p, 'BF'),
    pitches: val(p, '#P'),
    h: count(p, 'H'),
    r: count(p, 'R'),
    er: count(p, 'ER'),
    bb: count(p, 'BB'),
    so: count(p, 'SO'),
    soLooking: count(p, 'K-L'),
    hbp: count(p, 'HBP'),
    hr: count(p, 'HR'),
    wp: count(p, 'WP'),
    bk: count(p, 'BK'),
    pik: count(p, 'PIK'),
    sb: count(p, 'SB'),
    cs: count(p, 'CS'),
    era: val(p, 'ERA'),
    whip: val(p, 'WHIP'),
    baa: val(p, 'BAA'),
    strikePct: pct(p, 'S%'),
    fpsPct: pct(p, 'FPS%'),
    pPerIp: val(p, 'P/IP'),
    pPerBf: val(p, 'P/BF'),
    kPerBb: val(p, 'K/BB'),
    kPerBf: val(p, 'K/BF'),
    bbPerInn: val(p, 'BB/INN')
  };
}

export const SNAPSHOT_POSITION_COLUMNS: Array<{ header: string; position: Position }> = [
  { header: 'P', position: 1 },
  { header: 'C', position: 2 },
  { header: '1B', position: 3 },
  { header: '2B', position: 4 },
  { header: '3B', position: 5 },
  { header: 'SS', position: 6 },
  { header: 'LF', position: 7 },
  { header: 'CF', position: 8 },
  { header: 'RF', position: 9 }
];

export interface ImportedFielding {
  playerId: string | null;
  source: 'imported';
  /** One entry per position with recorded innings (outs). Errors are NOT known per position. */
  byPosition: Array<Partial<FieldingLine> & { position: Position; outs: number; inningsText: string; source: 'imported'; positionErrorsKnown: false }>;
  /** Player-level fielding totals as exported. */
  player: {
    tc: number;
    a: number;
    po: number;
    e: number;
    dp: number;
    tp: number;
    fpct: number | null;
    totalOuts: number | null;
    totalInningsText: string | null;
    /** Catcher-only columns as exported (INN = innings caught, PB, SB, SBATT, CS, PIK, CI). */
    catcher: { inningsCaughtOuts: number | null; pb: number; sb: number; sbAttempts: number; cs: number; csPct: number | null; pik: number; ci: number };
    /** GameChanger does not record the position occupied when an error happened. Never distribute errors. */
    positionErrorsKnown: false;
    source: 'imported';
  };
}

export function snapshotFieldingLines(row: SnapshotRow): ImportedFielding {
  const f = row.fielding;
  const byPosition: ImportedFielding['byPosition'] = [];
  for (const { header, position } of SNAPSHOT_POSITION_COLUMNS) {
    const outs = outsOf(f, header);
    if (outs == null || outs === 0) continue;
    byPosition.push({ source: 'imported', playerId: row.playerId ?? undefined, position, outs, inningsText: outsToInnings(outs), positionErrorsKnown: false });
  }
  const total = outsOf(f, 'Total');
  return {
    playerId: row.playerId,
    source: 'imported',
    byPosition,
    player: {
      tc: count(f, 'TC'),
      a: count(f, 'A'),
      po: count(f, 'PO'),
      e: count(f, 'E'),
      dp: count(f, 'DP'),
      tp: count(f, 'TP'),
      fpct: val(f, 'FPCT'),
      totalOuts: total,
      totalInningsText: total == null ? null : outsToInnings(total),
      catcher: {
        inningsCaughtOuts: outsOf(f, 'INN'),
        pb: count(f, 'PB'),
        sb: count(f, 'SB'),
        sbAttempts: count(f, 'SBATT'),
        cs: count(f, 'CS'),
        csPct: pct(f, 'CS%'),
        pik: count(f, 'PIK'),
        ci: count(f, 'CI')
      },
      positionErrorsKnown: false,
      source: 'imported'
    }
  };
}

// ---------------------------------------------------------------------------
// Combining imported aggregates with locally scored games
// ---------------------------------------------------------------------------

export function canCombine(snapshot: StatSnapshot, replays: ReplayResult[]): { ok: boolean; reason: string } {
  if (!snapshot.coverageEnd) {
    return { ok: false, reason: 'The snapshot has no coverage end date, so it is not known which games it already includes.' };
  }
  const scored = replays.filter((r) => r.game.teamId === snapshot.teamId || r.game.opponentTeamId === snapshot.teamId);
  if (!scored.length) return { ok: true, reason: 'No scored games for this team; the snapshot stands alone.' };
  const overlapping = scored.filter((r) => r.game.date <= snapshot.coverageEnd!);
  if (overlapping.length) {
    return {
      ok: false,
      reason: `${overlapping.length} scored game${overlapping.length === 1 ? '' : 's'} on or before the snapshot coverage end (${snapshot.coverageEnd}) could be counted twice.`
    };
  }
  return { ok: true, reason: `All ${scored.length} scored games are after the snapshot coverage end (${snapshot.coverageEnd}).` };
}

export type CombinedBattingLine = BattingLine & { provenance: 'combined'; importedPa: number; scoredPa: number };

/**
 * Sum counts from an imported line and a scored line, then recompute rates.
 * Rate-only imported fields that cannot be recomputed from counts (for example GB% with no
 * trajectory counts) are dropped rather than averaged. Throws unless `permission.ok`.
 */
export function combineBatting(
  snapshotLine: ImportedBattingLine,
  scoredLine: BattingLine,
  permission: { ok: boolean; reason: string }
): CombinedBattingLine {
  if (!permission.ok) throw new Error(`Cannot combine imported and scored statistics: ${permission.reason}`);
  const pid = scoredLine.playerId || snapshotLine.playerId || 'unknown';
  const t = emptyBattingLine(pid);
  const s = snapshotLine;
  const n = (x: number | null | undefined) => x ?? 0;
  t.games = n(s.games) + scoredLine.games;
  t.pa = n(s.pa) + scoredLine.pa;
  t.ab = n(s.ab) + scoredLine.ab;
  t.h = n(s.h) + scoredLine.h;
  t.singles = n(s.singles) + scoredLine.singles;
  t.doubles = n(s.doubles) + scoredLine.doubles;
  t.triples = n(s.triples) + scoredLine.triples;
  t.hr = n(s.hr) + scoredLine.hr;
  t.r = n(s.r) + scoredLine.r;
  t.rbi = n(s.rbi) + scoredLine.rbi;
  t.bb = n(s.bb) + scoredLine.bb;
  t.ibb = scoredLine.ibb;
  t.so = n(s.so) + scoredLine.so;
  t.soLooking = n(s.soLooking) + scoredLine.soLooking;
  t.hbp = n(s.hbp) + scoredLine.hbp;
  t.sac = n(s.sac) + scoredLine.sac;
  t.sf = n(s.sf) + scoredLine.sf;
  t.roe = n(s.roe) + scoredLine.roe;
  t.fc = n(s.fc) + scoredLine.fc;
  t.sb = n(s.sb) + scoredLine.sb;
  t.cs = n(s.cs) + scoredLine.cs;
  t.pik = n(s.pik) + scoredLine.pik;
  t.gidp = n(s.gidp) + scoredLine.gidp;
  t.lob = n(s.lob) + scoredLine.lob;
  t.twoOutRbi = n(s.twoOutRbi) + scoredLine.twoOutRbi;
  t.qab = n(s.qab) + scoredLine.qab;
  t.sixPlus = n(s.sixPlus) + scoredLine.sixPlus;
  t.twoStrikeThreePlus = n(s.twoStrikeThreePlus) + scoredLine.twoStrikeThreePlus;
  // Pitch totals only when both sides know them
  if (s.pitchesSeen != null && scoredLine.pitchesSeen != null) {
    t.pitchesSeen = s.pitchesSeen + scoredLine.pitchesSeen;
    t.pitchesSeenPa = n(s.pa) + scoredLine.pitchesSeenPa;
  } else {
    t.pitchesSeen = null;
    t.pitchesSeenPa = scoredLine.pitchesSeenPa;
  }
  // RISP: GameChanger gives BA/RISP but not the AB count, so keep only the scored portion
  t.abRisp = scoredLine.abRisp;
  t.hRisp = scoredLine.hRisp;
  // Batted-ball observations: only the scored portion has counts; imported HHB is a count without a denominator
  t.bip = scoredLine.bip;
  t.trajectoryKnown = scoredLine.trajectoryKnown;
  t.gb = scoredLine.gb; t.ld = scoredLine.ld; t.fb = scoredLine.fb; t.pu = scoredLine.pu; t.bunt = scoredLine.bunt;
  t.hardnessKnown = scoredLine.hardnessKnown;
  t.hard = scoredLine.hard; t.medium = scoredLine.medium; t.soft = scoredLine.soft; t.hardHitOuts = scoredLine.hardHitOuts;
  t.zoneKnown = scoredLine.zoneKnown;
  t.byZone = { ...scoredLine.byZone };
  finalizeBattingLine(t);
  return { ...t, provenance: 'combined', importedPa: n(s.pa), scoredPa: scoredLine.pa };
}
