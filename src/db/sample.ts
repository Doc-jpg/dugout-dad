/**
 * Practice mode: loads a realistic sample so the app can be explored with no consequences.
 *
 * Creates (if missing) the Rattlers roster, a practice opponent, one finished game with a
 * full box score and one game paused in the third inning to continue scoring. Every practice
 * game is tagged so "Remove practice games" can delete exactly those and nothing else.
 */
import { db, createTeam, createPlayer, createPlaceholderPlayer, createGame, appendEvent, saveSettings, deleteGame } from './db';
import type { Position, PAResult, Side, RunnerMove, FieldingRecord, BattedBall } from '../engine/types';
import { replayGame } from '../engine/reducer';
import { proposeMoves, proposeRbi } from '../engine/propose';

export const PRACTICE_TAG = 'PRACTICE SAMPLE';

const ROSTER: Array<[string, string, string]> = [
  ['1', 'Eli', 'Flesher'], ['24', 'Hudson', 'Fuerst'], ['4', 'AJ', 'Todd'], ['36', 'Hunter', 'Meadows'],
  ['3', 'Knox', 'Taylor'], ['12', 'Clay', 'Mcgarraugh'], ['99', 'Ford', 'Fox'], ['7', 'Wyatt', 'Fisher'],
  ['9', 'Graham', 'Weece'], ['13', 'Jayden', 'Watts'], ['0', 'Hendrix', 'Paston'], ['0', 'Kyle', 'Koon']
];

type Play =
  | { pa: PAResult; seq?: Position[]; err?: { pos: Position; kind: 'fielding' | 'throwing' }; bb?: BattedBall; override?: (m: RunnerMove[]) => RunnerMove[] }
  | { run: 'SB' | 'WP' | 'CS'; from: 1 | 2 | 3 }
  | { defense: Array<{ position: Position; playerId: string }> }
  | { pitchCount: number };

export async function loadSampleData(): Promise<{ finishedGameId: string; liveGameId: string }> {
  let team = (await db.teams.toArray()).find((t) => t.isMine);
  if (!team) {
    team = await createTeam({ name: 'Oklahoma Rattlers 13U', shortName: 'Rattlers', isMine: true });
    await saveSettings({ myTeamId: team.id });
  }
  const existing = await db.players.where('teamId').equals(team.id).toArray();
  const players: Record<string, string> = {};
  for (const [number, first, last] of ROSTER) {
    let p = existing.find((x) => x.firstName === first && x.lastName === last);
    if (!p) p = await createPlayer({ teamId: team.id, firstName: first, lastName: last, number, isFocus: last === 'Flesher' });
    players[last] = p.id;
  }
  const settings = await db.settings.get('settings');
  if (!settings?.focusPlayerId) await saveSettings({ focusPlayerId: players['Flesher'] });

  let opp = (await db.teams.toArray()).find((t) => t.name === 'Practice Opponent');
  if (!opp) opp = await createTeam({ name: 'Practice Opponent', shortName: 'Practice', isMine: false });
  const oppPlayers = await db.players.where('teamId').equals(opp.id).toArray();
  const oppIds: string[] = [];
  for (let i = 1; i <= 9; i++) {
    let p = oppPlayers.find((x) => x.lastName === `Batter ${i}`);
    if (!p) p = await createPlaceholderPlayer(opp.id, `Batter ${i}`);
    oppIds.push(p.id);
  }

  const order = ['Flesher', 'Fuerst', 'Todd', 'Meadows', 'Taylor', 'Mcgarraugh', 'Fox', 'Fisher', 'Weece'].map((l) => players[l]);
  const defenseStart: Partial<Record<Position, string>> = {
    1: players['Watts'], 2: players['Fuerst'], 3: players['Fox'], 4: players['Fisher'], 5: players['Meadows'],
    6: players['Taylor'], 7: players['Weece'], 8: players['Flesher'], 9: players['Todd']
  };
  const orderWithWatts = [...order.slice(0, 8), players['Watts']];

  const finished = await buildGame(team.id, opp.id, orderWithWatts, oppIds, defenseStart, '2026-10-17', '09:00', 'final', [
    // Top 1, Rattlers
    { pa: '1B', bb: { trajectory: 'GB', hardness: 'medium', zone: 'SS' } },
    { run: 'SB', from: 1 },
    { pa: '2B', bb: { trajectory: 'LD', hardness: 'hard', zone: 'LC' } },
    { pa: 'FO', seq: [8], bb: { trajectory: 'FB', hardness: 'medium', zone: 'CF' } },
    { pa: 'BB' },
    { pa: 'K' },
    { pa: 'GO', seq: [6, 3], bb: { trajectory: 'GB', hardness: 'hard', zone: 'SS' } },
    // Bottom 1, opponent
    { pa: 'GO', seq: [4, 3], bb: { trajectory: 'GB', hardness: 'soft', zone: '2B' } },
    { pa: 'KL' },
    { pa: 'ROE', err: { pos: 6, kind: 'throwing' }, bb: { trajectory: 'GB', hardness: 'medium', zone: 'SS' } },
    { pa: 'FO', seq: [8], bb: { trajectory: 'FB', hardness: 'hard', zone: 'CF_DEEP' } },
    // Top 2
    { pa: 'K' },
    { pa: '1B', bb: { trajectory: 'LD', hardness: 'hard', zone: 'RF' } },
    { pa: 'HR', bb: { trajectory: 'FB', hardness: 'hard', zone: 'LF_DEEP' } },
    { pa: 'PO', seq: [5] },
    { pa: 'GO', seq: [1, 3] },
    // Bottom 2: Eli from CF to SS, Taylor to CF
    { defense: [{ position: 6, playerId: players['Flesher'] }, { position: 8, playerId: players['Taylor'] }] },
    { pa: 'GO', seq: [6, 3], bb: { trajectory: 'GB', hardness: 'medium', zone: 'SS' } },
    { pa: '1B', bb: { trajectory: 'GB', hardness: 'soft', zone: '3B' } },
    { run: 'WP', from: 1 },
    { pa: 'SF', seq: [9] },
    { pa: 'K' },
    { pitchCount: 31 },
    // Top 3
    { pa: 'BB' },
    { pa: 'FC', seq: [6, 4] },
    { pa: 'DP', seq: [6, 4, 3], bb: { trajectory: 'GB', hardness: 'medium', zone: 'SS' } },
    // Bottom 3: pitching change, Meadows in for Watts (Watts to 3B)
    { defense: [{ position: 1, playerId: players['Meadows'] }, { position: 5, playerId: players['Watts'] }] },
    { pa: 'K' },
    { pa: 'KL' },
    { pa: 'GO', seq: [6, 3], bb: { trajectory: 'GB', hardness: 'hard', zone: 'SS' } },
    // Top 4
    { pa: '2B', bb: { trajectory: 'LD', hardness: 'hard', zone: 'RC' } },
    { pa: 'GO', seq: [4, 3], override: (m) => m.map((x) => (x.from === 2 ? { ...x, to: 3 as const } : x)) },
    { pa: 'SAC', seq: [2, 3] },
    { pa: 'FO', seq: [7] },
    // Bottom 4
    { pa: '1B' },
    { run: 'CS', from: 1 },
    { pa: 'HBP' },
    { pa: 'GO', seq: [5, 3] },
    { pa: 'LO', seq: [6] },
    { pitchCount: 24 }
  ], 'time_limit');

  const live = await buildGame(team.id, opp.id, orderWithWatts, oppIds, defenseStart, '2026-10-17', '11:30', 'in_progress', [
    { pa: 'GO', seq: [6, 3] },
    { pa: '1B' },
    { pa: 'K' },
    { pa: 'FO', seq: [9] },
    { pa: 'K' },
    { pa: 'BB' },
    { pa: 'GO', seq: [4, 3] },
    { pa: 'FO', seq: [8] },
    { pa: '2B', bb: { trajectory: 'LD', hardness: 'hard', zone: 'LC' } },
    { pa: '1B', bb: { trajectory: 'GB', hardness: 'medium', zone: 'MIDDLE' } },
    { pa: 'KL' },
    { pa: 'GO', seq: [1, 3] },
    { pa: 'K' },
    { pa: 'ROE', err: { pos: 4, kind: 'fielding' } },
    { pa: 'BB' }
  ]);

  return { finishedGameId: finished, liveGameId: live };
}

async function buildGame(
  teamId: string, oppId: string, order: string[], oppIds: string[], defense: Partial<Record<Position, string>>,
  date: string, time: string, status: 'final' | 'in_progress', plays: Play[], endReason?: 'time_limit'
): Promise<string> {
  const game = await createGame({
    teamId, opponentTeamId: oppId, mySide: 'away', date, time, venue: 'Practice field', ageDivision: '13U', gameType: 'scrimmage',
    rules: { scheduledInnings: 7, eraInnings: 7, fieldConfig: '54/80' }, scoringLevel: 'B', status: 'in_progress',
    opponentScoringDepth: 'full', notes: PRACTICE_TAG
  });
  const gid = game.id;
  await appendEvent(gid, { type: 'lineup_set', side: 'away', slots: order.map((playerId, i) => ({ slot: i + 1, playerId, position: 0 })) } as any);
  await appendEvent(gid, { type: 'lineup_set', side: 'home', slots: oppIds.map((playerId, i) => ({ slot: i + 1, playerId, position: 0 })) } as any);
  await appendEvent(gid, { type: 'defense_set', side: 'away', assignments: defense } as any);
  const oppDef: Partial<Record<Position, string>> = {};
  oppIds.forEach((id, i) => (oppDef[(i + 1) as Position] = id));
  await appendEvent(gid, { type: 'defense_set', side: 'home', assignments: oppDef } as any);

  for (const play of plays) {
    const events = await db.events.where('gameId').equals(gid).toArray();
    const r = replayGame(game, events.sort((a, b) => a.seq - b.seq));
    const batting: Side = r.state.half === 'top' ? 'away' : 'home';
    const fielding: Side = batting === 'home' ? 'away' : 'home';
    if ('defense' in play) {
      await appendEvent(gid, { type: 'defense_change', side: 'away', changes: play.defense, reason: play.defense.some((c) => c.position === 1) ? 'pitching_change' : 'swap' } as any);
      continue;
    }
    if ('pitchCount' in play) {
      const pid = r.state.away.defense[1];
      if (pid) await appendEvent(gid, { type: 'pitch_count', side: 'away', pitcherId: pid, count: play.pitchCount, source: 'manual' } as any);
      continue;
    }
    if ('run' in play) {
      const runner = r.state.bases[play.from];
      if (!runner) continue;
      const to = play.run === 'CS' ? 'out' : play.run === 'WP' ? (Math.min(4, play.from + 1) as 2 | 3 | 4) : (Math.min(4, play.from + 1) as 2 | 3 | 4);
      await appendEvent(gid, { type: 'baserunning', side: batting, kind: play.run, runners: [{ from: play.from, to, playerId: runner.playerId }], pitcherId: r.state[fielding].defense[1], fielding: play.run === 'CS' ? { sequence: [2, 4], errors: [] } : undefined } as any);
      continue;
    }
    const ss = r.state[batting];
    const slot = ss.lineup[ss.nextSlotIndex % ss.lineup.length];
    let moves = proposeMoves(play.pa, { bases: r.state.bases, outs: r.state.outs });
    if (play.override) moves = play.override(moves);
    const fieldingRec: FieldingRecord | undefined = play.seq || play.err
      ? { sequence: play.seq ?? (play.err ? [play.err.pos] : []), errors: play.err ? [{ position: play.err.pos, playerId: r.state[fielding].defense[play.err.pos], kind: play.err.kind, official: true, difficulty: 'routine' }] : [] }
      : undefined;
    await appendEvent(gid, {
      type: 'plate_appearance', side: batting, slot: slot.slot, batterId: slot.playerId, pitcherId: r.state[fielding].defense[1],
      result: play.pa, runners: moves, rbi: proposeRbi(play.pa, moves), battedBall: play.bb, fielding: fieldingRec,
      pitches: { total: 3 + ((slot.slot * 7) % 4) }
    } as any);
  }
  if (status === 'final') {
    await appendEvent(gid, { type: 'game_end', reason: endReason ?? 'regulation' } as any);
    await db.games.update(gid, { status: 'final', endReason: endReason ?? 'regulation' });
  }
  return gid;
}

export async function removePracticeGames(): Promise<number> {
  const games = (await db.games.toArray()).filter((g) => g.notes === PRACTICE_TAG);
  for (const g of games) await deleteGame(g.id);
  const opp = (await db.teams.toArray()).find((t) => t.name === 'Practice Opponent');
  if (opp) {
    const stillUsed = (await db.games.toArray()).some((g) => g.opponentTeamId === opp.id);
    if (!stillUsed) {
      await db.players.where('teamId').equals(opp.id).delete();
      await db.teams.delete(opp.id);
    }
  }
  return games.length;
}

export async function practiceGameCount(): Promise<number> {
  return (await db.games.toArray()).filter((g) => g.notes === PRACTICE_TAG).length;
}
