import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useGame, useEvents, usePlayerMap, useTeams, useSettings, fmtDate, fmt3, fmt2 } from '../hooks';
import { replayGame } from '../../engine/reducer';
import { boxScore, type BattingLine, type PitchingLine } from '../../engine/stats';
import { POSITION_LABEL, outsToInnings, nowIso } from '../../engine/types';
import type { Side } from '../../engine/types';
import { db, deleteGame, playerName, appendEvent } from '../../db/db';
import { StatsTable, type Column } from '../components/StatsTable';
import { Confirm, useToast } from '../components/Sheet';

export function GameSummaryPage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);
  const events = useEvents(gameId);
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const nav = useNavigate();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const [reopen, setReopen] = useState(false);
  const replay = useMemo(() => (game ? replayGame(game, events) : undefined), [game, events]);
  const box = useMemo(() => (replay ? boxScore(replay, game?.rules.eraInnings ?? 7, settings.qab) : undefined), [replay, game, settings.qab]);
  if (!game || !replay || !box) return <div className="empty">Loading…</div>;

  const nameOf = (side: Side) => {
    const id = side === game.mySide ? game.teamId : game.opponentTeamId;
    return teams.find((t) => t.id === id)?.shortName ?? teams.find((t) => t.id === id)?.name ?? '?';
  };
  const innings = Math.max(box.linescore.away.length, box.linescore.home.length, game.rules.scheduledInnings);
  const pn = (id: string) => playerName(players.get(id), 'short');

  const battingCols: Column<BattingLine>[] = [
    { key: 'name', label: 'Batter', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'pa', label: 'PA', value: (r) => r.pa },
    { key: 'ab', label: 'AB', value: (r) => r.ab },
    { key: 'r', label: 'R', value: (r) => r.r },
    { key: 'h', label: 'H', value: (r) => r.h },
    { key: 'xbh', label: 'XBH', value: (r) => r.xbh },
    { key: 'hr', label: 'HR', value: (r) => r.hr },
    { key: 'rbi', label: 'RBI', value: (r) => r.rbi },
    { key: 'bb', label: 'BB', value: (r) => r.bb },
    { key: 'so', label: 'SO', value: (r) => r.so },
    { key: 'sb', label: 'SB', value: (r) => r.sb },
    { key: 'roe', label: 'ROE', value: (r) => r.roe },
    { key: 'avg', label: 'AVG', value: (r) => r.avg, format: (v) => fmt3(v as number) },
    { key: 'obp', label: 'OBP', value: (r) => r.obp, format: (v) => fmt3(v as number) },
    { key: 'hard', label: 'Hard', title: 'Hard-hit balls (observed)', value: (r) => (r.hardnessKnown ? r.hard : null) }
  ];
  const pitchingCols: Column<PitchingLine>[] = [
    { key: 'name', label: 'Pitcher', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'ip', label: 'IP', value: (r) => r.outs, format: (v) => outsToInnings(v as number) },
    { key: 'bf', label: 'BF', value: (r) => r.bf },
    { key: 'h', label: 'H', value: (r) => r.h },
    { key: 'r', label: 'R', value: (r) => r.r },
    { key: 'er', label: 'ER', value: (r) => r.er, format: (v, r) => `${v}${r.erBasis === 'assumed_no_errors' ? '*' : ''}` },
    { key: 'bb', label: 'BB', value: (r) => r.bb },
    { key: 'so', label: 'SO', value: (r) => r.so },
    { key: 'hbp', label: 'HBP', value: (r) => r.hbp },
    { key: 'p', label: 'P', title: 'Pitches (manual or pitch-by-pitch); blank when unknown', value: (r) => r.pitches },
    { key: 'whip', label: 'WHIP', value: (r) => r.whip, format: (v) => fmt2(v as number), lowerIsBetter: true }
  ];

  const mySideRuns = game.mySide === 'home' ? box.linescore.homeRuns : box.linescore.awayRuns;
  const oppRuns = game.mySide === 'home' ? box.linescore.awayRuns : box.linescore.homeRuns;
  const defenseMine = box.defense.filter((d) => d.side === game.mySide);
  const byPlayer = new Map<string, Array<{ position: number; outs: number }>>();
  for (const d of defenseMine) {
    const arr = byPlayer.get(d.playerId) ?? [];
    arr.push({ position: d.position, outs: d.outs });
    byPlayer.set(d.playerId, arr);
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <Link to="/games" className="btn ghost sm">‹ Games</Link>
        <div className="row">
          <Link to={`/games/${gameId}/log`} className="btn sm">Play log</Link>
          {game.status === 'final' ? <button className="btn sm" onClick={() => setReopen(true)}>Reopen</button> : <Link to={`/games/${gameId}/live`} className="btn sm primary">Continue scoring</Link>}
        </div>
      </div>
      <h1>{mySideRuns > oppRuns ? 'Win' : mySideRuns < oppRuns ? 'Loss' : 'Tie'} {mySideRuns}-{oppRuns} vs {nameOf(game.mySide === 'home' ? 'away' : 'home')}</h1>
      <p className="muted small">{fmtDate(game.date)}{game.time ? ` ${game.time}` : ''}{game.venue ? ` · ${game.venue}` : ''} · {game.status === 'final' ? `Final (${(game.endReason ?? 'regulation').replace('_', ' ')})` : 'In progress'}{!game.lastExportedAt && game.status === 'final' ? ' · not exported yet' : ''}</p>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="stats">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}></th>
              {Array.from({ length: innings }, (_, i) => <th key={i}>{i + 1}</th>)}
              <th>R</th><th>H</th><th>E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as Side[]).map((s) => (
              <tr key={s}>
                <td>{nameOf(s)}</td>
                {Array.from({ length: innings }, (_, i) => <td key={i}>{box.linescore[s][i] ?? ''}</td>)}
                <td><strong>{s === 'away' ? box.linescore.awayRuns : box.linescore.homeRuns}</strong></td>
                <td>{s === 'away' ? box.linescore.awayHits : box.linescore.homeHits}</td>
                <td>{s === 'away' ? box.linescore.awayErrors : box.linescore.homeErrors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(box.skippedPlays || box.scoreAdjustments.length > 0) && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          This record is incomplete: {box.skippedPlays ? 'some plays were skipped' : ''}{box.skippedPlays && box.scoreAdjustments.length ? '; ' : ''}{box.scoreAdjustments.length ? `${box.scoreAdjustments.length} manual score adjustment${box.scoreAdjustments.length > 1 ? 's' : ''}` : ''}. Totals below reflect only what was recorded.
        </div>
      )}

      {(['away', 'home'] as Side[]).map((s) => (
        <div key={s} className="section">
          <div className="section-title"><h3>{nameOf(s)} batting</h3></div>
          <StatsTable rows={box.batting[s]} columns={battingCols} rowKey={(r) => r.playerId} highlight={(r) => r.playerId === settings.focusPlayerId} emptyText="No at-bats recorded." />
          <div className="section-title"><h3>{nameOf(s === 'away' ? 'home' : 'away')} pitching</h3></div>
          <StatsTable rows={box.pitching[s === 'away' ? 'home' : 'away']} columns={pitchingCols} rowKey={(r) => r.playerId} highlight={(r) => r.playerId === settings.focusPlayerId} emptyText="No pitching recorded." />
        </div>
      ))}
      <p className="muted small">* earned runs assume no unrecorded errors (quick scoring without fielding detail).</p>

      <div className="section">
        <div className="section-title"><h3>{nameOf(game.mySide)} defensive innings</h3></div>
        <div className="list">
          {[...byPlayer.entries()].sort((a, b) => b[1].reduce((x, y) => x + y.outs, 0) - a[1].reduce((x, y) => x + y.outs, 0)).map(([pid, arr]) => (
            <div key={pid} className={`item ${pid === settings.focusPlayerId ? 'focus' : ''}`} style={{ minHeight: 44 }}>
              <span className="grow title">{pn(pid)}</span>
              <span className="small">{arr.sort((a, b) => b.outs - a.outs).map((x) => `${POSITION_LABEL[x.position as 1]} ${outsToInnings(x.outs)}`).join(' · ')}</span>
              <span className="pill">{outsToInnings(arr.reduce((x, y) => x + y.outs, 0))}</span>
            </div>
          ))}
          {byPlayer.size === 0 && <div className="empty">No defensive assignments recorded.</div>}
        </div>
      </div>

      {box.warnings.length > 0 && (
        <details className="card small" style={{ marginTop: 12 }}>
          <summary className="muted">{box.warnings.length} record note{box.warnings.length > 1 ? 's' : ''}</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{box.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => setDel(true)}>Delete game</button>
      </div>

      {del && <Confirm title="Delete this game?" text="All plays for this game are removed from this device. If it was exported, the archive still has it." danger yesLabel="Delete" onNo={() => setDel(false)} onYes={async () => { await deleteGame(gameId); nav('/games'); }} />}
      {reopen && (
        <Confirm
          title="Reopen this game?"
          text="The game goes back to in-progress so you can keep scoring. The game-end marker is removed."
          yesLabel="Reopen"
          onNo={() => setReopen(false)}
          onYes={async () => {
            const end = events.filter((e) => e.type === 'game_end');
            for (const e of end) await (await import('../../db/db')).deleteEvent(e.id);
            await db.games.update(gameId, { status: 'in_progress', endReason: undefined, updatedAt: nowIso() });
            setReopen(false);
            nav(`/games/${gameId}/live`);
          }}
        />
      )}
      {toast.el}
    </div>
  );
}
