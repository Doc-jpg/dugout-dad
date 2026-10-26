import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllReplays, usePlayerMap, useSettings, useTeams, useTournaments, fmt3, fmt2, fmtPct, fmtDate } from '../hooks';
import { tournamentSummary } from '../../engine/stats';
import { outsToInnings, POSITION_LABEL } from '../../engine/types';
import { playerName, db } from '../../db/db';

export function TournamentsPage() {
  const replays = useAllReplays();
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const tournaments = useTournaments();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const tid = myTeam?.id;
  const [sel, setSel] = useState<string | null>(null);
  const current = sel ?? tournaments[0]?.id ?? null;
  const summary = useMemo(() => (replays && tid && current ? tournamentSummary(replays, current, tid, settings.qab, settings.defaultEraInnings || 7) : null), [replays, tid, current, settings.qab, settings.defaultEraInnings]);
  const pn = (id: string) => playerName(players.get(id), 'short');
  const t = tournaments.find((x) => x.id === current);

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}><Link to="/stats" className="btn ghost sm">‹ Stats</Link></div>
      <h1>Tournaments</h1>
      {tournaments.length === 0 && <div className="empty">Create a tournament when you set up a game and it shows up here.</div>}
      <div className="chips" style={{ margin: '10px 0' }}>
        {tournaments.map((x) => <button key={x.id} className={`chip ${current === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{x.name}</button>)}
      </div>
      {summary && t && (
        <>
          <div className="row between">
            <h2>{t.name}</h2>
            <input className="input" style={{ width: 'auto', minHeight: 36 }} type="date" value={t.startDate} onChange={(e) => db.tournaments.update(t.id, { startDate: e.target.value })} />
          </div>
          <div className="kpi" style={{ margin: '10px 0' }}>
            <div className="k"><div className="v">{summary.record.w}-{summary.record.l}{summary.record.t ? `-${summary.record.t}` : ''}</div><div className="l">Record</div></div>
            <div className="k"><div className="v">{summary.runsFor}-{summary.runsAgainst}</div><div className="l">Runs for-against</div></div>
            <div className="k"><div className="v">{summary.games.length}</div><div className="l">Games</div></div>
          </div>
          <div className="list">
            {summary.games.map((gid) => {
              const r = replays!.find((x) => x.game.id === gid)!;
              const my = r.game.mySide === 'home' ? r.state.home.runs : r.state.away.runs;
              const op = r.game.mySide === 'home' ? r.state.away.runs : r.state.home.runs;
              return (
                <Link key={gid} to={`/games/${gid}`} className="item tappable" style={{ minHeight: 44 }}>
                  <span className="grow">{fmtDate(r.game.date)}{r.game.time ? ` ${r.game.time}` : ''} vs {teams.find((x) => x.id === r.game.opponentTeamId)?.shortName ?? teams.find((x) => x.id === r.game.opponentTeamId)?.name}</span>
                  <strong>{my}-{op}</strong>
                </Link>
              );
            })}
          </div>

          <div className="section-title"><h3>Weekend batting</h3></div>
          <div className="table-wrap">
            <table className="stats">
              <thead><tr><th style={{ textAlign: 'left' }}>Player</th><th>PA</th><th>AB</th><th>H</th><th>XBH</th><th>BB</th><th>SO</th><th>RBI</th><th>AVG</th><th>OBP</th><th>SLG</th><th>Hard%</th></tr></thead>
              <tbody>
                {summary.batting.map((b) => (
                  <tr key={b.playerId} className={b.playerId === settings.focusPlayerId ? 'focus' : ''}>
                    <td>{pn(b.playerId)}</td><td>{b.pa}</td><td>{b.ab}</td><td>{b.h}</td><td>{b.xbh}</td><td>{b.bb}</td><td>{b.so}</td><td>{b.rbi}</td><td>{fmt3(b.avg)}</td><td>{fmt3(b.obp)}</td><td>{fmt3(b.slg)}</td><td>{b.hardnessKnown ? fmtPct(b.hardHitPct) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title"><h3>Pitching usage</h3></div>
          <div className="list">
            {summary.pitchingUsage.map((u) => (
              <div key={u.playerId} className="item" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="title">{pn(u.playerId)} <span className="muted small">{outsToInnings(u.totalOuts)} IP · {u.totalPitches ?? '? '} pitches</span></div>
                  <div className="row wrap" style={{ marginTop: 4 }}>
                    {Object.entries(u.byDate).sort().map(([d, v]) => <span key={d} className="pill">{fmtDate(d)}: {outsToInnings(v.outs)} IP, {v.pitches ?? '?'} P</span>)}
                  </div>
                </div>
              </div>
            ))}
            {summary.pitchingUsage.length === 0 && <div className="empty">No pitching recorded.</div>}
          </div>

          <div className="section-title"><h3>Defensive innings</h3></div>
          <div className="list">
            {summary.playingTime.filter((p) => p.totalOuts > 0).sort((a, b) => b.totalOuts - a.totalOuts).map((p) => (
              <div key={p.playerId} className={`item ${p.playerId === settings.focusPlayerId ? 'focus' : ''}`} style={{ minHeight: 44 }}>
                <span className="grow title">{pn(p.playerId)}</span>
                <span className="small">{p.byPosition.sort((a, b) => b.outs - a.outs).map((x) => `${POSITION_LABEL[x.position as 1]} ${x.inningsText}`).join(' · ')}</span>
                <span className="pill">{p.totalInningsText}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
