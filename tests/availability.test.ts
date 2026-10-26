import { describe, it, expect } from 'vitest';
import { standardStart, threeOuts, myPlayers, ELI, MY, makeGame, Log } from './helpers';
import { gameRoster, playerAvailability } from '../src/engine/reducer';
import { availabilitySummary, availabilityReport } from '../src/engine/stats';
import { outsToInnings } from '../src/engine/types';

/** Twelve on the roster, nine start. p10 absent, p11 and p12 on the bench. */
function rosteredGame() {
  const log = standardStart(6);
  log.game = makeGame({ mySide: 'away', rosterIds: myPlayers });
  log.availability('away', 'p10', 'absent');
  return log;
}

describe('availability and bench time', () => {
  it('everyone on the roster is present unless the log says otherwise', () => {
    const log = rosteredGame();
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    const r = log.replay();
    expect(gameRoster(r, 'away').sort()).toEqual([...myPlayers].sort());
    expect(playerAvailability(r, 'away', 'p10').status).toBe('absent');
    expect(playerAvailability(r, 'away', 'p10').availableOuts).toBe(0);
    expect(playerAvailability(r, 'away', 'p11').status).toBe('present');
    expect(playerAvailability(r, 'away', 'p11').availableOuts).toBe(3);
    expect(playerAvailability(r, 'away', ELI).availableOuts).toBe(3);
  });

  it('bench innings = available minus field; absent is not bench; did not bat is counted', () => {
    const log = rosteredGame();
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.end('time_limit');
    const r = log.replay();
    const eli = availabilitySummary([r], ELI, MY);
    expect(eli.gamesOnRoster).toBe(1);
    expect(eli.gamesPresent).toBe(1);
    expect(eli.gamesStarted).toBe(1);
    expect(eli.benchOuts).toBe(0);
    expect(eli.fieldOuts).toBe(6);
    expect(eli.availableOuts).toBe(6);
    const p11 = availabilitySummary([r], 'p11', MY);
    expect(p11.gamesPresent).toBe(1);
    expect(p11.gamesPlayed).toBe(0);
    expect(p11.gamesDidNotPlay).toBe(1);
    expect(p11.gamesDidNotBat).toBe(1);
    expect(outsToInnings(p11.benchOuts)).toBe('2.0');
    expect(p11.benchPct).toBe(1);
    expect(p11.paShare).toBe(0);
    const p10 = availabilitySummary([r], 'p10', MY);
    expect(p10.gamesAbsent).toBe(1);
    expect(p10.gamesPresent).toBe(0);
    expect(p10.benchOuts).toBe(0);
    expect(p10.byGame[0].status).toBe('absent');
  });

  it('a player hurt mid-game stops accruing bench time from that point', () => {
    const log = rosteredGame();
    threeOuts(log, 'away');
    threeOuts(log, 'home'); // Eli SS, 3 outs
    threeOuts(log, 'away');
    // Bottom 2: one out, then Eli is hurt and leaves SS; p11 takes over
    log.pa('home', 'GO', { fielding: { sequence: [6, 3], errors: [] } });
    log.availability('away', ELI, 'injured');
    log.change('away', [{ position: 6, playerId: null }], 'injury');
    log.change('away', [{ position: 6, playerId: 'p11' }], 'substitution');
    // p11 takes Eli's spot in the order too
    log.lineup('away', myPlayers.slice(0, 9).map((id) => (id === ELI ? 'p11' : id)));
    log.pa('home', 'K');
    log.pa('home', 'K');
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.end('time_limit');
    const r = log.replay();
    const eli = availabilitySummary([r], ELI, MY);
    expect(eli.byGame[0].status).toBe('injured');
    expect(eli.fieldOuts).toBe(4);
    expect(eli.availableOuts).toBe(4);
    expect(eli.benchOuts).toBe(0);
    expect(eli.gamesHurtOrLeft).toBe(1);
    // p11 sat 4 outs then played 5
    const p11 = availabilitySummary([r], 'p11', MY);
    expect(p11.availableOuts).toBe(9);
    expect(p11.fieldOuts).toBe(5);
    expect(p11.benchOuts).toBe(4);
    expect(p11.gamesStarted).toBe(0);
    expect(p11.gamesPlayed).toBe(1);
  });

  it('arriving late counts availability only from arrival', () => {
    const log = rosteredGame();
    log.availability('away', 'p12', 'absent');
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.availability('away', 'p12', 'present');
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.end('time_limit');
    const r = log.replay();
    const p12 = availabilitySummary([r], 'p12', MY);
    expect(p12.byGame[0].status).toBe('present');
    expect(p12.availableOuts).toBe(3);
    expect(p12.benchOuts).toBe(3);
    expect(p12.gamesAbsent).toBe(0);
  });

  it('team report lists everyone on any roster, most bench time first, and skips games with no roster', () => {
    const log = rosteredGame();
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.end('time_limit');
    const old = standardStart(6); // no rosterIds: only players who appeared count
    threeOuts(old, 'away');
    threeOuts(old, 'home');
    old.end('time_limit');
    const report = availabilityReport([log.replay(), old.replay()], MY);
    expect(report.map((x) => x.playerId)).toContain('p11');
    expect(report[0].benchPct).toBe(1);
    const eli = report.find((x) => x.playerId === ELI)!;
    expect(eli.gamesOnRoster).toBe(2);
    const p11 = report.find((x) => x.playerId === 'p11')!;
    expect(p11.gamesOnRoster).toBe(1);
  });

  it('a hurt player who bats anyway is counted as back in, with a note in the record', () => {
    const log = rosteredGame();
    threeOuts(log, 'away');
    threeOuts(log, 'home');
    log.availability('away', ELI, 'injured');
    threeOuts(log, 'away'); // slots 4-6
    threeOuts(log, 'home');
    threeOuts(log, 'away'); // slots 7-9: Eli, still in the order, comes to bat
    threeOuts(log, 'home');
    log.end('time_limit');
    const r = log.replay();
    expect(playerAvailability(r, 'away', ELI).status).toBe('present');
    expect(r.warnings.some((w) => /marked injured but came to bat/.test(w))).toBe(true);
    expect(availabilitySummary([r], ELI, MY).gamesHurtOrLeft).toBe(0);
  });

  it('a fresh log with no availability events has an empty availability log', () => {
    const r = new Log().replay();
    expect(r.availabilityLog).toEqual([]);
  });
});
