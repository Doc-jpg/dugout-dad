import type { Game, GameEvent, ID, LineupSlot, PAResult, Position, RunnerMove, Side, FieldingRecord, BattedBall, BaserunningKind } from '../src/engine/types';
import { newId, nowIso } from '../src/engine/types';
import { replayGame, type Bases } from '../src/engine/reducer';
import { proposeMoves, proposeRbi } from '../src/engine/propose';

export const MY = 'team-rattlers';
export const OPP = 'team-opp';

export function makeGame(over: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    teamId: MY,
    opponentTeamId: OPP,
    mySide: 'away',
    date: '2026-10-24',
    rules: { scheduledInnings: 7, eraInnings: 7 },
    scoringLevel: 'B',
    status: 'in_progress',
    opponentScoringDepth: 'full',
    revision: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...over
  };
}

/** Simple roster: ids p1..p12 for my team, o1..o9 for the opponent. */
export const myPlayers = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
export const oppPlayers = Array.from({ length: 9 }, (_, i) => `o${i + 1}`);
export const ELI = 'p7';

export class Log {
  events: GameEvent[] = [];
  game: Game;
  constructor(game: Game = makeGame()) {
    this.game = game;
  }
  private base() {
    return { id: newId(), gameId: this.game.id, seq: this.events.length, ts: nowIso() };
  }
  lineup(side: Side, ids: ID[], positions?: Position[]) {
    const slots: LineupSlot[] = ids.map((playerId, i) => ({ slot: i + 1, playerId, position: (positions?.[i] ?? 0) as Position }));
    this.events.push({ ...this.base(), type: 'lineup_set', side, slots });
    return this;
  }
  defense(side: Side, assignments: Partial<Record<Position, ID>>) {
    this.events.push({ ...this.base(), type: 'defense_set', side, assignments });
    return this;
  }
  change(side: Side, changes: Array<{ position: Position; playerId: ID | null }>, reason?: any) {
    this.events.push({ ...this.base(), type: 'defense_change', side, changes, reason });
    return this;
  }
  /** Replay to find the current bases/outs for proposals. */
  private ctx() {
    const r = replayGame(this.game, this.events);
    return { bases: r.state.bases as Bases, outs: r.state.outs, state: r.state, replay: r };
  }
  /** Record a PA for the next batter using proposed moves (optionally overridden). */
  pa(side: Side, result: PAResult, opts: { batterId?: ID; slot?: number; moves?: RunnerMove[]; fielding?: FieldingRecord; battedBall?: BattedBall; rbi?: number; pitches?: any } = {}) {
    const { bases, outs, replay } = this.ctx();
    const ss = side === 'home' ? replay.state.home : replay.state.away;
    const slotObj = ss.lineup.length ? ss.lineup[ss.nextSlotIndex % ss.lineup.length] : undefined;
    const batterId = opts.batterId ?? slotObj?.playerId ?? 'unknown';
    const slot = opts.slot ?? slotObj?.slot ?? 0;
    const moves = opts.moves ?? proposeMoves(result, { bases, outs });
    const rbi = opts.rbi ?? proposeRbi(result, moves);
    this.events.push({
      ...this.base(),
      type: 'plate_appearance',
      side,
      slot,
      batterId,
      result,
      runners: moves,
      fielding: opts.fielding,
      battedBall: opts.battedBall,
      rbi,
      pitches: opts.pitches
    });
    return this;
  }
  run(side: Side, kind: BaserunningKind, runners: RunnerMove[], fielding?: FieldingRecord) {
    this.events.push({ ...this.base(), type: 'baserunning', side, kind, runners, fielding });
    return this;
  }
  pitchCount(side: Side, pitcherId: ID, count: number, source: 'manual' | 'scoreboard' = 'manual') {
    this.events.push({ ...this.base(), type: 'pitch_count', side, pitcherId, count, source });
    return this;
  }
  adjustScore(side: Side, runs: number, reason: string) {
    this.events.push({ ...this.base(), type: 'score_adjustment', side, runs, reason });
    return this;
  }
  correct(payload: Omit<Extract<GameEvent, { type: 'state_correction' }>, 'id' | 'gameId' | 'seq' | 'ts' | 'type'>) {
    this.events.push({ ...this.base(), type: 'state_correction', ...payload });
    return this;
  }
  endHalf(creditMissingOuts = false) {
    this.events.push({ ...this.base(), type: 'half_inning_end', creditMissingOuts });
    return this;
  }
  end(reason: any = 'regulation') {
    this.events.push({ ...this.base(), type: 'game_end', reason });
    return this;
  }
  replay() {
    return replayGame(this.game, this.events);
  }
}

/** Standard start: away = my team (Rattlers) bats first; home = opponent. */
export function standardStart(eliPosition: Position = 6) {
  const log = new Log(makeGame({ mySide: 'away' }));
  const myPos: Position[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  // Make Eli (p7) play eliPosition; whoever had it takes p7's default (7 = LF)
  const positions = [...myPos];
  const idxEli = myPlayers.indexOf(ELI);
  const idxTarget = positions.indexOf(eliPosition);
  const tmp = positions[idxEli];
  positions[idxEli] = eliPosition;
  positions[idxTarget] = tmp;
  log.lineup('away', myPlayers.slice(0, 9), positions);
  log.lineup('home', oppPlayers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const myDef: Partial<Record<Position, ID>> = {};
  myPlayers.slice(0, 9).forEach((p, i) => (myDef[positions[i]] = p));
  const oppDef: Partial<Record<Position, ID>> = {};
  oppPlayers.forEach((p, i) => (oppDef[(i + 1) as Position] = p));
  log.defense('away', myDef);
  log.defense('home', oppDef);
  return log;
}

/** Retire the side in order with three quick outs. */
export function threeOuts(log: Log, side: Side) {
  log.pa(side, 'K');
  log.pa(side, 'K');
  log.pa(side, 'K');
  return log;
}
