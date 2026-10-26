import React from 'react';
import type { RunnerMove, Destination, Player } from '../../engine/types';
import type { Bases } from '../../engine/reducer';
import { playerName } from '../../db/db';

export interface RunnerReviewProps {
  bases: Bases;
  batter?: { playerId: string } | null;
  moves: RunnerMove[];
  onChange: (moves: RunnerMove[]) => void;
  players: Map<string, Player>;
  /** When true, the batter row is hidden (baserunning events). */
  hideBatter?: boolean;
  outsBefore: number;
}

const DEST_LABEL: Record<string, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: 'Home', out: 'Out' };

/**
 * Every runner (and the batter) gets one row of destination chips. "Stays" means no move.
 * Scoring runners get an RBI toggle and an "on error" toggle (affects earned runs).
 */
export function RunnerReview({ bases, batter, moves, onChange, players, hideBatter, outsBefore }: RunnerReviewProps) {
  const rows: Array<{ from: RunnerMove['from']; label: string; options: Destination[] }> = [];
  if (batter && !hideBatter) rows.push({ from: 'batter', label: `${playerName(players.get(batter.playerId), 'short')} (batter)`, options: [1, 2, 3, 4, 'out'] });
  for (const b of [3, 2, 1] as const) {
    const r = bases[b];
    if (!r) continue;
    const opts: Destination[] = [];
    for (let d = b + 1; d <= 4; d++) opts.push(d as Destination);
    opts.push('out');
    rows.push({ from: b, label: `${playerName(players.get(r.playerId), 'short')} on ${DEST_LABEL[b]}`, options: opts });
  }
  const moveFor = (from: RunnerMove['from']) => moves.find((m) => m.from === from);
  const setDest = (from: RunnerMove['from'], to: Destination | 'stay') => {
    const others = moves.filter((m) => m.from !== from);
    if (to === 'stay') return onChange(others);
    const prev = moveFor(from);
    const next: RunnerMove = { ...(prev ?? { from, to }), from, to };
    if (to === 4 && prev?.rbi == null) next.rbi = from === 'batter' ? true : prev?.rbi ?? true;
    if (to !== 4) delete next.rbi;
    if (to === 'out') {
      const outsSoFar = others.filter((m) => m.to === 'out').length;
      next.outNumber = outsSoFar + 1;
    } else delete next.outNumber;
    onChange([...others, next]);
  };
  const toggle = (from: RunnerMove['from'], key: 'rbi' | 'error') => {
    const m = moveFor(from);
    if (!m) return;
    const next = { ...m };
    if (key === 'rbi') next.rbi = !m.rbi;
    else next.how = m.how === 'error' ? 'other' : 'error';
    onChange(moves.map((x) => (x.from === from ? next : x)));
  };
  const totalOuts = outsBefore + moves.filter((m) => m.to === 'out').length;
  const dupBases = (() => {
    const seen = new Map<number, number>();
    for (const m of moves) if (typeof m.to === 'number' && m.to < 4) seen.set(m.to, (seen.get(m.to) ?? 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([b]) => DEST_LABEL[b]);
  })();
  // Runners who stay put but another runner is coming to their base
  const collisions = (() => {
    const out: string[] = [];
    for (const b of [1, 2, 3] as const) {
      if (!bases[b]) continue;
      const stays = !moveFor(b);
      if (stays && moves.some((m) => m.to === b)) out.push(DEST_LABEL[b]);
    }
    return out;
  })();

  return (
    <div className="col">
      {rows.map((row) => {
        const m = moveFor(row.from);
        return (
          <div key={String(row.from)} className="card" style={{ padding: 10 }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <strong>{row.label}</strong>
              {m?.to === 4 && (
                <span className="row">
                  <button className={`chip sm ${m.rbi ? 'on' : ''}`} onClick={() => toggle(row.from, 'rbi')}>
                    RBI
                  </button>
                  <button className={`chip sm ${m.how === 'error' ? 'on' : ''}`} onClick={() => toggle(row.from, 'error')} title="Scored because of an error (unearned)">
                    on E
                  </button>
                </span>
              )}
            </div>
            <div className="chips">
              {row.from !== 'batter' && (
                <button className={`chip ${!m ? 'on' : ''}`} onClick={() => setDest(row.from, 'stay')}>
                  Stays
                </button>
              )}
              {row.options.map((d) => (
                <button key={String(d)} className={`chip ${m?.to === d ? 'on' : ''}`} onClick={() => setDest(row.from, d)} style={d === 'out' ? { borderColor: 'var(--out)' } : undefined}>
                  {DEST_LABEL[String(d)]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <div className="muted small">No runners.</div>}
      {totalOuts > 3 && <div className="banner danger">That makes {totalOuts} outs this half-inning. Check the runners.</div>}
      {dupBases.length > 0 && <div className="banner warn">Two runners are headed to {dupBases.join(' and ')}.</div>}
      {collisions.length > 0 && <div className="banner warn">A runner is staying on {collisions.join(' and ')} while another runner is sent there.</div>}
    </div>
  );
}
