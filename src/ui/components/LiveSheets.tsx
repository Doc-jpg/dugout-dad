import React, { useState } from 'react';
import type { BaserunningKind, RunnerMove, Position, Player, Side, BaserunningEvent, Half, FieldingError, GameEndReason } from '../../engine/types';
import { POSITION_LABEL } from '../../engine/types';
import type { ReplayResult } from '../../engine/reducer';
import { proposeBaserunning } from '../../engine/propose';
import { Sheet } from './Sheet';
import { Diamond } from './Diamond';
import { RunnerReview } from './RunnerReview';
import { playerName } from '../../db/db';
import { usePlayers } from '../hooks';

// ---------------------------------------------------------------------------
// Baserunning between plate appearances
// ---------------------------------------------------------------------------

export type BRPayload = Omit<BaserunningEvent, 'id' | 'gameId' | 'seq' | 'ts'>;

const BR_KINDS: Array<{ v: BaserunningKind; l: string; perRunner: boolean }> = [
  { v: 'SB', l: 'Stolen base', perRunner: true },
  { v: 'CS', l: 'Caught stealing', perRunner: true },
  { v: 'PICKOFF', l: 'Picked off (out)', perRunner: true },
  { v: 'PICKOFF_ATTEMPT', l: 'Pickoff attempt (pitcher)', perRunner: true },
  { v: 'BACK_PICK', l: 'Back-pick (catcher)', perRunner: true },
  { v: 'WP', l: 'Wild pitch', perRunner: false },
  { v: 'PB', l: 'Passed ball', perRunner: false },
  { v: 'BALK', l: 'Balk', perRunner: false },
  { v: 'ADV_ERROR', l: 'Advance on error', perRunner: true },
  { v: 'ADV_THROW', l: 'Advance on throw', perRunner: true },
  { v: 'PICKOFF_ERROR', l: 'Pickoff error', perRunner: true },
  { v: 'DEFENSIVE_INDIFFERENCE', l: 'Defensive indifference', perRunner: true },
  { v: 'OUT_OTHER', l: 'Runner out (other)', perRunner: true },
  { v: 'ADV_OTHER', l: 'Other advance', perRunner: true }
];

export function BaserunningFlow({ replay, side, players, onSave, onClose, presetKinds }: { replay: ReplayResult; side: Side; players: Map<string, Player>; onSave: (p: BRPayload) => void; onClose: () => void; presetKinds?: BaserunningKind[] }) {
  const bases = replay.state.bases;
  const fieldingSide = side === 'home' ? 'away' : 'home';
  const defense = replay.state[fieldingSide].defense;
  const [kind, setKind] = useState<BaserunningKind | null>(null);
  const [runner, setRunner] = useState<1 | 2 | 3 | null>(null);
  const [moves, setMoves] = useState<RunnerMove[]>([]);
  const [sequence, setSequence] = useState<Position[]>([]);
  const [errorPos, setErrorPos] = useState<Position | null>(null);
  const [step, setStep] = useState<'kind' | 'runner' | 'review'>('kind');
  const runnersOn = ([3, 2, 1] as const).filter((b) => bases[b]);
  const kindDef = BR_KINDS.find((k) => k.v === kind);

  const chooseKind = (k: BaserunningKind) => {
    setKind(k);
    const def = BR_KINDS.find((x) => x.v === k)!;
    if (!def.perRunner) {
      setMoves(proposeBaserunning(k, 1, { bases, outs: replay.state.outs }));
      setStep('review');
    } else if (runnersOn.length === 1) {
      setRunner(runnersOn[0]);
      setMoves(proposeBaserunning(k, runnersOn[0], { bases, outs: replay.state.outs }));
      setStep('review');
    } else {
      setStep('runner');
    }
  };

  const needsError = kind === 'ADV_ERROR' || kind === 'PICKOFF_ERROR';
  const isAttempt = kind === 'PICKOFF_ATTEMPT' || kind === 'BACK_PICK';
  const save = () => {
    if (!kind) return;
    const errors: FieldingError[] = needsError && errorPos ? [{ position: errorPos, playerId: defense[errorPos], kind: 'throwing', official: true }] : [];
    onSave({ type: 'baserunning', side, kind, runners: moves, pitcherId: defense[1], catcherId: defense[2], targetBase: runner ?? undefined, fielding: sequence.length || errors.length ? { sequence, errors } : undefined });
  };

  return (
    <Sheet
      title={step === 'kind' ? 'Baserunning' : step === 'runner' ? `${kindDef?.l}: which runner?` : kindDef?.l ?? ''}
      onClose={onClose}
      onBack={step !== 'kind' ? () => setStep(step === 'review' && kindDef?.perRunner && runnersOn.length > 1 ? 'runner' : 'kind') : undefined}
      footer={
        step === 'review' ? (
          <button className="btn primary lg" onClick={save} disabled={needsError && !errorPos}>
            Confirm
          </button>
        ) : undefined
      }
    >
      {runnersOn.length === 0 && <div className="banner info">No runners on base. Use "Fix" to put a runner on if you missed a play.</div>}
      {step === 'kind' && (
        <div className="btn-grid">
          {BR_KINDS.filter((k) => !presetKinds || presetKinds.includes(k.v)).map((k) => (
            <button key={k.v} className="btn" onClick={() => chooseKind(k.v)} disabled={runnersOn.length === 0}>
              {k.l}
            </button>
          ))}
        </div>
      )}
      {step === 'runner' && (
        <div className="btn-grid">
          {runnersOn.map((b) => (
            <button
              key={b}
              className="btn"
              onClick={() => {
                setRunner(b);
                setMoves(proposeBaserunning(kind!, b, { bases, outs: replay.state.outs }));
                setStep('review');
              }}
            >
              {playerName(players.get(bases[b]!.playerId), 'short')} <span className="sub">on {b === 1 ? '1st' : b === 2 ? '2nd' : '3rd'}</span>
            </button>
          ))}
        </div>
      )}
      {step === 'review' && (
        <>
          {isAttempt && <div className="banner info">Logged as a throw to {runner === 1 ? 'first' : runner === 2 ? 'second' : 'third'} that did not get the runner. If a runner moved on the throw, set it below; if he was out, use "Picked off (out)" instead.</div>}
          <RunnerReview bases={bases} batter={null} hideBatter moves={moves} onChange={setMoves} players={players} outsBefore={replay.state.outs} />
          {(kind === 'CS' || kind === 'PICKOFF' || kind === 'OUT_OTHER') && (
            <div className="section">
              <h3 style={{ marginBottom: 6 }}>Fielders on the out (optional)</h3>
              <Diamond assignments={defense} players={players} sequence={sequence} onSelect={(p) => setSequence([...sequence, p])} showNames={false} />
              <div className="row between" style={{ marginTop: 6 }}>
                <span className="mono">{sequence.map((p) => POSITION_LABEL[p]).join('-') || '-'}</span>
                <button className="btn sm" onClick={() => setSequence(sequence.slice(0, -1))} disabled={!sequence.length}>
                  Remove last
                </button>
              </div>
            </div>
          )}
          {needsError && (
            <div className="section">
              <h3 style={{ marginBottom: 6 }}>Whose error?</h3>
              <Diamond assignments={defense} players={players} selected={errorPos} onSelect={setErrorPos} showNames={false} />
            </div>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>Runner: {runner ? playerName(players.get(bases[runner]!.playerId)) : 'all runners'}</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Defense changes (subs, swaps, pitching change)
// ---------------------------------------------------------------------------

export function DefenseSheet({
  replay,
  side,
  teamId,
  players,
  focusPlayerId,
  onSave,
  onClose
}: {
  replay: ReplayResult;
  side: Side; // fielding side being edited
  teamId: string;
  players: Map<string, Player>;
  focusPlayerId?: string;
  onSave: (changes: Array<{ position: Position; playerId: string | null }>, reason: 'substitution' | 'swap' | 'pitching_change') => void;
  onClose: () => void;
}) {
  const roster = usePlayers(teamId);
  const current = replay.state[side].defense;
  const lineup = replay.state[side].lineup;
  const [draft, setDraft] = useState<Partial<Record<Position, string>>>({ ...current });
  const [sel, setSel] = useState<Position | null>(null);

  const posOf = (pid: string) => Number(Object.entries(draft).find(([, id]) => id === pid)?.[0] ?? 0) as Position;
  const assign = (pos: Position, pid: string | null) => {
    const next = { ...draft };
    const prevHere = next[pos];
    const prevPosOfPid = pid ? posOf(pid) : 0;
    if (pid) {
      if (prevPosOfPid) delete next[prevPosOfPid];
      next[pos] = pid;
      // swap: the displaced player takes the mover's old spot when there was one
      if (prevHere && prevPosOfPid && prevHere !== pid) next[prevPosOfPid] = prevHere;
    } else delete next[pos];
    setDraft(next);
    setSel(null);
  };
  const changes: Array<{ position: Position; playerId: string | null }> = [];
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Position[]) {
    if ((draft[p] ?? null) !== (current[p] ?? null)) changes.push({ position: p, playerId: draft[p] ?? null });
  }
  const pitcherChanged = (draft[1] ?? null) !== (current[1] ?? null);
  const candidates = [
    ...lineup.map((s) => players.get(s.playerId)).filter((p): p is Player => !!p),
    ...roster.filter((p) => !lineup.some((s) => s.playerId === p.id) && p.status !== 'former')
  ];

  return (
    <Sheet
      title="Defense"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!changes.length} onClick={() => onSave(changes, pitcherChanged ? 'pitching_change' : changes.length === 2 ? 'swap' : 'substitution')}>
            Save {changes.length ? `(${changes.length})` : ''}
          </button>
        </>
      }
    >
      <p className="muted small">Tap a position, then the player. Picking a player already in the field swaps the two. Changes apply from now; earlier plays keep the old alignment.</p>
      <Diamond assignments={draft} players={players} selected={sel} onSelect={(p) => setSel(sel === p ? null : p)} focusPlayerId={focusPlayerId} />
      {sel && (
        <div className="section">
          <div className="row between">
            <h3>{POSITION_LABEL[sel]}</h3>
            <button className="btn sm" onClick={() => assign(sel, null)}>
              Leave empty
            </button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {candidates.map((p) => {
              const at = posOf(p.id);
              return (
                <button key={p.id} className={`chip ${draft[sel] === p.id ? 'on' : ''}`} onClick={() => assign(sel, p.id)}>
                  {p.number ? `#${p.number} ` : ''}
                  {playerName(p, 'short')}
                  {at ? ` (${POSITION_LABEL[at]})` : ' (bench)'}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {changes.length > 0 && (
        <div className="banner info" style={{ marginTop: 12 }}>
          {changes.map((c) => `${POSITION_LABEL[c.position]}: ${c.playerId ? playerName(players.get(c.playerId), 'short') : 'empty'}`).join(' · ')}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Fix: scoreboard and state corrections, pitch counts, notes
// ---------------------------------------------------------------------------

export interface FixActions {
  adjustScore: (side: Side, runs: number, reason: string) => void;
  correctState: (p: { inning?: number; half?: Half; outs?: number; runners?: { 1?: string | null; 2?: string | null; 3?: string | null }; skippedPlays?: boolean; reason: string }) => void;
  pitchCount: (side: Side, pitcherId: string, count: number) => void;
  addNote: (text: string, playerId?: string) => void;
  endHalf: (creditMissingOuts: boolean) => void;
  changeBatter: (side: Side, slot: number) => void;
}

export function FixSheet({ replay, players, teamNames, actions, onClose }: { replay: ReplayResult; players: Map<string, Player>; teamNames: Record<Side, string>; actions: FixActions; onClose: () => void }) {
  const st = replay.state;
  const [tab, setTab] = useState<'score' | 'state' | 'pitches' | 'note'>('score');
  const [runs, setRuns] = useState(1);
  const [runSide, setRunSide] = useState<Side>(st.half === 'top' ? 'away' : 'home');
  const [reason, setReason] = useState('Missed a play');
  const [inning, setInning] = useState(st.inning);
  const [half, setHalf] = useState<Half>(st.half);
  const [outs, setOuts] = useState(st.outs);
  const [runners, setRunners] = useState<{ 1?: string | null; 2?: string | null; 3?: string | null }>({ 1: st.bases[1]?.playerId ?? null, 2: st.bases[2]?.playerId ?? null, 3: st.bases[3]?.playerId ?? null });
  const [skipped, setSkipped] = useState(false);
  const [note, setNote] = useState('');
  const [count, setCount] = useState<string>('');
  const fieldingSide: Side = st.half === 'top' ? 'home' : 'away';
  const battingSide: Side = st.half === 'top' ? 'away' : 'home';
  const pitcherId = st[fieldingSide].defense[1];
  const battingLineup = st[battingSide].lineup;

  return (
    <Sheet title="Fix the record" onClose={onClose}>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === 'score' ? 'on' : ''}`} onClick={() => setTab('score')}>Score</button>
        <button className={`chip ${tab === 'state' ? 'on' : ''}`} onClick={() => setTab('state')}>Inning / outs / runners</button>
        <button className={`chip ${tab === 'pitches' ? 'on' : ''}`} onClick={() => setTab('pitches')}>Pitch count</button>
        <button className={`chip ${tab === 'note' ? 'on' : ''}`} onClick={() => setTab('note')}>Note</button>
      </div>

      {tab === 'score' && (
        <>
          <p className="muted small">Adds or removes runs on the scoreboard without inventing hits or RBIs. Use when you missed something.</p>
          <div className="chips" style={{ marginBottom: 8 }}>
            {(['away', 'home'] as Side[]).map((s) => (
              <button key={s} className={`chip ${runSide === s ? 'on' : ''}`} onClick={() => setRunSide(s)}>
                {teamNames[s]}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {[-2, -1, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`chip ${runs === n ? 'on' : ''}`} onClick={() => setRuns(n)}>
                {n > 0 ? `+${n}` : n}
              </button>
            ))}
          </div>
          <div className="field">
            <label>Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn primary block" onClick={() => { actions.adjustScore(runSide, runs, reason); onClose(); }}>
            Apply {runs > 0 ? `+${runs}` : runs} to {teamNames[runSide]}
          </button>
        </>
      )}

      {tab === 'state' && (
        <>
          <div className="inline-fields">
            <div className="field">
              <label>Inning</label>
              <select className="input" value={inning} onChange={(e) => setInning(parseInt(e.target.value, 10))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Half</label>
              <select className="input" value={half} onChange={(e) => setHalf(e.target.value as Half)}>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Outs</label>
            <div className="chips">
              {[0, 1, 2].map((n) => (
                <button key={n} className={`chip ${outs === n ? 'on' : ''}`} onClick={() => setOuts(n)}>{n}</button>
              ))}
            </div>
          </div>
          {([1, 2, 3] as const).map((b) => (
            <div className="field" key={b}>
              <label>Runner on {b === 1 ? '1st' : b === 2 ? '2nd' : '3rd'}</label>
              <select className="input" value={runners[b] ?? ''} onChange={(e) => setRunners({ ...runners, [b]: e.target.value || null })}>
                <option value="">Nobody</option>
                {battingLineup.map((s) => (
                  <option key={s.playerId} value={s.playerId}>{playerName(players.get(s.playerId))}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="switch">
            <span>Plays were skipped before this point</span>
            <input type="checkbox" checked={skipped} onChange={(e) => setSkipped(e.target.checked)} style={{ width: 24, height: 24 }} />
          </div>
          <div className="field">
            <label>Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn primary block" onClick={() => { actions.correctState({ inning, half, outs, runners, skippedPlays: skipped, reason }); onClose(); }}>
            Sync to scoreboard
          </button>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn grow" onClick={() => { actions.endHalf(true); onClose(); }}>
              End this half (credit missed outs)
            </button>
            <button className="btn grow" onClick={() => { actions.endHalf(false); onClose(); }}>
              End this half (no credit)
            </button>
          </div>
          <div className="section">
            <h3 style={{ marginBottom: 6 }}>Who is up for {teamNames[battingSide]}</h3>
            <div className="chips">
              {battingLineup.map((s) => (
                <button key={s.slot} className="chip sm" onClick={() => { actions.changeBatter(battingSide, s.slot); onClose(); }}>
                  {s.slot}. {playerName(players.get(s.playerId), 'short')}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'pitches' && (
        <>
          <p className="muted small">Enter the current pitcher's total pitches as observed (scoreboard or your own count). Never guessed from at-bats.</p>
          {pitcherId ? (
            <>
              <div className="field">
                <label>{playerName(players.get(pitcherId))}: pitches so far</label>
                <input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder={String(replay.pitcherLines.find((l) => l.pitcherId === pitcherId)?.pitches ?? '')} />
              </div>
              <button className="btn primary block" disabled={!count} onClick={() => { actions.pitchCount(fieldingSide, pitcherId, parseInt(count, 10)); onClose(); }}>
                Save pitch count
              </button>
            </>
          ) : (
            <div className="banner warn">No pitcher is set for the fielding team. Use Defense to set one.</div>
          )}
        </>
      )}

      {tab === 'note' && (
        <>
          <div className="field">
            <label>Note</label>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great play by the shortstop, coach pulled the pitcher early, etc." />
          </div>
          <button className="btn primary block" disabled={!note.trim()} onClick={() => { actions.addNote(note.trim()); onClose(); }}>
            Save note
          </button>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// End game
// ---------------------------------------------------------------------------

export function EndGameSheet({ onEnd, onClose }: { onEnd: (reason: GameEndReason) => void; onClose: () => void }) {
  const reasons: Array<[GameEndReason, string]> = [
    ['regulation', 'Regulation (all innings played)'],
    ['time_limit', 'Time limit'],
    ['mercy_rule', 'Mercy rule'],
    ['walk_off', 'Walk-off'],
    ['weather', 'Weather'],
    ['forfeit', 'Forfeit'],
    ['administrative', 'Administrative / other']
  ];
  return (
    <Sheet title="End game" onClose={onClose}>
      <p className="muted small">The game is saved on this device and can still be edited afterward.</p>
      <div className="col">
        {reasons.map(([r, l]) => (
          <button key={r} className="btn lg" onClick={() => onEnd(r)}>
            {l}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
