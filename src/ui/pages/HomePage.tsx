import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGames, useTeams, useSettings, fmtDate, useAllReplays } from '../hooks';
import { storageHealth, type StorageHealth } from '../../db/db';
import { loadSampleData, PRACTICE_TAG } from '../../db/sample';
import type { Game } from '../../engine/types';

function teamName(teams: { id: string; name: string; shortName?: string }[], id: string) {
  const t = teams.find((x) => x.id === id);
  return t?.shortName || t?.name || 'Opponent';
}

export function HomePage() {
  const games = useGames();
  const teams = useTeams();
  const settings = useSettings();
  const replays = useAllReplays();
  const nav = useNavigate();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  useEffect(() => {
    storageHealth().then(setHealth);
  }, [games.length]);

  const scoreFor = (g: Game) => {
    const r = replays?.find((x) => x.game.id === g.id);
    if (!r) return null;
    const my = g.mySide === 'home' ? r.state.home.runs : r.state.away.runs;
    const opp = g.mySide === 'home' ? r.state.away.runs : r.state.home.runs;
    return { my, opp, inning: r.state.inning, half: r.state.half, ended: r.state.ended };
  };

  const inProgress = games.filter((g) => g.status === 'in_progress' || g.status === 'setup' || g.status === 'suspended');
  const finals = games.filter((g) => g.status === 'final');
  const unexported = finals.filter((g) => !g.lastExportedAt && g.notes !== PRACTICE_TAG).length;
  const noTeam = teams.filter((t) => t.isMine).length === 0;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1>Dugout Dad</h1>
        <div className="row">
          <Link className="btn sm" to="/help">How it works</Link>
          <button className="btn primary" onClick={() => nav('/games/new')} disabled={noTeam}>
            + New game
          </button>
        </div>
      </div>

      {noTeam && (
        <div className="card">
          <h2>First time here</h2>
          <p className="muted">Try a practice game first to see how scoring feels, or set up your team and go.</p>
          <div className="col">
            <button className="btn primary block" onClick={async () => { const { liveGameId } = await loadSampleData(); nav(`/games/${liveGameId}/live`); }}>
              Load a practice game
            </button>
            <Link className="btn block" to="/teams">
              Set up my team
            </Link>
          </div>
        </div>
      )}

      {health && health.verdict === 'install' && (
        <div className="banner warn">{health.message}</div>
      )}
      {unexported >= (settings.exportReminderGames || 1) && (
        <div className="banner info row between">
          <span>
            {unexported} finished {unexported === 1 ? 'game has' : 'games have'} not been exported.
          </span>
          <Link className="btn sm" to="/transfer">
            Export
          </Link>
        </div>
      )}

      {inProgress.length > 0 && (
        <>
          <div className="section-title">
            <h3>In progress</h3>
          </div>
          <div className="list">
            {inProgress.map((g) => {
              const s = scoreFor(g);
              return (
                <div key={g.id} className="item tappable" onClick={() => nav(g.status === 'setup' ? `/games/${g.id}/lineup` : `/games/${g.id}/live`)}>
                  <div className="grow">
                    <div className="title">
                      {teamName(teams, g.teamId)} vs {teamName(teams, g.opponentTeamId)}
                    </div>
                    <div className="sub">
                      {fmtDate(g.date)}
                      {g.time ? ` · ${g.time}` : ''} {g.venue ? ` · ${g.venue}` : ''}
                    </div>
                  </div>
                  {s && g.status !== 'setup' && (
                    <div className="right">
                      <div className="title num">
                        {s.my}-{s.opp}
                      </div>
                      <div className="sub">
                        {s.half === 'top' ? 'Top' : 'Bot'} {s.inning}
                      </div>
                    </div>
                  )}
                  {g.status === 'setup' && <span className="pill">Setup</span>}
                  {g.notes === PRACTICE_TAG && <span className="pill">Practice</span>}
                  <span className="chev">›</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">
        <h3>Finished games</h3>
        <span className="muted small">{finals.length}</span>
      </div>
      {finals.length === 0 ? (
        <div className="empty">No finished games yet. Finished games save here and stay on this device until you export them.</div>
      ) : (
        <div className="list">
          {finals.map((g) => {
            const s = scoreFor(g);
            const won = s ? s.my > s.opp : false;
            const lost = s ? s.my < s.opp : false;
            return (
              <div key={g.id} className="item tappable" onClick={() => nav(`/games/${g.id}`)}>
                <div className="grow">
                  <div className="title">
                    {won ? 'W' : lost ? 'L' : 'T'} {s ? `${s.my}-${s.opp}` : ''} vs {teamName(teams, g.opponentTeamId)}
                  </div>
                  <div className="sub">
                    {fmtDate(g.date)}
                    {g.venue ? ` · ${g.venue}` : ''}
                    {g.endReason && g.endReason !== 'regulation' ? ` · ${g.endReason.replace('_', ' ')}` : ''}
                  </div>
                </div>
                {g.notes === PRACTICE_TAG ? <span className="pill">Practice</span> : !g.lastExportedAt && <span className="pill warn">Not exported</span>}
                <span className="chev">›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
