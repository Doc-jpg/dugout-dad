import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllReplays, usePlayerMap, useSettings, useTeams, fmt3, fmt2, fmtPct } from '../hooks';
import { filterReplays } from '../../engine/stats';
import { weightedBattingLines, recommendLineup, simulateLineupRuns, simOutcomesFromLine, SMALL_SAMPLE_PA } from '../../engine/lineup';
import { playerName, saveSettings } from '../../db/db';

/** Batting order analysis: season plus recent weighting, recommendation, alternatives, rough simulation. */
export function LineupLabPage() {
  const replays = useAllReplays();
  const players = usePlayerMap();
  const teams = useTeams();
  const settings = useSettings();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const tid = myTeam?.id;
  const roster = useMemo(() => [...players.values()].filter((p) => p.teamId === tid && p.status !== 'former' && p.status !== 'inactive'), [players, tid]);
  const [eligible, setEligible] = useState<Set<string> | null>(null);
  const eligibleIds = eligible ?? new Set(roster.filter((p) => p.status === 'regular').map((p) => p.id));
  const [recentGames, setRecentGames] = useState(settings.lineupWeights.recentGames);
  const [recentWeight, setRecentWeight] = useState(settings.lineupWeights.recent);
  const [slots, setSlots] = useState(9);
  const all = useMemo(() => (replays && tid ? filterReplays(replays, { teamId: tid }).filter((r) => r.state.started) : []), [replays, tid]);

  const entries = useMemo(() => (tid ? weightedBattingLines(all, { teamId: tid, playerIds: [...eligibleIds], recentGames, seasonWeight: 1 - recentWeight, recentWeight, qab: settings.qab }) : []), [all, tid, eligibleIds, recentGames, recentWeight, settings.qab]);
  const rec = useMemo(() => (entries.length ? recommendLineup(entries, { slots: Math.min(slots, entries.length) }) : null), [entries, slots]);
  const simLines = useMemo(() => Object.fromEntries(entries.map((e) => [e.playerId, simOutcomesFromLine(e.season)])), [entries]);
  const sims = useMemo(() => {
    if (!rec) return null;
    const main = simulateLineupRuns(rec.order.map((o) => o.playerId), simLines, 1500, 7);
    const alts = rec.alternatives.map((a) => ({ label: a.label, ...simulateLineupRuns(a.order, simLines, 1500, 7) }));
    return { main, alts };
  }, [rec, simLines]);
  const pn = (id: string) => playerName(players.get(id), 'short');
  const toggle = (id: string) => {
    const n = new Set(eligibleIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setEligible(n);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}><Link to="/stats" className="btn ghost sm">‹ Stats</Link></div>
      <h1>Lineup lab</h1>
      <p className="muted small">Season evidence with recent form overweighted, shrunk toward the team average for small samples. A tool for thinking, not a verdict; youth samples are tiny.</p>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Eligible (tap to include or exclude)</h3>
        <div className="chips">
          {roster.sort((a, b) => (parseInt(a.number ?? '999', 10) || 999) - (parseInt(b.number ?? '999', 10) || 999)).map((p) => (
            <button key={p.id} className={`chip sm ${eligibleIds.has(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
              {p.number ? `#${p.number} ` : ''}{playerName(p, 'short')}{p.status !== 'regular' ? ` (${p.status})` : ''}
            </button>
          ))}
        </div>
        <div className="inline-fields" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Recent window (games)</label>
            <select className="input" value={recentGames} onChange={(e) => setRecentGames(parseInt(e.target.value, 10))}>{[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="field">
            <label>Recent weight</label>
            <select className="input" value={recentWeight} onChange={(e) => setRecentWeight(parseFloat(e.target.value))}>
              {[0, 0.1, 0.15, 0.2, 0.3].map((w) => <option key={w} value={w}>{Math.round(w * 100)}% recent / {Math.round((1 - w) * 100)}% season</option>)}
            </select>
          </div>
        </div>
        <div className="inline-fields">
          <div className="field">
            <label>Batting order length</label>
            <select className="input" value={slots} onChange={(e) => setSlots(parseInt(e.target.value, 10))}>{[9, 10, 11, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn" onClick={() => saveSettings({ lineupWeights: { season: 1 - recentWeight, recent: recentWeight, recentGames } })}>Save as default</button>
          </div>
        </div>
      </div>

      {rec && (
        <>
          <div className="section-title"><h3>Recommended order</h3>{sims && <span className="muted small">sim: {fmt2(sims.main.meanRuns)} runs / 7 inn</span>}</div>
          <div className="list">
            {rec.order.map((o) => {
              const e = entries.find((x) => x.playerId === o.playerId)!;
              return (
                <div key={o.slot} className={`item ${o.playerId === settings.focusPlayerId ? 'focus' : ''}`}>
                  <span className="num" style={{ width: 24, fontWeight: 800, color: 'var(--ink-3)' }}>{o.slot}</span>
                  <div className="grow">
                    <div className="title">{pn(o.playerId)} <span className="muted small">{e.sampleNote}</span></div>
                    <div className="sub">{o.reason} · wOBP {fmt3(e.weighted.obp)} · wSLG {fmt3(e.weighted.slg)} · K {fmtPct(e.weighted.kPct)} · BB {fmtPct(e.weighted.bbPct)} · {e.season.pa} PA{e.recent.pa ? `, last ${recentGames}: ${fmt3(e.recent.obp)} OBP in ${e.recent.pa} PA` : ''}</div>
                  </div>
                  <span className="pill">{fmt2(rec.expectedPaPer7Innings[o.playerId])} PA/g</span>
                </div>
              );
            })}
          </div>
          {rec.weakStretches.length > 0 && <div className="banner warn" style={{ marginTop: 8 }}>{rec.weakStretches.map((w) => w.note).join(' ')}</div>}
          <div className="card small" style={{ marginTop: 8 }}>
            <strong>Caveats</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{rec.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <p className="muted" style={{ marginTop: 6 }}>Method: rates from every recorded plate appearance (season), with the last {recentGames} games counted again at {Math.round(recentWeight * 100)}% weight (recent games are part of the season sample, so this is an overweight of recent form, not a double count). Each rate is shrunk toward the team mean with 20 PA of prior. Composite = adjusted OBP × 1.8 + adjusted SLG. Players under {SMALL_SAMPLE_PA} PA are marked.</p>
          </div>
          <div className="section-title"><h3>Alternatives</h3></div>
          <div className="list">
            {rec.alternatives.map((a, i) => (
              <div key={a.label} className="card" style={{ padding: 10 }}>
                <div className="row between"><strong>{a.label}</strong>{sims && <span className="muted small">sim: {fmt2(sims.alts[i].meanRuns)} runs / 7 inn</span>}</div>
                <div className="small" style={{ marginTop: 4 }}>{a.order.map((id, j) => `${j + 1}. ${pn(id)}`).join('  ')}</div>
                <div className="muted small" style={{ marginTop: 4 }}>{a.note}</div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>Simulation is a rough Monte Carlo over 7 innings with simple runner advancement, seeded so it is repeatable. Differences of a few tenths of a run are noise at these sample sizes.</p>
        </>
      )}
      {!rec && <div className="empty">Score a few games first, then this page has something to work with.</div>}
    </div>
  );
}
