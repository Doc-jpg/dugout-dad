/**
 * Intelligent defaults for runner advancement and RBI credit.
 *
 * Everything here is a PROPOSAL the scorer reviews. The reducer applies the
 * moves actually stored on the event, never these defaults.
 */
import type { PAResult, RunnerMove, Destination, BaserunningKind } from './types';
import type { Bases } from './reducer';

export interface ProposalContext {
  bases: Bases;
  outs: number;
}

const RBI_RESULTS: ReadonlySet<PAResult> = new Set(['1B', '2B', '3B', 'HR', 'BB', 'IBB', 'HBP', 'SF', 'SAC', 'GO', 'FC', 'CI', 'FO', 'LO', 'PO', 'OTHER_SAFE']);

function has(b: Bases, base: 1 | 2 | 3) {
  return !!b[base];
}

function move(from: RunnerMove['from'], to: Destination, how: RunnerMove['how'], rbi?: boolean): RunnerMove {
  const m: RunnerMove = { from, to, how };
  if (to === 4 && rbi) m.rbi = true;
  return m;
}

/** Advance every runner `n` bases (capped at home). */
function advanceAll(b: Bases, n: number, how: RunnerMove['how'], rbi: boolean): RunnerMove[] {
  const out: RunnerMove[] = [];
  for (const base of [3, 2, 1] as const) {
    if (!has(b, base)) continue;
    const dest = Math.min(4, base + n) as Destination;
    out.push(move(base, dest, how, rbi));
  }
  return out;
}

/** Forced advancement only (walk, HBP, groundout at first, ROE at first). */
function forcedChain(b: Bases, how: RunnerMove['how'], rbi: boolean): RunnerMove[] {
  const out: RunnerMove[] = [];
  if (has(b, 1)) {
    out.push(move(1, 2, how));
    if (has(b, 2)) {
      out.push(move(2, 3, how));
      if (has(b, 3)) out.push(move(3, 4, how, rbi));
    }
  }
  return out;
}

export function proposeMoves(result: PAResult, ctx: ProposalContext): RunnerMove[] {
  const b = ctx.bases;
  switch (result) {
    case '1B':
      return [move('batter', 1, 'hit'), ...advanceAll(b, 1, 'hit', true)];
    case '2B':
      return [move('batter', 2, 'hit'), ...advanceAll(b, 2, 'hit', true)];
    case '3B':
      return [move('batter', 3, 'hit'), ...advanceAll(b, 3, 'hit', true)];
    case 'HR':
      return [move('batter', 4, 'hit', true), ...advanceAll(b, 4, 'hit', true)];
    case 'BB':
    case 'IBB':
      return [move('batter', 1, 'walk'), ...forcedChain(b, 'forced', true)];
    case 'HBP':
      return [move('batter', 1, 'hbp'), ...forcedChain(b, 'forced', true)];
    case 'CI':
      return [move('batter', 1, 'other'), ...forcedChain(b, 'forced', true)];
    case 'K':
    case 'KL':
      return [move('batter', 'out', 'other')];
    case 'D3K':
      return [move('batter', 1, 'pb'), ...forcedChain(b, 'forced', false)];
    case 'GO': {
      // Out at first; forced runners move up. Runs on a forced chain are RBIs.
      return [move('batter', 'out', 'other'), ...forcedChain(b, 'forced', true)];
    }
    case 'FO':
    case 'LO':
    case 'PO':
    case 'OTHER_OUT':
      return [move('batter', 'out', 'other')];
    case 'SF':
      return [move('batter', 'out', 'sac'), ...(has(b, 3) ? [move(3, 4, 'sac', true)] : [])];
    case 'SAC':
      return [move('batter', 'out', 'sac'), ...advanceAll(b, 1, 'sac', true)];
    case 'FC': {
      // Batter safe at first; the lead forced runner is out; others move up.
      const out: RunnerMove[] = [move('batter', 1, 'fc')];
      if (has(b, 1) && has(b, 2) && has(b, 3)) {
        out.push(move(3, 'out', 'fc', ), move(2, 3, 'fc'), move(1, 2, 'fc'));
      } else if (has(b, 1) && has(b, 2)) {
        out.push(move(2, 'out', 'fc'), move(1, 2, 'fc'));
      } else if (has(b, 1)) {
        out.push(move(1, 'out', 'fc'));
      }
      return out;
    }
    case 'DP': {
      const out: RunnerMove[] = [move('batter', 'out', 'other')];
      if (has(b, 1)) out.push(move(1, 'out', 'other'));
      else if (has(b, 2)) out.push(move(2, 'out', 'other'));
      else if (has(b, 3)) out.push(move(3, 'out', 'other'));
      // Other runners move up one; a runner on third scores only if the inning is not over.
      if (has(b, 1) && has(b, 2)) out.push(move(2, 3, 'other'));
      if (has(b, 3) && has(b, 1) && ctx.outs === 0) out.push(move(3, 4, 'other'));
      return out;
    }
    case 'TP': {
      const out: RunnerMove[] = [move('batter', 'out', 'other')];
      for (const base of [1, 2, 3] as const) if (has(b, base) && out.length < 3) out.push(move(base, 'out', 'other'));
      return out;
    }
    case 'ROE':
      return [move('batter', 1, 'error'), ...forcedChain(b, 'error', false)];
    case 'OTHER_SAFE':
      return [move('batter', 1, 'other'), ...forcedChain(b, 'forced', true)];
  }
}

/** RBI count implied by a set of moves for a result (scorer may override). */
export function proposeRbi(result: PAResult, moves: RunnerMove[]): number {
  if (!RBI_RESULTS.has(result)) return 0;
  return moves.filter((m) => m.to === 4 && m.rbi).length;
}

/** Default moves for baserunning events between plate appearances. */
export function proposeBaserunning(kind: BaserunningKind, runnerBase: 1 | 2 | 3, ctx: ProposalContext): RunnerMove[] {
  const b = ctx.bases;
  const next = Math.min(4, runnerBase + 1) as Destination;
  switch (kind) {
    case 'SB':
      return [move(runnerBase, next, 'sb')];
    case 'CS':
      return [move(runnerBase, 'out', 'cs')];
    case 'PICKOFF':
      return [move(runnerBase, 'out', 'pickoff')];
    case 'PICKOFF_ERROR':
      return [move(runnerBase, next, 'error')];
    case 'WP':
      return advanceAll(b, 1, 'wp', false);
    case 'PB':
      return advanceAll(b, 1, 'pb', false);
    case 'BALK':
      return advanceAll(b, 1, 'balk', false);
    case 'ADV_ERROR':
      return [move(runnerBase, next, 'error')];
    case 'ADV_THROW':
      return [move(runnerBase, next, 'throw')];
    case 'ADV_OTHER':
      return [move(runnerBase, next, 'other')];
    case 'DEFENSIVE_INDIFFERENCE':
      return [move(runnerBase, next, 'other')];
    case 'OUT_OTHER':
      return [move(runnerBase, 'out', 'tag')];
    case 'PICKOFF_ATTEMPT':
    case 'BACK_PICK':
      return [];
  }
}

/** Quick preview of a move set: how many outs and runs it produces. */
export function previewMoves(moves: RunnerMove[]): { outs: number; runs: number } {
  return {
    outs: moves.filter((m) => m.to === 'out').length,
    runs: moves.filter((m) => m.to === 4).length
  };
}

/** Human label for a PA result. */
export const RESULT_LABEL: Record<PAResult, string> = {
  '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run',
  BB: 'Walk', IBB: 'Intentional walk', HBP: 'Hit by pitch',
  K: 'Strikeout', KL: 'Strikeout looking', D3K: 'Dropped 3rd strike, safe',
  GO: 'Groundout', FO: 'Flyout', LO: 'Lineout', PO: 'Pop-out',
  FC: "Fielder's choice", SAC: 'Sacrifice bunt', SF: 'Sacrifice fly',
  DP: 'Double play', TP: 'Triple play', ROE: 'Reached on error',
  CI: "Catcher's interference", OTHER_OUT: 'Other out', OTHER_SAFE: 'Other, safe'
};

/** Short scorebook abbreviation for a PA result, with fielding sequence when present. */
export function scorebookNotation(result: PAResult, sequence?: number[]): string {
  const seq = sequence && sequence.length ? sequence.join('-') : '';
  switch (result) {
    case 'GO': return seq || 'GO';
    case 'FO': return seq ? `F${seq}` : 'FO';
    case 'LO': return seq ? `L${seq}` : 'LO';
    case 'PO': return seq ? `P${seq}` : 'PO';
    case 'DP': return seq ? `${seq} DP` : 'DP';
    case 'TP': return seq ? `${seq} TP` : 'TP';
    case 'K': return 'K';
    case 'KL': return 'ꓘ';
    case 'ROE': return seq ? `E${seq}` : 'E';
    case 'SF': return seq ? `SF${seq}` : 'SF';
    case 'SAC': return seq ? `SAC ${seq}` : 'SAC';
    case 'FC': return seq ? `FC ${seq}` : 'FC';
    default: return result;
  }
}
