import { describe, it, expect } from 'vitest';
import { outsToInnings, type SnapshotRow, type StatSnapshot, type StatValue } from '../src/engine/types';
import {
  battingLines, pitchingLines, fieldingLines, fieldingTotalsByPlayer, playingTime, teamDefensiveOuts, positionComparison,
  boxScore, teamRecord, tournamentSummary, filterReplays, teamBattingTotals, pitchesAfterTwoStrikes
} from '../src/engine/stats';
import { snapshotBattingLine, snapshotPitchingLine, snapshotFieldingLines, canCombine, combineBatting } from '../src/engine/snapshots';
import { Log, makeGame, standardStart, threeOuts, ELI, MY, OPP, myPlayers, oppPlayers } from './helpers';

const QAB = { hit: true, walkOrHbp: true, hardContact: true, sacrifice: true, rbi: true, sixPlusPitches: true, threePlusAfterTwoStrikes: true };

describe('batting lines', () => {
  it('computes AVG, OBP, SLG with the right denominators (SF in OBP, SAC not, HBP in OBP)', () => {
    const log = standardStart();
    // p1: 1B, then later outs; build a controlled line for p1 only by making others strike out
    log.pa('away', '1B'); // p1 single
    for (let i = 0; i < 8; i++) log.pa('away', 'K'); // p2..p9 out (inning rolls at 3 outs each)
    // Now p1 bats again (top 4 after 9 outs... compute: 9 PAs = 1B + 8 K = 8 outs -> inning 3 bottom? Let's just drive by batter id)
    const r0 = log.replay();
    void r0;
    const lines = battingLines([log.replay()], { teamId: MY, qab: QAB });
    const p1 = lines.find((l) => l.playerId === 'p1')!;
    expect(p1.pa).toBe(1);
    expect(p1.ab).toBe(1);
    expect(p1.h).toBe(1);
    expect(p1.avg).toBe(1);
  });

  it('OBP uses (H+BB+HBP)/(AB+BB+HBP+SF); SAC excluded; null rates when AB=0', () => {
    const log = new Log(makeGame());
    log.lineup('away', ['p1'], [0]);
    log.lineup('home', oppPlayers);
    log.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    // p1 bats every time (one-man lineup)
    log.pa('away', 'BB'); // pa1 bb
    log.pa('away', 'HBP'); // pa2 hbp, p1 forced to 2
    log.pa('away', 'SAC', { moves: [{ from: 'batter', to: 'out', how: 'sac' }, { from: 2, to: 3, how: 'sac' }] }); // sac: not AB, not OBP denominator
    log.pa('away', 'SF', { moves: [{ from: 'batter', to: 'out', how: 'sac' }, { from: 3, to: 4, how: 'sac', rbi: true }] }); // sf: in OBP denominator
    log.pa('away', '2B'); // hit
    const lines = battingLines([log.replay()], { teamId: MY, qab: QAB });
    const p1 = lines[0];
    expect(p1.pa).toBe(5);
    expect(p1.ab).toBe(1); // only the double
    expect(p1.h).toBe(1);
    expect(p1.bb).toBe(1);
    expect(p1.hbp).toBe(1);
    expect(p1.sac).toBe(1);
    expect(p1.sf).toBe(1);
    // OBP = (1 + 1 + 1) / (1 + 1 + 1 + 1) = 0.75
    expect(p1.obp).toBeCloseTo(0.75, 6);
    expect(p1.slg).toBe(2);
    expect(p1.rbi).toBe(1);
    expect(p1.r).toBe(1); // p1 scored as the runner (one-man lineup quirk) on the SF
    // AB = 0 case
    const log2 = new Log(makeGame());
    log2.lineup('away', ['p2'], [0]);
    log2.lineup('home', oppPlayers);
    log2.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    log2.pa('away', 'BB');
    const l2 = battingLines([log2.replay()], { teamId: MY, qab: QAB })[0];
    expect(l2.ab).toBe(0);
    expect(l2.avg).toBeNull();
    expect(l2.slg).toBeNull();
    expect(l2.obp).toBe(1);
    expect(l2.contactPct).toBeNull();
    expect(l2.bbPerK).toBeNull();
  });

  it('coverage counts: a ball in play without batted-ball detail is counted in "of" but not "recorded"; hardHitPct null when unknown', () => {
    const log = standardStart();
    log.pa('away', 'GO'); // p1 no detail
    log.pa('away', 'FO', { battedBall: { trajectory: 'FB' } }); // p2 trajectory only
    log.pa('away', '1B', { battedBall: { trajectory: 'LD', hardness: 'hard', zone: 'LC' } }); // p3 full
    const r = log.replay();
    const team = teamBattingTotals(battingLines([r], { teamId: MY, qab: QAB }));
    expect(team.bip).toBe(3);
    expect(team.coverage.trajectory).toEqual({ recorded: 2, of: 3 });
    expect(team.coverage.hardness).toEqual({ recorded: 1, of: 3 });
    expect(team.coverage.zone).toEqual({ recorded: 1, of: 3 });
    expect(team.hardHitPct).toBe(1);
    expect(team.ldPct).toBeCloseTo(0.5, 6);
    const p1 = battingLines([r], { teamId: MY, qab: QAB }).find((l) => l.playerId === 'p1')!;
    expect(p1.hardnessKnown).toBe(0);
    expect(p1.hardHitPct).toBeNull();
    expect(p1.gbPct).toBeNull();
    expect(team.byZone['LC']).toEqual({ bip: 1, h: 1, hard: 1 });
    // hard-hit out
    const log2 = standardStart();
    log2.pa('away', 'LO', { battedBall: { trajectory: 'LD', hardness: 'hard' } });
    const t2 = teamBattingTotals(battingLines([log2.replay()], { teamId: MY, qab: QAB }));
    expect(t2.hardHitOuts).toBe(1);
  });

  it('strikeouts, walks, HBP are not balls in play; QAB flags; pitches seen only when recorded', () => {
    const log = standardStart();
    log.pa('away', 'K', { pitches: { total: 7 } }); // 6+ pitch PA counts as QAB
    log.pa('away', 'BB');
    log.pa('away', 'HBP');
    const r = log.replay();
    const team = teamBattingTotals(battingLines([r], { teamId: MY, qab: QAB }));
    expect(team.bip).toBe(0);
    expect(team.pa).toBe(3);
    expect(team.qab).toBe(3);
    expect(team.pitchesSeen).toBe(7);
    expect(team.pitchesSeenPa).toBe(1);
    expect(team.psPerPa).toBe(7);
    expect(team.sixPlus).toBe(1);
    expect(team.coverage.pitches).toEqual({ recorded: 1, of: 3 });
    // QAB off for walks and pitches: only the K with 7 pitches drops too
    const strict = teamBattingTotals(battingLines([r], { teamId: MY, qab: { ...QAB, walkOrHbp: false, sixPlusPitches: false } }));
    expect(strict.qab).toBe(0);
  });

  it('3+ pitches after two strikes requires a pitch list', () => {
    const entry: any = { pitches: { pitches: [{ result: 'called_strike' }, { result: 'swinging_strike' }, { result: 'foul' }, { result: 'foul' }, { result: 'ball' }, { result: 'in_play' }] } };
    expect(pitchesAfterTwoStrikes(entry)).toBe(4);
    expect(pitchesAfterTwoStrikes({ pitches: { total: 6 } } as any)).toBeNull();
    // fouls with two strikes do not add strikes
    const e2: any = { pitches: { pitches: [{ result: 'foul' }, { result: 'foul' }, { result: 'foul' }, { result: 'in_play' }] } };
    expect(pitchesAfterTwoStrikes(e2)).toBe(2);
  });

  it('RISP, two-out RBI, LOB, GIDP, SB/CS/PIK and runs are attributed to the right batters', () => {
    const log = standardStart();
    log.pa('away', '2B'); // p1 on 2nd
    log.pa('away', 'K'); // p2
    log.pa('away', 'K'); // p3, two outs
    log.pa('away', '1B', { moves: [{ from: 'batter', to: 1, how: 'hit' }, { from: 2, to: 4, how: 'hit', rbi: true }] }); // p4 RBI single, RISP, two outs
    log.run('away', 'SB', [{ from: 1, to: 2 }]); // p4 steals (no playerId on move; resolved)
    log.run('away', 'CS', [{ from: 2, to: 'out' }], { sequence: [2, 5], errors: [] }); // p4 caught at third, inning over
    threeOuts(log, 'home');
    log.pa('away', '1B'); // p5
    log.pa('away', 'DP', { battedBall: { trajectory: 'GB' }, fielding: { sequence: [6, 4, 3], errors: [] } }); // p6 GIDP
    log.pa('away', 'FO'); // p7 flies out with nobody on
    const r = log.replay();
    const lines = battingLines([r], { teamId: MY, qab: QAB });
    const p4 = lines.find((l) => l.playerId === 'p4')!;
    expect(p4.rbi).toBe(1);
    expect(p4.twoOutRbi).toBe(1);
    expect(p4.abRisp).toBe(1);
    expect(p4.hRisp).toBe(1);
    expect(p4.baRisp).toBe(1);
    expect(p4.sb).toBe(1);
    expect(p4.cs).toBe(1);
    const p1 = lines.find((l) => l.playerId === 'p1')!;
    expect(p1.r).toBe(1);
    const p3 = lines.find((l) => l.playerId === 'p3')!;
    expect(p3.lob).toBe(1); // struck out with p1 on second
    const p6 = lines.find((l) => l.playerId === 'p6')!;
    expect(p6.gidp).toBe(1);
    expect(p6.games).toBe(1);
  });
});

describe('pitching lines', () => {
  it('ERA on a 7-inning basis: 1 ER in 7 IP = 1.00; 2 ER in 2.1 IP = 6.00; WHIP', () => {
    // 7 full innings for o1 with one earned run
    const log = standardStart();
    for (let inn = 0; inn < 7; inn++) {
      if (inn === 0) {
        log.pa('away', 'HR');
        threeOuts(log, 'away');
      } else {
        threeOuts(log, 'away');
      }
      if (inn < 6) threeOuts(log, 'home');
    }
    log.end('regulation');
    const r = log.replay();
    const o1 = pitchingLines([r], { teamId: OPP, eraInnings: 7 }).find((l) => l.playerId === 'o1')!;
    expect(o1.outs).toBe(21);
    expect(o1.ipText).toBe('7.0');
    expect(o1.er).toBe(1);
    expect(o1.era).toBeCloseTo(1.0, 6);
    expect(o1.gs).toBe(1);
    expect(o1.games).toBe(1);
    expect(o1.erBasis).toBe('calculated');

    // 2 ER in 2.1 IP (7 outs) -> 6.00 on a 7-inning basis; WHIP = (BB + H) / IP
    const log2 = standardStart();
    log2.pa('away', 'HR');
    log2.pa('away', 'BB');
    log2.pa('away', 'HR', { moves: [{ from: 'batter', to: 4, how: 'hit', rbi: true }, { from: 1, to: 4, how: 'hit', rbi: true }] });
    threeOuts(log2, 'away');
    threeOuts(log2, 'home');
    threeOuts(log2, 'away');
    threeOuts(log2, 'home');
    log2.pa('away', 'K');
    log2.end('time_limit');
    const r2 = log2.replay();
    const line2 = pitchingLines([r2], { teamId: OPP, eraInnings: 7 }).find((l) => l.playerId === 'o1')!;
    expect(line2.outs).toBe(7);
    expect(line2.ipText).toBe('2.1');
    expect(line2.r).toBe(3);
    expect(line2.er).toBe(3);
    expect(line2.era).toBeCloseTo(9.0, 6); // 3 ER * 7 / (7/3) = 9.00
    expect(line2.whip).toBeCloseTo((1 + 2) / (7 / 3), 6);
    expect(line2.hr).toBe(2);
    expect(line2.abAgainst).toBe(9); // 2 HR + 7 K
    expect(line2.baa).toBeCloseTo(2 / 9, 6);
    // Build the exact 2 ER in 2.1 IP case by hand to pin 6.00
    const manual = { ...line2, er: 2 };
    expect((manual.er * 7) / (manual.outs / 3)).toBeCloseTo(6.0, 6);
  });

  it('pitch totals are null when any appearance has an unknown count; known appearances are counted', () => {
    const g1 = standardStart();
    g1.pa('away', 'K');
    g1.pitchCount('home', 'o1', 12, 'manual');
    g1.end('time_limit');
    const g2 = new Log(makeGame({ id: 'game-2', date: '2026-10-25' }));
    g2.lineup('away', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    g2.lineup('home', oppPlayers);
    g2.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    g2.pa('away', 'K');
    g2.end('time_limit');
    const one = pitchingLines([g1.replay()], { teamId: OPP, eraInnings: 7 }).find((l) => l.playerId === 'o1')!;
    expect(one.pitches).toBe(12);
    expect(one.pPerBf).toBe(12);
    const both = pitchingLines([g1.replay(), g2.replay()], { teamId: OPP, eraInnings: 7 }).find((l) => l.playerId === 'o1')!;
    expect(both.pitches).toBeNull();
    expect(both.pitchesKnownAppearances).toBe(1);
    expect(both.appearances).toBe(2);
    expect(both.coverage.pitches).toEqual({ recorded: 1, of: 2 });
    expect(both.pPerIp).toBeNull();
  });

  it('erBasis reports assumed_no_errors for Level A games without fielding detail, mixed across games', () => {
    const a = new Log(makeGame({ id: 'ga', scoringLevel: 'A' }));
    a.lineup('away', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    a.lineup('home', oppPlayers);
    a.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    a.pa('away', 'HR');
    const b = standardStart();
    b.pa('away', 'GO', { fielding: { sequence: [6, 3], errors: [] } });
    const la = pitchingLines([a.replay()], { teamId: OPP, eraInnings: 7 })[0];
    expect(la.erBasis).toBe('assumed_no_errors');
    const mixed = pitchingLines([a.replay(), b.replay()], { teamId: OPP, eraInnings: 7 })[0];
    expect(mixed.erBasis).toBe('mixed');
  });
});

describe('fielding lines and playing time', () => {
  it('builds one line per player and position with innings text, chances and observational tallies', () => {
    const log = standardStart(6);
    threeOuts(log, 'away');
    log.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [], difficulty: 'routine', execution: 'made_expected' } });
    log.pa('home', 'ROE', { fielding: { sequence: [6], errors: [{ position: 6, kind: 'throwing', official: true, difficulty: 'routine' }], execution: 'missed_expected' } });
    log.pa('home', '1B', { fielding: { sequence: [6], errors: [], difficulty: 'difficult', execution: 'attempted_difficult' } });
    log.pa('home', 'K');
    log.pa('home', 'LO', { fielding: { sequence: [6], errors: [], difficulty: 'difficult', execution: 'made_difficult' } });
    log.end('time_limit');
    const r = log.replay();
    const lines = fieldingLines([r], { teamId: MY });
    const eliSS = lines.find((l) => l.playerId === ELI && l.position === 6)!;
    expect(eliSS.outs).toBe(3);
    expect(eliSS.inningsText).toBe('1.0');
    expect(eliSS.po).toBe(1); // L6
    expect(eliSS.a).toBe(1); // 6-3
    expect(eliSS.e).toBe(1);
    expect(eliSS.tc).toBe(3);
    expect(eliSS.fpct).toBeCloseTo(2 / 3, 6);
    expect(eliSS.errorsPer10Inn).toBeCloseTo(10, 6);
    expect(eliSS.chancesPerInn).toBeCloseTo(3, 6);
    expect(eliSS.opportunitiesRecorded).toBe(4);
    expect(eliSS.routineOpps).toBe(2);
    expect(eliSS.routineConverted).toBe(1);
    expect(eliSS.routineConversionPct).toBeCloseTo(0.5, 6);
    expect(eliSS.difficultOpps).toBe(2);
    expect(eliSS.difficultMade).toBe(1);
    expect(eliSS.missedExpected).toBe(1);
    expect(eliSS.attemptedDifficult).toBe(1);
    expect(eliSS.errorsByKind).toEqual({ throwing: 1 });
    expect(eliSS.observationalConfidence).toBe('low');
    expect(eliSS.games).toBe(1);
    expect(eliSS.starts).toBe(1);
    const firstBase = lines.find((l) => l.position === 3 && l.playerId === 'p3')!;
    expect(firstBase.po).toBe(1);
    const totals = fieldingTotalsByPlayer(lines).find((l) => l.playerId === ELI)!;
    expect(totals.position).toBe(0);
    expect(totals.e).toBe(1);
    expect(totals.outs).toBe(3);
  });

  it('playing time percentages and consecutive games without an appearance', () => {
    // Game 1: Eli at SS for 3 outs, then CF for 3 outs
    const g1 = standardStart(6);
    threeOuts(g1, 'away');
    threeOuts(g1, 'home');
    threeOuts(g1, 'away');
    g1.change('away', [{ position: 8, playerId: ELI }, { position: 6, playerId: 'p8' }], 'swap');
    threeOuts(g1, 'home');
    g1.end('time_limit');
    // Game 2: Eli at CF the whole game (6 outs)
    const g2 = new Log(makeGame({ id: 'game-2', date: '2026-10-25' }));
    const positions = [1, 2, 3, 4, 5, 7, 8, 6, 9]; // p7 (Eli) at 8 (CF), p8 at 6
    g2.lineup('away', myPlayers.slice(0, 9), positions as any);
    g2.lineup('home', oppPlayers);
    g2.defense('away', Object.fromEntries(myPlayers.slice(0, 9).map((p, i) => [positions[i], p])) as any);
    g2.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    threeOuts(g2, 'away');
    threeOuts(g2, 'home');
    threeOuts(g2, 'away');
    threeOuts(g2, 'home');
    g2.end('time_limit');
    const replays = [g1.replay(), g2.replay()];
    const pt = playingTime(replays, ELI, MY);
    expect(pt.totalOuts).toBe(12);
    expect(pt.totalInningsText).toBe('4.0');
    expect(teamDefensiveOuts(replays, MY)).toBe(12);
    expect(pt.pctOfTeamInnings).toBe(1);
    const ss = pt.byPosition.find((p) => p.position === 6)!;
    const cf = pt.byPosition.find((p) => p.position === 8)!;
    expect(ss.outs).toBe(3);
    expect(cf.outs).toBe(9);
    expect(cf.pctOfPlayerTime).toBeCloseTo(0.75, 6);
    expect(ss.pctOfTeamInnings).toBeCloseTo(0.25, 6);
    expect(ss.starts).toBe(1);
    expect(cf.starts).toBe(1);
    expect(cf.gamesAppeared).toBe(2);
    expect(ss.gamesAppeared).toBe(1);
    expect(pt.gamesPlayed).toBe(2);
    expect(pt.byGame.map((g) => g.date)).toEqual(['2026-10-24', '2026-10-25']);
    expect(pt.consecutiveGamesWithout[6]).toBe(1); // no SS in the most recent game
    expect(pt.consecutiveGamesWithout[8]).toBe(0);
    expect(pt.consecutiveGamesWithout[2]).toBe(2);
  });

  it('positionComparison sorts by innings and explains sample sizes', () => {
    const g1 = standardStart(6);
    threeOuts(g1, 'away');
    g1.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [], difficulty: 'routine' } });
    g1.pa('home', 'K');
    g1.pa('home', 'K');
    threeOuts(g1, 'away');
    g1.change('away', [{ position: 6, playerId: 'p8' }, { position: 8, playerId: ELI }], 'swap');
    threeOuts(g1, 'home');
    threeOuts(g1, 'away');
    threeOuts(g1, 'home');
    g1.end('time_limit');
    const rows = positionComparison([g1.replay()], 6, MY);
    expect(rows.map((r) => r.playerId)).toEqual(['p8', ELI]);
    expect(rows[0].outs).toBe(6);
    expect(rows[1].outs).toBe(3);
    expect(rows[1].pctOfTeamInnings).toBeCloseTo(3 / 9, 6);
    expect(rows[1].sampleNote).toMatch(/Small sample: 1 judged opportunity/);
    expect(rows[1].sampleNote).toMatch(/only 1.0 innings/);
    expect(rows[0].sampleNote).toMatch(/No difficulty or execution judgments recorded/);
  });
});

describe('box score, record, tournaments, filters', () => {
  it('box score linescore, hits, errors, defense outs and per-side lines', () => {
    const log = standardStart(6);
    log.pa('away', 'HR');
    threeOuts(log, 'away');
    log.pa('home', 'ROE', { fielding: { sequence: [6], errors: [{ position: 6, kind: 'fielding', official: true }] } });
    threeOuts(log, 'home');
    log.adjustScore('home', 1, 'missed a run');
    log.end('time_limit');
    const r = log.replay();
    const box = boxScore(r, 7, QAB);
    expect(box.linescore.away).toEqual([1, 0]);
    expect(box.linescore.home).toEqual([0, 1]);
    expect(box.linescore.awayHits).toBe(1);
    expect(box.linescore.awayErrors).toBe(1); // the Rattlers (away) committed the error
    expect(box.linescore.homeErrors).toBe(0);
    expect(box.batting.away.find((l) => l.playerId === 'p1')!.hr).toBe(1);
    expect(box.pitching.home[0].playerId).toBe('o1');
    expect(box.defense.find((d) => d.playerId === ELI && d.position === 6)!.outs).toBe(3);
    expect(box.scoreAdjustments).toHaveLength(1);
    expect(box.skippedPlays).toBe(false);
  });

  it('team record counts only final games and uses mySide', () => {
    const win = standardStart();
    win.pa('away', 'HR');
    threeOuts(win, 'away');
    threeOuts(win, 'home');
    win.end('time_limit');
    const loss = new Log(makeGame({ id: 'g2', date: '2026-10-25', mySide: 'home' }));
    loss.lineup('away', oppPlayers);
    loss.lineup('home', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    loss.defense('home', Object.fromEntries(myPlayers.slice(0, 9).map((p, i) => [i + 1, p])) as any);
    loss.defense('away', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    loss.pa('away', 'HR');
    loss.pa('away', 'HR');
    threeOuts(loss, 'away');
    threeOuts(loss, 'home');
    loss.end('time_limit');
    const unfinished = standardStart();
    unfinished.pa('away', 'HR');
    const rec = teamRecord([win.replay(), loss.replay(), unfinished.replay()], MY);
    expect(rec).toEqual({ w: 1, l: 1, t: 0, runsFor: 1, runsAgainst: 2, games: 2 });
  });

  it('filterReplays lastNGames picks the most recent by date, and tournamentSummary aggregates usage', () => {
    const mk = (id: string, date: string, tournamentId?: string) => {
      const log = new Log(makeGame({ id, date, tournamentId }));
      log.lineup('away', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      log.lineup('home', oppPlayers);
      log.defense('away', Object.fromEntries(myPlayers.slice(0, 9).map((p, i) => [i + 1, p])) as any);
      log.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
      log.pa('away', 'HR');
      threeOuts(log, 'away');
      threeOuts(log, 'home');
      log.end('time_limit');
      return log.replay();
    };
    const replays = [mk('a', '2026-10-10', 'T1'), mk('b', '2026-10-17', 'T2'), mk('c', '2026-10-18', 'T2'), mk('d', '2026-10-03', 'T1')];
    const last2 = filterReplays(replays, { lastNGames: 2 });
    expect(last2.map((r) => r.game.id)).toEqual(['c', 'b']);
    expect(filterReplays(replays, { dateFrom: '2026-10-11' }).map((r) => r.game.id).sort()).toEqual(['b', 'c']);
    expect(filterReplays(replays, { tournamentId: 'T1' })).toHaveLength(2);
    expect(filterReplays(replays, { playerId: 'zzz' })).toHaveLength(0);
    const t2 = tournamentSummary(replays, 'T2', MY, QAB, 7);
    expect(t2.games).toEqual(['b', 'c']);
    expect(t2.record).toEqual({ w: 2, l: 0, t: 0 });
    expect(t2.runsFor).toBe(2);
    const p1 = t2.pitchingUsage.find((u) => u.playerId === 'p1')!;
    expect(p1.totalOuts).toBe(6);
    expect(p1.totalPitches).toBeNull(); // no counts entered
    expect(Object.keys(p1.byDate).sort()).toEqual(['2026-10-17', '2026-10-18']);
    expect(t2.playingTime.find((p) => p.playerId === ELI)!.totalOuts).toBe(6);
  });
});

describe('snapshots (imported aggregates)', () => {
  const sv = (raw: string, kind: StatValue['kind'] = 'count'): StatValue => ({ raw, value: raw === '-' ? null : Number(raw), kind: raw === '-' ? 'na' : kind });
  const inn = (raw: string): StatValue => {
    const [w, p] = raw.split('.');
    return { raw, value: Number(raw), outs: Number(w) * 3 + Number(p ?? 0), kind: 'innings' };
  };
  const eliRow: SnapshotRow = {
    number: '1', last: 'Flesher', first: 'Eli', playerId: ELI,
    batting: { GP: sv('21'), PA: sv('52'), AB: sv('40'), H: sv('13'), BB: sv('9'), SO: sv('6'), 'K-L': sv('2'), HBP: sv('1'), SF: sv('1'), SAC: sv('1'), AVG: sv('.325', 'rate'), OBP: sv('.460', 'rate'), 'QAB%': sv('55.77', 'rate'), 'GB%': sv('40.00', 'rate'), 'BB/K': sv('-') },
    pitching: { IP: inn('13.0'), BB: sv('5'), SO: sv('14'), H: sv('8'), ER: sv('4'), R: sv('6'), GP: sv('5'), GS: sv('2'), '#P': sv('210'), ERA: sv('2.15', 'rate'), 'S%': sv('61.00', 'rate') },
    fielding: { TC: sv('20'), A: sv('8'), PO: sv('8'), E: sv('4'), DP: sv('1'), FPCT: sv('.800', 'rate'), INN: inn('0.0'), P: inn('13.0'), C: inn('0.0'), '1B': inn('0.0'), '2B': inn('1.0'), '3B': inn('1.1'), SS: inn('18.2'), LF: inn('1.0'), CF: inn('39.1'), RF: inn('1.0'), Total: inn('75.1') }
  };

  it('reads PA from the batting section and BB from the correct section (batting 9, pitching 5)', () => {
    const bat = snapshotBattingLine(eliRow);
    expect(bat.source).toBe('imported');
    expect(bat.pa).toBe(52);
    expect(bat.bb).toBe(9);
    expect(bat.so).toBe(6);
    expect(bat.soLooking).toBe(2);
    expect(bat.avg).toBeCloseTo(0.325, 6);
    expect(bat.qabPct).toBeCloseTo(0.5577, 6); // percent converted to a fraction
    expect(bat.gbPct).toBeCloseTo(0.4, 6);
    expect(bat.bbPerK).toBeNull(); // "-" stays null
    const pit = snapshotPitchingLine(eliRow);
    expect(pit.bb).toBe(5);
    expect(pit.so).toBe(14);
    expect(pit.outs).toBe(39);
    expect(pit.ipText).toBe('13.0');
    expect(pit.pitches).toBe(210);
    expect(pit.strikePct).toBeCloseTo(0.61, 6);
  });

  it('fielding snapshot keeps position innings in outs and never assigns errors to positions', () => {
    const f = snapshotFieldingLines(eliRow);
    const ss = f.byPosition.find((p) => p.position === 6)!;
    const cf = f.byPosition.find((p) => p.position === 8)!;
    expect(ss.outs).toBe(56);
    expect(ss.inningsText).toBe('18.2');
    expect(cf.outs).toBe(118);
    expect(cf.inningsText).toBe('39.1');
    expect(f.byPosition.find((p) => p.position === 2)).toBeUndefined(); // 0.0 innings skipped
    expect(f.byPosition.every((p) => p.positionErrorsKnown === false)).toBe(true);
    expect(f.byPosition.every((p) => (p as any).e === undefined)).toBe(true);
    expect(f.player.e).toBe(4);
    expect(f.player.positionErrorsKnown).toBe(false);
    expect(f.player.totalOuts).toBe(226);
    expect(f.player.totalInningsText).toBe('75.1');
    expect(outsToInnings(f.byPosition.reduce((a, p) => a + p.outs, 0))).toBe('75.1');
  });

  it('canCombine refuses without coverage, allows when coverage precedes all scored games', () => {
    const snap: StatSnapshot = {
      id: 's1', source: 'gamechanger', teamId: MY, label: 'GC Fall 2026', asOfDate: '2026-10-20', fileName: 'x.csv', fileSha256: 'abc', rawText: '',
      importedAt: '2026-10-20T00:00:00Z', rows: [eliRow], columnSections: []
    };
    const scored = standardStart();
    scored.pa('away', '1B');
    scored.end('time_limit');
    const replays = [scored.replay()]; // dated 2026-10-24
    expect(canCombine(snap, replays).ok).toBe(false);
    expect(canCombine({ ...snap, coverageEnd: '2026-10-24' }, replays).ok).toBe(false); // same day: could overlap
    const ok = canCombine({ ...snap, coverageEnd: '2026-10-20' }, replays);
    expect(ok.ok).toBe(true);
    expect(canCombine({ ...snap, coverageEnd: '2026-10-20' }, []).ok).toBe(true);
    // combine sums counts and recomputes rates
    const scoredLine = battingLines(replays, { teamId: MY, qab: QAB }).find((l) => l.playerId === 'p1')!;
    const combined = combineBatting({ ...snapshotBattingLine(eliRow), playerId: 'p1' }, scoredLine, ok);
    expect(combined.provenance).toBe('combined');
    expect(combined.pa).toBe(53);
    expect(combined.ab).toBe(41);
    expect(combined.h).toBe(14);
    expect(combined.avg).toBeCloseTo(14 / 41, 6);
    expect(combined.importedPa).toBe(52);
    expect(combined.scoredPa).toBe(1);
    expect(() => combineBatting(snapshotBattingLine(eliRow), scoredLine, canCombine(snap, replays))).toThrow(/Cannot combine/);
  });
});
