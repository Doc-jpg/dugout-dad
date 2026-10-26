import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllReplays, usePlayerMap, useSettings, useTeams, useTournaments, fmt2, fmtPct, fmtDate } from '../hooks';
import { pitchingLines, filterReplays } from '../../engine/stats';
import { pitchingWorkload } from '../../engine/lineup';
import { outsToInnings, type PitchingRules } from '../../engine/types';
import { playerName } from '../../db/db';
import { useStatsScope, ScopeChips } from './StatsPage';

/** Pitcher effectiveness plus tournament workload against configurable rules. */
export function PitchingPage() {
  const replays = useAllReplays();
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const tournaments = useTournaments();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const tid = myTeam?.id;
  const { scope, setScope, filtered } = useStatsScope(replays, tid);
  const [maxPitches, setMaxPitches] = useState<string>('');
  const rules: PitchingRules | undefined = maxPitches ? { maxPitchesPerDay: parseInt(maxPitches, 10) } : undefined;
  const lines = useMemo(() => pitchingLines(filtered, { teamId: tid, eraInnings: settings.defaultEraInnings || 7 }), [filtered, tid, settings.defaultEraInnings]);
  const work = useMemo(() => (tid ? pitchingWorkload(filtered, tid, rules) : []), [filtered, tid, rules]);
  const recent = useMemo(() => pitchingLines(filterReplays(filtered, { lastNGames: 3 }), { teamId: tid, eraInnings: settings.defaultEraInnings || 7 }), [filtered, tid, settings.defaultEraInnings]);
  const pn = (id: string) => playerName(players.get(id), 'short');

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}><Link to="/stats" className="btn ghost sm">‹ Stats</Link></div>
      <h1>Pitching workload and effectiveness</h1>
      <ScopeChips scope={scope} setScope={setScope} tournaments={tournaments} />
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Daily pitch limit to check against (this event's rule; not assumed)</label>
          <input className="input" inputMode="numeric" value={maxPitches} onChange={(e) => setMaxPitches(e.target.value)} placeholder="e.g. 95" />
        </div>
      </div>
      <div className="list">
        {work.sort((a, b) => b.appearances.reduce((x, y) => x + y.outs, 0) - a.appearances.reduce((x, y) => x + y.outs, 0)).map((w) => {
          const line = lines.find((l) => l.playerId === w.playerId);
          const r3 = recent.find((l) => l.playerId === w.playerId);
          return (
            <div key={w.playerId} className={`card ${w.playerId === settings.focusPlayerId ? 'focus' : ''}`} style={{ padding: 12 }}>
              <div className="row between">
                <Link to={`/stats/player/${w.playerId}`}><strong>{pn(w.playerId)}</strong></Link>
                <span className="small muted">{w.lastDate ? `last pitched ${fmtDate(w.lastDate)}${w.daysSinceLast != null ? ` (${w.daysSinceLast} d before latest game)` : ''}` : ''}</span>
              </div>
              {line && (
                <div className="kpi" style={{ marginTop: 8 }}>
                  <div className="k"><div className="v">{line.ipText}</div><div className="l">IP in {line.games} G</div></div>
                  <div className="k"><div className="v">{fmt2(line.era)}</div><div className="l">ERA</div></div>
                  <div className="k"><div className="v">{fmt2(line.whip)}</div><div className="l">WHIP</div></div>
                  <div className="k"><div className="v">{fmt2(line.bbPerInn)}</div><div className="l">BB / inn</div></div>
                  <div className="k"><div className="v">{fmtPct(line.kPerBf)}</div><div className="l">K / BF</div></div>
                  <div className="k"><div className="v">{line.pitches ?? (line.pitchesKnownAppearances ? `?` : '-')}</div><div className="l">Pitches{line.pitches == null && line.pitchesKnownAppearances ? ` (${line.pitchesKnownAppearances}/${line.appearances} known)` : ''}</div></div>
                  <div className="k"><div className="v">{line.pPerIp != null ? fmt2(line.pPerIp) : '-'}</div><div className="l">P / IP</div></div>
                  <div className="k"><div className="v">{r3 ? `${fmt2(r3.era)} / ${fmt2(r3.whip)}` : '-'}</div><div className="l">Last 3 G: ERA / WHIP</div></div>
                </div>
              )}
              <div className="small" style={{ marginTop: 8 }}>
                <strong>Weekend (last 3 days of view):</strong> {outsToInnings(w.weekendOuts)} IP, {w.weekendPitches ?? 'unknown'} pitches
              </div>
              <div className="row wrap" style={{ marginTop: 6 }}>
                {Object.entries(w.byDate).sort().map(([d, v]) => (
                  <span key={d} className="pill">{fmtDate(d)}: {outsToInnings(v.outs)} IP, {v.pitches ?? '?'} P</span>
                ))}
              </div>
              {w.flags.length > 0 && <div className="banner warn" style={{ marginTop: 8 }}>{w.flags.join(' · ')}</div>}
            </div>
          );
        })}
        {work.length === 0 && <div className="empty">No pitching recorded in this view.</div>}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Pitch counts are only what you entered or scored pitch by pitch; nothing is estimated from at-bats. Rest rules differ by organization, so enter the event's limit above before trusting any warning.</p>
    </div>
  );
}
