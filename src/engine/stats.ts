/**
 * Statistics engine.
 *
 * Pure functions over already-replayed games (ReplayResult[]). Rules:
 *  - every rate carries its denominator and is null when the denominator is 0
 *  - missing observations are never treated as zero; coverage counts say how much was recorded
 *  - observational metrics (hard-hit, difficulty, execution) are labeled as such
 *  - innings are stored as outs and displayed with outsToInnings
 */
import type { Side, Position, Difficulty, Execution, Settings, PAResult, ID } from './types';
import { outsToInnings } from './types';
import {
  type ReplayResult, type PALogEntry, type PitcherLine, type FieldingPlay, type BaserunningLogEntry,
  positionOuts, otherSide, AB_RESULTS, HIT_RESULTS, STRIKEOUT_RESULTS, WALK_RESULTS
} from './reducer';

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface GameFilter {
  playerId?: string;
  teamId?: string;
  side?: 'mine' | 'opponent';
  dateFrom?: string;
  dateTo?: string;
  gameIds?: string[];
  tournamentId?: string;
  lastNGames?: number;
  opponentTeamId?: string;
  homeAway?: 'home' | 'away';
}

export function myBattingSide(r: ReplayResult): Side {
  return r.game.mySide;
}

/** Which side a team occupies in a game, or null if the team is not in it. */
export function sideForTeam(r: ReplayResult, teamId: string | undefined): Side | null {
  if (!teamId) return null;
  if (r.game.teamId === teamId) return r.game.mySide;
  if (r.game.opponentTeamId === teamId) return otherSide(r.game.mySide);
  return null;
}

function sortByDateDesc(replays: ReplayResult[]): ReplayResult[] {
  return [...replays].sort((a, b) => {
    if (a.game.date !== b.game.date) return a.game.date < b.game.date ? 1 : -1;
    if (a.game.time && b.game.time && a.game.time !== b.game.time) return a.game.time < b.game.time ? 1 : -1;
    return a.game.createdAt < b.game.createdAt ? 1 : a.game.createdAt > b.game.createdAt ? -1 : 0;
  });
}

export function sortByDateAsc(replays: ReplayResult[]): ReplayResult[] {
  return sortByDateDesc(replays).reverse();
}

export function filterReplays(replays: ReplayResult[], f: GameFilter): ReplayResult[] {
  let out = replays.filter((r) => {
    if (f.gameIds && !f.gameIds.includes(r.game.id)) return false;
    if (f.teamId && r.game.teamId !== f.teamId && r.game.opponentTeamId !== f.teamId) return false;
    if (f.opponentTeamId && r.game.opponentTeamId !== f.opponentTeamId && r.game.teamId !== f.opponentTeamId) return false;
    if (f.tournamentId && r.game.tournamentId !== f.tournamentId) return false;
    if (f.dateFrom && r.game.date < f.dateFrom) return false;
    if (f.dateTo && r.game.date > f.dateTo) return false;
    if (f.homeAway && r.game.mySide !== f.homeAway) return false;
    if (f.playerId) {
      const played =
        r.paLog.some((p) => p.batterId === f.playerId) ||
        r.intervals.some((iv) => iv.playerId === f.playerId) ||
        r.pitcherLines.some((l) => l.pitcherId === f.playerId);
      if (!played) return false;
    }
    return true;
  });
  if (f.lastNGames != null) {
    out = sortByDateDesc(out).slice(0, Math.max(0, f.lastNGames));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

const BIP_EXCLUDED: ReadonlySet<PAResult> = new Set(['K', 'KL', 'D3K', 'BB', 'IBB', 'HBP', 'CI', 'OTHER_OUT', 'OTHER_SAFE']);

function totalBases(result: PAResult): number {
  switch (result) {
    case '1B': return 1;
    case '2B': return 2;
    case '3B': return 3;
    case 'HR': return 4;
    default: return 0;
  }
}

/** Count pitches thrown after the second strike (Level C pitch list only). Null if no pitch list. */
export function pitchesAfterTwoStrikes(entry: PALogEntry): number | null {
  const list = entry.pitches?.pitches;
  if (!list || !list.length) return null;
  let strikes = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    let isStrike = false;
    if (p.result === 'called_strike' || p.result === 'swinging_strike' || p.result === 'foul_tip') isStrike = true;
    else if (p.result === 'foul' && strikes < 2) isStrike = true;
    if (isStrike) strikes += 1;
    if (strikes === 2) return list.length - (i + 1);
  }
  return 0;
}

/**
 * Baserunning moves do not always carry the runner's id (the scorer may have tapped a base, not a name).
 * Resolve runner identities by walking the game's PA and baserunning logs in seq order.
 */
export function resolveBaserunning(r: ReplayResult): BaserunningLogEntry[] {
  const merged: Array<{ seq: number; kind: 'pa'; pa: PALogEntry } | { seq: number; kind: 'br'; br: BaserunningLogEntry }> = [];
  for (const pa of r.paLog) merged.push({ seq: pa.seq, kind: 'pa', pa });
  for (const br of r.baserunningLog) merged.push({ seq: br.seq, kind: 'br', br });
  merged.sort((a, b) => a.seq - b.seq);
  const bases: { 1?: ID; 2?: ID; 3?: ID } = {};
  const out: BaserunningLogEntry[] = [];
  for (const m of merged) {
    if (m.kind === 'pa') {
      bases[1] = m.pa.basesAfter[1];
      bases[2] = m.pa.basesAfter[2];
      bases[3] = m.pa.basesAfter[3];
      continue;
    }
    const resolved = m.br.runners.map((mv) => {
      const pid = mv.playerId ?? (mv.from === 'batter' ? undefined : bases[mv.from]);
      return { ...mv, playerId: pid };
    });
    // apply to bases snapshot
    const next: { 1?: ID; 2?: ID; 3?: ID } = { ...bases };
    for (const mv of resolved) if (mv.from !== 'batter') delete next[mv.from];
    for (const mv of resolved) {
      if (mv.to === 1 || mv.to === 2 || mv.to === 3) next[mv.to] = mv.playerId;
    }
    bases[1] = next[1];
    bases[2] = next[2];
    bases[3] = next[3];
    out.push({ ...m.br, runners: resolved });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batting
// ---------------------------------------------------------------------------

export interface Coverage {
  recorded: number;
  of: number;
}

export interface BattingLine {
  playerId: string;
  games: number;
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  r: number;
  rbi: number;
  /** Walks including intentional walks. */
  bb: number;
  ibb: number;
  so: number;
  soLooking: number;
  hbp: number;
  sac: number;
  sf: number;
  roe: number;
  fc: number;
  sb: number;
  cs: number;
  pik: number;
  tb: number;
  xbh: number;
  gidp: number;
  lob: number;
  twoOutRbi: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  babip: number | null;
  abRisp: number;
  hRisp: number;
  baRisp: number | null;
  /** (ab - so) / ab */
  contactPct: number | null;
  bbPerK: number | null;
  paPerBb: number | null;
  qab: number;
  qabPct: number | null;
  pitchesSeen: number | null;
  /** PAs where a pitch total was recorded. */
  pitchesSeenPa: number;
  psPerPa: number | null;
  sixPlus: number;
  sixPlusPct: number | null;
  twoStrikeThreePlus: number;
  /** Balls in play recorded (PAs whose result is a batted ball; HR included). */
  bip: number;
  trajectoryKnown: number;
  gb: number;
  ld: number;
  fb: number;
  pu: number;
  bunt: number;
  gbPct: number | null;
  ldPct: number | null;
  fbPct: number | null;
  puPct: number | null;
  hardnessKnown: number;
  hard: number;
  medium: number;
  soft: number;
  /** Observational hard-hit rate: hard / hardnessKnown. Not measured exit velocity. */
  hardHitPct: number | null;
  /** Observational: hard-hit balls that became outs. */
  hardHitOuts: number;
  zoneKnown: number;
  byZone: Record<string, { bip: number; h: number; hard: number }>;
  coverage: {
    trajectory: Coverage;
    hardness: Coverage;
    zone: Coverage;
    pitches: Coverage;
  };
}

export function emptyBattingLine(playerId: string): BattingLine {
  return {
    playerId,
    games: 0, pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0,
    bb: 0, ibb: 0, so: 0, soLooking: 0, hbp: 0, sac: 0, sf: 0, roe: 0, fc: 0, sb: 0, cs: 0, pik: 0,
    tb: 0, xbh: 0, gidp: 0, lob: 0, twoOutRbi: 0,
    avg: null, obp: null, slg: null, ops: null, babip: null,
    abRisp: 0, hRisp: 0, baRisp: null, contactPct: null, bbPerK: null, paPerBb: null,
    qab: 0, qabPct: null, pitchesSeen: null, pitchesSeenPa: 0, psPerPa: null, sixPlus: 0, sixPlusPct: null, twoStrikeThreePlus: 0,
    bip: 0, trajectoryKnown: 0, gb: 0, ld: 0, fb: 0, pu: 0, bunt: 0, gbPct: null, ldPct: null, fbPct: null, puPct: null,
    hardnessKnown: 0, hard: 0, medium: 0, soft: 0, hardHitPct: null, hardHitOuts: 0,
    zoneKnown: 0, byZone: {},
    coverage: {
      trajectory: { recorded: 0, of: 0 },
      hardness: { recorded: 0, of: 0 },
      zone: { recorded: 0, of: 0 },
      pitches: { recorded: 0, of: 0 }
    }
  };
}

/** Recompute every rate on a line from its counts. */
export function finalizeBattingLine(l: BattingLine): BattingLine {
  l.tb = l.singles + 2 * l.doubles + 3 * l.triples + 4 * l.hr;
  l.xbh = l.doubles + l.triples + l.hr;
  l.avg = ratio(l.h, l.ab);
  l.obp = ratio(l.h + l.bb + l.hbp, l.ab + l.bb + l.hbp + l.sf);
  l.slg = ratio(l.tb, l.ab);
  l.ops = l.obp != null && l.slg != null ? l.obp + l.slg : null;
  l.babip = ratio(l.h - l.hr, l.ab - l.so - l.hr + l.sf);
  l.baRisp = ratio(l.hRisp, l.abRisp);
  l.contactPct = ratio(l.ab - l.so, l.ab);
  l.bbPerK = ratio(l.bb, l.so);
  l.paPerBb = ratio(l.pa, l.bb);
  l.qabPct = ratio(l.qab, l.pa);
  l.psPerPa = l.pitchesSeen != null ? ratio(l.pitchesSeen, l.pitchesSeenPa) : null;
  l.sixPlusPct = ratio(l.sixPlus, l.pitchesSeenPa);
  l.gbPct = ratio(l.gb, l.trajectoryKnown);
  l.ldPct = ratio(l.ld, l.trajectoryKnown);
  l.fbPct = ratio(l.fb, l.trajectoryKnown);
  l.puPct = ratio(l.pu, l.trajectoryKnown);
  l.hardHitPct = ratio(l.hard, l.hardnessKnown);
  l.coverage.trajectory = { recorded: l.trajectoryKnown, of: l.bip };
  l.coverage.hardness = { recorded: l.hardnessKnown, of: l.bip };
  l.coverage.zone = { recorded: l.zoneKnown, of: l.bip };
  l.coverage.pitches = { recorded: l.pitchesSeenPa, of: l.pa };
  return l;
}

export function isQualityAtBat(entry: PALogEntry, qab: Settings['qab']): boolean {
  if (entry.qab === true) return true;
  if (entry.qab === false) return false;
  if (qab.hit && HIT_RESULTS.has(entry.result)) return true;
  if (qab.walkOrHbp && (WALK_RESULTS.has(entry.result) || entry.result === 'HBP')) return true;
  if (qab.hardContact && entry.battedBall?.hardness === 'hard') return true;
  if (qab.sacrifice && (entry.result === 'SAC' || entry.result === 'SF')) return true;
  if (qab.rbi && entry.rbi > 0) return true;
  if (qab.sixPlusPitches && (entry.pitches?.total ?? 0) >= 6) return true;
  if (qab.threePlusAfterTwoStrikes) {
    const n = pitchesAfterTwoStrikes(entry);
    if (n != null && n >= 3) return true;
  }
  return false;
}

/** Add one plate appearance to a line (counts only; call finalizeBattingLine afterwards). */
function addPA(l: BattingLine, e: PALogEntry, qab: Settings['qab']) {
  l.pa += 1;
  if (AB_RESULTS.has(e.result)) l.ab += 1;
  if (HIT_RESULTS.has(e.result)) l.h += 1;
  if (e.result === '1B') l.singles += 1;
  if (e.result === '2B') l.doubles += 1;
  if (e.result === '3B') l.triples += 1;
  if (e.result === 'HR') l.hr += 1;
  l.rbi += e.rbi;
  if (WALK_RESULTS.has(e.result)) l.bb += 1;
  if (e.result === 'IBB') l.ibb += 1;
  if (STRIKEOUT_RESULTS.has(e.result)) l.so += 1;
  if (e.result === 'KL') l.soLooking += 1;
  if (e.result === 'HBP') l.hbp += 1;
  if (e.result === 'SAC') l.sac += 1;
  if (e.result === 'SF') l.sf += 1;
  if (e.result === 'ROE') l.roe += 1;
  if (e.result === 'FC') l.fc += 1;
  if (e.result === 'DP') {
    const t = e.battedBall?.trajectory;
    if (t === undefined || t === 'GB' || t === 'BUNT') l.gidp += 1;
  }
  l.lob += e.runnersLeftOnBase;
  if (e.outsBefore === 2) l.twoOutRbi += e.rbi;
  if (e.risp && AB_RESULTS.has(e.result)) {
    l.abRisp += 1;
    if (HIT_RESULTS.has(e.result)) l.hRisp += 1;
  }
  if (isQualityAtBat(e, qab)) l.qab += 1;
  if (e.pitches?.total != null) {
    l.pitchesSeenPa += 1;
    l.pitchesSeen = (l.pitchesSeen ?? 0) + e.pitches.total;
    if (e.pitches.total >= 6) l.sixPlus += 1;
  }
  const after2 = pitchesAfterTwoStrikes(e);
  if (after2 != null && after2 >= 3) l.twoStrikeThreePlus += 1;

  if (!BIP_EXCLUDED.has(e.result)) {
    l.bip += 1;
    const bb = e.battedBall;
    if (bb?.trajectory) {
      l.trajectoryKnown += 1;
      if (bb.trajectory === 'GB') l.gb += 1;
      if (bb.trajectory === 'LD') l.ld += 1;
      if (bb.trajectory === 'FB') l.fb += 1;
      if (bb.trajectory === 'PU') l.pu += 1;
      if (bb.trajectory === 'BUNT') l.bunt += 1;
    }
    if (bb?.hardness) {
      l.hardnessKnown += 1;
      if (bb.hardness === 'hard') {
        l.hard += 1;
        if (e.batterOut) l.hardHitOuts += 1;
      }
      if (bb.hardness === 'medium') l.medium += 1;
      if (bb.hardness === 'soft') l.soft += 1;
    }
    if (bb?.zone) {
      l.zoneKnown += 1;
      const z = (l.byZone[bb.zone] ??= { bip: 0, h: 0, hard: 0 });
      z.bip += 1;
      if (HIT_RESULTS.has(e.result)) z.h += 1;
      if (bb.hardness === 'hard') z.hard += 1;
    }
  }
}

/**
 * Core batting aggregator. `include(r, side)` decides which batting sides of which games count.
 * `playerIds` optionally restricts to given batters.
 */
function aggregateBatting(
  replays: ReplayResult[],
  include: (r: ReplayResult, side: Side) => boolean,
  qab: Settings['qab'],
  playerIds?: string[]
): BattingLine[] {
  const lines = new Map<string, BattingLine>();
  const gamesByPlayer = new Map<string, Set<string>>();
  const allow = playerIds ? new Set(playerIds) : null;
  const get = (pid: string) => {
    let l = lines.get(pid);
    if (!l) {
      l = emptyBattingLine(pid);
      lines.set(pid, l);
    }
    return l;
  };
  for (const r of replays) {
    for (const e of r.paLog) {
      if (!include(r, e.side)) continue;
      if (allow && !allow.has(e.batterId)) continue;
      addPA(get(e.batterId), e, qab);
      (gamesByPlayer.get(e.batterId) ?? gamesByPlayer.set(e.batterId, new Set()).get(e.batterId)!).add(r.game.id);
    }
    for (const run of r.runLog) {
      if (!include(r, run.side)) continue;
      if (allow && !allow.has(run.runnerId)) continue;
      get(run.runnerId).r += 1;
      (gamesByPlayer.get(run.runnerId) ?? gamesByPlayer.set(run.runnerId, new Set()).get(run.runnerId)!).add(r.game.id);
    }
    for (const br of resolveBaserunning(r)) {
      if (!include(r, br.side)) continue;
      for (const mv of br.runners) {
        if (!mv.playerId) continue;
        if (allow && !allow.has(mv.playerId)) continue;
        const l = get(mv.playerId);
        if (mv.how === 'sb' && mv.to !== 'out') l.sb += 1;
        if (mv.how === 'cs' && mv.to === 'out') l.cs += 1;
        if (mv.how === 'pickoff' && mv.to === 'out') l.pik += 1;
      }
    }
  }
  for (const [pid, l] of lines) {
    l.games = gamesByPlayer.get(pid)?.size ?? 0;
    finalizeBattingLine(l);
  }
  return [...lines.values()].sort((a, b) => b.pa - a.pa || a.playerId.localeCompare(b.playerId));
}

export function battingLines(
  replays: ReplayResult[],
  opts: { teamId?: string; playerIds?: string[]; qab: Settings['qab'] }
): BattingLine[] {
  const include = (r: ReplayResult, side: Side) => {
    if (!opts.teamId) return true;
    const s = sideForTeam(r, opts.teamId);
    return s !== null && s === side;
  };
  return aggregateBatting(replays, include, opts.qab, opts.playerIds);
}

export function teamBattingTotals(lines: BattingLine[]): BattingLine {
  const t = emptyBattingLine('TEAM');
  const games = new Set<number>();
  for (const l of lines) {
    t.games = Math.max(t.games, l.games);
    t.pa += l.pa; t.ab += l.ab; t.h += l.h; t.singles += l.singles; t.doubles += l.doubles; t.triples += l.triples; t.hr += l.hr;
    t.r += l.r; t.rbi += l.rbi; t.bb += l.bb; t.ibb += l.ibb; t.so += l.so; t.soLooking += l.soLooking; t.hbp += l.hbp;
    t.sac += l.sac; t.sf += l.sf; t.roe += l.roe; t.fc += l.fc; t.sb += l.sb; t.cs += l.cs; t.pik += l.pik;
    t.gidp += l.gidp; t.lob += l.lob; t.twoOutRbi += l.twoOutRbi; t.abRisp += l.abRisp; t.hRisp += l.hRisp;
    t.qab += l.qab; t.pitchesSeenPa += l.pitchesSeenPa;
    if (l.pitchesSeen != null) t.pitchesSeen = (t.pitchesSeen ?? 0) + l.pitchesSeen;
    t.sixPlus += l.sixPlus; t.twoStrikeThreePlus += l.twoStrikeThreePlus;
    t.bip += l.bip; t.trajectoryKnown += l.trajectoryKnown; t.gb += l.gb; t.ld += l.ld; t.fb += l.fb; t.pu += l.pu; t.bunt += l.bunt;
    t.hardnessKnown += l.hardnessKnown; t.hard += l.hard; t.medium += l.medium; t.soft += l.soft; t.hardHitOuts += l.hardHitOuts;
    t.zoneKnown += l.zoneKnown;
    for (const [z, v] of Object.entries(l.byZone)) {
      const tz = (t.byZone[z] ??= { bip: 0, h: 0, hard: 0 });
      tz.bip += v.bip; tz.h += v.h; tz.hard += v.hard;
    }
  }
  void games;
  return finalizeBattingLine(t);
}

// ---------------------------------------------------------------------------
// Pitching
// ---------------------------------------------------------------------------

export interface PitchingLine {
  playerId: string;
  games: number;
  gs: number;
  outs: number;
  ipText: string;
  bf: number;
  /** At-bats against (from the plate-appearance log). */
  abAgainst: number;
  h: number;
  r: number;
  er: number;
  erBasis: 'calculated' | 'assumed_no_errors' | 'mixed' | 'manual';
  bb: number;
  ibb: number;
  so: number;
  soLooking: number;
  hbp: number;
  hr: number;
  wp: number;
  bk: number;
  pik: number;
  sb: number;
  cs: number;
  era: number | null;
  whip: number | null;
  baa: number | null;
  bbPerInn: number | null;
  kPerBf: number | null;
  kPerBb: number | null;
  /** Total pitches, only when every appearance has a known count. */
  pitches: number | null;
  pitchesKnownAppearances: number;
  appearances: number;
  pPerIp: number | null;
  pPerBf: number | null;
  /** Strike percentage over pitch-by-pitch appearances only. */
  strikePct: number | null;
  /** First-pitch strike percentage where recorded. */
  fpsPct: number | null;
  inherited: number;
  bequeathed: number;
  coverage: { pitches: Coverage };
}

export function emptyPitchingLine(playerId: string): PitchingLine {
  return {
    playerId, games: 0, gs: 0, outs: 0, ipText: '0.0', bf: 0, abAgainst: 0, h: 0, r: 0, er: 0, erBasis: 'calculated',
    bb: 0, ibb: 0, so: 0, soLooking: 0, hbp: 0, hr: 0, wp: 0, bk: 0, pik: 0, sb: 0, cs: 0,
    era: null, whip: null, baa: null, bbPerInn: null, kPerBf: null, kPerBb: null,
    pitches: null, pitchesKnownAppearances: 0, appearances: 0, pPerIp: null, pPerBf: null, strikePct: null, fpsPct: null,
    inherited: 0, bequeathed: 0, coverage: { pitches: { recorded: 0, of: 0 } }
  };
}

interface PitchAccum {
  line: PitchingLine;
  bases: Set<PitcherLine['erBasis']>;
  pitchSum: number;
  allPitchesKnown: boolean;
  strikes: number;
  strikesPitches: number;
  fps: number;
  fpsBatters: number;
}

function finalizePitching(acc: PitchAccum, eraInnings: number): PitchingLine {
  const l = acc.line;
  const ip = l.outs / 3;
  l.ipText = outsToInnings(l.outs);
  l.era = ip > 0 ? (l.er * eraInnings) / ip : null;
  l.whip = ip > 0 ? (l.bb + l.h) / ip : null;
  l.baa = ratio(l.h, l.abAgainst);
  l.bbPerInn = ip > 0 ? l.bb / ip : null;
  l.kPerBf = ratio(l.so, l.bf);
  l.kPerBb = ratio(l.so, l.bb);
  l.pitches = acc.allPitchesKnown && l.appearances > 0 ? acc.pitchSum : null;
  l.pPerIp = l.pitches != null && ip > 0 ? l.pitches / ip : null;
  l.pPerBf = l.pitches != null ? ratio(l.pitches, l.bf) : null;
  l.strikePct = ratio(acc.strikes, acc.strikesPitches);
  l.fpsPct = ratio(acc.fps, acc.fpsBatters);
  l.coverage.pitches = { recorded: l.pitchesKnownAppearances, of: l.appearances };
  if (acc.bases.size === 0) l.erBasis = 'calculated';
  else if (acc.bases.size === 1) l.erBasis = [...acc.bases][0];
  else l.erBasis = 'mixed';
  return l;
}

function aggregatePitching(
  replays: ReplayResult[],
  include: (r: ReplayResult, fieldingSide: Side) => boolean,
  eraInnings: number
): PitchingLine[] {
  const accs = new Map<string, PitchAccum>();
  const get = (pid: string) => {
    let a = accs.get(pid);
    if (!a) {
      a = { line: emptyPitchingLine(pid), bases: new Set(), pitchSum: 0, allPitchesKnown: true, strikes: 0, strikesPitches: 0, fps: 0, fpsBatters: 0 };
      accs.set(pid, a);
    }
    return a;
  };
  for (const r of replays) {
    for (const pl of r.pitcherLines) {
      if (!include(r, pl.side)) continue;
      const a = get(pl.pitcherId);
      const l = a.line;
      l.games += 1;
      if (pl.started) l.gs += 1;
      l.outs += pl.outs;
      l.bf += pl.battersFaced;
      l.h += pl.hits;
      l.r += pl.runs;
      l.er += pl.earnedRuns;
      a.bases.add(pl.erBasis);
      l.bb += pl.walks;
      l.ibb += pl.intentionalWalks;
      l.so += pl.strikeouts;
      l.soLooking += pl.strikeoutsLooking;
      l.hbp += pl.hitBatters;
      l.hr += pl.homeRuns;
      l.wp += pl.wildPitches;
      l.bk += pl.balks;
      l.pik += pl.pickoffs;
      l.sb += pl.stolenBasesAllowed;
      l.cs += pl.caughtStealing;
      l.inherited += pl.inheritedRunners;
      l.bequeathed += pl.bequeathedRunners;
      l.appearances += Math.max(1, pl.appearances.length);
      if (pl.pitches != null) {
        l.pitchesKnownAppearances += 1;
        a.pitchSum += pl.pitches;
      } else {
        a.allPitchesKnown = false;
      }
      if (pl.pitchSource === 'pitch_by_pitch' && pl.strikes != null && pl.pitches != null) {
        a.strikes += pl.strikes;
        a.strikesPitches += pl.pitches;
      }
      if (pl.firstPitchBatters) {
        a.fps += pl.firstPitchStrikes ?? 0;
        a.fpsBatters += pl.firstPitchBatters;
      }
    }
    // At-bats against from the PA log
    for (const e of r.paLog) {
      if (!e.pitcherId) continue;
      const fielding = otherSide(e.side);
      if (!include(r, fielding)) continue;
      if (!accs.has(e.pitcherId)) continue;
      if (AB_RESULTS.has(e.result)) get(e.pitcherId).line.abAgainst += 1;
    }
  }
  return [...accs.values()].map((a) => finalizePitching(a, eraInnings)).sort((a, b) => b.outs - a.outs || a.playerId.localeCompare(b.playerId));
}

export function pitchingLines(replays: ReplayResult[], opts: { teamId?: string; eraInnings: number }): PitchingLine[] {
  const include = (r: ReplayResult, fielding: Side) => {
    if (!opts.teamId) return true;
    const s = sideForTeam(r, opts.teamId);
    return s !== null && s === fielding;
  };
  return aggregatePitching(replays, include, opts.eraInnings);
}

// ---------------------------------------------------------------------------
// Fielding
// ---------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = ['routine', 'moderate', 'difficult', 'exceptional'];
const EXECUTIONS: Execution[] = ['made_expected', 'made_difficult', 'missed_expected', 'attempted_difficult', 'no_realistic_play', 'uncertain'];

export interface FieldingLine {
  playerId: string;
  /** 0 = all positions combined. */
  position: Position;
  games: number;
  starts: number;
  outs: number;
  inningsText: string;
  tc: number;
  po: number;
  a: number;
  /** Official errors only. */
  e: number;
  /** Plays marked as an error but judged not official (observational). */
  unofficialErrors: number;
  dp: number;
  fpct: number | null;
  errorsPer10Inn: number | null;
  chancesPerInn: number | null;
  /** Observational: plays where the scorer recorded a difficulty or execution judgment. */
  opportunitiesRecorded: number;
  routineOpps: number;
  routineConverted: number;
  routineConversionPct: number | null;
  difficultOpps: number;
  difficultMade: number;
  missedExpected: number;
  attemptedDifficult: number;
  noRealisticPlay: number;
  byDifficulty: Record<Difficulty, { opps: number; made: number }>;
  byExecution: Record<Execution, number>;
  errorsByKind: Record<string, number>;
  observationalConfidence: 'none' | 'low' | 'medium' | 'high';
}

export function emptyFieldingLine(playerId: string, position: Position): FieldingLine {
  return {
    playerId, position, games: 0, starts: 0, outs: 0, inningsText: '0.0', tc: 0, po: 0, a: 0, e: 0, unofficialErrors: 0, dp: 0,
    fpct: null, errorsPer10Inn: null, chancesPerInn: null,
    opportunitiesRecorded: 0, routineOpps: 0, routineConverted: 0, routineConversionPct: null,
    difficultOpps: 0, difficultMade: 0, missedExpected: 0, attemptedDifficult: 0, noRealisticPlay: 0,
    byDifficulty: { routine: { opps: 0, made: 0 }, moderate: { opps: 0, made: 0 }, difficult: { opps: 0, made: 0 }, exceptional: { opps: 0, made: 0 } },
    byExecution: { made_expected: 0, made_difficult: 0, missed_expected: 0, attempted_difficult: 0, no_realistic_play: 0, uncertain: 0 },
    errorsByKind: {},
    observationalConfidence: 'none'
  };
}

function playMade(p: FieldingPlay): boolean {
  if (p.error && p.errorOfficial !== false) return false;
  return p.putout || p.assist || p.execution === 'made_expected' || p.execution === 'made_difficult';
}

function addFieldingPlay(l: FieldingLine, p: FieldingPlay) {
  if (p.putout) l.po += 1;
  if (p.assist) l.a += 1;
  if (p.error) {
    if (p.errorOfficial === false) l.unofficialErrors += 1;
    else {
      l.e += 1;
      const k = p.errorKind ?? 'other';
      l.errorsByKind[k] = (l.errorsByKind[k] ?? 0) + 1;
    }
  }
  if ((p.doublePlay || p.triplePlay) && (p.putout || p.assist)) l.dp += 1;
  const judged = p.difficulty != null || p.execution != null;
  if (judged) l.opportunitiesRecorded += 1;
  const made = playMade(p);
  if (p.difficulty) {
    l.byDifficulty[p.difficulty].opps += 1;
    if (made) l.byDifficulty[p.difficulty].made += 1;
    if (p.difficulty === 'routine') {
      l.routineOpps += 1;
      if (made) l.routineConverted += 1;
    }
    if (p.difficulty === 'difficult' || p.difficulty === 'exceptional') {
      l.difficultOpps += 1;
      if (made) l.difficultMade += 1;
    }
  }
  if (p.execution) {
    l.byExecution[p.execution] += 1;
    if (p.execution === 'missed_expected') l.missedExpected += 1;
    if (p.execution === 'attempted_difficult') l.attemptedDifficult += 1;
    if (p.execution === 'no_realistic_play') l.noRealisticPlay += 1;
  }
}

export function finalizeFieldingLine(l: FieldingLine): FieldingLine {
  l.tc = l.po + l.a + l.e;
  l.inningsText = outsToInnings(l.outs);
  const inn = l.outs / 3;
  l.fpct = ratio(l.po + l.a, l.tc);
  l.errorsPer10Inn = inn > 0 ? (l.e / inn) * 10 : null;
  l.chancesPerInn = inn > 0 ? l.tc / inn : null;
  l.routineConversionPct = ratio(l.routineConverted, l.routineOpps);
  const n = l.opportunitiesRecorded;
  l.observationalConfidence = n === 0 ? 'none' : n < 5 ? 'low' : n < 15 ? 'medium' : 'high';
  return l;
}

export function fieldingLines(replays: ReplayResult[], opts: { teamId?: string }): FieldingLine[] {
  const lines = new Map<string, FieldingLine>();
  const games = new Map<string, Set<string>>();
  const key = (pid: string, pos: Position) => `${pid}:${pos}`;
  const get = (pid: string, pos: Position) => {
    const k = key(pid, pos);
    let l = lines.get(k);
    if (!l) {
      l = emptyFieldingLine(pid, pos);
      lines.set(k, l);
    }
    return l;
  };
  const include = (r: ReplayResult, side: Side) => {
    if (!opts.teamId) return true;
    const s = sideForTeam(r, opts.teamId);
    return s !== null && s === side;
  };
  for (const r of replays) {
    for (const po of positionOuts(r)) {
      if (!include(r, po.side)) continue;
      if (po.position === 0) continue;
      const l = get(po.playerId, po.position);
      l.outs += po.outs;
      l.starts += po.starts;
      if (po.outs > 0 || po.starts > 0) {
        (games.get(key(po.playerId, po.position)) ?? games.set(key(po.playerId, po.position), new Set()).get(key(po.playerId, po.position))!).add(r.game.id);
      }
    }
    for (const p of r.fieldingPlays) {
      if (!include(r, p.side)) continue;
      if (!p.playerId || p.position === 0) continue;
      const l = get(p.playerId, p.position);
      addFieldingPlay(l, p);
      (games.get(key(p.playerId, p.position)) ?? games.set(key(p.playerId, p.position), new Set()).get(key(p.playerId, p.position))!).add(r.game.id);
    }
  }
  for (const [k, l] of lines) {
    l.games = games.get(k)?.size ?? 0;
    finalizeFieldingLine(l);
  }
  return [...lines.values()].sort((a, b) => a.playerId.localeCompare(b.playerId) || a.position - b.position);
}

/** Combine a player's per-position lines into one line (position 0). */
export function fieldingTotalsByPlayer(lines: FieldingLine[]): FieldingLine[] {
  const out = new Map<string, FieldingLine>();
  const gamesHint = new Map<string, number>();
  for (const l of lines) {
    let t = out.get(l.playerId);
    if (!t) {
      t = emptyFieldingLine(l.playerId, 0);
      out.set(l.playerId, t);
    }
    gamesHint.set(l.playerId, Math.max(gamesHint.get(l.playerId) ?? 0, l.games));
    t.starts += l.starts; t.outs += l.outs; t.po += l.po; t.a += l.a; t.e += l.e; t.unofficialErrors += l.unofficialErrors; t.dp += l.dp;
    t.opportunitiesRecorded += l.opportunitiesRecorded; t.routineOpps += l.routineOpps; t.routineConverted += l.routineConverted;
    t.difficultOpps += l.difficultOpps; t.difficultMade += l.difficultMade; t.missedExpected += l.missedExpected;
    t.attemptedDifficult += l.attemptedDifficult; t.noRealisticPlay += l.noRealisticPlay;
    for (const d of DIFFICULTIES) {
      t.byDifficulty[d].opps += l.byDifficulty[d].opps;
      t.byDifficulty[d].made += l.byDifficulty[d].made;
    }
    for (const x of EXECUTIONS) t.byExecution[x] += l.byExecution[x];
    for (const [k, v] of Object.entries(l.errorsByKind)) t.errorsByKind[k] = (t.errorsByKind[k] ?? 0) + v;
  }
  for (const [pid, t] of out) {
    // games across positions: at least the max of any position; exact union is not known from lines alone
    t.games = gamesHint.get(pid) ?? 0;
    finalizeFieldingLine(t);
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Playing time
// ---------------------------------------------------------------------------

export interface PlayingTime {
  playerId: string;
  totalOuts: number;
  totalInningsText: string;
  teamDefensiveOuts: number;
  pctOfTeamInnings: number | null;
  byPosition: Array<{
    position: Position;
    outs: number;
    inningsText: string;
    pctOfPlayerTime: number | null;
    pctOfTeamInnings: number | null;
    starts: number;
    gamesAppeared: number;
  }>;
  gamesPlayed: number;
  byGame: Array<{ gameId: string; date: string; opponentTeamId: string; byPosition: Record<number, number> }>;
  /** Current streak (most recent games first) without an appearance at each position. */
  consecutiveGamesWithout: Record<number, number>;
}

export function teamDefensiveOuts(replays: ReplayResult[], teamId: string): number {
  let total = 0;
  for (const r of replays) {
    const side = sideForTeam(r, teamId);
    if (!side) continue;
    total += side === 'home' ? r.state.home.defensiveOuts : r.state.away.defensiveOuts;
  }
  return total;
}

export function playingTime(replays: ReplayResult[], playerId: string, teamId: string): PlayingTime {
  const byPos = new Map<Position, { outs: number; starts: number; games: Set<string> }>();
  const byGame: PlayingTime['byGame'] = [];
  const playedGames = new Set<string>();
  let totalOuts = 0;
  const ordered = sortByDateAsc(replays.filter((r) => sideForTeam(r, teamId) !== null));
  for (const r of ordered) {
    const side = sideForTeam(r, teamId)!;
    const rec: Record<number, number> = {};
    let any = false;
    for (const po of positionOuts(r)) {
      if (po.side !== side || po.playerId !== playerId || po.position === 0) continue;
      if (po.outs <= 0 && po.starts === 0) continue;
      any = true;
      rec[po.position] = (rec[po.position] ?? 0) + po.outs;
      totalOuts += po.outs;
      const cur = byPos.get(po.position) ?? { outs: 0, starts: 0, games: new Set<string>() };
      cur.outs += po.outs;
      cur.starts += po.starts;
      cur.games.add(r.game.id);
      byPos.set(po.position, cur);
    }
    const batted = r.paLog.some((e) => e.side === side && e.batterId === playerId);
    if (any || batted) playedGames.add(r.game.id);
    const opponent = r.game.teamId === teamId ? r.game.opponentTeamId : r.game.teamId;
    byGame.push({ gameId: r.game.id, date: r.game.date, opponentTeamId: opponent, byPosition: rec });
  }
  const teamOuts = teamDefensiveOuts(ordered, teamId);
  const consecutiveGamesWithout: Record<number, number> = {};
  for (let pos = 1; pos <= 9; pos++) {
    let streak = 0;
    for (let i = byGame.length - 1; i >= 0; i--) {
      if ((byGame[i].byPosition[pos] ?? 0) > 0) break;
      streak += 1;
    }
    consecutiveGamesWithout[pos] = streak;
  }
  const byPosition = [...byPos.entries()]
    .map(([position, v]) => ({
      position,
      outs: v.outs,
      inningsText: outsToInnings(v.outs),
      pctOfPlayerTime: ratio(v.outs, totalOuts),
      pctOfTeamInnings: ratio(v.outs, teamOuts),
      starts: v.starts,
      gamesAppeared: v.games.size
    }))
    .sort((a, b) => b.outs - a.outs || a.position - b.position);
  return {
    playerId,
    totalOuts,
    totalInningsText: outsToInnings(totalOuts),
    teamDefensiveOuts: teamOuts,
    pctOfTeamInnings: ratio(totalOuts, teamOuts),
    byPosition,
    gamesPlayed: playedGames.size,
    byGame,
    consecutiveGamesWithout
  };
}

export type PositionComparisonRow = FieldingLine & { pctOfTeamInnings: number | null; sampleNote: string };

export function positionComparison(replays: ReplayResult[], position: Position, teamId: string): PositionComparisonRow[] {
  const teamOuts = teamDefensiveOuts(replays, teamId);
  const lines = fieldingLines(replays, { teamId }).filter((l) => l.position === position);
  return lines
    .map((l) => {
      const n = l.opportunitiesRecorded;
      let sampleNote: string;
      if (n === 0) sampleNote = `No difficulty or execution judgments recorded (${l.tc} official chances)`;
      else if (n < 5) sampleNote = `Small sample: ${n} judged opportunit${n === 1 ? 'y' : 'ies'}, ${l.tc} official chances`;
      else if (n < 15) sampleNote = `${n} judged opportunities, ${l.tc} official chances (moderate sample)`;
      else sampleNote = `${n} judged opportunities, ${l.tc} official chances`;
      if (l.outs < 9) sampleNote += `; only ${l.inningsText} innings`;
      return { ...l, pctOfTeamInnings: ratio(l.outs, teamOuts), sampleNote };
    })
    .sort((a, b) => b.outs - a.outs || a.playerId.localeCompare(b.playerId));
}

// ---------------------------------------------------------------------------
// Box score
// ---------------------------------------------------------------------------

export interface BoxScore {
  gameId: string;
  linescore: {
    away: number[];
    home: number[];
    awayRuns: number;
    homeRuns: number;
    awayHits: number;
    homeHits: number;
    awayErrors: number;
    homeErrors: number;
  };
  batting: { away: BattingLine[]; home: BattingLine[] };
  pitching: { away: PitchingLine[]; home: PitchingLine[] };
  defense: Array<{ side: Side; playerId: string; position: Position; outs: number }>;
  warnings: string[];
  scoreAdjustments: ReplayResult['state']['scoreAdjustments'];
  skippedPlays: boolean;
}

export function boxScore(r: ReplayResult, eraInnings: number, qab: Settings['qab'] = defaultQab()): BoxScore {
  const innings = Math.max(r.state.inning, r.state.away.runsByInning.length, r.state.home.runsByInning.length);
  const pad = (arr: number[]) => Array.from({ length: innings }, (_, i) => arr[i] ?? 0);
  const bat = (side: Side) => aggregateBatting([r], (_r, s) => s === side, qab);
  const pit = (side: Side) => aggregatePitching([r], (_r, s) => s === side, eraInnings);
  return {
    gameId: r.game.id,
    linescore: {
      away: pad(r.state.away.runsByInning),
      home: pad(r.state.home.runsByInning),
      awayRuns: r.state.away.runs,
      homeRuns: r.state.home.runs,
      awayHits: r.state.away.hits,
      homeHits: r.state.home.hits,
      awayErrors: r.state.away.errors,
      homeErrors: r.state.home.errors
    },
    batting: { away: bat('away'), home: bat('home') },
    pitching: { away: pit('away'), home: pit('home') },
    defense: positionOuts(r)
      .filter((p) => p.position !== 0)
      .map((p) => ({ side: p.side, playerId: p.playerId, position: p.position, outs: p.outs })),
    warnings: r.warnings,
    scoreAdjustments: r.state.scoreAdjustments,
    skippedPlays: r.state.skippedPlays
  };
}

function defaultQab(): Settings['qab'] {
  return { hit: true, walkOrHbp: true, hardContact: true, sacrifice: true, rbi: true, sixPlusPitches: true, threePlusAfterTwoStrikes: true };
}

// ---------------------------------------------------------------------------
// Team record and tournaments
// ---------------------------------------------------------------------------

export interface TeamRecord {
  w: number;
  l: number;
  t: number;
  runsFor: number;
  runsAgainst: number;
  games: number;
}

function isFinal(r: ReplayResult): boolean {
  return r.game.status === 'final' || r.state.ended;
}

export function teamRecord(replays: ReplayResult[], teamId: string): TeamRecord {
  const rec: TeamRecord = { w: 0, l: 0, t: 0, runsFor: 0, runsAgainst: 0, games: 0 };
  for (const r of replays) {
    const side = sideForTeam(r, teamId);
    if (!side || !isFinal(r)) continue;
    const mine = side === 'home' ? r.state.home.runs : r.state.away.runs;
    const theirs = side === 'home' ? r.state.away.runs : r.state.home.runs;
    rec.games += 1;
    rec.runsFor += mine;
    rec.runsAgainst += theirs;
    if (mine > theirs) rec.w += 1;
    else if (mine < theirs) rec.l += 1;
    else rec.t += 1;
  }
  return rec;
}

export interface TournamentSummary {
  tournamentId: string;
  games: string[];
  record: { w: number; l: number; t: number };
  runsFor: number;
  runsAgainst: number;
  batting: BattingLine[];
  pitching: PitchingLine[];
  playingTime: PlayingTime[];
  pitchingUsage: Array<{
    playerId: string;
    byDate: Record<string, { pitches: number | null; outs: number; appearances: number }>;
    totalPitches: number | null;
    totalOuts: number;
  }>;
}

export function tournamentSummary(
  replays: ReplayResult[],
  tournamentId: string,
  teamId: string,
  qab: Settings['qab'],
  eraInnings: number
): TournamentSummary {
  const games = sortByDateAsc(replays.filter((r) => r.game.tournamentId === tournamentId && sideForTeam(r, teamId) !== null));
  const rec = teamRecord(games, teamId);
  const batting = battingLines(games, { teamId, qab });
  const pitching = pitchingLines(games, { teamId, eraInnings });
  const players = new Set<string>();
  for (const r of games) {
    const side = sideForTeam(r, teamId)!;
    for (const po of positionOuts(r)) if (po.side === side) players.add(po.playerId);
    for (const e of r.paLog) if (e.side === side) players.add(e.batterId);
  }
  const pt = [...players].map((pid) => playingTime(games, pid, teamId)).sort((a, b) => b.totalOuts - a.totalOuts);
  const usage = new Map<string, TournamentSummary['pitchingUsage'][number] & { unknown: boolean }>();
  for (const r of games) {
    const side = sideForTeam(r, teamId)!;
    for (const pl of r.pitcherLines) {
      if (pl.side !== side) continue;
      let u = usage.get(pl.pitcherId);
      if (!u) {
        u = { playerId: pl.pitcherId, byDate: {}, totalPitches: 0, totalOuts: 0, unknown: false };
        usage.set(pl.pitcherId, u);
      }
      const d = (u.byDate[r.game.date] ??= { pitches: 0, outs: 0, appearances: 0 });
      d.outs += pl.outs;
      d.appearances += 1;
      u.totalOuts += pl.outs;
      if (pl.pitches == null) {
        d.pitches = null;
        u.unknown = true;
      } else if (d.pitches != null) {
        d.pitches += pl.pitches;
      }
      if (pl.pitches != null && u.totalPitches != null) u.totalPitches += pl.pitches;
    }
  }
  const pitchingUsage = [...usage.values()].map((u) => ({
    playerId: u.playerId,
    byDate: u.byDate,
    totalPitches: u.unknown ? null : u.totalPitches,
    totalOuts: u.totalOuts
  }));
  return {
    tournamentId,
    games: games.map((r) => r.game.id),
    record: { w: rec.w, l: rec.l, t: rec.t },
    runsFor: rec.runsFor,
    runsAgainst: rec.runsAgainst,
    batting,
    pitching,
    playingTime: pt,
    pitchingUsage
  };
}
