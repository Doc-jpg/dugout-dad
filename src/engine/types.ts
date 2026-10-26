/**
 * Dugout Dad data model.
 *
 * Design rules (from the master prompt):
 *  - Live games are EVENT-SOURCED. The ordered event log is the source of truth;
 *    everything else (score, outs, runners, box score, position innings, stats)
 *    is derived by replaying it. Corrections edit or remove events and replay.
 *  - Defensive playing time is stored in OUTS, never decimal innings.
 *  - Recorded facts, scorer judgments, calculated statistics, imported aggregates
 *    and unknown information are kept distinguishable.
 *  - Stable UUIDs everywhere so weekend exports can be imported twice safely.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO timestamp

// ---------------------------------------------------------------------------
// Teams, players, seasons, tournaments
// ---------------------------------------------------------------------------

export type PlayerStatus = 'regular' | 'pickup' | 'guest' | 'inactive' | 'former';

export interface Team {
  id: ID;
  name: string; // "Oklahoma Rattlers 13U"
  shortName?: string; // "Rattlers"
  isMine: boolean; // the team I follow (my son's team)
  color?: string; // hex, optional
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Player {
  id: ID;
  teamId: ID;
  firstName: string;
  lastName: string;
  number?: string; // jersey number is NOT identity; may change between seasons
  bats?: 'R' | 'L' | 'S';
  throws?: 'R' | 'L';
  status: PlayerStatus;
  /** True for the player whose development the owner is tracking (Eli). */
  isFocus?: boolean;
  /** Placeholder opponents such as "Player 4" or "#12" until a name is known. */
  isPlaceholder?: boolean;
  /** Alternate spellings / imported names that map to this identity. */
  aliases: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Season {
  id: ID;
  teamId: ID;
  name: string; // "Fall 2026"
  startDate: ISODate;
  endDate?: ISODate;
}

export interface Tournament {
  id: ID;
  name: string;
  startDate: ISODate;
  endDate?: ISODate;
  venue?: string;
  /** Configurable pitching rules for this event (optional). */
  pitchingRules?: PitchingRules;
}

export interface PitchingRules {
  organization?: string; // "USSSA", "Perfect Game", league name
  maxPitchesPerDay?: number;
  maxInningsPerDay?: number; // in outs? keep innings for readability; stored as number of innings
  maxInningsPerWeekend?: number;
  restDays?: Array<{ minPitches: number; maxPitches: number; restDays: number }>;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export type Side = 'home' | 'away';
export type Half = 'top' | 'bottom';
export type ScoringLevel = 'A' | 'B' | 'C'; // Quick / Enhanced / Full
export type GameStatus = 'setup' | 'in_progress' | 'suspended' | 'final';
export type GameEndReason =
  | 'regulation'
  | 'time_limit'
  | 'mercy_rule'
  | 'walk_off'
  | 'weather'
  | 'forfeit'
  | 'administrative'
  | 'other';

export interface GameRules {
  scheduledInnings: number; // 7 for most 13U
  timeLimitMinutes?: number;
  fieldConfig?: '50/70' | '54/80' | '60/90' | 'other';
  /** Innings used to normalize ERA (7 for 13U; 9 traditional). */
  eraInnings: number;
  /** Mercy rule text, kept as a note; the scorer ends the game manually. */
  mercyRule?: string;
  continuousBattingOrder?: boolean;
}

export interface Game {
  id: ID;
  /** My team (the team I follow). */
  teamId: ID;
  /** The opponent team record (may be a lightly-populated placeholder team). */
  opponentTeamId: ID;
  /** Which side my team bats on. */
  mySide: Side;
  date: ISODate;
  time?: string; // HH:MM local
  seasonId?: ID;
  tournamentId?: ID;
  venue?: string;
  ageDivision?: string; // "13U"
  gameType?: 'pool' | 'bracket' | 'friendly' | 'league' | 'scrimmage' | 'other';
  rules: GameRules;
  scoringLevel: ScoringLevel;
  /** Log every pitch (ball, strike, foul) on the live screen. Default true for new games. */
  pitchLogging?: boolean;
  status: GameStatus;
  endReason?: GameEndReason;
  /** How much of the opponent's offense was captured. */
  opponentScoringDepth: 'full' | 'simplified' | 'scoreboard_only';
  notes?: string;
  /** Monotonic revision, bumped on every event write; used for import conflict detection. */
  revision: number;
  /** Set when the game has been included in an export archive. */
  lastExportedAt?: ISODateTime;
  /**
   * My team's roster for this game, frozen when the game starts: everyone who could have played,
   * including players marked absent. Availability is judged against this list.
   */
  rosterIds?: ID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

/** Fielding positions use standard numbers. 0 = unknown / not recorded. EH = extra hitter (bats, no field position). */
export type Position = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const POSITION_LABEL: Record<Position, string> = {
  0: '--', 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF'
};
export const POSITION_NAME: Record<Position, string> = {
  0: 'Unknown', 1: 'Pitcher', 2: 'Catcher', 3: 'First base', 4: 'Second base', 5: 'Third base',
  6: 'Shortstop', 7: 'Left field', 8: 'Center field', 9: 'Right field'
};

export interface LineupSlot {
  slot: number; // 1-based batting order position
  playerId: ID;
  /** Starting defensive position (0 if not fielding / unknown). Changes are events. */
  position: Position;
}

/** Bases: 0 = batter's box (plate), 1,2,3 = bases, 4 = home (scored). */
export type Base = 0 | 1 | 2 | 3;
export type Destination = 1 | 2 | 3 | 4 | 'out';

export type PAResult =
  | '1B' | '2B' | '3B' | 'HR'
  | 'BB' | 'IBB' | 'HBP'
  | 'K' | 'KL' // strikeout swinging / looking (K = unspecified or swinging)
  | 'D3K' // reached on dropped third strike (batter safe)
  | 'GO' | 'FO' | 'LO' | 'PO' // groundout, flyout, lineout, pop-out
  | 'FC' // fielder's choice (batter safe, runner out)
  | 'SAC' | 'SF' // sacrifice bunt / fly
  | 'DP' | 'TP' // batter grounded/lined into double or triple play
  | 'ROE' // reached on error
  | 'CI' // catcher's interference
  | 'OTHER_OUT' // batter out some other way (e.g., interference, out of box)
  | 'OTHER_SAFE'; // batter safe some other way

export type Trajectory = 'GB' | 'LD' | 'FB' | 'PU' | 'BUNT';
export type Hardness = 'soft' | 'medium' | 'hard';

/** Field zones. Named so both the tap-the-field graphic and text selection map to the same codes. */
export type FieldZone =
  | '3B_LINE' | '3B' | 'SS' | 'MIDDLE' | '2B' | '1B' | '1B_LINE' | 'P' | 'C'
  | 'LF' | 'LC' | 'CF' | 'RC' | 'RF'
  | 'LF_DEEP' | 'LC_DEEP' | 'CF_DEEP' | 'RC_DEEP' | 'RF_DEEP'
  | 'LF_SHALLOW' | 'CF_SHALLOW' | 'RF_SHALLOW'
  | 'FOUL_L' | 'FOUL_R';

export type ContactTag =
  | 'jammed' | 'off_end' | 'bloop' | 'squared_up' | 'deep_fly' | 'warning_track'
  | 'gap' | 'routine' | 'difficult_defensive_chance' | 'off_fence' | 'ground_rule'
  | 'inside_park' | 'over_fence' | 'through_infield';

export interface BattedBall {
  trajectory?: Trajectory;
  hardness?: Hardness; // undefined = unknown (never assume from outcome)
  zone?: FieldZone;
  /** Optional precise tap point on the field graphic, 0..1 normalized (x right, y toward outfield). */
  point?: { x: number; y: number };
  tags?: ContactTag[];
}

export type Difficulty = 'routine' | 'moderate' | 'difficult' | 'exceptional';
export type Execution =
  | 'made_expected' | 'made_difficult' | 'missed_expected' | 'attempted_difficult'
  | 'no_realistic_play' | 'uncertain';

export interface FieldingError {
  /** Position occupied when the error happened (resolved at record time). */
  position: Position;
  /** Player at that position when the error happened (resolved at record time). */
  playerId?: ID;
  kind: 'fielding' | 'throwing' | 'dropped_throw' | 'missed_catch' | 'other';
  difficulty?: Difficulty;
  /** Observational: should this count as an official error? Default true. */
  official: boolean;
  note?: string;
}

export interface FieldingRecord {
  /** Official-style sequence by position number, e.g. [6,3] for 6-3, [8] for F8, [6,4,3] for a DP. */
  sequence: Position[];
  errors: FieldingError[];
  /** Optional observational assessment of the play's difficulty / execution for the primary fielder. */
  difficulty?: Difficulty;
  execution?: Execution;
  /** Primary fielder if it differs from sequence[0] (e.g., ball reached but not converted). */
  primaryPosition?: Position;
}

export interface RunnerMove {
  /** Who moved. 'batter' or the base the runner started from. */
  from: 'batter' | 1 | 2 | 3;
  playerId?: ID; // resolved at record time when known
  to: Destination;
  /** Out number within the play, 1..3, when to === 'out'. */
  outNumber?: number;
  /** Set when the run is an RBI for the batter (scorer-reviewable). */
  rbi?: boolean;
  /** How the runner advanced (for earned-run and SB logic). */
  how?: 'hit' | 'walk' | 'hbp' | 'error' | 'fc' | 'sac' | 'forced' | 'sb' | 'cs' | 'wp' | 'pb' | 'balk' | 'throw' | 'pickoff' | 'tag' | 'other';
  /** Fielders credited on a runner out (e.g., 8-2 at the plate). */
  sequence?: Position[];
  note?: string;
}

/** Target base for pickoff attempts and back-picks. */
export type PickoffTarget = 1 | 2 | 3;

export interface PitchDetail {
  balls?: number;
  strikes?: number;
  /** Total pitches in the plate appearance (Level B/C). */
  total?: number;
  /** Level C: ordered list of pitches. */
  pitches?: Array<{
    result: 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play' | 'hbp' | 'foul_tip' | 'other';
    type?: 'FB' | 'CB' | 'CH' | 'SL' | 'CT' | 'OS' | 'unknown';
    velocity?: number;
  }>;
  firstPitchStrike?: boolean;
}

export type GameEvent =
  | PitchEvent
  | LineupSetEvent
  | DefenseSetEvent
  | DefenseChangeEvent
  | LineupChangeEvent
  | PlateAppearanceEvent
  | BaserunningEvent
  | PitchCountEvent
  | ScoreAdjustmentEvent
  | StateCorrectionEvent
  | NoteEvent
  | GameEndEvent
  | HalfInningEndEvent
  | AvailabilityEvent;

export interface EventBase {
  id: ID;
  gameId: ID;
  /** Order in the log. Dense, 0-based. Replay happens in seq order. */
  seq: number;
  /** Device clock when recorded (informational). */
  ts: ISODateTime;
  type: string;
  /** Free text attached to this event. */
  note?: string;
  /** Predefined observation tags (not official stats). */
  tags?: string[];
}

/** Set (or replace) the batting order for a side. Usually seq 0/1. */
export interface LineupSetEvent extends EventBase {
  type: 'lineup_set';
  side: Side;
  slots: LineupSlot[];
}

/** Set the entire defensive alignment for a side (start of game or wholesale change). */
export interface DefenseSetEvent extends EventBase {
  type: 'defense_set';
  side: Side; // side that is FIELDING
  assignments: Partial<Record<Position, ID>>; // position -> playerId
}

/** Incremental defensive changes: subs, swaps, pitching changes. */
export interface DefenseChangeEvent extends EventBase {
  type: 'defense_change';
  side: Side; // fielding side
  changes: Array<{ position: Position; playerId: ID | null }>; // null = position vacated
  reason?: 'substitution' | 'swap' | 'pitching_change' | 'injury' | 'other';
}

/** Batting order changes: a sub takes a slot, pinch hitter, pinch/courtesy runner. */
export interface LineupChangeEvent extends EventBase {
  type: 'lineup_change';
  side: Side;
  slot: number;
  playerId: ID;
  kind: 'substitution' | 'pinch_hitter' | 'pinch_runner' | 'courtesy_runner' | 'reentry';
  /** For runners: which base the replaced runner occupied. */
  base?: 1 | 2 | 3;
}

/** One pitch that was not put in play: ball, strike, or foul. The pitch that ends the at-bat is implied by the plate appearance. */
export type PitchResult = 'ball' | 'strike' | 'strike_looking' | 'strike_swinging' | 'foul';
export interface PitchEvent extends EventBase {
  type: 'pitch';
  side: Side; // batting side
  result: PitchResult;
}

export interface PlateAppearanceEvent extends EventBase {
  type: 'plate_appearance';
  side: Side; // batting side
  slot: number; // batting-order slot
  batterId: ID;
  pitcherId?: ID; // resolved from defense at record time
  result: PAResult;
  battedBall?: BattedBall;
  fielding?: FieldingRecord;
  runners: RunnerMove[];
  pitches?: PitchDetail;
  /** Scorer-confirmed RBI total for the PA (derived default, editable). */
  rbi: number;
  /** Observational quality-at-bat judgment (optional). */
  qab?: boolean;
  /** Set when the scorer explicitly marks the PA as reconstructed/uncertain. */
  uncertain?: boolean;
}

export type BaserunningKind =
  | 'SB' | 'CS' | 'PICKOFF' | 'PICKOFF_ERROR' | 'WP' | 'PB' | 'BALK'
  | 'ADV_ERROR' | 'ADV_THROW' | 'ADV_OTHER' | 'OUT_OTHER' | 'DEFENSIVE_INDIFFERENCE'
  /** Pickoff throw by the pitcher that did not get the runner (logged, no movement). */
  | 'PICKOFF_ATTEMPT'
  /** Back-pick throw by the catcher after a pitch that did not get the runner. */
  | 'BACK_PICK';

/** Events between plate appearances. */
export interface BaserunningEvent extends EventBase {
  type: 'baserunning';
  side: Side; // batting side
  kind: BaserunningKind;
  runners: RunnerMove[];
  pitcherId?: ID;
  catcherId?: ID;
  fielding?: FieldingRecord;
  /** For PICKOFF_ATTEMPT / BACK_PICK / PICKOFF: the base thrown to. */
  targetBase?: PickoffTarget;
}

/** Manual pitch count for the current pitcher (Level A/B). */
export interface PitchCountEvent extends EventBase {
  type: 'pitch_count';
  side: Side; // fielding side
  pitcherId: ID;
  /** Cumulative pitches for this pitcher in this game, as observed. */
  count: number;
  source: 'manual' | 'scoreboard' | 'pitch_by_pitch';
}

/** "Opponent scored two runs that I missed." Adjusts the scoreboard without inventing plays. */
export interface ScoreAdjustmentEvent extends EventBase {
  type: 'score_adjustment';
  side: Side; // side that gets the runs
  runs: number; // may be negative to correct an over-count
  reason: string;
}

/**
 * Hard-sync the live state to the real scoreboard (inning/half/outs/runners).
 * Preserved as a correction; it never manufactures plate appearances.
 */
export interface StateCorrectionEvent extends EventBase {
  type: 'state_correction';
  inning?: number;
  half?: Half;
  outs?: number;
  /** Runner on each base by playerId (or null to clear). Undefined = leave unchanged. */
  runners?: { 1?: ID | null; 2?: ID | null; 3?: ID | null };
  /** Set the next batter slot for a side. */
  nextSlot?: { side: Side; slot: number };
  /** Mark that plays were skipped/unrecorded before this point. */
  skippedPlays?: boolean;
  reason: string;
}

export interface NoteEvent extends EventBase {
  type: 'note';
  text: string;
  playerId?: ID;
}

export interface GameEndEvent extends EventBase {
  type: 'game_end';
  reason: GameEndReason;
}

/**
 * Optional explicit half-inning end (e.g., time limit, or the side was retired with
 * an unrecorded out). Normally half-innings end automatically at 3 outs.
 */
export interface HalfInningEndEvent extends EventBase {
  type: 'half_inning_end';
  /** If true, the missing outs are counted as defensive outs for playing time. */
  creditMissingOuts: boolean;
}

/** Availability of a rostered player. Everyone is present until an event says otherwise. */
export type AvailabilityStatus = 'present' | 'absent' | 'injured' | 'left';
export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  present: 'Here', absent: 'Absent', injured: 'Hurt', left: 'Left early'
};

/**
 * A player's availability changed: marked absent before the game, hurt or gone home
 * mid-game, or back (arrived late, cleared to play). Expected playing time stops and
 * starts at these points, so bench time is never counted against a kid who was not there.
 */
export interface AvailabilityEvent extends EventBase {
  type: 'availability';
  side: Side;
  playerId: ID;
  status: AvailabilityStatus;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: ID;
  gameId: ID;
  at: ISODateTime;
  action: 'undo' | 'edit' | 'delete' | 'insert' | 'redo';
  eventId: ID;
  before?: GameEvent;
  after?: GameEvent;
}

// ---------------------------------------------------------------------------
// Imported aggregate snapshots (e.g., GameChanger season export)
// ---------------------------------------------------------------------------

export interface StatSnapshot {
  id: ID;
  source: 'gamechanger' | 'other';
  teamId: ID;
  seasonId?: ID;
  label: string; // "GameChanger Fall 2026 export"
  /** Date the export reflects (as of). */
  asOfDate: ISODate;
  /** Known coverage: first/last game date covered, if the owner knows. */
  coverageStart?: ISODate;
  coverageEnd?: ISODate;
  fileName: string;
  fileSha256: string;
  /** The original file text, preserved verbatim for rollback and re-parsing. */
  rawText: string;
  importedAt: ISODateTime;
  rows: SnapshotRow[];
  /** Totals row as exported (not computed). */
  totals?: SnapshotRow;
  glossary?: Record<string, string>;
  columnSections: Array<{ section: 'batting' | 'pitching' | 'fielding' | 'identity'; start: number; end: number }>;
  /** Players created by this import (so a rollback can report them). */
  createdPlayerIds?: string[];
}

export interface SnapshotRow {
  /** Identity columns exactly as imported. */
  number: string;
  last: string;
  first: string;
  /** Matched Dugout Dad player (null if unmatched). */
  playerId: ID | null;
  /** Section-scoped values. Key = original column header. Value = parsed. */
  batting: Record<string, StatValue>;
  pitching: Record<string, StatValue>;
  fielding: Record<string, StatValue>;
}

/**
 * Imported value with provenance. `raw` is the exact text from the file.
 * `value` is null when the export used "-" (not applicable / undefined).
 * Innings-style fields keep `outs` so 1.2 is never treated as 1.2 decimal.
 */
export interface StatValue {
  raw: string;
  value: number | null;
  outs?: number; // for IP / INN / position innings
  kind: 'count' | 'rate' | 'innings' | 'text' | 'na';
}

// ---------------------------------------------------------------------------
// Import / export bookkeeping
// ---------------------------------------------------------------------------

export interface TransferRecord {
  id: ID;
  direction: 'export' | 'import';
  at: ISODateTime;
  fileName: string;
  sha256?: string;
  gameIds: ID[];
  summary: string;
}

export interface Settings {
  id: 'settings';
  focusPlayerId?: ID;
  myTeamId?: ID;
  defaultScoringLevel: ScoringLevel;
  defaultEraInnings: number;
  defaultScheduledInnings: number;
  /** Quality-at-bat definition flags. */
  qab: {
    hit: boolean;
    walkOrHbp: boolean;
    hardContact: boolean;
    sacrifice: boolean;
    rbi: boolean;
    sixPlusPitches: boolean;
    threePlusAfterTwoStrikes: boolean;
  };
  /** Lineup weighting defaults. */
  lineupWeights: { season: number; recent: number; recentGames: number };
  /** Remind to export after this many un-exported final games. */
  exportReminderGames: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  defaultScoringLevel: 'A',
  defaultEraInnings: 7,
  defaultScheduledInnings: 7,
  qab: {
    hit: true,
    walkOrHbp: true,
    hardContact: true,
    sacrifice: true,
    rbi: true,
    sixPlusPitches: true,
    threePlusAfterTwoStrikes: true
  },
  lineupWeights: { season: 0.85, recent: 0.15, recentGames: 5 },
  exportReminderGames: 1
};

// ---------------------------------------------------------------------------
// Innings notation helpers (outs are the unit of record)
// ---------------------------------------------------------------------------

/** 4 outs -> "1.1", 5 -> "1.2", 9 -> "3.0". Never decimal arithmetic. */
export function outsToInnings(outs: number): string {
  const o = Math.max(0, Math.round(outs));
  return `${Math.floor(o / 3)}.${o % 3}`;
}

/** "1.2" -> 5 outs. Accepts "1", "1.0", "1.1", "1.2". Throws on ".3" or more. */
export function inningsToOuts(text: string): number {
  const t = String(text).trim();
  if (t === '' || t === '-') throw new Error(`Not an innings value: "${text}"`);
  const m = /^(\d+)(?:\.(\d))?$/.exec(t);
  if (!m) throw new Error(`Bad innings notation: "${text}"`);
  const whole = parseInt(m[1], 10);
  const part = m[2] ? parseInt(m[2], 10) : 0;
  if (part > 2) throw new Error(`Bad innings notation (outs digit must be 0-2): "${text}"`);
  return whole * 3 + part;
}

/** Innings as a true fraction for rate stats (ERA, per-9, per-7). */
export function outsToInningsFraction(outs: number): number {
  return outs / 3;
}

export function newId(): string {
  // crypto.randomUUID is available in all modern browsers and Node 19+.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  // Fallback (should not happen in supported environments)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
