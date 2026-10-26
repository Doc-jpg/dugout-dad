import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAllReplays, usePlayerMap, useSettings, useTeams, useSnapshots, useTournaments, fmt3, fmt2, fmtPct, fmtDate } from '../hooks';
import { battingLines, pitchingLines, fieldingLines, playingTime, availabilitySummary, filterReplays, teamDefensiveOuts, type BattingLine, type FieldingLine } from '../../engine/stats';
import { snapshotBattingLine, snapshotFieldingLines, snapshotPitchingLine } from '../../engine/snapshots';
import { POSITION_LABEL, POSITION_NAME, outsToInnings } from '../../engine/types';
import { playerName } from '../../db/db';
import { useStatsScope, ScopeChips } from './StatsPage';

/** Individual development dashboard: hitting, pitching, fielding by position, playing time, imported history. */
export function PlayerPage() {
  const { playerId = '' } = useParams();
  const replays = useAllReplays();
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const snapshots = useSnapshots();
  const tournaments = useTournaments();
  const player = players.get(playerId);
  const teamId = player?.teamId;
  const { scope, setScope, filtered } = useStatsScope(replays, teamId);
  const all = useMemo(() => (replays ? filterReplays(replays, { teamId }) : []), [replays, teamId]);

  const season = useMemo(() => battingLines(all, { teamId, playerIds: [playerId], qab: settings.qab })[0], [all, teamId, playerId, settings.qab]);
  const scoped = useMemo(() => battingLines(filtered, { teamId, playerIds: [playerId], qab: settings.qab })[0], [filtered, teamId, playerId, settings.qab]);
  const recent5 = useMemo(() => battingLines(filterReplays(all, { lastNGames: 5 }), { teamId, playerIds: [playerId], qab: settings.qab })[0], [all, teamId, playerId, settings.qab]);
  const pitching = useMemo(() => pitchingLines(filtered, { teamId, eraInnings: settings.defaultEraInnings || 7 }).find((l) => l.playerId === playerId), [filtered, teamId, playerId, settings.defaultEraInnings]);
  const fielding = useMemo(() => fieldingLines(filtered, { teamId }).filter((l) => l.playerId === playerId).sort((a, b) => b.outs - a.outs), [filtered, teamId, playerId]);
  const time = useMemo(() => (teamId ? playingTime(filtered, playerId, teamId) : null), [filtered, playerId, teamId]);
  const avail = useMemo(() => (teamId ? availabilitySummary(filtered, playerId, teamId) : null), [filtered, playerId, teamId]);
  const snapshot = snapshots.find((s) => s.teamId === teamId);
  const snapRow = snapshot?.rows.find((r) => r.playerId === playerId);
  const impBat = snapRow ? snapshotBattingLine(snapRow) : null;
  const impPit = snapRow ? snapshotPitchingLine(snapRow) : null;
  const impField = snapRow ? snapshotFieldingLines(snapRow) : null;

  if (!player) return <div className="empty">Player not found.</div>;
  const team = teams.find((t) => t.id === teamId);
  const scopedGames = filtered.filter((r) => r.state.started).length;

  const Stat = ({ v, l, title }: { v: string; l: string; title?: string }) => (
    <div className="k" title={title}><div className="v">{v}</div><div className="l">{l}</div></div>
  );
  const line = (b?: BattingLine) => b ?? null;
  const s = line(scoped);
  const r5 = line(recent5);

  return (
    <div className="player-page">
      <div className="row between" style={{ marginBottom: 8 }}>
        <Link to="/stats" className="btn ghost sm">‹ Stats</Link>
        <button className="btn sm" onClick={() => window.print()}>Print report</button>
      </div>
      <h1>{player.number ? `#${player.number} ` : ''}{playerName(player)}</h1>
      <p className="muted small">{team?.name}{player.bats ? ` · bats ${player.bats}` : ''} · {scopedGames} game{scopedGames === 1 ? '' : 's'} in view</p>
      <ScopeChips scope={scope} setScope={setScope} tournaments={tournaments} />

      <div className="section-title"><h3>Hitting</h3><span className="muted small">scored in Dugout Dad</span></div>
      {s && s.pa > 0 ? (
        <>
          <div className="kpi">
            <Stat v={`${fmt3(s.avg)} / ${fmt3(s.obp)} / ${fmt3(s.slg)}`} l="AVG / OBP / SLG" />
            <Stat v={fmt3(s.ops)} l="OPS" />
            <Stat v={`${s.pa} / ${s.ab}`} l="PA / AB" />
            <Stat v={`${s.h} (${s.xbh} XBH)`} l="Hits" />
            <Stat v={`${s.bb} / ${s.so}`} l="BB / SO" />
            <Stat v={fmtPct(s.contactPct)} l="Contact %" />
            <Stat v={s.hardnessKnown ? `${fmtPct(s.hardHitPct)} (${s.hardnessKnown})` : '-'} l="Hard-hit % (observed)" title="Share of balls in play you marked hard; count = balls with a mark" />
            <Stat v={s.trajectoryKnown ? `${fmtPct(s.ldPct)} / ${fmtPct(s.gbPct)} / ${fmtPct(s.fbPct)}` : '-'} l="LD / GB / FB %" />
            <Stat v={s.abRisp ? `${fmt3(s.baRisp)} (${s.abRisp} AB)` : '-'} l="BA with RISP" />
            <Stat v={s.qabPct != null ? fmtPct(s.qabPct) : '-'} l="QAB %" />
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>Coverage: trajectory {s.coverage.trajectory.recorded}/{s.coverage.trajectory.of} balls in play, contact {s.coverage.hardness.recorded}/{s.coverage.hardness.of}, location {s.coverage.zone.recorded}/{s.coverage.zone.of}, pitches {s.coverage.pitches.recorded}/{s.coverage.pitches.of} PA.</p>
          {r5 && season && scope.kind === 'all' && (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="stats">
                <thead><tr><th style={{ textAlign: 'left' }}>Split</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>BB</th><th>SO</th><th>Hard%</th></tr></thead>
                <tbody>
                  <tr><td>All scored games</td><td>{season.pa}</td><td>{fmt3(season.avg)}</td><td>{fmt3(season.obp)}</td><td>{fmt3(season.slg)}</td><td>{fmt3(season.ops)}</td><td>{season.bb}</td><td>{season.so}</td><td>{season.hardnessKnown ? fmtPct(season.hardHitPct) : '-'}</td></tr>
                  <tr><td>Last 5 games</td><td>{r5.pa}</td><td>{fmt3(r5.avg)}</td><td>{fmt3(r5.obp)}</td><td>{fmt3(r5.slg)}</td><td>{fmt3(r5.ops)}</td><td>{r5.bb}</td><td>{r5.so}</td><td>{r5.hardnessKnown ? fmtPct(r5.hardHitPct) : '-'}</td></tr>
                  {impBat && <tr><td>GameChanger import (as of {snapshot!.asOfDate})</td><td>{impBat.pa ?? '-'}</td><td>{fmt3(impBat.avg)}</td><td>{fmt3(impBat.obp)}</td><td>{fmt3(impBat.slg)}</td><td>{fmt3(impBat.ops)}</td><td>{impBat.bb ?? '-'}</td><td>{impBat.so ?? '-'}</td><td className="na">n/a</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {s.zoneKnown > 0 && (
            <div className="section">
              <h3 style={{ marginBottom: 6 }}>Where the ball went ({s.zoneKnown} located)</h3>
              <div className="chips">
                {Object.entries(s.byZone).sort((a, b) => b[1].bip - a[1].bip).map(([z, v]) => (
                  <span key={z} className="pill">{z.replace('_', ' ')}: {v.bip} ({v.h} H{v.hard ? `, ${v.hard} hard` : ''})</span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty">No plate appearances scored in this view{impBat ? '; imported totals are below' : ''}.</div>
      )}

      {pitching && pitching.outs > 0 && (
        <>
          <div className="section-title"><h3>Pitching</h3></div>
          <div className="kpi">
            <Stat v={`${pitching.ipText} in ${pitching.games} G`} l="Innings" />
            <Stat v={fmt2(pitching.era)} l={`ERA (${settings.defaultEraInnings || 7} inn)`} />
            <Stat v={fmt2(pitching.whip)} l="WHIP" />
            <Stat v={`${pitching.bb} / ${pitching.so}`} l="BB / SO" />
            <Stat v={fmt2(pitching.bbPerInn)} l="BB per inning" />
            <Stat v={pitching.pitches != null ? String(pitching.pitches) : pitching.pitchesKnownAppearances ? `? (${pitching.pitchesKnownAppearances}/${pitching.appearances} known)` : 'unknown'} l="Pitches" />
            <Stat v={pitching.strikePct != null ? fmtPct(pitching.strikePct) : '-'} l="Strike % (pitch-by-pitch)" />
            <Stat v={`${pitching.r} / ${pitching.er}${pitching.erBasis !== 'calculated' ? '*' : ''}`} l="R / ER" />
          </div>
        </>
      )}

      <div className="section-title"><h3>Fielding by position</h3></div>
      {fielding.length ? (
        <div className="table-wrap">
          <table className="stats">
            <thead><tr><th style={{ textAlign: 'left' }}>Pos</th><th>INN</th><th>G</th><th>GS</th><th>TC</th><th>PO</th><th>A</th><th>E</th><th>FPCT</th><th>E/10</th><th>Routine</th><th>Routine %</th><th>Difficult</th><th>Missed exp.</th><th>Sample</th></tr></thead>
            <tbody>
              {fielding.map((f: FieldingLine) => (
                <tr key={f.position}>
                  <td>{POSITION_LABEL[f.position]}</td><td>{f.inningsText}</td><td>{f.games}</td><td>{f.starts}</td><td>{f.tc}</td><td>{f.po}</td><td>{f.a}</td><td>{f.e}</td>
                  <td>{fmt3(f.fpct)}</td><td>{fmt2(f.errorsPer10Inn)}</td><td>{f.routineOpps}</td><td>{fmtPct(f.routineConversionPct)}</td><td>{f.difficultOpps ? `${f.difficultMade}/${f.difficultOpps}` : '-'}</td><td>{f.missedExpected}</td><td>{f.observationalConfidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">No defensive innings scored in this view.</div>}
      <p className="muted small">Errors are attached to the position being played when they happened. Routine, difficult and missed-expected are your own observations and are labeled by sample size.</p>

      {avail && avail.gamesOnRoster > 0 && (
        <>
          <div className="section-title"><h3>Showing up and getting in</h3><span className="muted small">{avail.gamesOnRoster} game{avail.gamesOnRoster === 1 ? '' : 's'} on the roster</span></div>
          <div className="kpi">
            <div className="k"><div className="v">{avail.gamesPresent}</div><div className="l">here{avail.gamesAbsent ? `, ${avail.gamesAbsent} absent` : ''}</div></div>
            <div className="k"><div className="v">{avail.gamesStarted}</div><div className="l">starts of {avail.gamesPresent} games here</div></div>
            <div className="k"><div className="v">{outsToInnings(avail.benchOuts)}</div><div className="l">bench innings ({fmtPct(avail.benchPct)} of {outsToInnings(avail.availableOuts)} available)</div></div>
            <div className="k"><div className="v">{avail.gamesDidNotPlay + avail.gamesDidNotBat}</div><div className="l">{avail.gamesDidNotPlay} did not play, {avail.gamesDidNotBat} did not bat</div></div>
            <div className="k"><div className="v">{fmtPct(avail.paShare)}</div><div className="l">share of team PA while here (even nine is 11%)</div></div>
            {avail.gamesHurtOrLeft > 0 && <div className="k"><div className="v">{avail.gamesHurtOrLeft}</div><div className="l">hurt or left early</div></div>}
          </div>
          {avail.byGame.some((g) => g.status !== 'present' || g.benchOuts > 0 || !g.inOrder) && (
            <p className="muted small" style={{ marginTop: 6 }}>
              {avail.byGame.filter((g) => g.status !== 'present' || g.benchOuts > 0 || !g.inOrder).map((g) => `${fmtDate(g.date)}: ${g.status === 'absent' ? 'absent' : [g.status === 'injured' ? 'hurt' : g.status === 'left' ? 'left early' : null, g.benchOuts > 0 ? `bench ${outsToInnings(g.benchOuts)}` : null, !g.inOrder && g.availableTeamPAs > 0 ? 'did not bat' : null].filter(Boolean).join(', ')}`).join(' · ')}
            </p>
          )}
        </>
      )}

      {time && time.totalOuts > 0 && (
        <>
          <div className="section-title"><h3>Playing time</h3><span className="muted small">{time.totalInningsText} of {outsToInnings(time.teamDefensiveOuts)} team innings ({fmtPct(time.pctOfTeamInnings)})</span></div>
          <div className="col">
            {time.byPosition.sort((a, b) => b.outs - a.outs).map((p) => (
              <div key={p.position}>
                <div className="row between small"><span>{POSITION_NAME[p.position as 1]}</span><span>{p.inningsText} · {fmtPct(p.pctOfPlayerTime)} of his time · {fmtPct(p.pctOfTeamInnings)} of team innings · {p.starts} start{p.starts === 1 ? '' : 's'}, {p.gamesAppeared} game{p.gamesAppeared === 1 ? '' : 's'}</span></div>
                <div className="bar"><div style={{ width: `${Math.round((p.pctOfPlayerTime ?? 0) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {Object.entries(time.consecutiveGamesWithout).filter(([, n]) => n > 0 && n < time.gamesPlayed).length > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Current streaks without an appearance: {Object.entries(time.consecutiveGamesWithout).filter(([, n]) => n > 0 && n < time.gamesPlayed).map(([pos, n]) => `${POSITION_LABEL[Number(pos) as 1]} ${n}`).join(', ')} games.
            </p>
          )}
          <div className="section">
            <h3 style={{ marginBottom: 6 }}>By game</h3>
            <div className="table-wrap">
              <table className="stats">
                <thead><tr><th style={{ textAlign: 'left' }}>Date</th><th>Opponent</th>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => <th key={p}>{POSITION_LABEL[p as 1]}</th>)}</tr></thead>
                <tbody>
                  {time.byGame.map((g) => (
                    <tr key={g.gameId}>
                      <td><Link to={`/games/${g.gameId}`}>{fmtDate(g.date)}</Link></td>
                      <td style={{ textAlign: 'left' }}>{teams.find((t) => t.id === g.opponentTeamId)?.shortName ?? teams.find((t) => t.id === g.opponentTeamId)?.name ?? ''}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => <td key={p} className={g.byPosition[p] ? '' : 'na'}>{g.byPosition[p] ? outsToInnings(g.byPosition[p]) : '-'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {impField && (
        <>
          <div className="section-title"><h3>GameChanger import</h3><span className="muted small">as of {snapshot!.asOfDate}</span></div>
          <div className="row wrap">
            {impField.byPosition.filter((p) => p.outs).sort((a, b) => b.outs - a.outs).map((p) => <span key={p.position} className="pill">{POSITION_LABEL[p.position as 1]} {p.inningsText}</span>)}
            <span className="pill ok">Total {impField.player.totalInningsText ?? '-'}</span>
            <span className="pill">E {impField.player.e} (position unknown)</span>
          </div>
          {impPit && (impPit.outs ?? 0) > 0 && <p className="small" style={{ marginTop: 8 }}>Pitching (imported): {impPit.ipText} IP, ERA {fmt2(impPit.era)}, WHIP {fmt2(impPit.whip)}, {impPit.bb} BB, {impPit.so} SO, {impPit.pitches ?? '?'} pitches.</p>}
          <p className="muted small" style={{ marginTop: 6 }}>Imported totals cover games before Dugout Dad; they are shown next to scored games, never silently added together. GameChanger did not record which position each error happened at.</p>
        </>
      )}

      <div className="card small" style={{ marginTop: 16 }}>
        <strong>Reading this page</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>Playing time comes from defensive outs actually recorded, in baseball notation (1.2 = one inning and two outs).</li>
          <li>Small samples are small samples. A dozen chances say little; the sample label on each row is there on purpose.</li>
          <li>Runs allowed while someone played a position depend on pitching and luck far more than on that player.</li>
        </ul>
      </div>
    </div>
  );
}
