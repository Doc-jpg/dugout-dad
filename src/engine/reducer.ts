/**
 * Game replay engine.
 *
 * replayGame(game, events) walks the ordered event log and produces:
 *  - live state (inning, half, outs, score, runners, next batter, defense)
 *  - a plate-appearance log with full context (for every batting statistic)
 *  - a baserunning log
 *  - pitcher lines with inherited-runner attribution and earned/unearned runs
 *  - defensive assignment intervals measured in OUTS
 *  - fielding plays (putouts, assists, errors, observational difficulty)
 *  - warnings about missing / inconsistent information
 *
 * The reducer never invents data. If something was not recorded, it is left
 * undefined and (where it matters) a warning is produced.
 */

import type {
  AvailabilityStatus,
  Game, GameEvent, ID, Half, Side, Position, LineupSlot, PlateAppearanceEvent, BaserunningEvent,
  RunnerMove, PAResult, BattedBall, PitchDetail, FieldingRecord, Difficulty, Execution, GameEndReason,
  Destination, PitchResult
} from './types';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface RunnerOnBase {
  playerId: ID;
  slot: number;
  /** Pitcher responsible for this runner (the pitcher when he reached base). */
  responsiblePitcherId?: ID;
  /** Reached base on an error (or advanced to this base only because of one). */
  reachedOnError: boolean;
  /** Reached base on a passed ball / dropped third strike passed ball (unearned). */
  reachedOnPassedBall?: boolean;
}

export interface Bases {
  1?: RunnerOnBase;
  2?: RunnerOnBase;
  3?: RunnerOnBase;
}

export interface DefenseInterval {
  side: Side; // fielding side
  playerId: ID;
  position: Position;
  /** Fielding side's cumulative defensive-out counter at start / end. */
  startOuts: number;
  endOuts: number | null; // null = still open
  startInning: number;
  startHalf: Half;
  /** Did this interval begin at the very start of the game (a "start" at the position)? */
  isStart: boolean;
  /** 0-based half-inning index when interval opened (for per-inning alignment views). */
  startHalfIndex: number;
}

export interface PALogEntry {
  eventId: ID;
  seq: number;
  side: Side; // batting side
  inning: number;
  half: Half;
  slot: number;
  batterId: ID;
  pitcherId?: ID;
  catcherId?: ID;
  result: PAResult;
  outsBefore: number;
  basesBefore: { 1?: ID; 2?: ID; 3?: ID };
  basesAfter: { 1?: ID; 2?: ID; 3?: ID };
  risp: boolean; // runner in scoring position before the PA
  rbi: number;
  runsScored: number; // runs that scored on the play
  batterOut: boolean;
  batterReached: boolean;
  batterDestination: Destination;
  outsOnPlay: number;
  runnersLeftOnBase: number; // after the play, when the batter made an out
  endedInning: boolean;
  battedBall?: BattedBall;
  fielding?: FieldingRecord;
  pitches?: PitchDetail;
  qab?: boolean;
  uncertain?: boolean;
  tags?: string[];
  note?: string;
}

export interface BaserunningLogEntry {
  eventId: ID;
  seq: number;
  side: Side; // batting side
  inning: number;
  half: Half;
  kind: BaserunningEvent['kind'];
  runners: RunnerMove[];
  pitcherId?: ID;
  catcherId?: ID;
  runsScored: number;
  outsOnPlay: number;
}

export interface PitcherLine {
  side: Side; // fielding side
  pitcherId: ID;
  started: boolean;
  outs: number;
  battersFaced: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  /** How earned runs were determined. */
  erBasis: 'calculated' | 'assumed_no_errors' | 'manual';
  walks: number; // BB + IBB
  intentionalWalks: number;
  strikeouts: number;
  strikeoutsLooking: number;
  hitBatters: number;
  homeRuns: number;
  wildPitches: number;
  balks: number;
  pickoffs: number;
  /** Pickoff throws by the pitcher that did not get the runner. */
  pickoffAttempts: number;
  stolenBasesAllowed: number;
  caughtStealing: number;
  /** Pitch count and how it is known. null = unknown. */
  pitches: number | null;
  pitchSource: 'pitch_by_pitch' | 'manual' | 'scoreboard' | 'unknown';
  /** Pitch-by-pitch derived when available. */
  strikes?: number;
  firstPitchStrikes?: number;
  firstPitchBatters?: number;
  /** Ordered list of appearance intervals (entered / left). */
  appearances: Array<{ startInning: number; startHalf: Half; endInning?: number; endHalf?: Half }>;
  /** Runners inherited when entering mid-inning. */
  inheritedRunners: number;
  /** Runners left on base for the next pitcher. */
  bequeathedRunners: number;
}

export interface FieldingPlay {
  eventId: ID;
  seq: number;
  side: Side; // fielding side
  inning: number;
  half: Half;
  playerId?: ID; // resolved at replay from the defense at that moment
  position: Position;
  putout: boolean;
  assist: boolean;
  error: boolean;
  errorKind?: string;
  errorOfficial?: boolean;
  doublePlay: boolean;
  triplePlay: boolean;
  /** Observational judgments for the primary fielder (optional). */
  difficulty?: Difficulty;
  execution?: Execution;
  primary: boolean; // was this the primary fielder on the play
  battedBall?: BattedBall;
  /** The play's primary outcome category for opportunity analysis. */
  outcome: 'out' | 'error' | 'hit' | 'other';
}

export interface RunLogEntry {
  seq: number;
  side: Side; // scoring side
  inning: number;
  half: Half;
  runnerId: ID;
  responsiblePitcherId?: ID;
  earned: boolean;
  reason?: string;
}

export interface SideLiveState {
  lineup: LineupSlot[];
  /** Batting order in force at the first pitch (players who started on offense). */
  startingLineupIds: ID[];
  nextSlotIndex: number; // index into lineup (0-based)
  runs: number;
  runsByInning: number[]; // index = inning-1
  defense: Partial<Record<Position, ID>>;
  defensiveOuts: number;
  /** Number of official errors by this fielding side in the current half-inning (while fielding). */
  errorsThisHalf: number;
  /** Would-be outs lost to errors in the current half-inning (for earned-run reconstruction). */
  lostOutsThisHalf: number;
  lob: number; // team runners left on base (end of each half)
  hits: number;
  errors: number;
  pitchCounts: Record<ID, { count: number; source: 'manual' | 'scoreboard' | 'pitch_by_pitch' }>;
}

export interface GameLiveState {
  inning: number;
  half: Half;
  outs: number;
  bases: Bases;
  halfIndex: number; // 0-based count of half-innings started
  home: SideLiveState;
  away: SideLiveState;
  ended: boolean;
  endReason?: GameEndReason;
  started: boolean; // at least one PA or baserunning event recorded
  skippedPlays: boolean;
  scoreAdjustments: Array<{ side: Side; runs: number; reason: string; seq: number }>;
  /** Current count on the batter, from logged pitch events. */
  count: { balls: number; strikes: number };
  /** Pitches logged for the current at-bat (not yet attached to a plate appearance). */
  pendingPitches: PitchResult[];
}

/** One availability change, stamped with where the game stood so expected playing time can be measured. */
export interface AvailabilityLogEntry {
  seq: number;
  side: Side;
  playerId: ID;
  status: AvailabilityStatus;
  /** The side's defensive outs when the change was recorded. */
  atOuts: number;
  /** The side's plate appearances when the change was recorded. */
  atTeamPAs: number;
  inning: number;
  half: Half;
}

export interface ReplayResult {
  game: Game;
  state: GameLiveState;
  paLog: PALogEntry[];
  baserunningLog: BaserunningLogEntry[];
  pitcherLines: PitcherLine[];
  intervals: DefenseInterval[];
  fieldingPlays: FieldingPlay[];
  runLog: RunLogEntry[];
  availabilityLog: AvailabilityLogEntry[];
  warnings: string[];
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function battingSide(half: Half, _game?: Game): Side {
  return half === 'top' ? 'away' : 'home';
}
export function fieldingSide(half: Half): Side {
  return half === 'top' ? 'home' : 'away';
}
export function otherSide(side: Side): Side {
  return side === 'home' ? 'away' : 'home';
}

/** The pitch that ends an at-bat, implied by its result (null when no pitch is thrown, e.g. an intentional walk). */
export function finalPitchFor(result: PAResult): NonNullable<PitchDetail['pitches']>[number]['result'] | null {
  switch (result) {
    case 'BB': return 'ball';
    case 'IBB': return null;
    case 'HBP': return 'hbp';
    case 'K': return 'swinging_strike';
    case 'KL': return 'called_strike';
    case 'D3K': return 'swinging_strike';
    case 'CI': return 'other';
    default: return 'in_play';
  }
}

/** Build the pitch detail for an at-bat from the logged pitches plus the implied final pitch. */
export function pitchDetailFor(pending: PitchResult[], result: PAResult): PitchDetail {
  const list: NonNullable<PitchDetail['pitches']> = pending.map((r) => ({
    result: r === 'ball' ? 'ball' : r === 'foul' ? 'foul' : r === 'strike_swinging' ? 'swinging_strike' : 'called_strike'
  }));
  // When ball four or strike three was itself logged, it is already in the list.
  let loggedBalls = 0;
  let loggedStrikes = 0;
  for (const r of pending) {
    if (r === 'ball') loggedBalls += 1;
    else if (r === 'foul') { if (loggedStrikes < 2) loggedStrikes += 1; }
    else loggedStrikes += 1;
  }
  const alreadyEnded = (result === 'BB' && loggedBalls >= 4) || ((result === 'K' || result === 'KL' || result === 'D3K') && loggedStrikes >= 3);
  const final = alreadyEnded ? null : finalPitchFor(result);
  if (final) list.push({ result: final });
  const isStrike = (x: string) => x !== 'ball' && x !== 'hbp' && x !== 'other';
  const balls = list.filter((p) => p.result === 'ball').length;
  const strikes = list.filter((p) => isStrike(p.result)).length;
  return { total: list.length, pitches: list, balls, strikes, firstPitchStrike: list.length ? isStrike(list[0].result) : undefined };
}

export const HIT_RESULTS: ReadonlySet<PAResult> = new Set(['1B', '2B', '3B', 'HR']);
export const STRIKEOUT_RESULTS: ReadonlySet<PAResult> = new Set(['K', 'KL', 'D3K']);
export const WALK_RESULTS: ReadonlySet<PAResult> = new Set(['BB', 'IBB']);
/** Results that count as an official at-bat. */
export const AB_RESULTS: ReadonlySet<PAResult> = new Set([
  '1B', '2B', '3B', 'HR', 'K', 'KL', 'D3K', 'GO', 'FO', 'LO', 'PO', 'FC', 'DP', 'TP', 'ROE', 'OTHER_OUT'
]);
/** Results where the batter is out (default; runner moves are authoritative). */
export const BATTER_OUT_RESULTS: ReadonlySet<PAResult> = new Set([
  'K', 'KL', 'GO', 'FO', 'LO', 'PO', 'SAC', 'SF', 'DP', 'TP', 'OTHER_OUT'
]);

function emptySide(): SideLiveState {
  return {
    lineup: [],
    startingLineupIds: [],
    nextSlotIndex: 0,
    runs: 0,
    runsByInning: [],
    defense: {},
    defensiveOuts: 0,
    errorsThisHalf: 0,
    lostOutsThisHalf: 0,
    lob: 0,
    hits: 0,
    errors: 0,
    pitchCounts: {}
  };
}

function basesIds(b: Bases): { 1?: ID; 2?: ID; 3?: ID } {
  const out: { 1?: ID; 2?: ID; 3?: ID } = {};
  if (b[1]) out[1] = b[1].playerId;
  if (b[2]) out[2] = b[2].playerId;
  if (b[3]) out[3] = b[3].playerId;
  return out;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export function replayGame(game: Game, eventsIn: GameEvent[]): ReplayResult {
  const events = [...eventsIn].sort((a, b) => a.seq - b.seq);
  const warnings: string[] = [];

  const state: GameLiveState = {
    inning: 1,
    half: 'top',
    outs: 0,
    bases: {},
    halfIndex: 0,
    home: emptySide(),
    away: emptySide(),
    ended: false,
    started: false,
    skippedPlays: false,
    scoreAdjustments: [],
    count: { balls: 0, strikes: 0 },
    pendingPitches: []
  };

  const paLog: PALogEntry[] = [];
  const baserunningLog: BaserunningLogEntry[] = [];
  const intervals: DefenseInterval[] = [];
  const fieldingPlays: FieldingPlay[] = [];
  const runLog: RunLogEntry[] = [];
  const availabilityLog: AvailabilityLogEntry[] = [];
  const availabilityNow = new Map<string, AvailabilityStatus>(); // side:playerId -> latest status
  let currentSeq = 0;
  /** A player marked absent, hurt or gone who then fields or bats is back; note it rather than lose the time. */
  function ensurePresent(side: Side, playerId: ID, seq: number, how: string) {
    const k = `${side}:${playerId}`;
    const cur = availabilityNow.get(k) ?? 'present';
    if (cur === 'present') return;
    availabilityNow.set(k, 'present');
    const ss = sideState(side);
    availabilityLog.push({ seq, side, playerId, status: 'present', atOuts: ss.defensiveOuts, atTeamPAs: paLog.filter((p) => p.side === side).length, inning: state.inning, half: state.half });
    warnings.push(`seq ${seq}: ${playerId} was marked ${cur} but ${how}; counted as back in from here`);
  }
  const pitcherLines = new Map<string, PitcherLine>(); // key side:pitcherId
  /** errors-in-half snapshot at the moment each pitcher entered the current half (for reconstruction). */
  const pitcherEntryLostOuts = new Map<string, number>();

  const sideState = (s: Side) => (s === 'home' ? state.home : state.away);

  function pitcherKey(side: Side, pitcherId: ID) {
    return `${side}:${pitcherId}`;
  }

  function getPitcherLine(side: Side, pitcherId: ID): PitcherLine {
    const k = pitcherKey(side, pitcherId);
    let line = pitcherLines.get(k);
    if (!line) {
      line = {
        side,
        pitcherId,
        started: false,
        outs: 0,
        battersFaced: 0,
        hits: 0,
        runs: 0,
        earnedRuns: 0,
        erBasis: 'calculated',
        walks: 0,
        intentionalWalks: 0,
        strikeouts: 0,
        strikeoutsLooking: 0,
        hitBatters: 0,
        homeRuns: 0,
        wildPitches: 0,
        balks: 0,
        pickoffs: 0,
        pickoffAttempts: 0,
        stolenBasesAllowed: 0,
        caughtStealing: 0,
        pitches: null,
        pitchSource: 'unknown',
        appearances: [],
        inheritedRunners: 0,
        bequeathedRunners: 0
      };
      pitcherLines.set(k, line);
    }
    return line;
  }

  function currentPitcher(fielding: Side): ID | undefined {
    return sideState(fielding).defense[1];
  }
  function currentCatcher(fielding: Side): ID | undefined {
    return sideState(fielding).defense[2];
  }

  /** Open a defensive interval for player at position for the fielding side. */
  function openInterval(side: Side, playerId: ID, position: Position, isStart: boolean) {
    const ss = sideState(side);
    intervals.push({
      side,
      playerId,
      position,
      startOuts: ss.defensiveOuts,
      endOuts: null,
      startInning: state.inning,
      startHalf: state.half,
      isStart,
      startHalfIndex: state.halfIndex
    });
  }

  function closeInterval(side: Side, position: Position, playerId?: ID) {
    const ss = sideState(side);
    for (let i = intervals.length - 1; i >= 0; i--) {
      const iv = intervals[i];
      if (iv.side === side && iv.position === position && iv.endOuts === null && (!playerId || iv.playerId === playerId)) {
        iv.endOuts = ss.defensiveOuts;
        return;
      }
    }
  }

  /** Apply a defensive assignment change (position -> playerId | null). */
  function setDefense(side: Side, position: Position, playerId: ID | null, reason?: string) {
    if (position === 0) return;
    const ss = sideState(side);
    const prev = ss.defense[position];
    if (prev === (playerId ?? undefined)) return; // no change
    if (prev) closeInterval(side, position, prev);
    if (playerId) {
      // If this player is currently somewhere else, close that interval too (a swap).
      for (const [posStr, pid] of Object.entries(ss.defense)) {
        const pos = Number(posStr) as Position;
        if (pid === playerId && pos !== position) {
          closeInterval(side, pos, playerId);
          delete ss.defense[pos];
        }
      }
      ss.defense[position] = playerId;
      ensurePresent(side, playerId, currentSeq, `took the field at ${position}`);
      openInterval(side, playerId, position, !state.started && ss.defensiveOuts === 0);
      if (position === 1) {
        const line = getPitcherLine(side, playerId);
        if (!state.started && ss.defensiveOuts === 0 && line.appearances.length === 0) line.started = true;
        line.appearances.push({ startInning: state.inning, startHalf: state.half });
        pitcherEntryLostOuts.set(pitcherKey(side, playerId), ss.lostOutsThisHalf);
      }
    } else {
      delete ss.defense[position];
    }
    if (prev && position === 1 && prev !== playerId) {
      const prevLine = getPitcherLine(side, prev);
      const app = prevLine.appearances[prevLine.appearances.length - 1];
      if (app && app.endInning === undefined) {
        app.endInning = state.inning;
        app.endHalf = state.half;
      }
    }
    void reason;
  }

  /**
   * After any defensive change batch: if the pitcher changed mid-inning, record inherited and
   * bequeathed runners and close the previous pitcher's appearance.
   */
  function notePitchingChange(side: Side, prevPitcher: ID | undefined) {
    const ss = sideState(side);
    const newPitcher = ss.defense[1];
    if (prevPitcher === newPitcher) return;
    if (prevPitcher) {
      const prevLine = getPitcherLine(side, prevPitcher);
      const app = prevLine.appearances[prevLine.appearances.length - 1];
      if (app && app.endInning === undefined) {
        app.endInning = state.inning;
        app.endHalf = state.half;
      }
    }
    if (prevPitcher && newPitcher && state.started && fieldingSide(state.half) === side) {
      const onBase = [state.bases[1], state.bases[2], state.bases[3]].filter(Boolean).length;
      if (onBase > 0) {
        getPitcherLine(side, newPitcher).inheritedRunners += onBase;
        getPitcherLine(side, prevPitcher).bequeathedRunners += onBase;
      }
    }
  }

  /** End the current half-inning and switch sides. */
  function resetCount() {
    state.count = { balls: 0, strikes: 0 };
    state.pendingPitches = [];
  }

  /**
   * Build the pitch detail for a plate appearance from the pitches logged before it plus the
   * pitch that ended it (implied by the result). An explicit pitch list on the event wins.
   */
  function derivePitches(pa: PlateAppearanceEvent): PitchDetail | undefined {
    if (pa.pitches?.pitches?.length) return pa.pitches;
    const pending = state.pendingPitches;
    // No pitches were logged for this at-bat: keep whatever the scorer entered (a manual total or
    // nothing). Never invent a count from the result alone.
    if (!pending.length) return pa.pitches;
    return pitchDetailFor(pending, pa.result);
  }

  function endHalf(creditMissingOuts: boolean) {
    resetCount();
    const fielding = fieldingSide(state.half);
    const batting = battingSide(state.half);
    const fs = sideState(fielding);
    const bs = sideState(batting);
    if (creditMissingOuts && state.outs < 3) {
      fs.defensiveOuts += 3 - state.outs;
    }
    // Runners left on base for the batting team
    bs.lob += [state.bases[1], state.bases[2], state.bases[3]].filter(Boolean).length;
    state.bases = {};
    state.outs = 0;
    fs.errorsThisHalf = 0;
    fs.lostOutsThisHalf = 0;
    // Reset pitcher entry snapshots for the fielding side at the start of a new half
    for (const key of pitcherEntryLostOuts.keys()) {
      if (key.startsWith(fielding + ':')) pitcherEntryLostOuts.set(key, 0);
    }
    if (state.half === 'top') {
      state.half = 'bottom';
    } else {
      state.half = 'top';
      state.inning += 1;
    }
    state.halfIndex += 1;
  }

  /** Record one defensive out for the fielding side and the current pitcher. */
  function recordOut(fielding: Side, pitcherId: ID | undefined) {
    state.outs += 1;
    sideState(fielding).defensiveOuts += 1;
    if (pitcherId) getPitcherLine(fielding, pitcherId).outs += 1;
  }

  /** Score a run for the batting side; attribute to responsible pitcher; decide earned/unearned. */
  function scoreRun(
    batting: Side,
    runner: RunnerOnBase,
    seq: number,
    opts: { viaError: boolean; viaPassedBall: boolean; scoringLevel: Game['scoringLevel'] }
  ) {
    const bs = sideState(batting);
    const fielding = otherSide(batting);
    const fs = sideState(fielding);
    bs.runs += 1;
    bs.runsByInning[state.inning - 1] = (bs.runsByInning[state.inning - 1] ?? 0) + 1;

    const pid = runner.responsiblePitcherId;
    let earned = true;
    let reason: string | undefined;
    if (runner.reachedOnError) {
      earned = false;
      reason = 'runner reached on error';
    } else if (runner.reachedOnPassedBall) {
      earned = false;
      reason = 'runner reached on passed ball';
    } else if (opts.viaError) {
      earned = false;
      reason = 'scored on error';
    } else if (opts.viaPassedBall) {
      earned = false;
      reason = 'scored on passed ball';
    } else if (pid) {
      // Reconstruction: once the defense should have had three outs (outs + lost outs since this
      // pitcher entered the half-inning), further runs are unearned.
      const entryLost = pitcherEntryLostOuts.get(pitcherKey(fielding, pid)) ?? 0;
      const lostSinceEntry = Math.max(0, fs.lostOutsThisHalf - entryLost);
      if (state.outs + lostSinceEntry >= 3) {
        earned = false;
        reason = 'inning would have ended without errors';
      }
    }
    if (pid) {
      const line = getPitcherLine(fielding, pid);
      line.runs += 1;
      if (earned) line.earnedRuns += 1;
    }
    runLog.push({ seq, side: batting, inning: state.inning, half: state.half, runnerId: runner.playerId, responsiblePitcherId: pid, earned, reason });
  }

  /**
   * Apply runner moves for a play. Returns runs scored, outs recorded, batter destination.
   * Moves are applied atomically from a snapshot so order within the list does not matter.
   */
  function applyRunnerMoves(
    batting: Side,
    moves: RunnerMove[],
    batter: { playerId: ID; slot: number } | null,
    seq: number,
    scoringLevel: Game['scoringLevel'],
    ctx: { batterReachedOnError?: boolean; batterReachedOnPassedBall?: boolean; playSequenceOuts?: boolean }
  ): { runs: number; outs: number; batterDestination: Destination | null; viaErrorRuns: number } {
    const fielding = otherSide(batting);
    const pitcherId = currentPitcher(fielding);
    const before: Bases = { ...state.bases };
    const after: Bases = {};
    let runs = 0;
    let outs = 0;
    let viaErrorRuns = 0;
    let batterDestination: Destination | null = null;

    // Runners not mentioned stay where they are.
    const mentioned = new Set<number>();
    for (const m of moves) if (m.from !== 'batter') mentioned.add(m.from);
    for (const b of [1, 2, 3] as const) {
      if (before[b] && !mentioned.has(b)) after[b] = before[b];
    }

    // Order outs so "outNumber" is respected if provided (affects nothing in totals).
    const sorted = [...moves].sort((a, b) => (a.outNumber ?? 99) - (b.outNumber ?? 99));

    for (const m of sorted) {
      let runner: RunnerOnBase | undefined;
      if (m.from === 'batter') {
        if (!batter) continue;
        runner = {
          playerId: batter.playerId,
          slot: batter.slot,
          responsiblePitcherId: pitcherId,
          reachedOnError: !!ctx.batterReachedOnError || m.how === 'error',
          reachedOnPassedBall: !!ctx.batterReachedOnPassedBall
        };
        batterDestination = m.to;
      } else {
        runner = before[m.from];
        if (!runner) {
          warnings.push(`seq ${seq}: a move was recorded for base ${m.from} but no runner was there`);
          continue;
        }
        if (m.how === 'error') runner = { ...runner, reachedOnError: runner.reachedOnError }; // advancing on error does not make the runner "reached on error" for ER purposes; only the run scored on error is unearned
      }
      if (m.to === 'out') {
        outs += 1;
        recordOut(fielding, pitcherId);
        if (m.sequence && m.sequence.length) {
          creditSequence(fielding, m.sequence, seq, false, false, undefined, undefined, 'out');
        }
      } else if (m.to === 4) {
        runs += 1;
        const viaErr = m.how === 'error';
        const viaPB = m.how === 'pb';
        if (viaErr) viaErrorRuns += 1;
        scoreRun(batting, runner, seq, { viaError: viaErr, viaPassedBall: viaPB, scoringLevel });
      } else {
        if (after[m.to]) {
          warnings.push(`seq ${seq}: two runners were sent to base ${m.to}; kept the later one`);
        }
        after[m.to] = m.from === 'batter' ? runner : { ...runner };
      }
    }
    state.bases = after;
    return { runs, outs, batterDestination, viaErrorRuns };
  }

  /** Credit putouts/assists (and DP/TP participation) for a fielding sequence. */
  function creditSequence(
    fielding: Side,
    sequence: Position[],
    seq: number,
    dp: boolean,
    tp: boolean,
    battedBall: BattedBall | undefined,
    eventId: ID | undefined,
    outcome: FieldingPlay['outcome']
  ) {
    const fs = sideState(fielding);
    const n = sequence.length;
    sequence.forEach((pos, idx) => {
      if (pos === 0) return;
      const isLast = idx === n - 1;
      fieldingPlays.push({
        eventId: eventId ?? '',
        seq,
        side: fielding,
        inning: state.inning,
        half: state.half,
        playerId: fs.defense[pos],
        position: pos,
        putout: isLast,
        assist: !isLast,
        error: false,
        doublePlay: dp,
        triplePlay: tp,
        primary: idx === 0,
        battedBall,
        outcome
      });
    });
  }

  // -------------------------------------------------------------------------
  // Walk the log
  // -------------------------------------------------------------------------

  let lastSeq = -1;
  for (const ev of events) {
    if (ev.seq <= lastSeq) warnings.push(`duplicate or out-of-order seq ${ev.seq}`);
    lastSeq = ev.seq;
    currentSeq = ev.seq;
    if (state.ended && ev.type !== 'note') {
      warnings.push(`seq ${ev.seq}: event recorded after game end`);
    }

    switch (ev.type) {
      case 'pitch': {
        state.started = true;
        // Credit the pitcher as each pitch happens so the live count is current mid at-bat.
        {
          const fielding = fieldingSide(state.half);
          const pid = currentPitcher(fielding);
          if (pid) {
            const line = getPitcherLine(fielding, pid);
            if (line.pitchSource !== 'pitch_by_pitch') { line.pitches = line.pitchSource === 'unknown' ? 0 : line.pitches ?? 0; line.pitchSource = 'pitch_by_pitch'; }
            line.pitches = (line.pitches ?? 0) + 1;
            const strike = ev.result !== 'ball';
            if (strike) line.strikes = (line.strikes ?? 0) + 1; else line.strikes = line.strikes ?? 0;
            if (state.pendingPitches.length === 0) {
              line.firstPitchBatters = (line.firstPitchBatters ?? 0) + 1;
              line.firstPitchStrikes = (line.firstPitchStrikes ?? 0) + (strike ? 1 : 0);
            }
          }
        }
        state.pendingPitches.push(ev.result);
        if (ev.result === 'ball') state.count.balls += 1;
        else if (ev.result === 'foul') { if (state.count.strikes < 2) state.count.strikes += 1; }
        else state.count.strikes += 1;
        if (state.count.balls > 4 || state.count.strikes > 3) warnings.push(`seq ${ev.seq}: count ran past ${state.count.balls}-${state.count.strikes}; the at-bat should have ended`);
        break;
      }

      case 'lineup_set': {
        const ss = sideState(ev.side);
        ss.lineup = [...ev.slots].sort((a, b) => a.slot - b.slot);
        if (ss.nextSlotIndex >= ss.lineup.length) ss.nextSlotIndex = 0;
        if (!state.started) ss.startingLineupIds = ss.lineup.map((sl) => sl.playerId);
        break;
      }

      case 'defense_set': {
        const ss = sideState(ev.side);
        const prevPitcher = ss.defense[1];
        // Vacate positions not in the new set
        for (const posStr of Object.keys(ss.defense)) {
          const pos = Number(posStr) as Position;
          if (!(pos in ev.assignments)) setDefense(ev.side, pos, null);
        }
        for (const [posStr, pid] of Object.entries(ev.assignments)) {
          const pos = Number(posStr) as Position;
          if (pid) setDefense(ev.side, pos, pid);
        }
        notePitchingChange(ev.side, prevPitcher);
        break;
      }

      case 'defense_change': {
        // Apply as a batch: first vacate everyone involved, then place, so swaps work in any order.
        const ss = sideState(ev.side);
        const prevPitcher = ss.defense[1];
        const placing = ev.changes.filter((c) => c.playerId);
        const vacating = ev.changes.filter((c) => !c.playerId);
        // Close intervals for players who are moving (they may currently be elsewhere)
        for (const c of placing) {
          for (const [posStr, pid] of Object.entries(ss.defense)) {
            const pos = Number(posStr) as Position;
            if (pid === c.playerId && pos !== c.position) {
              closeInterval(ev.side, pos, pid);
              delete ss.defense[pos];
            }
          }
        }
        for (const c of vacating) setDefense(ev.side, c.position, null, ev.reason);
        for (const c of placing) setDefense(ev.side, c.position, c.playerId, ev.reason);
        notePitchingChange(ev.side, prevPitcher);
        break;
      }

      case 'lineup_change': {
        const ss = sideState(ev.side);
        const slotObj = ss.lineup.find((s) => s.slot === ev.slot);
        if (ev.kind === 'courtesy_runner' || ev.kind === 'pinch_runner') {
          if (ev.base && state.bases[ev.base]) {
            const r = state.bases[ev.base]!;
            state.bases[ev.base] = { ...r, playerId: ev.playerId };
          } else {
            warnings.push(`seq ${ev.seq}: runner substitution but no runner on base ${ev.base ?? '?'}`);
          }
          if (ev.kind === 'pinch_runner' && slotObj) slotObj.playerId = ev.playerId;
        } else if (slotObj) {
          slotObj.playerId = ev.playerId;
        } else {
          ss.lineup.push({ slot: ev.slot, playerId: ev.playerId, position: 0 });
          ss.lineup.sort((a, b) => a.slot - b.slot);
        }
        break;
      }

      case 'plate_appearance': {
        const pa0 = ev as PlateAppearanceEvent;
        const pa: PlateAppearanceEvent = { ...pa0, pitches: derivePitches(pa0) };
        // Pitches already credited to the pitcher one by one; only the remainder of the list is new.
        const alreadyCredited = state.pendingPitches.length;
        resetCount();
        const batting = pa.side;
        const fielding = otherSide(batting);
        const bs = sideState(batting);
        const fs = sideState(fielding);
        ensurePresent(batting, pa.batterId, ev.seq, 'came to bat');
        const expectedBatting = battingSide(state.half);
        if (batting !== expectedBatting) {
          warnings.push(`seq ${pa.seq}: ${batting} batted during the ${state.half} of inning ${state.inning}`);
        }
        state.started = true;
        const pitcherId = currentPitcher(fielding) ?? pa.pitcherId;
        if (!currentPitcher(fielding) && pa.pitcherId) {
          // No defense recorded; use the pitcher captured at record time.
        }
        const catcherId = currentCatcher(fielding);
        const outsBefore = state.outs;
        const basesBefore = basesIds(state.bases);
        const risp = !!(state.bases[2] || state.bases[3]);

        // Fielding: errors and sequence
        const officialErrors = (pa.fielding?.errors ?? []).filter((e) => e.official);
        const batterROE = pa.result === 'ROE' || (officialErrors.length > 0 && !BATTER_OUT_RESULTS.has(pa.result) && !HIT_RESULTS.has(pa.result) && !WALK_RESULTS.has(pa.result) && pa.result !== 'HBP');
        // Errors that cost an out: batter reached on error -> one lost out.
        if (batterROE && officialErrors.length) fs.lostOutsThisHalf += 1;

        // Pitcher counting stats (before applying moves so BF increments even if we warn)
        if (pitcherId) {
          const line = getPitcherLine(fielding, pitcherId);
          line.battersFaced += 1;
          if (HIT_RESULTS.has(pa.result)) line.hits += 1;
          if (pa.result === 'HR') line.homeRuns += 1;
          if (WALK_RESULTS.has(pa.result)) line.walks += 1;
          if (pa.result === 'IBB') line.intentionalWalks += 1;
          if (pa.result === 'HBP') line.hitBatters += 1;
          if (STRIKEOUT_RESULTS.has(pa.result)) line.strikeouts += 1;
          if (pa.result === 'KL') line.strikeoutsLooking += 1;
          if (pa.pitches?.total != null) {
            const newPitches = Math.max(0, pa.pitches.total - alreadyCredited);
            if (line.pitchSource === 'unknown' || line.pitchSource === 'pitch_by_pitch') {
              line.pitches = (line.pitches ?? 0) + newPitches;
              line.pitchSource = 'pitch_by_pitch';
            }
            if (pa.pitches.pitches?.length) {
              const fresh = pa.pitches.pitches.slice(alreadyCredited);
              const strikes = fresh.filter((p) => p.result !== 'ball' && p.result !== 'hbp' && p.result !== 'other').length;
              line.strikes = (line.strikes ?? 0) + strikes;
              if (alreadyCredited === 0) {
                line.firstPitchBatters = (line.firstPitchBatters ?? 0) + 1;
                line.firstPitchStrikes = line.firstPitchStrikes ?? 0;
                const fp = pa.pitches.pitches[0];
                if (fp && fp.result !== 'ball' && fp.result !== 'hbp' && fp.result !== 'other') line.firstPitchStrikes += 1;
              }
            } else if (pa.pitches.firstPitchStrike != null) {
              line.firstPitchBatters = (line.firstPitchBatters ?? 0) + 1;
              if (pa.pitches.firstPitchStrike) line.firstPitchStrikes = (line.firstPitchStrikes ?? 0) + 1;
            }
          }
        }
        if (HIT_RESULTS.has(pa.result)) bs.hits += 1;

        // Fielding credits: errors
        for (const err of pa.fielding?.errors ?? []) {
          const pid = fs.defense[err.position] ?? err.playerId;
          fieldingPlays.push({
            eventId: pa.id,
            seq: pa.seq,
            side: fielding,
            inning: state.inning,
            half: state.half,
            playerId: pid,
            position: err.position,
            putout: false,
            assist: false,
            error: true,
            errorKind: err.kind,
            errorOfficial: err.official,
            doublePlay: false,
            triplePlay: false,
            primary: true,
            difficulty: err.difficulty ?? pa.fielding?.difficulty,
            execution: pa.fielding?.execution,
            battedBall: pa.battedBall,
            outcome: 'error'
          });
          if (err.official) {
            fs.errors += 1;
            fs.errorsThisHalf += 1;
          }
        }

        // Apply moves
        const batterInfo = { playerId: pa.batterId, slot: pa.slot };
        const isDP = pa.result === 'DP';
        const isTP = pa.result === 'TP';
        const applied = applyRunnerMoves(batting, pa.runners, batterInfo, pa.seq, game.scoringLevel, {
          batterReachedOnError: batterROE,
          batterReachedOnPassedBall: pa.result === 'D3K' && pa.runners.some((m) => m.from === 'batter' && m.how === 'pb')
        });
        // Also count DP/TP where the moves show multiple outs even if result label differs
        const outsOnPlay = applied.outs;
        const dpFlag = isDP || outsOnPlay === 2;
        const tpFlag = isTP || outsOnPlay === 3;

        // Fielding credits: putouts/assists from the batter's play sequence (not runner-specific sequences)
        const seqPositions = pa.fielding?.sequence ?? [];
        const batterMove = pa.runners.find((m) => m.from === 'batter');
        const batterOut = batterMove ? batterMove.to === 'out' : BATTER_OUT_RESULTS.has(pa.result);
        if (seqPositions.length && (batterOut || outsOnPlay > 0) && !officialErrors.length) {
          creditSequence(fielding, seqPositions, pa.seq, dpFlag, tpFlag, pa.battedBall, pa.id, 'out');
        } else if (seqPositions.length && !officialErrors.length) {
          // Ball fielded but batter safe (hit / FC safe etc.) - record as a touch, no PO/A
          const primaryPos = pa.fielding?.primaryPosition ?? seqPositions[0];
          fieldingPlays.push({
            eventId: pa.id,
            seq: pa.seq,
            side: fielding,
            inning: state.inning,
            half: state.half,
            playerId: fs.defense[primaryPos],
            position: primaryPos,
            putout: false,
            assist: false,
            error: false,
            doublePlay: false,
            triplePlay: false,
            primary: true,
            difficulty: pa.fielding?.difficulty,
            execution: pa.fielding?.execution,
            battedBall: pa.battedBall,
            outcome: HIT_RESULTS.has(pa.result) ? 'hit' : 'other'
          });
        } else if (!seqPositions.length && pa.fielding?.primaryPosition != null && !officialErrors.length) {
          const primaryPos = pa.fielding.primaryPosition;
          fieldingPlays.push({
            eventId: pa.id,
            seq: pa.seq,
            side: fielding,
            inning: state.inning,
            half: state.half,
            playerId: fs.defense[primaryPos],
            position: primaryPos,
            putout: false,
            assist: false,
            error: false,
            doublePlay: false,
            triplePlay: false,
            primary: true,
            difficulty: pa.fielding.difficulty,
            execution: pa.fielding.execution,
            battedBall: pa.battedBall,
            outcome: HIT_RESULTS.has(pa.result) ? 'hit' : batterOut ? 'out' : 'other'
          });
        }
        // Observational difficulty / execution attached to the primary fielder when sequence credits exist
        if (seqPositions.length && (pa.fielding?.difficulty || pa.fielding?.execution)) {
          const primaryPos = pa.fielding?.primaryPosition ?? seqPositions[0];
          const fp = fieldingPlays.filter((f) => f.eventId === pa.id && f.position === primaryPos);
          for (const f of fp) {
            if (f.difficulty == null) f.difficulty = pa.fielding?.difficulty;
            if (f.execution == null) f.execution = pa.fielding?.execution;
          }
        }

        const endedInning = state.outs >= 3;
        const runnersAfter = [state.bases[1], state.bases[2], state.bases[3]].filter(Boolean).length;
        paLog.push({
          eventId: pa.id,
          seq: pa.seq,
          side: batting,
          inning: state.inning,
          half: state.half,
          slot: pa.slot,
          batterId: pa.batterId,
          pitcherId,
          catcherId,
          result: pa.result,
          outsBefore,
          basesBefore,
          basesAfter: basesIds(state.bases),
          risp,
          rbi: pa.rbi,
          runsScored: applied.runs,
          batterOut,
          batterReached: !batterOut && (applied.batterDestination != null && applied.batterDestination !== 'out'),
          batterDestination: applied.batterDestination ?? (batterOut ? 'out' : 1),
          outsOnPlay,
          runnersLeftOnBase: batterOut ? runnersAfter : 0,
          endedInning,
          battedBall: pa.battedBall,
          fielding: pa.fielding,
          pitches: pa.pitches,
          qab: pa.qab,
          uncertain: pa.uncertain,
          tags: pa.tags,
          note: pa.note
        });

        // Advance batting order
        if (bs.lineup.length) {
          const idx = bs.lineup.findIndex((s) => s.slot === pa.slot);
          bs.nextSlotIndex = idx >= 0 ? (idx + 1) % bs.lineup.length : (bs.nextSlotIndex + 1) % bs.lineup.length;
        }

        if (state.outs >= 3) {
          if (state.outs > 3) warnings.push(`seq ${pa.seq}: more than three outs recorded in a half-inning`);
          endHalf(false);
        }
        break;
      }

      case 'baserunning': {
        const br = ev as BaserunningEvent;
        const batting = br.side;
        const fielding = otherSide(batting);
        const fs = sideState(fielding);
        state.started = true;
        const pitcherId = currentPitcher(fielding) ?? br.pitcherId;
        const catcherId = currentCatcher(fielding) ?? br.catcherId;

        // Errors on the play
        for (const err of br.fielding?.errors ?? []) {
          fieldingPlays.push({
            eventId: br.id,
            seq: br.seq,
            side: fielding,
            inning: state.inning,
            half: state.half,
            playerId: fs.defense[err.position] ?? err.playerId,
            position: err.position,
            putout: false,
            assist: false,
            error: true,
            errorKind: err.kind,
            errorOfficial: err.official,
            doublePlay: false,
            triplePlay: false,
            primary: true,
            difficulty: err.difficulty,
            outcome: 'error'
          });
          if (err.official) {
            fs.errors += 1;
            fs.errorsThisHalf += 1;
          }
        }

        // Default "how" from kind for runs/ER purposes; resolve runner ids from the bases at this moment
        const moves: RunnerMove[] = br.runners.map((m) => ({
          ...m,
          playerId: m.from === 'batter' ? m.playerId : state.bases[m.from]?.playerId ?? m.playerId,
          how:
            m.how ??
            (br.kind === 'SB' ? 'sb'
              : br.kind === 'CS' ? 'cs'
              : br.kind === 'WP' ? 'wp'
              : br.kind === 'PB' ? 'pb'
              : br.kind === 'BALK' ? 'balk'
              : br.kind === 'ADV_ERROR' || br.kind === 'PICKOFF_ERROR' ? 'error'
              : br.kind === 'ADV_THROW' ? 'throw'
              : br.kind === 'PICKOFF' ? 'pickoff'
              : 'other')
        }));
        const applied = applyRunnerMoves(batting, moves, null, br.seq, game.scoringLevel, {});

        if (pitcherId) {
          const line = getPitcherLine(fielding, pitcherId);
          if (br.kind === 'WP') line.wildPitches += 1;
          if (br.kind === 'BALK') line.balks += 1;
          if (br.kind === 'PICKOFF') line.pickoffs += 1;
          if (br.kind === 'PICKOFF_ATTEMPT') line.pickoffAttempts += 1;
          if (br.kind === 'SB') line.stolenBasesAllowed += moves.filter((m) => m.to !== 'out').length;
          if (br.kind === 'CS') line.caughtStealing += moves.filter((m) => m.to === 'out').length;
        }
        // Credit fielders on runner outs (e.g., CS 2-6)
        if (br.fielding?.sequence?.length && applied.outs > 0) {
          creditSequence(fielding, br.fielding.sequence, br.seq, false, false, undefined, br.id, 'out');
        }

        baserunningLog.push({
          eventId: br.id,
          seq: br.seq,
          side: batting,
          inning: state.inning,
          half: state.half,
          kind: br.kind,
          runners: moves,
          pitcherId,
          catcherId,
          runsScored: applied.runs,
          outsOnPlay: applied.outs
        });

        if (state.outs >= 3) endHalf(false);
        break;
      }

      case 'pitch_count': {
        const fs = sideState(ev.side);
        fs.pitchCounts[ev.pitcherId] = { count: ev.count, source: ev.source };
        const line = getPitcherLine(ev.side, ev.pitcherId);
        if (line.pitchSource !== 'pitch_by_pitch') {
          line.pitches = ev.count;
          line.pitchSource = ev.source;
        }
        break;
      }

      case 'score_adjustment': {
        const ss = sideState(ev.side);
        ss.runs += ev.runs;
        ss.runsByInning[state.inning - 1] = (ss.runsByInning[state.inning - 1] ?? 0) + ev.runs;
        state.scoreAdjustments.push({ side: ev.side, runs: ev.runs, reason: ev.reason, seq: ev.seq });
        break;
      }

      case 'state_correction': {
        if (ev.skippedPlays) state.skippedPlays = true;
        if (ev.inning != null || ev.half != null || ev.outs != null || ev.nextSlot) resetCount();
        const prevHalf = state.half;
        const prevInning = state.inning;
        if (ev.inning != null) state.inning = ev.inning;
        if (ev.half != null) state.half = ev.half;
        if (ev.inning != null || ev.half != null) {
          if (state.inning !== prevInning || state.half !== prevHalf) {
            // Count the half-innings skipped so interval indexes stay monotonic
            const prevIdx = (prevInning - 1) * 2 + (prevHalf === 'top' ? 0 : 1);
            const newIdx = (state.inning - 1) * 2 + (state.half === 'top' ? 0 : 1);
            state.halfIndex += Math.max(1, newIdx - prevIdx);
            state.bases = {};
            state.outs = 0;
            for (const s of ['home', 'away'] as Side[]) {
              sideState(s).errorsThisHalf = 0;
              sideState(s).lostOutsThisHalf = 0;
            }
          }
        }
        if (ev.outs != null) {
          const fielding = fieldingSide(state.half);
          const diff = ev.outs - state.outs;
          if (diff > 0) {
            // Outs we missed: credit the fielding side's defensive playing time and the pitcher.
            sideState(fielding).defensiveOuts += diff;
            const p = currentPitcher(fielding);
            if (p) getPitcherLine(fielding, p).outs += diff;
          }
          state.outs = ev.outs;
        }
        if (ev.runners) {
          const fielding = fieldingSide(state.half);
          const pitcherId = currentPitcher(fielding);
          for (const b of [1, 2, 3] as const) {
            if (!(b in ev.runners)) continue;
            const pid = ev.runners[b];
            if (pid === null) delete state.bases[b];
            else if (pid) {
              const bs = sideState(battingSide(state.half));
              const slot = bs.lineup.find((s) => s.playerId === pid)?.slot ?? 0;
              state.bases[b] = { playerId: pid, slot, responsiblePitcherId: pitcherId, reachedOnError: false };
            }
          }
        }
        if (ev.nextSlot) {
          const ss = sideState(ev.nextSlot.side);
          const idx = ss.lineup.findIndex((s) => s.slot === ev.nextSlot!.slot);
          if (idx >= 0) ss.nextSlotIndex = idx;
        }
        warnings.push(`seq ${ev.seq}: manual state correction (${ev.reason})`);
        break;
      }

      case 'half_inning_end': {
        endHalf(ev.creditMissingOuts);
        break;
      }

      case 'game_end': {
        state.ended = true;
        state.endReason = ev.reason;
        // Close all open defensive intervals and pitcher appearances
        for (const iv of intervals) if (iv.endOuts === null) iv.endOuts = sideState(iv.side).defensiveOuts;
        for (const line of pitcherLines.values()) {
          const app = line.appearances[line.appearances.length - 1];
          if (app && app.endInning === undefined) {
            app.endInning = state.inning;
            app.endHalf = state.half;
          }
        }
        break;
      }

      case 'availability': {
        const ss = sideState(ev.side);
        availabilityNow.set(`${ev.side}:${ev.playerId}`, ev.status);
        availabilityLog.push({
          seq: ev.seq,
          side: ev.side,
          playerId: ev.playerId,
          status: ev.status,
          atOuts: ss.defensiveOuts,
          atTeamPAs: paLog.filter((p) => p.side === ev.side).length,
          inning: state.inning,
          half: state.half
        });
        break;
      }

      case 'note':
        break;

      default: {
        warnings.push(`unknown event type ${(ev as any).type}`);
      }
    }
  }

  // Earned-run basis: if no fielding detail was ever recorded at Level A, say so.
  const anyFieldingRecorded = paLog.some((p) => p.fielding && (p.fielding.sequence.length || p.fielding.errors.length));
  for (const line of pitcherLines.values()) {
    if (!anyFieldingRecorded && game.scoringLevel === 'A') line.erBasis = 'assumed_no_errors';
  }

  // Lineup sanity
  for (const s of ['home', 'away'] as Side[]) {
    if (!sideState(s).lineup.length && paLog.some((p) => p.side === s)) {
      warnings.push(`${s} lineup was never set; batting order statistics use the recorded batters only`);
    }
  }

  return {
    game,
    state,
    paLog,
    baserunningLog,
    pitcherLines: [...pitcherLines.values()],
    intervals,
    fieldingPlays,
    runLog,
    availabilityLog,
    warnings,
    eventCount: events.length
  };
}

// ---------------------------------------------------------------------------
// Availability: who was there, and for how much of the game
// ---------------------------------------------------------------------------

export interface PlayerAvailability {
  side: Side;
  playerId: ID;
  /** Status at the end of the log (or now, for a live game). */
  status: AvailabilityStatus;
  /** Was the player ever marked absent, hurt or gone during this game. */
  everAbsent: boolean;
  everInjured: boolean;
  everLeft: boolean;
  /** Defensive outs of the side while the player was present (expected field time). */
  availableOuts: number;
  /** Plate appearances of the side while the player was present (expected batting chances). */
  availableTeamPAs: number;
}

/** The roster a side is judged against for this game: the frozen roster for my side, otherwise everyone who appeared. */
export function gameRoster(r: ReplayResult, side: Side): ID[] {
  const ids = new Set<ID>();
  if (side === r.game.mySide && r.game.rosterIds) for (const id of r.game.rosterIds) ids.add(id);
  const ss = side === 'home' ? r.state.home : r.state.away;
  for (const s of ss.lineup) ids.add(s.playerId);
  for (const pid of Object.values(ss.defense)) if (pid) ids.add(pid);
  for (const iv of r.intervals) if (iv.side === side) ids.add(iv.playerId);
  for (const e of r.paLog) if (e.side === side) ids.add(e.batterId);
  for (const a of r.availabilityLog) if (a.side === side) ids.add(a.playerId);
  return [...ids];
}

/** Availability of one player for one game. Everyone is present until the log says otherwise. */
export function playerAvailability(r: ReplayResult, side: Side, playerId: ID): PlayerAvailability {
  const ss = side === 'home' ? r.state.home : r.state.away;
  const endOuts = ss.defensiveOuts;
  const endPAs = r.paLog.filter((p) => p.side === side).length;
  let status: AvailabilityStatus = 'present';
  let fromOuts = 0;
  let fromPAs = 0;
  let availableOuts = 0;
  let availableTeamPAs = 0;
  const out: PlayerAvailability = { side, playerId, status, everAbsent: false, everInjured: false, everLeft: false, availableOuts: 0, availableTeamPAs: 0 };
  for (const a of r.availabilityLog) {
    if (a.side !== side || a.playerId !== playerId) continue;
    if (status === 'present') {
      availableOuts += Math.max(0, a.atOuts - fromOuts);
      availableTeamPAs += Math.max(0, a.atTeamPAs - fromPAs);
    }
    status = a.status;
    fromOuts = a.atOuts;
    fromPAs = a.atTeamPAs;
    if (a.status === 'absent') out.everAbsent = true;
    if (a.status === 'injured') out.everInjured = true;
    if (a.status === 'left') out.everLeft = true;
  }
  if (status === 'present') {
    availableOuts += Math.max(0, endOuts - fromOuts);
    availableTeamPAs += Math.max(0, endPAs - fromPAs);
  }
  out.status = status;
  out.availableOuts = availableOuts;
  out.availableTeamPAs = availableTeamPAs;
  return out;
}

// ---------------------------------------------------------------------------
// Convenience: who bats next, who is pitching, position innings for a replay
// ---------------------------------------------------------------------------

export function currentBatter(r: ReplayResult): { side: Side; slot: LineupSlot | null } {
  const side = battingSide(r.state.half);
  const ss = side === 'home' ? r.state.home : r.state.away;
  const slot = ss.lineup.length ? ss.lineup[ss.nextSlotIndex % ss.lineup.length] : null;
  return { side, slot };
}

export function currentPitcherId(r: ReplayResult): ID | undefined {
  const side = fieldingSide(r.state.half);
  const ss = side === 'home' ? r.state.home : r.state.away;
  return ss.defense[1];
}

/** Outs played per (side, playerId, position), closing open intervals at the current counter. */
export function positionOuts(r: ReplayResult): Array<{ side: Side; playerId: ID; position: Position; outs: number; starts: number }> {
  const map = new Map<string, { side: Side; playerId: ID; position: Position; outs: number; starts: number }>();
  for (const iv of r.intervals) {
    const ss = iv.side === 'home' ? r.state.home : r.state.away;
    const end = iv.endOuts ?? ss.defensiveOuts;
    const outs = Math.max(0, end - iv.startOuts);
    const key = `${iv.side}:${iv.playerId}:${iv.position}`;
    const cur = map.get(key) ?? { side: iv.side, playerId: iv.playerId, position: iv.position, outs: 0, starts: 0 };
    cur.outs += outs;
    if (iv.isStart) cur.starts += 1;
    map.set(key, cur);
  }
  return [...map.values()];
}

/** Defensive alignment of a side at a given half-inning index (for inning-by-inning views). */
export function alignmentAtHalf(r: ReplayResult, side: Side, halfIndex: number): Partial<Record<Position, ID>> {
  const out: Partial<Record<Position, ID>> = {};
  // Find intervals open at the start of that half: startHalfIndex <= halfIndex and (end null or end counter later)
  // Since intervals are measured in outs, approximate by taking the last interval per position whose startHalfIndex <= halfIndex.
  for (const iv of r.intervals) {
    if (iv.side !== side) continue;
    if (iv.startHalfIndex <= halfIndex) out[iv.position] = iv.playerId;
  }
  return out;
}
