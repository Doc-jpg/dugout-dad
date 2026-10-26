import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useGame, useEvents, usePlayerMap, useTeams, useSettings, useOnline } from '../hooks';
import { appendEvent, undoLastEvent, insertEventAt, setGameStatus, db, playerName } from '../../db/db';
import { replayGame, currentBatter, type ReplayResult } from '../../engine/reducer';
import type { GameEvent, Side, Position, PlateAppearanceEvent, Half } from '../../engine/types';
import { POSITION_LABEL, nowIso, outsToInnings } from '../../engine/types';
import { scorebookNotation } from '../../engine/propose';
import { PAFlow, type PAPayload } from '../components/PAFlow';
import { BaserunningFlow, DefenseSheet, FixSheet, EndGameSheet, type BRPayload } from '../components/LiveSheets';
import { BasesWidget } from '../components/Diamond';
import { Sheet, useToast } from '../components/Sheet';

type Open = null | 'pa' | 'run' | 'defense' | 'fix' | 'end' | 'batter' | 'level';

export function LiveGamePage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);
  const events = useEvents(gameId);
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const online = useOnline();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [redo, setRedo] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState(false);
  // Which side's defense the Defense sheet edits (null = whoever is fielding now).
  const [defenseSide, setDefenseSide] = useState<Side | null>(null);

  const replay = useMemo(() => (game ? replayGame(game, events) : undefined), [game, events]);
  if (!game || !replay) return <div className="empty">Loading…</div>;

  const st = replay.state;
  const mySide = game.mySide;
  const battingSide: Side = st.half === 'top' ? 'away' : 'home';
  const fieldingSide: Side = battingSide === 'home' ? 'away' : 'home';
  const myTeam = teams.find((t) => t.id === game.teamId);
  const oppTeam = teams.find((t) => t.id === game.opponentTeamId);
  const nameOf = (side: Side) => (side === mySide ? myTeam?.shortName || myTeam?.name || 'Us' : oppTeam?.shortName || oppTeam?.name || 'Opponent');
  const teamIdOf = (side: Side) => (side === mySide ? game.teamId : game.opponentTeamId);
  const cb = currentBatter(replay);
  const pitcherId = st[fieldingSide].defense[1];
  const weAreBatting = battingSide === mySide;
  const oppScoreboardOnly = !weAreBatting && game.opponentScoringDepth === 'scoreboard_only';
  const lastEvent = events[events.length - 1];
  const lastDesc = lastEvent ? describeEvent(lastEvent, players) : null;
  const setupMissing = st[mySide].lineup.length === 0;

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast.show(`Could not save: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const savePA = (payload: PAPayload) =>
    guard(async () => {
      await appendEvent<PlateAppearanceEvent>(gameId, payload as any);
      setRedo([]);
      setOpen(null);
      const outs = payload.runners.filter((m) => m.to === 'out').length;
      const runs = payload.runners.filter((m) => m.to === 4).length;
      toast.show(`${scorebookNotation(payload.result, payload.fielding?.sequence)} saved${runs ? `, ${runs} run${runs > 1 ? 's' : ''}` : ''}${outs ? `, ${outs} out${outs > 1 ? 's' : ''}` : ''}`);
    });
  const saveBR = (payload: BRPayload) =>
    guard(async () => {
      await appendEvent(gameId, payload as any);
      setRedo([]);
      setOpen(null);
      toast.show('Saved');
    });
  const saveDefense = (changes: Array<{ position: Position; playerId: string | null }>, reason: 'substitution' | 'swap' | 'pitching_change') =>
    guard(async () => {
      await appendEvent(gameId, { type: 'defense_change', side: fieldingSideForDefense, changes, reason } as any);
      setOpen(null);
      toast.show(reason === 'pitching_change' ? 'Pitching change saved' : 'Defense updated');
    });
  const undo = () =>
    guard(async () => {
      const ev = await undoLastEvent(gameId);
      if (ev) {
        setRedo((r) => [...r, ev]);
        toast.show(`Undid: ${describeEvent(ev, players)}`);
      } else toast.show('Nothing to undo');
    });
  const redoLast = () =>
    guard(async () => {
      const ev = redo[redo.length - 1];
      if (!ev) return;
      await insertEventAt(ev, Number.MAX_SAFE_INTEGER);
      setRedo((r) => r.slice(0, -1));
      toast.show('Redone');
    });
  const endGame = (reason: Parameters<typeof setGameStatus>[2]) =>
    guard(async () => {
      await appendEvent(gameId, { type: 'game_end', reason } as any);
      await setGameStatus(gameId, 'final', reason);
      setOpen(null);
      nav(`/games/${gameId}`, { replace: true });
    });

  const fieldingSideForDefense: Side = defenseSide ?? fieldingSide;

  const fixActions = {
    adjustScore: (side: Side, runs: number, reason: string) => guard(async () => { await appendEvent(gameId, { type: 'score_adjustment', side, runs, reason } as any); toast.show('Score adjusted'); }),
    correctState: (p: { inning?: number; half?: Half; outs?: number; runners?: any; skippedPlays?: boolean; reason: string }) => guard(async () => { await appendEvent(gameId, { type: 'state_correction', ...p } as any); toast.show('Synced'); }),
    pitchCount: (side: Side, pid: string, count: number) => guard(async () => { await appendEvent(gameId, { type: 'pitch_count', side, pitcherId: pid, count, source: 'manual' } as any); toast.show('Pitch count saved'); }),
    addNote: (text: string, playerId?: string) => guard(async () => { await appendEvent(gameId, { type: 'note', text, playerId } as any); toast.show('Note saved'); }),
    endHalf: (credit: boolean) => guard(async () => { await appendEvent(gameId, { type: 'half_inning_end', creditMissingOuts: credit } as any); toast.show('Half-inning ended'); }),
    changeBatter: (side: Side, slot: number) => guard(async () => { await appendEvent(gameId, { type: 'state_correction', nextSlot: { side, slot }, reason: 'Changed batter' } as any); toast.show('Batter changed'); })
  };

  const inningLabel = `${st.half === 'top' ? 'Top' : 'Bot'} ${st.inning}`;
  const finalInning = st.inning >= game.rules.scheduledInnings;
  const homeLeadsAfterTop = st.half === 'bottom' && finalInning && st.home.runs > st.away.runs && st.outs === 0 && events.length > 0;
  const suggestEnd = (finalInning && st.half === 'top' && st.inning > game.rules.scheduledInnings) || homeLeadsAfterTop;

  return (
    <div className="live">
      <div className="row between">
        <Link to="/games" className="btn ghost sm">‹ Games</Link>
        <div className="row">
          {!online && <span className="pill">Offline, saving on device</span>}
          <Link to={`/games/${gameId}/log`} className="btn ghost sm">Log</Link>
          <button className="btn ghost sm" onClick={() => setOpen('level')}>{game.scoringLevel === 'A' ? 'Quick' : game.scoringLevel === 'B' ? 'Enhanced' : 'Full'}</button>
        </div>
      </div>

      <div className="scoreboard">
        <div className="sb-grid">
          <div className={`sb-team ${battingSide === 'away' ? 'batting' : ''}`}>
            <span className="name">{nameOf('away')}</span>
            <span className="runs num">{st.away.runs}</span>
            <span className="small muted">H {st.away.hits} · E {st.away.errors}</span>
          </div>
          <div className="sb-mid">
            <div className="inning">{inningLabel}</div>
            <div className="outs">
              {[0, 1, 2].map((i) => <span key={i} className={`out-dot ${st.outs > i ? 'on' : ''}`} />)}
            </div>
            <div className="label">{st.outs} out{st.outs === 1 ? '' : 's'}</div>
          </div>
          <div className={`sb-team right ${battingSide === 'home' ? 'batting' : ''}`}>
            <span className="name">{nameOf('home')}</span>
            <span className="runs num">{st.home.runs}</span>
            <span className="small muted">H {st.home.hits} · E {st.home.errors}</span>
          </div>
        </div>
      </div>

      {setupMissing && (
        <div className="banner warn row between">
          <span>Your lineup is not set.</span>
          <Link className="btn sm" to={`/games/${gameId}/lineup`}>Set lineups</Link>
        </div>
      )}
      {st.ended && <div className="banner info">This game is marked final. You can still fix plays from the Log.</div>}
      {suggestEnd && !st.ended && (
        <div className="banner info row between">
          <span>Looks like the game may be over.</span>
          <button className="btn sm" onClick={() => setOpen('end')}>End game</button>
        </div>
      )}

      <div className="card live-state">
        <div className="now">
          <div>
            <div className="label">At bat · {nameOf(battingSide)}</div>
            <button className="who" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpen('batter')}>
              {cb.slot ? `${cb.slot.slot}. ${playerName(players.get(cb.slot.playerId))}` : oppScoreboardOnly ? 'Scoreboard only' : 'Tap to pick batter'}
              <span className="muted"> ▾</span>
            </button>
          </div>
          <div>
            <div className="label">Pitching · {nameOf(fieldingSide)}</div>
            <div style={{ fontWeight: 600 }}>
              {pitcherId ? playerName(players.get(pitcherId)) : <span className="muted">not set</span>}
              {pitcherId && (() => { const l = replay.pitcherLines.find((x) => x.pitcherId === pitcherId); return l ? <span className="muted small"> · {outsToInnings(l.outs)} IP{l.pitches != null ? `, ${l.pitches} P` : ''}</span> : null; })()}
            </div>
          </div>
          {lastDesc && <div className="small muted">Last: {lastDesc}</div>}
        </div>
        <BasesWidget bases={st.bases} players={players} />
      </div>

      <div className="live-actions">
        <div className="btn-grid">
          <button className="btn primary lg" style={{ gridColumn: '1 / -1', minHeight: 72, fontSize: 20 }} disabled={st.ended || oppScoreboardOnly || !cb.slot} onClick={() => setOpen('pa')}>
            Record at-bat
            <span className="sub">hit · out · strikeout · walk · error</span>
          </button>
        </div>
        <div className="secondary-actions" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setOpen('run')} disabled={st.ended}>
            <span>Runner</span><span className="muted">SB · WP · PB</span>
          </button>
          <button className="btn" onClick={() => { setDefenseSide(fieldingSide); setOpen('defense'); }}>
            <span>Defense</span><span className="muted">subs · pitcher</span>
          </button>
          <button className="btn" onClick={() => setOpen('fix')}>
            <span>Fix</span><span className="muted">score · outs</span>
          </button>
          <button className="btn" onClick={undo} disabled={!events.length || busy}>
            <span>Undo</span><span className="muted">{redo.length ? `${redo.length} redo` : 'last play'}</span>
          </button>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          {redo.length > 0 && <button className="btn sm" onClick={redoLast}>Redo</button>}
          {weAreBatting && (
            <button className="btn sm" onClick={() => { setDefenseSide(mySide); setOpen('defense'); }}>Our defense for next half</button>
          )}
          <span className="grow" />
          <button className="btn sm" onClick={() => setOpen('end')} disabled={st.ended}>End game</button>
        </div>
      </div>

      {replay.warnings.length > 0 && (
        <details className="card small">
          <summary className="muted">{replay.warnings.length} note{replay.warnings.length > 1 ? 's' : ''} about this game's record</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {replay.warnings.slice(-8).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      {open === 'pa' && cb.slot && (
        <PAFlow
          replay={replay}
          side={battingSide}
          batter={{ playerId: cb.slot.playerId, slot: cb.slot.slot }}
          level={game.scoringLevel}
          players={players}
          onSave={savePA}
          onClose={() => setOpen(null)}
          onChangeBatter={() => setOpen('batter')}
        />
      )}
      {open === 'run' && <BaserunningFlow replay={replay} side={battingSide} players={players} onSave={saveBR} onClose={() => setOpen(null)} />}
      {open === 'defense' && (
        <DefenseSheet
          replay={replay}
          side={fieldingSideForDefense}
          teamId={teamIdOf(fieldingSideForDefense)}
          players={players}
          focusPlayerId={settings.focusPlayerId}
          onSave={saveDefense}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'fix' && <FixSheet replay={replay} players={players} teamNames={{ home: nameOf('home'), away: nameOf('away') }} actions={fixActions} onClose={() => setOpen(null)} />}
      {open === 'end' && <EndGameSheet onEnd={endGame} onClose={() => setOpen(null)} />}
      {open === 'batter' && (
        <Sheet title={`Who is up for ${nameOf(battingSide)}?`} onClose={() => setOpen(null)}>
          {st[battingSide].lineup.length === 0 ? (
            <div className="col">
              <p className="muted small">No batting order for this side yet.</p>
              <Link className="btn primary" to={`/games/${gameId}/lineup`}>Set the lineup</Link>
            </div>
          ) : (
            <div className="list">
              {st[battingSide].lineup.map((s) => (
                <button key={s.slot} className={`item tappable ${cb.slot?.slot === s.slot ? 'selected' : ''}`} style={{ textAlign: 'left' }} onClick={() => { fixActions.changeBatter(battingSide, s.slot); setOpen(null); }}>
                  <span className="num" style={{ width: 24, fontWeight: 800, color: 'var(--ink-3)' }}>{s.slot}</span>
                  <span className="grow">{playerName(players.get(s.playerId))}</span>
                  {cb.slot?.slot === s.slot && <span className="pill ok">up</span>}
                </button>
              ))}
              <Link className="btn sm" to={`/games/${gameId}/lineup`}>Edit lineups</Link>
            </div>
          )}
        </Sheet>
      )}
      {open === 'level' && (
        <Sheet title="Scoring depth" onClose={() => setOpen(null)}>
          <div className="col">
            {([['A', 'Quick', 'Result, outs, runs, runners, positions.'], ['B', 'Enhanced', 'Adds contact quality, hit location, fielding detail, pitch totals.'], ['C', 'Full', 'Adds pitch-by-pitch.']] as const).map(([lv, name, desc]) => (
              <button key={lv} className={`btn lg ${game.scoringLevel === lv ? 'selected' : ''}`} style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={async () => { await db.games.update(gameId, { scoringLevel: lv, updatedAt: nowIso() }); setOpen(null); }}>
                <span><strong>{name}</strong><br /><span className="muted small">{desc}</span></span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {toast.el}
    </div>
  );
}

/** One-line description of an event for logs and toasts. */
export function describeEvent(ev: GameEvent, players: Map<string, { firstName: string; lastName: string }>): string {
  const nm = (id?: string) => (id ? playerName(players.get(id) as any, 'short') : '?');
  switch (ev.type) {
    case 'plate_appearance': {
      const outs = ev.runners.filter((m) => m.to === 'out').length;
      const runs = ev.runners.filter((m) => m.to === 4).length;
      return `${nm(ev.batterId)}: ${scorebookNotation(ev.result, ev.fielding?.sequence)}${ev.battedBall?.hardness ? ` (${ev.battedBall.hardness}${ev.battedBall.trajectory ? ' ' + ev.battedBall.trajectory : ''})` : ''}${runs ? `, ${runs} R` : ''}${ev.rbi ? `, ${ev.rbi} RBI` : ''}${outs ? `, ${outs} out` : ''}`;
    }
    case 'baserunning':
      return `${ev.kind.replace('_', ' ')}: ${ev.runners.map((m) => `${nm(m.playerId) !== '?' ? nm(m.playerId) : 'runner on ' + m.from} to ${m.to === 4 ? 'home' : m.to}`).join(', ')}`;
    case 'defense_change':
      return `Defense: ${ev.changes.map((c) => `${POSITION_LABEL[c.position]} ${c.playerId ? nm(c.playerId) : 'empty'}`).join(', ')}`;
    case 'defense_set':
      return `Starting defense set (${ev.side})`;
    case 'lineup_set':
      return `Batting order set (${ev.side}, ${ev.slots.length})`;
    case 'lineup_change':
      return `${ev.kind.replace('_', ' ')}: ${nm(ev.playerId)} in slot ${ev.slot}`;
    case 'pitch_count':
      return `${nm(ev.pitcherId)} pitch count ${ev.count}`;
    case 'score_adjustment':
      return `Score adjusted ${ev.runs > 0 ? '+' : ''}${ev.runs} (${ev.side}): ${ev.reason}`;
    case 'state_correction':
      return `Correction: ${ev.reason}`;
    case 'half_inning_end':
      return `Half-inning ended manually${ev.creditMissingOuts ? ' (missed outs credited)' : ''}`;
    case 'game_end':
      return `Game ended (${ev.reason.replace('_', ' ')})`;
    case 'note':
      return `Note: ${ev.text}`;
    default:
      return (ev as any).type;
  }
}
