import React, { useState } from 'react';
import type { Player } from '../../engine/types';
import { updatePlayer, playerName } from '../../db/db';
import { Sheet } from './Sheet';

/** Fill in what you learn during the game: name, number, bats, throws. Works for either team. */
export function PlayerQuickEdit({ player, onClose }: { player: Player; onClose: () => void }) {
  const [first, setFirst] = useState(player.firstName);
  const [last, setLast] = useState(player.isPlaceholder ? '' : player.lastName);
  const [number, setNumber] = useState(player.number ?? '');
  const [bats, setBats] = useState<Player['bats'] | ''>(player.bats ?? '');
  const [throws, setThrows] = useState<Player['throws'] | ''>(player.throws ?? '');
  const save = async () => {
    const hasName = !!(first.trim() || last.trim());
    await updatePlayer(player.id, {
      firstName: first.trim(),
      lastName: hasName ? last.trim() : player.lastName,
      number: number.trim() || undefined,
      bats: bats || undefined,
      throws: throws || undefined,
      isPlaceholder: hasName ? false : player.isPlaceholder
    });
    onClose();
  };
  return (
    <Sheet
      title={`Edit ${playerName(player)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="inline-fields">
        <div className="field"><label>First name</label><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div className="field"><label>Last name</label><input className="input" value={last} onChange={(e) => setLast(e.target.value)} placeholder={player.isPlaceholder ? player.lastName : ''} /></div>
      </div>
      <div className="field"><label>Number</label><input className="input" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      <div className="field">
        <label>Bats</label>
        <div className="chips">
          {([['R', 'Right'], ['L', 'Left'], ['S', 'Switch'], ['', 'Unknown']] as const).map(([v, l]) => (
            <button key={v} className={`chip ${bats === v ? 'on' : ''}`} onClick={() => setBats(v as any)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Throws</label>
        <div className="chips">
          {([['R', 'Right'], ['L', 'Left'], ['', 'Unknown']] as const).map(([v, l]) => (
            <button key={v} className={`chip ${throws === v ? 'on' : ''}`} onClick={() => setThrows(v as any)}>{l}</button>
          ))}
        </div>
      </div>
      <p className="muted small">Every play already recorded for this player stays attached; only the label changes.</p>
    </Sheet>
  );
}

export function handLabel(p?: Player | null, role: 'pitcher' | 'batter' = 'batter'): string {
  if (!p) return '';
  if (role === 'pitcher') return p.throws ? `${p.throws}HP` : '';
  return p.bats ? `bats ${p.bats}` : '';
}
