import React, { useMemo, useState } from 'react';
import type {
  PAResult, RunnerMove, Position, Trajectory, Hardness, FieldZone, ContactTag, FieldingRecord, FieldingError,
  BattedBall, Difficulty, Execution, Player, ScoringLevel, PlateAppearanceEvent, PitchDetail
} from '../../engine/types';
import { POSITION_LABEL } from '../../engine/types';
import type { ReplayResult } from '../../engine/reducer';
import { proposeMoves, proposeRbi, RESULT_LABEL } from '../../engine/propose';
import { Sheet } from './Sheet';
import { Diamond } from './Diamond';
import { FieldZonePicker, ZONE_LABEL } from './FieldZonePicker';
import { RunnerReview } from './RunnerReview';
import { playerName } from '../../db/db';

type Step = 'category' | 'hit' | 'out' | 'k' | 'walk' | 'error_pos' | 'error_kind' | 'fielders' | 'other' | 'detail' | 'review';

export type PAPayload = Omit<PlateAppearanceEvent, 'id' | 'gameId' | 'seq' | 'ts'>;

export interface PAFlowProps {
  replay: ReplayResult;
  side: 'home' | 'away';
  batter: { playerId: string; slot: number };
  level: ScoringLevel;
  players: Map<string, Player>;
  onSave: (payload: PAPayload) => void;
  onClose: () => void;
  initial?: PlateAppearanceEvent;
  onChangeBatter?: () => void;
  /** Open directly on a result (walk on ball four) or on a step (strikeout choices on strike three). */
  startResult?: PAResult;
  startStep?: 'k';
  /** Pitches already logged for this at-bat; when present the manual pitch chips are hidden. */
  loggedPitches?: number;
}

const TRAJ: Array<{ v: Trajectory; l: string }> = [
  { v: 'GB', l: 'Ground ball' },
  { v: 'LD', l: 'Line drive' },
  { v: 'FB', l: 'Fly ball' },
  { v: 'PU', l: 'Pop-up' },
  { v: 'BUNT', l: 'Bunt' }
];
const HARD: Array<{ v: Hardness; l: string }> = [
  { v: 'soft', l: 'Soft' },
  { v: 'medium', l: 'Medium' },
  { v: 'hard', l: 'Hard' }
];
const TAGS: Array<{ v: ContactTag; l: string }> = [
  { v: 'squared_up', l: 'Squared up' },
  { v: 'jammed', l: 'Jammed' },
  { v: 'off_end', l: 'Off the end' },
  { v: 'bloop', l: 'Bloop' },
  { v: 'through_infield', l: 'Through the infield' },
  { v: 'gap', l: 'Gap' },
  { v: 'deep_fly', l: 'Deep fly' },
  { v: 'warning_track', l: 'Warning track' },
  { v: 'off_fence', l: 'Off the fence' },
  { v: 'ground_rule', l: 'Ground-rule' },
  { v: 'over_fence', l: 'Over the fence' },
  { v: 'inside_park', l: 'Inside the park' },
  { v: 'routine', l: 'Routine' },
  { v: 'difficult_defensive_chance', l: 'Tough chance' }
];
const DIFF: Array<{ v: Difficulty; l: string }> = [
  { v: 'routine', l: 'Routine' },
  { v: 'moderate', l: 'Moderate' },
  { v: 'difficult', l: 'Difficult' },
  { v: 'exceptional', l: 'Exceptional' }
];
const EXEC: Array<{ v: Execution; l: string }> = [
  { v: 'made_expected', l: 'Made expected play' },
  { v: 'made_difficult', l: 'Made difficult play' },
  { v: 'missed_expected', l: 'Missed expected play' },
  { v: 'attempted_difficult', l: 'Attempted difficult play' },
  { v: 'no_realistic_play', l: 'No realistic play' },
  { v: 'uncertain', l: 'Uncertain' }
];

function implyTrajectory(result: PAResult): Trajectory | undefined {
  switch (result) {
    case 'GO': return 'GB';
    case 'FO': return 'FB';
    case 'LO': return 'LD';
    case 'PO': return 'PU';
    case 'SF': return 'FB';
    case 'SAC': return 'BUNT';
    default: return undefined;
  }
}

export function PAFlow({ replay, side, batter, level, players, onSave, onClose, initial, onChangeBatter, startResult, startStep, loggedPitches }: PAFlowProps) {
  const fieldingSide = side === 'home' ? 'away' : 'home';
  const defense = replay.state[fieldingSide].defense;
  const bases = replay.state.bases;
  const outs = replay.state.outs;

  const [step, setStep] = useState<Step>(initial ? 'review' : startResult ? 'review' : startStep ?? 'category');
  const [history, setHistory] = useState<Step[]>([]);
  const [result, setResult] = useState<PAResult | null>(initial?.result ?? startResult ?? null);
  const [moves, setMoves] = useState<RunnerMove[]>(initial?.runners ?? (startResult ? proposeMoves(startResult, { bases: replay.state.bases, outs: replay.state.outs }) : []));
  const [rbiOverride, setRbiOverride] = useState<number | null>(initial ? initial.rbi : null);
  const [batted, setBatted] = useState<BattedBall>(initial?.battedBall ?? {});
  const [sequence, setSequence] = useState<Position[]>(initial?.fielding?.sequence ?? []);
  const [errors, setErrors] = useState<FieldingError[]>(initial?.fielding?.errors ?? []);
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(initial?.fielding?.difficulty);
  const [execution, setExecution] = useState<Execution | undefined>(initial?.fielding?.execution);
  const [pitches, setPitches] = useState<PitchDetail | undefined>(initial?.pitches);
  const [qab, setQab] = useState<boolean | undefined>(initial?.qab);
  const [note, setNote] = useState(initial?.note ?? '');
  const [showDetail, setShowDetail] = useState(false);
  const [pendingErrorPos, setPendingErrorPos] = useState<Position | null>(null);

  const go = (next: Step) => {
    setHistory((h) => [...h, step]);
    setStep(next);
  };
  const back = () => {
    const h = [...history];
    const prev = h.pop();
    setHistory(h);
    if (prev) setStep(prev);
    else if (step === 'review') setStep('category'); // editing a saved play: Back goes to the choices, not out
    else onClose();
  };

  const pick = (r: PAResult, next: Step) => {
    setResult(r);
    const proposed = proposeMoves(r, { bases, outs });
    setMoves(proposed);
    setRbiOverride(null);
    const t = implyTrajectory(r);
    if (t && !batted.trajectory) setBatted((b) => ({ ...b, trajectory: t }));
    go(next);
  };

  const rbi = rbiOverride ?? (result ? proposeRbi(result, moves) : 0);
  const outsOnPlay = moves.filter((m) => m.to === 'out').length;
  const runs = moves.filter((m) => m.to === 4).length;

  const save = () => {
    if (!result) return;
    const fielding: FieldingRecord | undefined =
      sequence.length || errors.length || difficulty || execution ? { sequence, errors, difficulty, execution } : undefined;
    const battedBall = Object.keys(batted).length ? batted : undefined;
    const payload: PAPayload = {
      type: 'plate_appearance',
      side,
      slot: batter.slot,
      batterId: batter.playerId,
      pitcherId: defense[1],
      result,
      battedBall,
      fielding,
      runners: moves,
      pitches,
      rbi,
      qab,
      note: note.trim() || undefined
    };
    onSave(payload);
  };

  const title = (() => {
    const who = playerName(players.get(batter.playerId), 'short');
    switch (step) {
      case 'category': return `${who}: what happened?`;
      case 'hit': return 'Hit';
      case 'out': return 'Out';
      case 'k': return 'Strikeout';
      case 'walk': return 'Walk';
      case 'error_pos': return 'Error: which fielder?';
      case 'error_kind': return 'Error type';
      case 'fielders': return 'Who made the play?';
      case 'other': return 'Other result';
      case 'detail': return 'Contact detail (optional)';
      case 'review': return result ? RESULT_LABEL[result] : 'Review';
    }
  })();

  const footer = step === 'review' ? (
    <>
      <button className="btn" onClick={back}>
        Back
      </button>
      <button className="btn primary lg" onClick={save}>
        Confirm{outsOnPlay ? ` · ${outsOnPlay} out${outsOnPlay > 1 ? 's' : ''}` : ''}{runs ? ` · ${runs} run${runs > 1 ? 's' : ''}` : ''}
      </button>
    </>
  ) : step === 'detail' || step === 'fielders' ? (
    <>
      <button className="btn" onClick={() => go('review')}>
        Skip
      </button>
      <button className="btn primary" onClick={() => go('review')}>
        Next
      </button>
    </>
  ) : undefined;

  const detailBlock = (
    <>
      <h3 style={{ margin: '8px 0 6px' }}>Batted ball</h3>
      <div className="chips">
        {TRAJ.map((t) => (
          <button key={t.v} className={`chip ${batted.trajectory === t.v ? 'on' : ''}`} onClick={() => setBatted({ ...batted, trajectory: batted.trajectory === t.v ? undefined : t.v })}>
            {t.l}
          </button>
        ))}
      </div>
      <h3 style={{ margin: '12px 0 6px' }}>Contact (observed, not measured)</h3>
      <div className="chips">
        {HARD.map((h) => (
          <button key={h.v} className={`chip ${batted.hardness === h.v ? 'on' : ''}`} onClick={() => setBatted({ ...batted, hardness: batted.hardness === h.v ? undefined : h.v })}>
            {h.l}
          </button>
        ))}
        <button className={`chip ${!batted.hardness ? 'on' : ''}`} onClick={() => setBatted({ ...batted, hardness: undefined })}>
          Unknown
        </button>
      </div>
      <h3 style={{ margin: '12px 0 6px' }}>Where {batted.zone ? `· ${ZONE_LABEL[batted.zone]}` : '(tap the field)'}</h3>
      <FieldZonePicker zone={batted.zone} point={batted.point} onPick={(z, pt) => setBatted({ ...batted, zone: z, point: pt })} />
      <h3 style={{ margin: '12px 0 6px' }}>Tags</h3>
      <div className="chips">
        {TAGS.map((t) => {
          const on = batted.tags?.includes(t.v);
          return (
            <button key={t.v} className={`chip sm ${on ? 'on' : ''}`} onClick={() => setBatted({ ...batted, tags: on ? batted.tags!.filter((x) => x !== t.v) : [...(batted.tags ?? []), t.v] })}>
              {t.l}
            </button>
          );
        })}
      </div>
    </>
  );

  const fieldersBlock = (
    <>
      <p className="muted small">Tap fielders in order (6 then 3 for a 6-3 groundout; just 8 for a fly to center).</p>
      <Diamond assignments={defense} players={players} sequence={sequence} onSelect={(p) => setSequence([...sequence, p])} />
      <div className="row between" style={{ marginTop: 8 }}>
        <strong className="mono">{sequence.length ? sequence.map((p) => POSITION_LABEL[p]).join(' - ') : 'No fielders yet'}</strong>
        <button className="btn sm" onClick={() => setSequence(sequence.slice(0, -1))} disabled={!sequence.length}>
          Remove last
        </button>
      </div>
      {level !== 'A' && (
        <>
          <h3 style={{ margin: '12px 0 6px' }}>How hard was the play? (optional)</h3>
          <div className="chips">
            {DIFF.map((d) => (
              <button key={d.v} className={`chip ${difficulty === d.v ? 'on' : ''}`} onClick={() => setDifficulty(difficulty === d.v ? undefined : d.v)}>
                {d.l}
              </button>
            ))}
          </div>
          <h3 style={{ margin: '12px 0 6px' }}>Execution (optional)</h3>
          <div className="chips">
            {EXEC.map((d) => (
              <button key={d.v} className={`chip sm ${execution === d.v ? 'on' : ''}`} onClick={() => setExecution(execution === d.v ? undefined : d.v)}>
                {d.l}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <Sheet title={title} onClose={onClose} onBack={step !== 'category' ? back : undefined} footer={footer}>
      {step === 'category' && (
        <>
          <div className="btn-grid">
            <button className="btn hit" onClick={() => go('hit')}>
              Hit
            </button>
            <button className="btn out" onClick={() => go('out')}>
              Out
            </button>
            <button className="btn out" onClick={() => go('k')}>
              Strikeout
            </button>
            <button className="btn walk" onClick={() => go('walk')}>
              Walk
            </button>
            <button className="btn walk" onClick={() => pick('HBP', 'review')}>
              Hit by pitch
            </button>
            <button className="btn err" onClick={() => go('error_pos')}>
              Reached on error
            </button>
            <button className="btn" onClick={() => pick('FC', 'fielders')}>
              Fielder's choice
            </button>
            <button className="btn" onClick={() => go('other')}>
              Other
            </button>
          </div>
          {onChangeBatter && (
            <button className="btn ghost block sm" style={{ marginTop: 12 }} onClick={onChangeBatter}>
              Wrong batter? Change who is up
            </button>
          )}
        </>
      )}

      {step === 'hit' && (
        <div className="btn-grid">
          {(['1B', '2B', '3B', 'HR'] as PAResult[]).map((r) => (
            <button key={r} className="btn hit" onClick={() => pick(r, level === 'A' ? 'review' : 'detail')}>
              {RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {step === 'out' && (
        <div className="btn-grid">
          {(['GO', 'FO', 'LO', 'PO', 'SF', 'SAC', 'DP', 'TP', 'OTHER_OUT'] as PAResult[]).map((r) => (
            <button key={r} className="btn out" onClick={() => pick(r, 'fielders')}>
              {RESULT_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      {step === 'k' && (
        <div className="btn-grid">
          <button className="btn out" onClick={() => pick('K', 'review')}>
            Swinging
          </button>
          <button className="btn out" onClick={() => pick('KL', 'review')}>
            Looking
          </button>
          <button className="btn out" onClick={() => pick('K', 'review')}>
            Unspecified
          </button>
          <button className="btn" onClick={() => pick('D3K', 'review')}>
            Dropped 3rd strike, batter safe
          </button>
        </div>
      )}

      {step === 'walk' && (
        <div className="btn-grid">
          <button className="btn walk" onClick={() => pick('BB', 'review')}>
            Walk
          </button>
          <button className="btn walk" onClick={() => pick('IBB', 'review')}>
            Intentional walk
          </button>
        </div>
      )}

      {step === 'other' && (
        <div className="btn-grid">
          <button className="btn" onClick={() => pick('CI', 'review')}>
            Catcher's interference
          </button>
          <button className="btn" onClick={() => pick('OTHER_SAFE', 'review')}>
            Safe, other
          </button>
          <button className="btn out" onClick={() => pick('OTHER_OUT', 'review')}>
            Out, other
          </button>
        </div>
      )}

      {step === 'error_pos' && (
        <>
          <p className="muted small">Tap the fielder who made the error.</p>
          <Diamond
            assignments={defense}
            players={players}
            selected={pendingErrorPos}
            onSelect={(p) => {
              setPendingErrorPos(p);
              go('error_kind');
            }}
          />
        </>
      )}

      {step === 'error_kind' && pendingErrorPos && (
        <>
          <div className="btn-grid">
            {(
              [
                ['fielding', 'Fielding error'],
                ['throwing', 'Throwing error'],
                ['dropped_throw', 'Dropped throw'],
                ['missed_catch', 'Missed catch']
              ] as Array<[FieldingError['kind'], string]>
            ).map(([k, l]) => (
              <button
                key={k}
                className="btn err"
                onClick={() => {
                  setErrors([{ position: pendingErrorPos, playerId: defense[pendingErrorPos], kind: k, official: true }]);
                  setSequence([pendingErrorPos]);
                  pick('ROE', level === 'A' ? 'review' : 'detail');
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <h3 style={{ margin: '14px 0 6px' }}>How hard was it? (optional)</h3>
          <div className="chips">
            {DIFF.map((d) => (
              <button key={d.v} className={`chip ${difficulty === d.v ? 'on' : ''}`} onClick={() => setDifficulty(difficulty === d.v ? undefined : d.v)}>
                {d.l}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            A failed difficult play is not automatically an error. If you want the play recorded without an official error, pick a result under Out or Hit and tag the chance there.
          </p>
        </>
      )}

      {step === 'fielders' && fieldersBlock}

      {step === 'detail' && detailBlock}

      {step === 'review' && result && (
        <>
          {errors.length > 0 && (
            <div className="banner warn row between">
              <span>
                Error on {POSITION_LABEL[errors[0].position]} ({errors[0].kind.replace('_', ' ')})
                {difficulty ? `, ${difficulty}` : ''}
              </span>
              <button className={`chip sm ${errors[0].official ? 'on' : ''}`} onClick={() => setErrors([{ ...errors[0], official: !errors[0].official }])}>
                {errors[0].official ? 'Official E' : 'Not official'}
              </button>
            </div>
          )}
          {sequence.length > 0 && errors.length === 0 && (
            <div className="banner info row between">
              <span className="mono">Play: {sequence.map((p) => POSITION_LABEL[p]).join('-')}</span>
              <button className="btn sm ghost" onClick={() => go('fielders')}>
                Edit
              </button>
            </div>
          )}
          <h3 style={{ margin: '4px 0 8px' }}>Runners</h3>
          <RunnerReview bases={bases} batter={batter} moves={moves} onChange={(m) => { setMoves(m); setRbiOverride(null); }} players={players} outsBefore={outs} />

          <div className="row between" style={{ marginTop: 12 }}>
            <strong>RBI</strong>
            <div className="chips">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} className={`chip sm ${rbi === n ? 'on' : ''}`} onClick={() => setRbiOverride(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {loggedPitches ? (
            <div className="banner info" style={{ marginTop: 12 }}>{loggedPitches} pitch{loggedPitches === 1 ? '' : 'es'} logged before this one{finalPitchNote(result)}.</div>
          ) : level !== 'A' && (
            <div className="row between" style={{ marginTop: 12 }}>
              <strong>Pitches in this at-bat</strong>
              <div className="chips">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button key={n} className={`chip sm ${pitches?.total === n ? 'on' : ''}`} onClick={() => setPitches(pitches?.total === n ? undefined : { ...(pitches ?? {}), total: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="row between" style={{ marginTop: 12 }}>
            <strong>Quality at-bat</strong>
            <div className="chips">
              <button className={`chip sm ${qab === true ? 'on' : ''}`} onClick={() => setQab(qab === true ? undefined : true)}>
                Yes
              </button>
              <button className={`chip sm ${qab === false ? 'on' : ''}`} onClick={() => setQab(qab === false ? undefined : false)}>
                No
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {!showDetail && !batted.zone && !batted.hardness && (
              <button className="btn block sm" onClick={() => setShowDetail(true)}>
                + Add contact detail (where, how hard)
              </button>
            )}
            {(showDetail || batted.zone || batted.hardness) && (
              <div className="card">
                {detailBlock}
              </div>
            )}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Note (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great at-bat, missed cutoff, etc." />
          </div>
        </>
      )}
    </Sheet>
  );
}

function finalPitchNote(result: PAResult): string {
  switch (result) {
    case 'BB': return ', plus ball four';
    case 'IBB': return ', no pitch for the intentional walk';
    case 'HBP': return ', plus the pitch that hit him';
    case 'K': case 'KL': case 'D3K': return ', plus strike three';
    default: return ', plus the ball in play (a strike)';
  }
}

function PitchByPitch({ pitches, onChange }: { pitches?: PitchDetail; onChange: (p: PitchDetail | undefined) => void }) {
  const list = pitches?.pitches ?? [];
  const add = (result: NonNullable<PitchDetail['pitches']>[number]['result']) => {
    const next = [...list, { result }];
    const balls = next.filter((p) => p.result === 'ball').length;
    const strikes = next.filter((p) => p.result !== 'ball' && p.result !== 'in_play' && p.result !== 'hbp').length;
    onChange({ ...(pitches ?? {}), pitches: next, total: next.length, balls, strikes: Math.min(strikes, 3), firstPitchStrike: next[0].result !== 'ball' && next[0].result !== 'hbp' });
  };
  const undo = () => {
    const next = list.slice(0, -1);
    onChange(next.length ? { ...(pitches ?? {}), pitches: next, total: next.length } : undefined);
  };
  return (
    <div className="card" style={{ marginTop: 12, padding: 10 }}>
      <div className="row between">
        <strong>Pitch by pitch</strong>
        <span className="mono">{list.map((p) => ({ ball: 'B', called_strike: 'C', swinging_strike: 'S', foul: 'F', in_play: 'X', hbp: 'H', foul_tip: 'T', other: '?' })[p.result]).join(' ') || '-'}</span>
      </div>
      <div className="btn-grid cols-3" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => add('ball')}>Ball</button>
        <button className="btn sm" onClick={() => add('called_strike')}>Called K</button>
        <button className="btn sm" onClick={() => add('swinging_strike')}>Swing K</button>
        <button className="btn sm" onClick={() => add('foul')}>Foul</button>
        <button className="btn sm" onClick={() => add('in_play')}>In play</button>
        <button className="btn sm ghost" onClick={undo} disabled={!list.length}>Undo pitch</button>
      </div>
    </div>
  );
}
