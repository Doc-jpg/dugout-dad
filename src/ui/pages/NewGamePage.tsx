import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeams, useSettings, useTournaments, todayIso } from '../hooks';
import { createGame, createTeam, db } from '../../db/db';
import type { Game, ScoringLevel, Side } from '../../engine/types';
import { newId } from '../../engine/types';

export function NewGamePage() {
  const teams = useTeams();
  const settings = useSettings();
  const tournaments = useTournaments();
  const nav = useNavigate();
  const myTeams = teams.filter((t) => t.isMine);
  const opponents = teams.filter((t) => !t.isMine);

  const [teamId, setTeamId] = useState(settings.myTeamId && myTeams.some((t) => t.id === settings.myTeamId) ? settings.myTeamId : myTeams[0]?.id ?? '');
  const [oppMode, setOppMode] = useState<'existing' | 'new'>(opponents.length ? 'existing' : 'new');
  const [oppId, setOppId] = useState(opponents[0]?.id ?? '');
  const [oppName, setOppName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('');
  const [mySide, setMySide] = useState<Side>('away');
  const [tournamentId, setTournamentId] = useState<string>('');
  const [newTournament, setNewTournament] = useState('');
  const [venue, setVenue] = useState('');
  const [innings, setInnings] = useState(settings.defaultScheduledInnings || 7);
  const [timeLimit, setTimeLimit] = useState<string>('');
  const [fieldConfig, setFieldConfig] = useState<Game['rules']['fieldConfig']>('54/80');
  const [gameType, setGameType] = useState<Game['gameType']>('pool');
  const [level, setLevel] = useState<ScoringLevel>(settings.defaultScoringLevel);
  const [oppDepth, setOppDepth] = useState<Game['opponentScoringDepth']>('full');
  const [busy, setBusy] = useState(false);

  // Live queries resolve after the first render; pick defaults once the lists arrive.
  React.useEffect(() => {
    if (!teamId && myTeams.length) setTeamId(settings.myTeamId && myTeams.some((t) => t.id === settings.myTeamId) ? settings.myTeamId : myTeams[0].id);
  }, [myTeams, settings.myTeamId, teamId]);
  React.useEffect(() => {
    if (!oppId && opponents.length) setOppId(opponents[0].id);
    if (opponents.length && oppMode === 'new' && !oppName) setOppMode('existing');
  }, [opponents.length]);

  const canCreate = teamId && (oppMode === 'existing' ? !!oppId : oppName.trim().length > 0) && date;

  const recentVenues = useMemo(() => [] as string[], []);
  void recentVenues;

  const create = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    try {
      let opponentTeamId = oppId;
      if (oppMode === 'new') {
        const existing = opponents.find((t) => t.name.toLowerCase() === oppName.trim().toLowerCase());
        opponentTeamId = existing ? existing.id : (await createTeam({ name: oppName.trim(), isMine: false })).id;
      }
      let tId: string | undefined = tournamentId || undefined;
      if (tournamentId === '__new' && newTournament.trim()) {
        tId = newId();
        await db.tournaments.put({ id: tId, name: newTournament.trim(), startDate: date, venue: venue || undefined });
      } else if (tournamentId === '__new') {
        tId = undefined;
      }
      const game = await createGame({
        teamId,
        opponentTeamId,
        mySide,
        date,
        time: time || undefined,
        tournamentId: tId,
        venue: venue || undefined,
        ageDivision: '13U',
        gameType,
        rules: {
          scheduledInnings: innings,
          timeLimitMinutes: timeLimit ? parseInt(timeLimit, 10) : undefined,
          fieldConfig,
          eraInnings: settings.defaultEraInnings || 7
        },
        scoringLevel: level,
        status: 'setup',
        opponentScoringDepth: oppDepth
      });
      nav(`/games/${game.id}/lineup`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn ghost sm" onClick={() => nav(-1)}>
          ‹ Back
        </button>
      </div>
      <h1 style={{ marginBottom: 12 }}>New game</h1>

      <div className="card">
        <div className="field">
          <label>My team</label>
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {myTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Opponent</label>
          <div className="chips" style={{ marginBottom: 8 }}>
            <button className={`chip ${oppMode === 'existing' ? 'on' : ''}`} onClick={() => setOppMode('existing')} disabled={!opponents.length}>
              Played before
            </button>
            <button className={`chip ${oppMode === 'new' ? 'on' : ''}`} onClick={() => setOppMode('new')}>
              New opponent
            </button>
          </div>
          {oppMode === 'existing' ? (
            <select className="input" value={oppId} onChange={(e) => setOppId(e.target.value)}>
              {opponents.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <input className="input" value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Opponent name (or 'Unknown opponent')" />
          )}
        </div>
        <div className="field">
          <label>We are</label>
          <div className="chips">
            <button className={`chip ${mySide === 'away' ? 'on' : ''}`} onClick={() => setMySide('away')}>
              Away (bat first)
            </button>
            <button className={`chip ${mySide === 'home' ? 'on' : ''}`} onClick={() => setMySide('home')}>
              Home (bat second)
            </button>
          </div>
        </div>
        <div className="inline-fields">
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Time</label>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Tournament</label>
          <select className="input" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
            <option value="">None / friendly</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="__new">+ New tournament…</option>
          </select>
          {tournamentId === '__new' && <input className="input" style={{ marginTop: 8 }} value={newTournament} onChange={(e) => setNewTournament(e.target.value)} placeholder="Tournament name" />}
        </div>
        <div className="field">
          <label>Venue / field</label>
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 10 }}>Rules</h3>
        <div className="inline-fields">
          <div className="field">
            <label>Innings</label>
            <select className="input" value={innings} onChange={(e) => setInnings(parseInt(e.target.value, 10))}>
              {[5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Time limit (min)</label>
            <input className="input" inputMode="numeric" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="none" />
          </div>
        </div>
        <div className="inline-fields">
          <div className="field">
            <label>Field</label>
            <select className="input" value={fieldConfig} onChange={(e) => setFieldConfig(e.target.value as any)}>
              <option value="54/80">54/80</option>
              <option value="60/90">60/90</option>
              <option value="50/70">50/70</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Game type</label>
            <select className="input" value={gameType} onChange={(e) => setGameType(e.target.value as any)}>
              <option value="pool">Pool play</option>
              <option value="bracket">Bracket</option>
              <option value="league">League</option>
              <option value="friendly">Friendly</option>
              <option value="scrimmage">Scrimmage</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 10 }}>Scoring depth</h3>
        <div className="chips">
          <button className={`chip ${level === 'A' ? 'on' : ''}`} onClick={() => setLevel('A')}>
            Quick
          </button>
          <button className={`chip ${level === 'B' ? 'on' : ''}`} onClick={() => setLevel('B')}>
            Enhanced
          </button>
          <button className={`chip ${level === 'C' ? 'on' : ''}`} onClick={() => setLevel('C')}>
            Full (pitches)
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Quick: result, outs, runs, runners, positions. Enhanced adds contact quality, hit location and fielding detail when you have time. Full adds pitch-by-pitch. You can switch during the game.
        </p>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Opponent at-bats</label>
          <select className="input" value={oppDepth} onChange={(e) => setOppDepth(e.target.value as any)}>
            <option value="full">Score every opponent at-bat (our pitching and defense stats)</option>
            <option value="simplified">Score opponent outs and runs, light detail</option>
            <option value="scoreboard_only">Scoreboard only for the opponent</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn primary lg block" onClick={create} disabled={!canCreate || busy}>
          Next: lineups
        </button>
      </div>
    </div>
  );
}
