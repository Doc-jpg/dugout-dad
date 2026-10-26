import React from 'react';
import type { Position, Player } from '../../engine/types';
import { POSITION_LABEL } from '../../engine/types';
import { playerName } from '../../db/db';

/** Percent coordinates of each position on the diamond graphic (x right, y down). */
export const POS_XY: Record<Exclude<Position, 0>, { x: number; y: number }> = {
  1: { x: 50, y: 62 },
  2: { x: 50, y: 90 },
  3: { x: 76, y: 58 },
  4: { x: 65, y: 42 },
  5: { x: 24, y: 58 },
  6: { x: 35, y: 42 },
  7: { x: 16, y: 24 },
  8: { x: 50, y: 12 },
  9: { x: 84, y: 24 }
};

export const ALL_POSITIONS: Exclude<Position, 0>[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function DiamondBackdrop() {
  return (
    <svg viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden>
      <path d="M50 5 L98 45 Q50 100 2 45 Z" fill="var(--field)" />
      <path d="M50 46 L72 68 L50 90 L28 68 Z" fill="var(--dirt)" opacity=".9" />
      <path d="M50 52 L66 68 L50 84 L34 68 Z" fill="var(--field-2)" />
      <circle cx="50" cy="66" r="4" fill="var(--dirt)" />
      <rect x="48.5" y="86" width="3" height="3" fill="#fff" transform="rotate(45 50 87.5)" />
      <rect x="64.5" y="66.5" width="3" height="3" fill="#fff" transform="rotate(45 66 68)" />
      <rect x="48.5" y="50.5" width="3" height="3" fill="#fff" transform="rotate(45 50 52)" />
      <rect x="32.5" y="66.5" width="3" height="3" fill="#fff" transform="rotate(45 34 68)" />
    </svg>
  );
}

export interface DiamondProps {
  assignments: Partial<Record<Position, string>>;
  players: Map<string, Player>;
  selected?: Position | null;
  onSelect?: (pos: Exclude<Position, 0>) => void;
  focusPlayerId?: string;
  /** Highlight positions in a sequence (e.g., 6-3) with their order number. */
  sequence?: Position[];
  showNames?: boolean;
}

/** Tap-to-select diamond used for defensive alignment and fielding sequences. */
export function Diamond({ assignments, players, selected, onSelect, focusPlayerId, sequence, showNames = true }: DiamondProps) {
  return (
    <div className="diamond">
      <DiamondBackdrop />
      {ALL_POSITIONS.map((pos) => {
        const pid = assignments[pos];
        const p = pid ? players.get(pid) : undefined;
        const seqIdx = sequence ? sequence.indexOf(pos) : -1;
        const cls = ['pos'];
        if (!pid) cls.push('empty');
        if (selected === pos) cls.push('selected');
        if (focusPlayerId && pid === focusPlayerId) cls.push('focus');
        if (seqIdx >= 0) cls.push('pick');
        return (
          <button
            key={pos}
            type="button"
            className={cls.join(' ')}
            style={{ left: `${POS_XY[pos].x}%`, top: `${POS_XY[pos].y}%` }}
            onClick={() => onSelect?.(pos)}
          >
            <span className="abbr">
              {POSITION_LABEL[pos]}
              {seqIdx >= 0 && sequence && sequence.filter((s) => s === pos).length > 0 ? ` #${seqIdx + 1}` : ''}
            </span>
            {showNames && <span className="nm">{pid ? (p ? playerName(p, 'short') : '?') : 'tap'}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function BasesWidget({ bases, players }: { bases: { 1?: { playerId: string }; 2?: { playerId: string }; 3?: { playerId: string } }; players: Map<string, Player> }) {
  const nm = (b: 1 | 2 | 3) => {
    const r = bases[b];
    if (!r) return null;
    return playerName(players.get(r.playerId), 'short');
  };
  return (
    <div className="bases" aria-label="Runners">
      <div className={`base b2 ${bases[2] ? 'on' : ''}`} />
      <div className={`base b3 ${bases[3] ? 'on' : ''}`} />
      <div className={`base b1 ${bases[1] ? 'on' : ''}`} />
      <div className="base home" />
      {bases[2] && <span className="base-label" style={{ left: 0, right: 0, top: -4, textAlign: 'center', maxWidth: 'none' }}>{nm(2)}</span>}
      {bases[3] && <span className="base-label" style={{ left: -8, top: 76, maxWidth: 60 }}>{nm(3)}</span>}
      {bases[1] && <span className="base-label" style={{ right: -8, top: 76, maxWidth: 60, textAlign: 'right' }}>{nm(1)}</span>}
    </div>
  );
}
