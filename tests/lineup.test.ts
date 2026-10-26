import { describe, it, expect } from 'vitest';
import { weightedBattingLines, recommendLineup, simulateLineupRuns, simOutcomesFromLine, pitchingWorkload, expectedPaForSlot, SHRINKAGE_PA, mulberry32 } from '../src/engine/lineup';
import { battingLines } from '../src/engine/stats';
import { Log, makeGame, threeOuts, myPlayers, oppPlayers, MY, OPP } from './helpers';

const QAB = { hit: true, walkOrHbp: true, hardContact: true, sacrifice: true, rbi: true, sixPlusPitches: true, threePlusAfterTwoStrikes: true };

/** One-man lineups make per-player rates easy to control. */
function soloGame(id: string, date: string, batter: string, results: Array<'1B' | '2B' | 'HR' | 'BB' | 'K' | 'GO'>) {
  const log = new Log(makeGame({ id, date }));
  log.lineup('away', [batter], [0]);
  log.lineup('home', oppPlayers);
  log.defense('home', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
  for (const res of results) log.pa('away', res, { moves: res === 'K' || res === 'GO' ? [{ from: 'batter', to: 'out', how: 'other' }] : res === 'HR' ? [{ from: 'batter', to: 4, how: 'hit', rbi: true }] : [{ from: 'batter', to: res === '2B' ? 2 : 1, how: 'hit' }] });
  log.end('time_limit');
  return log.replay();
}

describe('weighted batting lines', () => {
  it('blends 85/15 after shrinking toward the team rate; recent PAs are a subset of season PAs', () => {
    // p1: season = game A (older) + game B (recent). Game A: 10 PA all K. Game B: 10 PA all 1B.
    const a = soloGame('a', '2026-09-01', 'p1', Array(10).fill('K') as any);
    const b = soloGame('b', '2026-10-01', 'p1', Array(10).fill('1B') as any);
    const entries = weightedBattingLines([a, b], { teamId: MY, playerIds: ['p1'], recentGames: 1, seasonWeight: 0.85, recentWeight: 0.15, qab: QAB });
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.season.pa).toBe(20);
    expect(e.recent.pa).toBe(10); // subset, not added
    expect(e.season.obp).toBeCloseTo(0.5, 6);
    expect(e.recent.obp).toBeCloseTo(1.0, 6);
    // team rate = season rate of the only player = 0.5; shrink season: (20*0.5 + 20*0.5)/40 = 0.5
    // shrink recent: (10*1.0 + 20*0.5)/30 = 0.6667; weighted = 0.85*0.5 + 0.15*0.6667 = 0.525
    const k = SHRINKAGE_PA;
    const recentAdj = (10 * 1.0 + k * 0.5) / (10 + k);
    const expected = 0.85 * 0.5 + 0.15 * recentAdj;
    expect(e.weighted.obp).toBeCloseTo(expected, 6);
    expect(e.weighted.composite).toBeCloseTo(1.8 * e.weighted.obp! + e.weighted.slg!, 6);
    expect(e.sampleNote).toMatch(/20 PA this season, 10 in the last 1 game/);
    expect(e.sampleNote).toMatch(/small sample/);
  });

  it('players with no recent PAs use the season value alone; players with no PAs sit at the team rate', () => {
    const a = soloGame('a', '2026-09-01', 'p1', ['HR', 'HR', 'K', 'K']);
    const b = soloGame('b', '2026-10-01', 'p2', ['K', 'K', 'K', 'K']);
    const entries = weightedBattingLines([a, b], { teamId: MY, playerIds: ['p1', 'p2', 'p3'], recentGames: 1, seasonWeight: 0.85, recentWeight: 0.15, qab: QAB });
    const p1 = entries.find((e) => e.playerId === 'p1')!;
    const p3 = entries.find((e) => e.playerId === 'p3')!;
    expect(p1.recent.pa).toBe(0);
    expect(p1.sampleNote).toMatch(/season value used alone/);
    expect(p3.season.pa).toBe(0);
    expect(p3.sampleNote).toMatch(/no plate appearances recorded/);
    // team OBP = 2 reached / 8 PA = .25 -> p3 shown at the team rate
    expect(p3.weighted.obp).toBeCloseTo(0.25, 6);
    expect(entries[0].playerId).toBe('p1'); // sorted by composite desc
  });
});

describe('recommendLineup', () => {
  function entry(playerId: string, obp: number, slg: number, pa = 40) {
    const line = { ...battingLines([], { playerIds: [], qab: QAB })[0] } as any;
    void line;
    return {
      playerId,
      season: { pa } as any,
      recent: { pa: 5 } as any,
      weighted: { pa, obp, slg, ops: obp + slg, kPct: 0.2, bbPct: 0.1, hardHitPct: null, composite: 1.8 * obp + slg },
      sampleNote: ''
    };
  }
  it('places the best on-base hitter first, best composite second, best slugger fourth, and warns on small samples', () => {
    const entries = [
      entry('A', 0.50, 0.60), // composite 1.50
      entry('B', 0.40, 0.80), // 1.52 best composite
      entry('C', 0.45, 0.45), // 1.26
      entry('D', 0.30, 0.90), // 1.44 best SLG
      entry('E', 0.35, 0.40), // 1.03
      entry('F', 0.30, 0.30, 12), // 0.84, small sample
      entry('G', 0.25, 0.25), // 0.70
      entry('H', 0.20, 0.20), // 0.56
      entry('I', 0.10, 0.10) // 0.28
    ];
    const rec = recommendLineup(entries, { slots: 9 });
    expect(rec.order).toHaveLength(9);
    expect(rec.order[0].playerId).toBe('A'); // highest OBP among top four composite (B, A, D, C)
    expect(rec.order[1].playerId).toBe('B'); // best remaining composite
    expect(rec.order[3].playerId).toBe('D'); // best remaining SLG batting 4th
    expect(rec.order[2].playerId).toBe('C'); // next composite batting 3rd
    expect(rec.order.map((o) => o.playerId).slice(4)).toEqual(['E', 'F', 'G', 'H', 'I']);
    expect(rec.caveats.some((c) => /fewer than 30 PA/.test(c) && /F/.test(c))).toBe(true);
    expect(rec.expectedPaPer7Innings['A']).toBeCloseTo(4.3, 6);
    expect(rec.expectedPaPer7Innings['I']).toBeCloseTo(expectedPaForSlot(9), 6);
    expect(rec.weakStretches.length).toBeGreaterThan(0);
    expect(rec.weakStretches[rec.weakStretches.length - 1].slots).toEqual([7, 9]);
    expect(rec.alternatives.map((a) => a.label)).toEqual(['Best hitters 1-2-3', 'Power 3-4-5']);
    expect(rec.alternatives[0].order[0]).toBe('B');
    const power = rec.alternatives[1].order;
    expect(power[3]).toBe('D'); // best slugger 4th in the traditional shape
    expect(rec.order.every((o) => o.reason.length > 0)).toBe(true);
  });

  it('fewer eligible players than slots produces a caveat, not a crash', () => {
    const rec = recommendLineup([entry('A', 0.4, 0.5), entry('B', 0.3, 0.4)], { slots: 9 });
    expect(rec.order).toHaveLength(2);
    expect(rec.caveats.some((c) => /Only 2 eligible/.test(c))).toBe(true);
  });
});

describe('simulateLineupRuns', () => {
  it('is deterministic for a seed and rewards better hitters', () => {
    const good = { pa: 100, outcomes: { bb: 15, hbp: 2, '1B': 20, '2B': 8, '3B': 1, hr: 4, out: 50 } };
    const bad = { pa: 100, outcomes: { bb: 5, hbp: 1, '1B': 10, '2B': 2, '3B': 0, hr: 0, out: 82 } };
    const lines = { A: good, B: good, C: good, D: bad, E: bad, F: bad, G: bad, H: bad, I: bad };
    const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const r1 = simulateLineupRuns(order, lines, 500, 7);
    const r2 = simulateLineupRuns(order, lines, 500, 7);
    expect(r1).toEqual(r2);
    const allBad = simulateLineupRuns(order, { A: bad, B: bad, C: bad, D: bad, E: bad, F: bad, G: bad, H: bad, I: bad }, 500, 7);
    expect(r1.meanRuns).toBeGreaterThan(allBad.meanRuns);
    expect(r1.sd).toBeGreaterThan(0);
    expect(simulateLineupRuns([], lines)).toEqual({ meanRuns: 0, sd: 0 });
    // outcomes helper
    const line = battingLines([soloGame('x', '2026-10-01', 'p1', ['1B', 'BB', 'K', 'HR'])], { teamId: MY, qab: QAB })[0];
    expect(simOutcomesFromLine(line).outcomes).toEqual({ bb: 1, hbp: 0, '1B': 1, '2B': 0, '3B': 0, hr: 1, out: 1 });
    const rnd = mulberry32(3);
    const v = rnd();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(mulberry32(3)()).toBe(v);
  });
});

describe('pitchingWorkload', () => {
  function game(id: string, date: string, pitcher: string, outs: number, pitches: number | null) {
    const log = new Log(makeGame({ id, date, mySide: 'home' }));
    log.lineup('away', oppPlayers);
    log.lineup('home', myPlayers.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const def = Object.fromEntries(myPlayers.slice(0, 9).map((p, i) => [i + 1, p])) as any;
    def[1] = pitcher;
    def[7] = 'p1';
    log.defense('home', def);
    log.defense('away', Object.fromEntries(oppPlayers.map((p, i) => [i + 1, p])) as any);
    for (let i = 0; i < outs; i++) {
      log.pa('away', 'K');
    }
    if (pitches != null) log.pitchCount('home', pitcher, pitches, 'manual');
    log.end('time_limit');
    return log.replay();
  }
  it('aggregates by date, computes rest days and weekend window, and applies configurable rules', () => {
    const replays = [
      game('g1', '2026-10-17', 'p7', 9, 60),
      game('g2', '2026-10-24', 'p7', 6, 70),
      game('g3', '2026-10-25', 'p7', 3, null),
      game('g4', '2026-10-25', 'p9', 6, 95)
    ];
    const work = pitchingWorkload(replays, MY, { maxPitchesPerDay: 85, maxInningsPerWeekend: 2, restDays: [{ minPitches: 66, maxPitches: 85, restDays: 3 }] });
    const eli = work.find((w) => w.playerId === 'p7')!;
    expect(eli.appearances).toHaveLength(3);
    expect(eli.byDate['2026-10-24']).toEqual({ pitches: 70, outs: 6 });
    expect(eli.byDate['2026-10-25'].pitches).toBeNull();
    expect(eli.lastDate).toBe('2026-10-25');
    expect(eli.daysSinceLast).toBe(0);
    expect(eli.weekendOuts).toBe(9); // 10/24 and 10/25 fall in the three-day window ending 10/25
    expect(eli.weekendPitches).toBeNull();
    expect(eli.flags).toContain('pitch count unknown for 1 appearance');
    expect(eli.flags.some((f) => /3.0 innings in the weekend window exceeds the limit of 2/.test(f))).toBe(true);
    const p9 = work.find((w) => w.playerId === 'p9')!;
    expect(p9.flags.some((f) => /95 pitches exceeds the daily limit of 85/.test(f))).toBe(true);
    expect(p9.weekendPitches).toBe(95);
    // rest rule: p7 threw 70 on 10/24 (needs 3 days) and pitched again 10/25
    const restCheck = pitchingWorkload([replays[0], replays[1], game('g5', '2026-10-25', 'p9', 3, 20)], MY, { restDays: [{ minPitches: 66, maxPitches: 85, restDays: 3 }] });
    const eli2 = restCheck.find((w) => w.playerId === 'p7')!;
    expect(eli2.daysSinceLast).toBe(1);
    expect(eli2.flags.some((f) => /requires 3 rest days; 1 elapsed/.test(f))).toBe(true);
    expect(pitchingWorkload([], MY)).toEqual([]);
  });
});
