import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAllReplays, usePlayerMap, useSettings, useTeams, useTournaments, useSnapshots, fmt3, fmt2, fmtPct } from '../hooks';
import { positionComparison, type PositionComparisonRow } from '../../engine/stats';
import { snapshotFieldingLines } from '../../engine/snapshots';
import { POSITION_LABEL, POSITION_NAME, outsToInnings, type Position } from '../../engine/types';
import { playerName } from '../../db/db';
import { StatsTable, type Column } from '../components/StatsTable';
import { useStatsScope, ScopeChips } from './StatsPage';

/** Pick a position; compare everyone who has played it. Objective, with sample sizes shown. */
export function PositionsPage() {
  const replays = useAllReplays();
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const tournaments = useTournaments();
  const snapshots = useSnapshots();
  const nav = useNavigate();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const tid = myTeam?.id;
  const { scope, setScope, filtered } = useStatsScope(replays, tid);
  const [position, setPosition] = useState<Position>(6);
  const rows = useMemo(() => (tid ? positionComparison(filtered, position, tid) : []), [filtered, position, tid]);
  const pn = (id: string) => playerName(players.get(id), 'short');
  const snapshot = snapshots.find((s) => s.teamId === tid);
  const imported = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.rows
      .filter((r) => r.playerId)
      .map((r) => ({ playerId: r.playerId!, f: snapshotFieldingLines(r) }))
      .map((x) => ({ playerId: x.playerId, outs: x.f.byPosition.find((p) => p.position === position)?.outs ?? 0, total: x.f.player.totalOuts ?? 0, e: x.f.player.e }))
      .filter((x) => x.outs > 0)
      .sort((a, b) => b.outs - a.outs);
  }, [snapshot, position]);

  const cols: Column<PositionComparisonRow>[] = [
    { key: 'name', label: 'Player', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'inn', label: `${POSITION_LABEL[position]} INN`, value: (r) => r.outs, format: (v) => outsToInnings(v as number) },
    { key: 'pct', label: '% of team inn', value: (r) => r.pctOfTeamInnings, format: (v) => fmtPct(v as number) },
    { key: 'g', label: 'G', value: (r) => r.games },
    { key: 'gs', label: 'GS', value: (r) => r.starts },
    { key: 'tc', label: 'Chances', value: (r) => r.tc },
    { key: 'po', label: 'PO', value: (r) => r.po },
    { key: 'a', label: 'A', value: (r) => r.a },
    { key: 'e', label: 'E', value: (r) => r.e },
    { key: 'fpct', label: 'FPCT', value: (r) => r.fpct, format: (v) => fmt3(v as number) },
    { key: 'e10', label: 'E / 10 inn', value: (r) => r.errorsPer10Inn, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 'cpi', label: 'Chances / inn', value: (r) => r.chancesPerInn, format: (v) => fmt2(v as number) },
    { key: 'ropp', label: 'Routine opps', value: (r) => r.routineOpps },
    { key: 'rconv', label: 'Routine %', value: (r) => r.routineConversionPct, format: (v) => fmtPct(v as number) },
    { key: 'dmade', label: 'Difficult made', value: (r) => (r.difficultOpps ? `${r.difficultMade}/${r.difficultOpps}` : null) },
    { key: 'missed', label: 'Missed expected', value: (r) => r.missedExpected },
    { key: 'conf', label: 'Obs. confidence', value: (r) => r.observationalConfidence },
    { key: 'note', label: 'Sample', value: (r) => r.sampleNote, align: 'right' }
  ];

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <Link to="/stats" className="btn ghost sm">‹ Stats</Link>
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <h1>Position comparison</h1>
      <p className="muted small">Everyone who has played the position, from games scored here. Fielding percentage and error totals alone do not rank players; look at chances, routine conversion and the sample size together.</p>
      <div className="chips" style={{ margin: '10px 0' }}>
        {([1, 2, 3, 4, 5, 6, 7, 8, 9] as Position[]).map((p) => (
          <button key={p} className={`chip ${position === p ? 'on' : ''}`} onClick={() => setPosition(p)}>{POSITION_LABEL[p]}</button>
        ))}
      </div>
      <ScopeChips scope={scope} setScope={setScope} tournaments={tournaments} />
      <h2 style={{ marginBottom: 8 }}>{POSITION_NAME[position]}</h2>
      <StatsTable rows={rows} columns={cols} rowKey={(r) => r.playerId} defaultSort="inn" highlight={(r) => r.playerId === settings.focusPlayerId} onRowClick={(r) => nav(`/stats/player/${r.playerId}`)} emptyText={`Nobody has recorded innings at ${POSITION_LABEL[position]} in this view yet.`} />
      {imported.length > 0 && (
        <div className="section">
          <div className="section-title"><h3>Imported GameChanger innings at {POSITION_LABEL[position]}</h3><span className="muted small">as of {snapshot!.asOfDate}</span></div>
          <div className="table-wrap">
            <table className="stats">
              <thead><tr><th style={{ textAlign: 'left' }}>Player</th><th>{POSITION_LABEL[position]} INN</th><th>Total INN</th><th>% of player time</th><th>Total E (all positions)</th></tr></thead>
              <tbody>
                {imported.map((r) => (
                  <tr key={r.playerId} className={r.playerId === settings.focusPlayerId ? 'focus' : ''}>
                    <td>{pn(r.playerId)}</td><td>{outsToInnings(r.outs)}</td><td>{outsToInnings(r.total)}</td><td>{r.total ? fmtPct(r.outs / r.total) : '-'}</td><td>{r.e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>Imported errors are season totals across all positions. GameChanger does not say where each one happened, so they are not split by position.</p>
        </div>
      )}
    </div>
  );
}
