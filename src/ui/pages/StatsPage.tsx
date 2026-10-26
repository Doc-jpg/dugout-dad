import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAllReplays, useTeams, usePlayerMap, useSettings, useTournaments, useSnapshots, fmt3, fmt2, fmtPct } from '../hooks';
import { battingLines, pitchingLines, fieldingLines, fieldingTotalsByPlayer, filterReplays, teamBattingTotals, teamRecord, playingTime, availabilityReport, type BattingLine, type PitchingLine, type FieldingLine, type GameFilter, type AvailabilitySummary } from '../../engine/stats';
import { snapshotBattingLine, snapshotPitchingLine, snapshotFieldingLines, canCombine, combineBatting } from '../../engine/snapshots';
import { outsToInnings, POSITION_LABEL } from '../../engine/types';
import type { ReplayResult } from '../../engine/reducer';
import { playerName } from '../../db/db';
import { StatsTable, type Column } from '../components/StatsTable';

export type Scope = { kind: 'all' } | { kind: 'last'; n: number } | { kind: 'tournament'; id: string } | { kind: 'range'; from: string; to: string };

export function useStatsScope(replays: ReplayResult[] | undefined, teamId: string | undefined) {
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const filtered = useMemo(() => {
    if (!replays) return [];
    const base: GameFilter = { teamId };
    let f: GameFilter = { ...base };
    if (scope.kind === 'last') f.lastNGames = scope.n;
    if (scope.kind === 'tournament') f.tournamentId = scope.id;
    if (scope.kind === 'range') {
      f.dateFrom = scope.from;
      f.dateTo = scope.to;
    }
    return filterReplays(replays, f);
  }, [replays, teamId, scope]);
  return { scope, setScope, filtered };
}

export function ScopeChips({ scope, setScope, tournaments }: { scope: Scope; setScope: (s: Scope) => void; tournaments: Array<{ id: string; name: string }> }) {
  return (
    <div className="chips" style={{ marginBottom: 12 }}>
      <button className={`chip sm ${scope.kind === 'all' ? 'on' : ''}`} onClick={() => setScope({ kind: 'all' })}>All games</button>
      {[3, 5, 10].map((n) => (
        <button key={n} className={`chip sm ${scope.kind === 'last' && scope.n === n ? 'on' : ''}`} onClick={() => setScope({ kind: 'last', n })}>Last {n}</button>
      ))}
      {tournaments.map((t) => (
        <button key={t.id} className={`chip sm ${scope.kind === 'tournament' && scope.id === t.id ? 'on' : ''}`} onClick={() => setScope({ kind: 'tournament', id: t.id })}>{t.name}</button>
      ))}
    </div>
  );
}

export function StatsPage() {
  const replays = useAllReplays();
  const teams = useTeams();
  const players = usePlayerMap();
  const settings = useSettings();
  const tournaments = useTournaments();
  const snapshots = useSnapshots();
  const nav = useNavigate();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const tid = teamId ?? myTeam?.id;
  const { scope, setScope, filtered } = useStatsScope(replays, tid);
  const [tab, setTab] = useState<'batting' | 'pitching' | 'fielding' | 'time' | 'imported'>('batting');
  const [source, setSource] = useState<'scored' | 'imported' | 'combined'>('scored');
  const finals = filtered.filter((r) => r.game.status === 'final' || r.state.started);

  const teamSnapshots = snapshots.filter((s) => s.teamId === tid);
  const snapshot = teamSnapshots[0];
  const combinable = snapshot ? canCombine(snapshot, finals) : { ok: false, reason: 'No imported snapshot.' };

  const roster = useMemo(() => [...players.values()].filter((p) => p.teamId === tid), [players, tid]);
  const regularIds = roster.filter((p) => p.status === 'regular').map((p) => p.id);
  const pn = (id: string) => playerName(players.get(id), 'short');

  const batting = useMemo(() => battingLines(finals, { teamId: tid, qab: settings.qab }), [finals, tid, settings.qab]);
  const pitching = useMemo(() => pitchingLines(finals, { teamId: tid, eraInnings: settings.defaultEraInnings || 7 }), [finals, tid, settings.defaultEraInnings]);
  const fielding = useMemo(() => fieldingLines(finals, { teamId: tid }), [finals, tid]);
  const fieldingByPlayer = useMemo(() => fieldingTotalsByPlayer(fielding), [fielding]);
  const record = useMemo(() => (tid ? teamRecord(finals, tid) : null), [finals, tid]);
  const times = useMemo(() => (tid ? roster.filter((p) => p.status !== 'former').map((p) => playingTime(finals, p.id, tid)).filter((t) => t.totalOuts > 0).sort((a, b) => b.totalOuts - a.totalOuts) : []), [finals, roster, tid]);
  const availability = useMemo(() => (tid ? availabilityReport(finals, tid).filter((a) => !players.get(a.playerId)?.isPlaceholder) : []), [finals, tid, players]);
  const availCols: Column<AvailabilitySummary>[] = [
    { key: 'name', label: 'Player', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'g', label: 'G', title: 'Games on the roster', value: (r) => r.gamesOnRoster },
    { key: 'abs', label: 'Abs', title: 'Games absent', value: (r) => r.gamesAbsent },
    { key: 'gp', label: 'GP', title: 'Games played (fielded or batted)', value: (r) => r.gamesPlayed },
    { key: 'gs', label: 'GS', title: 'Games started', value: (r) => r.gamesStarted },
    { key: 'dnp', label: 'DNP', title: 'Here but did not play', value: (r) => r.gamesDidNotPlay },
    { key: 'dnb', label: 'DNB', title: 'Here but never in the batting order', value: (r) => r.gamesDidNotBat },
    { key: 'avail', label: 'Avail', title: 'Innings available (here and healthy)', value: (r) => r.availableOuts, format: (v) => outsToInnings(v as number) },
    { key: 'field', label: 'Field', title: 'Innings in the field', value: (r) => r.fieldOuts, format: (v) => outsToInnings(v as number) },
    { key: 'bench', label: 'Bench', title: 'Innings on the bench while available', value: (r) => r.benchOuts, format: (v) => outsToInnings(v as number) },
    { key: 'benchPct', label: 'Bench%', title: 'Bench innings over available innings', value: (r) => r.benchPct, format: (v) => fmtPct(v as number | null) },
    { key: 'pa', label: 'PA', value: (r) => r.pa },
    { key: 'paShare', label: 'PA share', title: 'His plate appearances per team plate appearance while he was here; nine batters rotating evenly sit near 11%', value: (r) => r.paShare, format: (v) => fmtPct(v as number | null) }
  ];

  const importedBatting = useMemo(() => (snapshot ? snapshot.rows.filter((r) => r.playerId).map((r) => ({ ...snapshotBattingLine(r), playerId: r.playerId! })) : []), [snapshot]);
  const importedPitching = useMemo(() => (snapshot ? snapshot.rows.filter((r) => r.playerId).map((r) => ({ ...snapshotPitchingLine(r), playerId: r.playerId! })) : []), [snapshot]);
  const combinedBatting = useMemo(() => {
    if (!snapshot || !combinable.ok) return [];
    const out: BattingLine[] = [];
    for (const imp of importedBatting) {
      const scored = batting.find((b) => b.playerId === imp.playerId);
      if (scored) out.push(combineBatting(imp as any, scored, combinable));
      else out.push({ ...(imp as any) });
    }
    for (const b of batting) if (!out.some((o) => o.playerId === b.playerId)) out.push(b);
    return out;
  }, [snapshot, combinable, importedBatting, batting]);

  const battingCols: Column<BattingLine>[] = [
    { key: 'name', label: 'Player', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'g', label: 'GP', value: (r) => r.games },
    { key: 'pa', label: 'PA', value: (r) => r.pa },
    { key: 'ab', label: 'AB', value: (r) => r.ab },
    { key: 'avg', label: 'AVG', value: (r) => r.avg, format: (v) => fmt3(v as number) },
    { key: 'obp', label: 'OBP', value: (r) => r.obp, format: (v) => fmt3(v as number) },
    { key: 'slg', label: 'SLG', value: (r) => r.slg, format: (v) => fmt3(v as number) },
    { key: 'ops', label: 'OPS', value: (r) => r.ops, format: (v) => fmt3(v as number) },
    { key: 'h', label: 'H', value: (r) => r.h },
    { key: 'xbh', label: 'XBH', value: (r) => r.xbh },
    { key: 'hr', label: 'HR', value: (r) => r.hr },
    { key: 'r', label: 'R', value: (r) => r.r },
    { key: 'rbi', label: 'RBI', value: (r) => r.rbi },
    { key: 'bb', label: 'BB', value: (r) => r.bb },
    { key: 'so', label: 'SO', value: (r) => r.so },
    { key: 'kl', label: 'K-L', value: (r) => r.soLooking },
    { key: 'hbp', label: 'HBP', value: (r) => r.hbp },
    { key: 'sb', label: 'SB', value: (r) => r.sb },
    { key: 'cs', label: 'CS', value: (r) => r.cs },
    { key: 'roe', label: 'ROE', value: (r) => r.roe },
    { key: 'bbk', label: 'BB/K', value: (r) => r.bbPerK, format: (v) => fmt2(v as number) },
    { key: 'c', label: 'C%', title: 'Contact: (AB - K) / AB', value: (r) => r.contactPct, format: (v) => fmtPct(v as number) },
    { key: 'qab', label: 'QAB%', title: 'Quality at-bats per settings definition', value: (r) => r.qabPct, format: (v) => fmtPct(v as number) },
    { key: 'babip', label: 'BABIP', value: (r) => r.babip, format: (v) => fmt3(v as number) },
    { key: 'risp', label: 'BA/RISP', value: (r) => r.baRisp, format: (v, r) => (r.abRisp ? `${fmt3(v as number)} (${r.abRisp})` : '-') },
    { key: 'ld', label: 'LD%', title: 'Of balls in play with a recorded trajectory', value: (r) => r.ldPct, format: (v, r) => (r.trajectoryKnown ? `${fmtPct(v as number)} (${r.trajectoryKnown})` : '-') },
    { key: 'gb', label: 'GB%', value: (r) => r.gbPct, format: (v) => fmtPct(v as number) },
    { key: 'fb', label: 'FB%', value: (r) => r.fbPct, format: (v) => fmtPct(v as number) },
    { key: 'hh', label: 'Hard%', title: 'Observed hard-hit rate (not Statcast)', value: (r) => r.hardHitPct, format: (v, r) => (r.hardnessKnown ? `${fmtPct(v as number)} (${r.hardnessKnown})` : '-') },
    { key: 'hho', label: 'Hard outs', value: (r) => (r.hardnessKnown ? r.hardHitOuts : null) },
    { key: 'ps', label: 'PS/PA', title: 'Pitches seen per PA, when recorded', value: (r) => r.psPerPa, format: (v, r) => (r.pitchesSeenPa ? `${fmt2(v as number)} (${r.pitchesSeenPa})` : '-') }
  ];
  const pitchingCols: Column<PitchingLine>[] = [
    { key: 'name', label: 'Pitcher', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'g', label: 'G', value: (r) => r.games },
    { key: 'gs', label: 'GS', value: (r) => r.gs },
    { key: 'ip', label: 'IP', value: (r) => r.outs, format: (v) => outsToInnings(v as number) },
    { key: 'bf', label: 'BF', value: (r) => r.bf },
    { key: 'era', label: 'ERA', title: `Per ${settings.defaultEraInnings || 7} innings`, value: (r) => r.era, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 'whip', label: 'WHIP', value: (r) => r.whip, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 'h', label: 'H', value: (r) => r.h },
    { key: 'r', label: 'R', value: (r) => r.r },
    { key: 'er', label: 'ER', value: (r) => r.er, format: (v, r) => `${v}${r.erBasis !== 'calculated' ? '*' : ''}` },
    { key: 'bb', label: 'BB', value: (r) => r.bb },
    { key: 'so', label: 'SO', value: (r) => r.so },
    { key: 'kl', label: 'K-L', value: (r) => r.soLooking },
    { key: 'hbp', label: 'HBP', value: (r) => r.hbp },
    { key: 'hr', label: 'HR', value: (r) => r.hr },
    { key: 'wp', label: 'WP', value: (r) => r.wp },
    { key: 'sb', label: 'SB', value: (r) => r.sb },
    { key: 'baa', label: 'BAA', value: (r) => r.baa, format: (v) => fmt3(v as number), lowerIsBetter: true },
    { key: 'bbinn', label: 'BB/INN', value: (r) => r.bbPerInn, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 'kbf', label: 'K/BF', value: (r) => r.kPerBf, format: (v) => fmtPct(v as number) },
    { key: 'kbb', label: 'K/BB', value: (r) => r.kPerBb, format: (v) => fmt2(v as number) },
    { key: 'p', label: 'P', title: 'Total pitches when every appearance has a count', value: (r) => r.pitches, format: (v, r) => (v == null ? (r.pitchesKnownAppearances ? `? (${r.pitchesKnownAppearances}/${r.appearances} known)` : '-') : String(v)) },
    { key: 'pip', label: 'P/IP', value: (r) => r.pPerIp, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 's', label: 'S%', title: 'Strike percentage (pitch-by-pitch only)', value: (r) => r.strikePct, format: (v) => fmtPct(v as number) },
    { key: 'fps', label: 'FPS%', value: (r) => r.fpsPct, format: (v) => fmtPct(v as number) }
  ];
  const fieldingCols: Column<FieldingLine>[] = [
    { key: 'name', label: 'Player', value: (r) => pn(r.playerId), align: 'left' },
    { key: 'g', label: 'G', value: (r) => r.games },
    { key: 'inn', label: 'INN', value: (r) => r.outs, format: (v) => outsToInnings(v as number) },
    { key: 'tc', label: 'TC', value: (r) => r.tc },
    { key: 'po', label: 'PO', value: (r) => r.po },
    { key: 'a', label: 'A', value: (r) => r.a },
    { key: 'e', label: 'E', value: (r) => r.e },
    { key: 'dp', label: 'DP', value: (r) => r.dp },
    { key: 'fpct', label: 'FPCT', value: (r) => r.fpct, format: (v) => fmt3(v as number) },
    { key: 'e10', label: 'E/10 inn', value: (r) => r.errorsPer10Inn, format: (v) => fmt2(v as number), lowerIsBetter: true },
    { key: 'ropp', label: 'Routine', title: 'Routine opportunities recorded (observational)', value: (r) => r.routineOpps },
    { key: 'rconv', label: 'Routine %', value: (r) => r.routineConversionPct, format: (v) => fmtPct(v as number) },
    { key: 'diff', label: 'Difficult made', value: (r) => (r.difficultOpps ? `${r.difficultMade}/${r.difficultOpps}` : null) },
    { key: 'conf', label: 'Obs. sample', value: (r) => r.observationalConfidence, align: 'right' }
  ];

  const sourceRows: BattingLine[] = source === 'scored' ? batting : source === 'imported' ? (importedBatting as any) : combinedBatting;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1>Stats</h1>
        {teams.length > 1 && (
          <select className="input" style={{ width: 'auto', minHeight: 40 }} value={tid ?? ''} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {!tid && <div className="empty">Set up your team first.</div>}
      {record && (
        <div className="kpi" style={{ marginBottom: 12 }}>
          <div className="k"><div className="v">{record.w}-{record.l}{record.t ? `-${record.t}` : ''}</div><div className="l">Record ({record.games} final)</div></div>
          <div className="k"><div className="v">{record.runsFor}</div><div className="l">Runs scored</div></div>
          <div className="k"><div className="v">{record.runsAgainst}</div><div className="l">Runs allowed</div></div>
          <div className="k"><div className="v">{finals.length}</div><div className="l">Games in view</div></div>
        </div>
      )}
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Link className="btn sm" to="/stats/positions">Position comparison</Link>
        <Link className="btn sm" to="/stats/lineup">Lineup lab</Link>
        <Link className="btn sm" to="/stats/pitching">Pitching workload</Link>
        <Link className="btn sm" to="/stats/tournaments">Tournaments</Link>
        {settings.focusPlayerId && <Link className="btn sm primary" to={`/stats/player/${settings.focusPlayerId}`}>{pn(settings.focusPlayerId)}</Link>}
      </div>
      <ScopeChips scope={scope} setScope={setScope} tournaments={tournaments} />
      <div className="chips" style={{ marginBottom: 12 }}>
        {(['batting', 'pitching', 'fielding', 'time'] as const).map((t) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t === 'time' ? 'Playing time' : t[0].toUpperCase() + t.slice(1)}</button>
        ))}
        {snapshot && <button className={`chip ${tab === 'imported' ? 'on' : ''}`} onClick={() => setTab('imported')}>Imported (GameChanger)</button>}
      </div>

      {tab === 'batting' && (
        <>
          {snapshot && (
            <div className="row wrap" style={{ marginBottom: 8 }}>
              <span className="muted small">Source:</span>
              <button className={`chip sm ${source === 'scored' ? 'on' : ''}`} onClick={() => setSource('scored')}>Scored in Dugout Dad</button>
              <button className={`chip sm ${source === 'imported' ? 'on' : ''}`} onClick={() => setSource('imported')}>Imported totals</button>
              <button className={`chip sm ${source === 'combined' ? 'on' : ''}`} onClick={() => setSource('combined')} disabled={!combinable.ok} title={combinable.reason}>Combined</button>
              {!combinable.ok && <span className="muted small">Combined is off: {combinable.reason}</span>}
            </div>
          )}
          <StatsTable rows={sourceRows} columns={battingCols} rowKey={(r) => r.playerId} defaultSort="ops" highlight={(r) => r.playerId === settings.focusPlayerId} totalRow={sourceRows.length && source === 'scored' ? teamBattingTotals(batting) : undefined} onRowClick={(r) => nav(`/stats/player/${r.playerId}`)} emptyText="No scored at-bats in this view yet." />
          <p className="muted small" style={{ marginTop: 6 }}>Counts in parentheses are the number of observations behind a rate. Hard% is what you observed from the stands, not a measured exit velocity.</p>
        </>
      )}
      {tab === 'pitching' && (
        <>
          <StatsTable rows={pitching} columns={pitchingCols} rowKey={(r) => r.playerId} defaultSort="ip" highlight={(r) => r.playerId === settings.focusPlayerId} onRowClick={(r) => nav(`/stats/player/${r.playerId}`)} emptyText="No pitching recorded in this view." />
          <p className="muted small" style={{ marginTop: 6 }}>* earned runs include games scored without fielding detail (assumed no errors).</p>
        </>
      )}
      {tab === 'fielding' && (
        <>
          <StatsTable rows={fieldingByPlayer} columns={fieldingCols} rowKey={(r) => `${r.playerId}`} defaultSort="inn" highlight={(r) => r.playerId === settings.focusPlayerId} onRowClick={(r) => nav(`/stats/player/${r.playerId}`)} emptyText="No defensive innings recorded in this view." />
          <p className="muted small" style={{ marginTop: 6 }}>Per-position breakdowns and the position comparison live under Position comparison and on each player's page.</p>
        </>
      )}
      {tab === 'time' && (
        <>
          <div className="section-title"><h3>Here, playing, or sitting</h3><span className="muted small">{availability.length} on the roster</span></div>
          <StatsTable rows={availability} columns={availCols} rowKey={(r) => r.playerId} defaultSort="benchPct" highlight={(r) => r.playerId === settings.focusPlayerId} onRowClick={(r) => nav(`/stats/player/${r.playerId}`)} emptyText="No games with a roster yet." />
          <p className="muted small" style={{ marginTop: 6, marginBottom: 14 }}>Everyone on the roster counts as here unless marked absent at game setup or hurt or gone from Fix during the game. Bench is innings available minus innings in the field. Games scored before this was added have no roster, so only players who appeared are counted for them.</p>
          <div className="section-title"><h3>By position</h3></div>
        <div className="list">
          {times.map((t) => (
            <div key={t.playerId} className={`card ${t.playerId === settings.focusPlayerId ? 'focus' : ''}`} style={{ padding: 10, cursor: 'pointer' }} onClick={() => nav(`/stats/player/${t.playerId}`)}>
              <div className="row between">
                <strong>{pn(t.playerId)}</strong>
                <span className="small">{t.totalInningsText} of {outsToInnings(t.teamDefensiveOuts)} team innings ({fmtPct(t.pctOfTeamInnings)})</span>
              </div>
              <div className="row wrap" style={{ marginTop: 6 }}>
                {t.byPosition.sort((a, b) => b.outs - a.outs).map((p) => (
                  <span key={p.position} className="pill">{POSITION_LABEL[p.position as 1]} {p.inningsText} ({fmtPct(p.pctOfPlayerTime)})</span>
                ))}
              </div>
            </div>
          ))}
          {times.length === 0 && <div className="empty">No defensive innings yet.</div>}
        </div>
        </>
      )}
      {tab === 'imported' && snapshot && (
        <ImportedView snapshot={snapshot} pn={pn} importedBatting={importedBatting as any} importedPitching={importedPitching as any} battingCols={battingCols} pitchingCols={pitchingCols} focus={settings.focusPlayerId} />
      )}
    </div>
  );
}

function ImportedView({ snapshot, pn, importedBatting, importedPitching, battingCols, pitchingCols, focus }: { snapshot: any; pn: (id: string) => string; importedBatting: BattingLine[]; importedPitching: PitchingLine[]; battingCols: Column<BattingLine>[]; pitchingCols: Column<PitchingLine>[]; focus?: string }) {
  const fieldRows = snapshot.rows.filter((r: any) => r.playerId).map((r: any) => ({ playerId: r.playerId, f: snapshotFieldingLines(r) }));
  return (
    <>
      <div className="banner info">Imported from {snapshot.fileName} (as of {snapshot.asOfDate}). These are season totals from GameChanger, kept separate from games scored here. GameChanger does not say which position each error happened at, so position-level errors are not shown for imported data.</div>
      <div className="section-title"><h3>Batting (imported)</h3></div>
      <StatsTable rows={importedBatting} columns={battingCols.filter((c) => !['hho', 'ps'].includes(c.key))} rowKey={(r) => r.playerId} defaultSort="ops" highlight={(r) => r.playerId === focus} />
      <div className="section-title"><h3>Pitching (imported)</h3></div>
      <StatsTable rows={importedPitching} columns={pitchingCols} rowKey={(r) => r.playerId} defaultSort="ip" highlight={(r) => r.playerId === focus} />
      <div className="section-title"><h3>Innings by position (imported)</h3></div>
      <div className="table-wrap">
        <table className="stats">
          <thead><tr><th style={{ textAlign: 'left' }}>Player</th>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => <th key={p}>{POSITION_LABEL[p as 1]}</th>)}<th>Total</th><th>E</th><th>FPCT</th></tr></thead>
          <tbody>
            {fieldRows.sort((a: any, b: any) => (b.f.player.totalOuts ?? 0) - (a.f.player.totalOuts ?? 0)).map((row: any) => (
              <tr key={row.playerId} className={row.playerId === focus ? 'focus' : ''}>
                <td>{pn(row.playerId)}</td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => { const bp = row.f.byPosition.find((x: any) => x.position === p); return <td key={p} className={!bp || !bp.outs ? 'na' : ''}>{bp && bp.outs ? bp.inningsText : '-'}</td>; })}
                <td>{row.f.player.totalInningsText ?? '-'}</td>
                <td>{row.f.player.e}</td>
                <td>{row.f.player.fpct != null ? fmt3(row.f.player.fpct) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
