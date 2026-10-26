import { describe, it, expect } from 'vitest';
import { outsToInnings, inningsToOuts } from '../src/engine/types';
import { positionOuts, currentBatter } from '../src/engine/reducer';
import { proposeMoves, proposeRbi } from '../src/engine/propose';
import { Log, makeGame, standardStart, threeOuts, ELI, myPlayers, oppPlayers } from './helpers';

describe('innings notation', () => {
  it('converts outs to baseball notation without decimal arithmetic', () => {
    expect(outsToInnings(0)).toBe('0.0');
    expect(outsToInnings(1)).toBe('0.1');
    expect(outsToInnings(4)).toBe('1.1');
    expect(outsToInnings(5)).toBe('1.2');
    expect(outsToInnings(9)).toBe('3.0');
    expect(outsToInnings(226)).toBe('75.1');
  });
  it('parses notation back to outs and rejects decimals', () => {
    expect(inningsToOuts('1.1')).toBe(4);
    expect(inningsToOuts('1.2')).toBe(5);
    expect(inningsToOuts('3')).toBe(9);
    expect(inningsToOuts('75.1')).toBe(226);
    expect(() => inningsToOuts('1.3')).toThrow();
    expect(() => inningsToOuts('-')).toThrow();
  });
});

describe('CRITICAL defensive test: SS 4 outs then CF 5 outs', () => {
  it('records SS 1.1, CF 1.2, total 3.0', () => {
    const log = standardStart(6); // Eli at SS
    // Top 1: Rattlers bat (3 quick outs) so the bottom half has my team fielding
    threeOuts(log, 'away');
    // Bottom 1: opponent bats; my team fields; 3 outs with Eli at SS
    threeOuts(log, 'home');
    // Top 2
    threeOuts(log, 'away');
    // Bottom 2: one out at SS, then Eli moves to CF (swap with p8 who was in CF)
    log.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [] } });
    log.change('away', [{ position: 8, playerId: ELI }, { position: 6, playerId: 'p8' }], 'swap');
    log.pa('home', 'FO', { fielding: { sequence: [8], errors: [] } });
    log.pa('home', 'K');
    // Top 3
    threeOuts(log, 'away');
    // Bottom 3: three more outs with Eli in CF
    threeOuts(log, 'home');
    log.end('time_limit');

    const r = log.replay();
    const eli = positionOuts(r).filter((p) => p.playerId === ELI);
    const ss = eli.find((p) => p.position === 6)!;
    const cf = eli.find((p) => p.position === 8)!;
    expect(ss.outs).toBe(4);
    expect(cf.outs).toBe(5);
    expect(outsToInnings(ss.outs)).toBe('1.1');
    expect(outsToInnings(cf.outs)).toBe('1.2');
    expect(outsToInnings(ss.outs + cf.outs)).toBe('3.0');
    // p8 went the other way: CF for 4 outs, SS for 5
    const p8 = positionOuts(r).filter((p) => p.playerId === 'p8');
    expect(p8.find((p) => p.position === 8)!.outs).toBe(4);
    expect(p8.find((p) => p.position === 6)!.outs).toBe(5);
    // The team's total defensive outs = 9 (three half-innings fielded)
    expect(r.state.away.defensiveOuts).toBe(9);
  });
});

describe('CRITICAL fielding test: error attributed to the position occupied at the time', () => {
  it('attributes a throwing error to the SS appearance, not the earlier CF appearance', () => {
    const log = standardStart(8); // Eli starts in CF
    threeOuts(log, 'away');
    // Bottom 1: Eli in CF, one out, then move Eli to SS
    log.pa('home', 'FO', { fielding: { sequence: [8], errors: [] } });
    log.change('away', [{ position: 6, playerId: ELI }, { position: 8, playerId: 'p6' }], 'swap');
    // Throwing error by the shortstop
    log.pa('home', 'ROE', {
      battedBall: { trajectory: 'GB', hardness: 'hard', zone: 'SS' },
      fielding: { sequence: [6], errors: [{ position: 6, kind: 'throwing', official: true, difficulty: 'routine' }], execution: 'missed_expected' }
    });
    log.pa('home', 'K');
    log.pa('home', 'K');
    const r = log.replay();
    const errors = r.fieldingPlays.filter((f) => f.error);
    expect(errors).toHaveLength(1);
    expect(errors[0].playerId).toBe(ELI);
    expect(errors[0].position).toBe(6);
    expect(errors[0].errorKind).toBe('throwing');
    // And Eli has a CF interval with 1 out and an SS interval with 2 outs
    const eli = positionOuts(r).filter((p) => p.playerId === ELI);
    expect(eli.find((p) => p.position === 8)!.outs).toBe(1);
    expect(eli.find((p) => p.position === 6)!.outs).toBe(2);
    // Team error count
    expect(r.state.away.errors).toBe(1);
  });

  it('uses the defense at replay time, so fixing a substitution fixes attribution', () => {
    const log = standardStart(6);
    threeOuts(log, 'away');
    log.pa('home', 'ROE', { fielding: { sequence: [6], errors: [{ position: 6, kind: 'fielding', official: true, playerId: 'wrong-player' }] } });
    const r = log.replay();
    expect(r.fieldingPlays.find((f) => f.error)!.playerId).toBe(ELI);
  });
});

describe('plate appearance mechanics', () => {
  it('single with runners: proposed advancement and RBI', () => {
    const log = standardStart();
    log.pa('away', '1B'); // p1 to 1B
    log.pa('away', 'BB'); // p2 walks, p1 forced to 2B
    const r0 = log.replay();
    expect(r0.state.bases[1]?.playerId).toBe('p2');
    expect(r0.state.bases[2]?.playerId).toBe('p1');
    log.pa('away', '1B'); // default: R2 -> 3, R1 -> 2, batter -> 1
    const r = log.replay();
    expect(r.state.bases[1]?.playerId).toBe('p3');
    expect(r.state.bases[2]?.playerId).toBe('p2');
    expect(r.state.bases[3]?.playerId).toBe('p1');
    expect(r.state.away.runs).toBe(0);
  });

  it('double with runners on first and second: default sends R2 home and R1 to third (RBI 1), scorer can override to score both', () => {
    const log = standardStart();
    log.pa('away', '1B');
    log.pa('away', '1B'); // R1->2, batter->1
    const r0 = log.replay();
    const moves = proposeMoves('2B', { bases: r0.state.bases, outs: 0 });
    expect(proposeRbi('2B', moves)).toBe(1);
    expect(moves.find((m) => m.from === 1)?.to).toBe(3);
    // Scorer saw both runners score: override R1 -> home
    const override = moves.map((m) => (m.from === 1 ? { ...m, to: 4 as const, rbi: true } : m));
    expect(proposeRbi('2B', override)).toBe(2);
    log.pa('away', '2B', { moves: override });
    const r = log.replay();
    expect(r.state.away.runs).toBe(2);
    expect(r.paLog[2].rbi).toBe(2);
    expect(r.state.bases[2]?.playerId).toBe('p3');
    expect(r.state.bases[3]).toBeUndefined();
    expect(r.runLog).toHaveLength(2);
    expect(r.runLog.every((x) => x.earned)).toBe(true);
    // Pitcher o1 charged 2 ER
    const line = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(line.runs).toBe(2);
    expect(line.earnedRuns).toBe(2);
    expect(line.hits).toBe(3);
  });

  it('bases-loaded walk forces in a run with an RBI', () => {
    const log = standardStart();
    log.pa('away', 'BB');
    log.pa('away', 'BB');
    log.pa('away', 'HBP');
    const r0 = log.replay();
    expect(Object.keys(r0.state.bases)).toHaveLength(3);
    log.pa('away', 'BB');
    const r = log.replay();
    expect(r.state.away.runs).toBe(1);
    expect(r.paLog[3].rbi).toBe(1);
    expect(r.state.bases[1]?.playerId).toBe('p4');
    expect(r.state.bases[3]?.playerId).toBe('p2');
    const line = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(line.walks).toBe(3);
    expect(line.hitBatters).toBe(1);
    expect(line.battersFaced).toBe(4);
  });

  it('sacrifice fly scores the runner from third, batter out, RBI, not an AB', () => {
    const log = standardStart();
    log.pa('away', '3B');
    log.pa('away', 'SF', { fielding: { sequence: [8], errors: [] } });
    const r = log.replay();
    expect(r.state.away.runs).toBe(1);
    expect(r.state.outs).toBe(1);
    expect(r.paLog[1].rbi).toBe(1);
    expect(r.paLog[1].batterOut).toBe(true);
    const cf = r.fieldingPlays.find((f) => f.position === 8 && f.putout);
    expect(cf?.playerId).toBe('o8');
  });

  it('reached on error puts the batter on and the run later scored is unearned', () => {
    const log = standardStart();
    log.pa('away', 'ROE', { fielding: { sequence: [6], errors: [{ position: 6, kind: 'fielding', official: true }] } });
    log.pa('away', 'HR'); // 2 runs: batter earned, ROE runner unearned
    const r = log.replay();
    expect(r.state.away.runs).toBe(2);
    const line = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(line.runs).toBe(2);
    expect(line.earnedRuns).toBe(1);
    expect(r.runLog.find((x) => x.runnerId === 'p1')!.earned).toBe(false);
    expect(r.runLog.find((x) => x.runnerId === 'p2')!.earned).toBe(true);
  });

  it("fielder's choice: batter safe, lead runner out", () => {
    const log = standardStart();
    log.pa('away', '1B');
    log.pa('away', 'FC', { fielding: { sequence: [6, 4], errors: [] } });
    const r = log.replay();
    expect(r.state.outs).toBe(1);
    expect(r.state.bases[1]?.playerId).toBe('p2');
    expect(r.state.bases[2]).toBeUndefined();
    expect(r.paLog[1].batterReached).toBe(true);
  });

  it('double play records two outs and credits all fielders in the sequence', () => {
    const log = standardStart();
    log.pa('away', '1B');
    log.pa('away', 'DP', { fielding: { sequence: [6, 4, 3], errors: [] }, battedBall: { trajectory: 'GB' } });
    const r = log.replay();
    expect(r.state.outs).toBe(2);
    expect(Object.keys(r.state.bases)).toHaveLength(0);
    const plays = r.fieldingPlays.filter((f) => f.eventId === r.paLog[1].eventId);
    expect(plays.map((p) => p.position)).toEqual([6, 4, 3]);
    expect(plays.filter((p) => p.assist)).toHaveLength(2);
    expect(plays.filter((p) => p.putout)).toHaveLength(1);
    expect(plays.every((p) => p.doublePlay)).toBe(true);
  });

  it('triple play ends the inning', () => {
    const log = standardStart();
    log.pa('away', '1B');
    log.pa('away', '1B');
    log.pa('away', 'TP', { fielding: { sequence: [5, 4, 3], errors: [] } });
    const r = log.replay();
    expect(r.state.half).toBe('bottom');
    expect(r.state.outs).toBe(0);
    expect(r.state.home.defensiveOuts).toBe(3);
  });

  it('dropped third strike: batter reaches, pitcher still gets the strikeout', () => {
    const log = standardStart();
    log.pa('away', 'D3K');
    const r = log.replay();
    expect(r.state.bases[1]?.playerId).toBe('p1');
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.strikeouts).toBe(1);
    expect(r.state.outs).toBe(0);
  });

  it('strikeout looking counts in K and K-L for pitcher', () => {
    const log = standardStart();
    log.pa('away', 'KL');
    log.pa('away', 'K');
    const r = log.replay();
    const line = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(line.strikeouts).toBe(2);
    expect(line.strikeoutsLooking).toBe(1);
  });
});

describe('baserunning events', () => {
  it('stolen base, caught stealing and pickoff', () => {
    const log = standardStart();
    log.pa('away', '1B');
    log.run('away', 'SB', [{ from: 1, to: 2 }]);
    let r = log.replay();
    expect(r.state.bases[2]?.playerId).toBe('p1');
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.stolenBasesAllowed).toBe(1);
    log.pa('away', 'BB');
    log.run('away', 'CS', [{ from: 1, to: 'out' }], { sequence: [2, 4], errors: [] });
    r = log.replay();
    expect(r.state.outs).toBe(1);
    expect(r.state.bases[1]).toBeUndefined();
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.caughtStealing).toBe(1);
    // catcher o2 gets an assist, 2B o4 a putout
    expect(r.fieldingPlays.find((f) => f.position === 2 && f.assist)?.playerId).toBe('o2');
    log.run('away', 'PICKOFF', [{ from: 2, to: 'out' }], { sequence: [1, 6], errors: [] });
    r = log.replay();
    expect(r.state.outs).toBe(2);
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pickoffs).toBe(1);
  });

  it('wild pitch scores a runner from third; run is earned but not an RBI', () => {
    const log = standardStart();
    log.pa('away', '3B');
    log.run('away', 'WP', [{ from: 3, to: 4 }]);
    const r = log.replay();
    expect(r.state.away.runs).toBe(1);
    expect(r.runLog[0].earned).toBe(true);
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.wildPitches).toBe(1);
  });

  it('passed ball scoring a run is unearned', () => {
    const log = standardStart();
    log.pa('away', '3B');
    log.run('away', 'PB', [{ from: 3, to: 4 }]);
    const r = log.replay();
    expect(r.runLog[0].earned).toBe(false);
  });
});

describe('pitching changes and inherited runners', () => {
  it('runs by inherited runners are charged to the pitcher who put them on', () => {
    const log = standardStart();
    log.pa('away', '1B'); // p1 on vs o1
    log.pa('away', 'BB'); // p2 on vs o1
    log.change('home', [{ position: 1, playerId: 'o9' }, { position: 9, playerId: 'o1' }], 'pitching_change');
    log.pa('away', 'HR'); // 3 runs: p1, p2 charged to o1; batter p3 to o9
    const r = log.replay();
    const o1 = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    const o9 = r.pitcherLines.find((l) => l.pitcherId === 'o9')!;
    expect(o1.runs).toBe(2);
    expect(o1.earnedRuns).toBe(2);
    expect(o1.bequeathedRunners).toBe(2);
    expect(o9.runs).toBe(1);
    expect(o9.inheritedRunners).toBe(2);
    expect(o9.homeRuns).toBe(1);
    expect(o9.started).toBe(false);
    expect(o1.started).toBe(true);
  });

  it('outs are credited to the pitcher of record and innings pitched reconcile with defensive innings at P', () => {
    const log = standardStart();
    log.pa('away', 'K');
    log.change('home', [{ position: 1, playerId: 'o9' }, { position: 9, playerId: 'o1' }], 'pitching_change');
    log.pa('away', 'K');
    log.pa('away', 'K');
    threeOuts(log, 'home');
    threeOuts(log, 'away');
    log.end('time_limit');
    const r = log.replay();
    const o1 = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    const o9 = r.pitcherLines.find((l) => l.pitcherId === 'o9')!;
    expect(o1.outs).toBe(1);
    expect(o9.outs).toBe(5);
    const po = positionOuts(r);
    expect(po.find((p) => p.playerId === 'o1' && p.position === 1)!.outs).toBe(1);
    expect(po.find((p) => p.playerId === 'o9' && p.position === 1)!.outs).toBe(5);
  });

  it('earned-run reconstruction: runs after the inning should have ended are unearned', () => {
    const log = standardStart();
    log.pa('away', 'K');
    log.pa('away', 'K');
    // Two outs. Batter reaches on error (would have been the third out).
    log.pa('away', 'ROE', { fielding: { sequence: [4], errors: [{ position: 4, kind: 'fielding', official: true }] } });
    log.pa('away', 'HR'); // both runs unearned: runner reached on error; batter's run after 3 would-be outs
    const r = log.replay();
    const o1 = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(o1.runs).toBe(2);
    expect(o1.earnedRuns).toBe(0);
  });
});

describe('game flow, lineups and incomplete games', () => {
  it('advances the batting order and wraps around', () => {
    const log = standardStart();
    for (let i = 0; i < 9; i++) log.pa('away', 'HR');
    const r = log.replay();
    expect(currentBatter(r).slot?.playerId).toBe('p1');
  });

  it('continuous batting order with 11 batters', () => {
    const log = new Log(makeGame());
    log.lineup('away', myPlayers.slice(0, 11));
    log.lineup('home', oppPlayers);
    log.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    for (let i = 0; i < 11; i++) log.pa('away', 'HR');
    const r = log.replay();
    expect(r.state.away.runs).toBe(11);
    expect(currentBatter(r).slot?.playerId).toBe('p1');
  });

  it('game ending mid-inning preserves actual outs played', () => {
    const log = standardStart(6);
    threeOuts(log, 'away');
    log.pa('home', 'K');
    log.pa('home', 'K');
    log.end('time_limit');
    const r = log.replay();
    expect(r.state.away.defensiveOuts).toBe(2);
    const eli = positionOuts(r).find((p) => p.playerId === ELI && p.position === 6)!;
    expect(outsToInnings(eli.outs)).toBe('0.2');
    expect(r.state.ended).toBe(true);
    expect(r.state.endReason).toBe('time_limit');
  });

  it('half-inning end with missed outs can credit defensive time without inventing plays', () => {
    const log = standardStart(6);
    threeOuts(log, 'away');
    log.pa('home', 'K');
    log.endHalf(true); // scorer missed two outs; credit them as defensive time only
    const r = log.replay();
    expect(r.state.away.defensiveOuts).toBe(3);
    expect(r.paLog.filter((p) => p.side === 'home')).toHaveLength(1); // no invented plate appearances
    expect(r.state.half).toBe('top');
    expect(r.state.inning).toBe(2);
  });

  it('scoreboard adjustment adds runs without hits or RBIs', () => {
    const log = standardStart();
    log.adjustScore('home', 2, 'Opponent scored two runs I missed');
    const r = log.replay();
    expect(r.state.home.runs).toBe(2);
    expect(r.state.home.hits).toBe(0);
    expect(r.paLog).toHaveLength(0);
    expect(r.state.scoreAdjustments).toHaveLength(1);
  });

  it('state correction syncs inning/outs/runners and marks skipped plays', () => {
    const log = standardStart();
    log.correct({ inning: 3, half: 'bottom', outs: 1, runners: { 2: 'o5' }, skippedPlays: true, reason: 'Missed most of two innings' });
    log.pa('home', '1B');
    const r = log.replay();
    expect(r.state.inning).toBe(3);
    expect(r.state.half).toBe('bottom');
    expect(r.state.skippedPlays).toBe(true);
    expect(r.state.bases[3]?.playerId).toBe('o5'); // runner from 2nd went to 3rd on the single
    expect(r.state.bases[1]?.playerId).toBe('o1');
  });

  it('editing a previous play recalculates everything from the log', () => {
    const log = standardStart();
    log.pa('away', 'HR');
    log.pa('away', 'K');
    let r = log.replay();
    expect(r.state.away.runs).toBe(1);
    // Scorer realizes the HR was really a double: edit the event in place
    const ev = log.events.find((e) => e.type === 'plate_appearance')! as any;
    ev.result = '2B';
    ev.runners = [{ from: 'batter', to: 2, how: 'hit' }];
    ev.rbi = 0;
    r = log.replay();
    expect(r.state.away.runs).toBe(0);
    expect(r.state.bases[2]?.playerId).toBe('p1');
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.homeRuns).toBe(0);
  });

  it('undo removes the last event and replays cleanly', () => {
    const log = standardStart();
    log.pa('away', '2B');
    log.pa('away', 'K');
    log.events.pop();
    const r = log.replay();
    expect(r.state.outs).toBe(0);
    expect(r.state.bases[2]?.playerId).toBe('p1');
  });

  it('pinch runner replaces the runner and the lineup slot; courtesy runner keeps the slot', () => {
    const log = standardStart();
    log.pa('away', '1B'); // p1 on first
    log.events.push({ id: 'lc1', gameId: log.game.id, seq: log.events.length, ts: '', type: 'lineup_change', side: 'away', slot: 1, playerId: 'p10', kind: 'courtesy_runner', base: 1 });
    let r = log.replay();
    expect(r.state.bases[1]?.playerId).toBe('p10');
    expect(r.state.away.lineup[0].playerId).toBe('p1');
    log.events.push({ id: 'lc2', gameId: log.game.id, seq: log.events.length, ts: '', type: 'lineup_change', side: 'away', slot: 1, playerId: 'p11', kind: 'pinch_runner', base: 1 });
    r = log.replay();
    expect(r.state.bases[1]?.playerId).toBe('p11');
    expect(r.state.away.lineup[0].playerId).toBe('p11');
  });

  it('manual pitch counts are kept separate from pitch-by-pitch and never inferred', () => {
    const log = standardStart();
    log.pa('away', 'K');
    let r = log.replay();
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pitches).toBeNull();
    log.pitchCount('home', 'o1', 14, 'scoreboard');
    r = log.replay();
    const line = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(line.pitches).toBe(14);
    expect(line.pitchSource).toBe('scoreboard');
  });

  it('unknown opponent batters can be placeholders and renamed later without losing events', () => {
    const log = new Log(makeGame());
    log.lineup('away', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    log.defense('away', Object.fromEntries(myPlayers.slice(0, 9).map((p, i) => [i + 1, p])) as any);
    log.lineup('home', ['opp-unknown-1', 'opp-unknown-2', 'opp-unknown-3']);
    threeOuts(log, 'away');
    log.pa('home', '2B');
    const r = log.replay();
    // The event references the stable placeholder id; renaming is a Player-table edit, not an event edit.
    expect(r.paLog.find((p) => p.side === 'home')!.batterId).toBe('opp-unknown-1');
  });
});

describe('pitch logging', () => {
  const pitch = (log: Log, side: 'home' | 'away', result: any) => {
    log.events.push({ id: `p${log.events.length}`, gameId: log.game.id, seq: log.events.length, ts: '', type: 'pitch', side, result });
  };
  it('tracks the count; a foul with two strikes is a pitch and a strike but does not change the count', () => {
    const log = standardStart();
    pitch(log, 'away', 'ball');
    pitch(log, 'away', 'strike');
    pitch(log, 'away', 'foul');
    pitch(log, 'away', 'foul');
    pitch(log, 'away', 'ball');
    let r = log.replay();
    expect(r.state.count).toEqual({ balls: 2, strikes: 2 });
    expect(r.state.pendingPitches).toHaveLength(5);
    // Ball in play on the next pitch: six pitches, 2 balls, 4 strikes (two fouls, one strike, the ball in play)
    log.pa('away', '1B');
    r = log.replay();
    expect(r.state.count).toEqual({ balls: 0, strikes: 0 });
    expect(r.state.pendingPitches).toHaveLength(0);
    const pa = r.paLog[0];
    expect(pa.pitches?.total).toBe(6);
    expect(pa.pitches?.balls).toBe(2);
    expect(pa.pitches?.strikes).toBe(4);
    const o1 = r.pitcherLines.find((l) => l.pitcherId === 'o1')!;
    expect(o1.pitches).toBe(6);
    expect(o1.pitchSource).toBe('pitch_by_pitch');
    expect(o1.strikes).toBe(4);
    expect(o1.firstPitchStrikes).toBe(0);
    expect(o1.firstPitchBatters).toBe(1);
  });
  it('full count then a walk is six pitches with the fourth ball; strikeout adds the third strike', () => {
    const log = standardStart();
    for (const p of ['ball', 'strike', 'ball', 'strike', 'ball']) pitch(log, 'away', p);
    log.pa('away', 'BB');
    pitch(log, 'away', 'strike');
    pitch(log, 'away', 'strike_looking');
    log.pa('away', 'KL');
    const r = log.replay();
    expect(r.paLog[0].pitches?.total).toBe(6);
    expect(r.paLog[0].pitches?.balls).toBe(4);
    expect(r.paLog[1].pitches?.total).toBe(3);
    expect(r.paLog[1].pitches?.strikes).toBe(3);
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pitches).toBe(9);
  });
  it('an at-bat with no logged pitches gets no invented count', () => {
    const log = standardStart();
    log.pa('away', 'K');
    const r = log.replay();
    expect(r.paLog[0].pitches).toBeUndefined();
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pitches).toBeNull();
  });
  it('pickoff attempts and back-picks are logged without moving anyone', () => {
    const log = standardStart();
    log.pa('away', '1B');
    pitch(log, 'away', 'ball');
    log.run('away', 'PICKOFF_ATTEMPT', []);
    log.run('away', 'BACK_PICK', []);
    const r = log.replay();
    expect(r.state.bases[1]?.playerId).toBe('p1');
    expect(r.state.count).toEqual({ balls: 1, strikes: 0 });
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pickoffAttempts).toBe(1);
    expect(r.baserunningLog.map((b) => b.kind)).toEqual(['PICKOFF_ATTEMPT', 'BACK_PICK']);
  });
  it('undoing a pitch restores the count; the count resets at the end of a half-inning', () => {
    const log = standardStart();
    pitch(log, 'away', 'strike');
    pitch(log, 'away', 'strike');
    log.events.pop();
    expect(log.replay().state.count).toEqual({ balls: 0, strikes: 1 });
    log.endHalf(true);
    expect(log.replay().state.count).toEqual({ balls: 0, strikes: 0 });
  });
});

describe('pitch logging: the deciding pitch is not counted twice', () => {
  const pitch = (log: Log, result: any) => log.events.push({ id: `q${log.events.length}`, gameId: log.game.id, seq: log.events.length, ts: '', type: 'pitch', side: 'away', result });
  it('three logged strikes then a strikeout is three pitches; four logged balls then a walk is four', () => {
    const log = standardStart();
    pitch(log, 'strike'); pitch(log, 'strike'); pitch(log, 'strike');
    log.pa('away', 'KL');
    pitch(log, 'ball'); pitch(log, 'ball'); pitch(log, 'ball'); pitch(log, 'ball');
    log.pa('away', 'BB');
    const r = log.replay();
    expect(r.paLog[0].pitches?.total).toBe(3);
    expect(r.paLog[1].pitches?.total).toBe(4);
    expect(r.pitcherLines.find((l) => l.pitcherId === 'o1')!.pitches).toBe(7);
  });
  it('two logged strikes then a strikeout adds strike three (catch-up)', () => {
    const log = standardStart();
    pitch(log, 'strike'); pitch(log, 'strike');
    log.pa('away', 'K');
    expect(log.replay().paLog[0].pitches?.total).toBe(3);
  });
});
