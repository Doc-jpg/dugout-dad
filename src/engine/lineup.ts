/**
 * Batting-order analytics and pitching workload.
 *
 * WEIGHTING METHOD (documented so nobody mistakes it for precision):
 *   1. Season rates come from every plate appearance in the selected games.
 *   2. Recent rates come from the plate appearances in the last N games only.
 *      Those recent PAs are a SUBSET of the season PAs. Blending them is therefore an
 *      overweight of recent form, not a double count of separate totals. We never add
 *      season aggregates to recent aggregates.
 *   3. Small samples are shrunk toward the team rate before blending:
 *        rate_adj = (pa * rate + K * teamRate) / (pa + K), with K = 20 PA.
 *   4. weighted = seasonWeight * season_adj + recentWeight * recent_adj
 *      (defaults 0.85 / 0.15). If a player has no recent PAs, the season value is used
 *      alone and the sample note says so.
 *   5. composite = 1.8 * OBP_adj + SLG_adj. This is a wOBA-style proxy (OBP counted
 *      roughly 1.8x SLG, following the common rule of thumb), not a precise wOBA. It ranks
 *      hitters for sequencing; it is not a run estimate.
 *
 * Youth samples are small. Every output carries caveats and the UI must show them.
 */
import type { ReplayResult } from './reducer';
import type { Settings, PitchingRules, Position } from './types';
import { outsToInnings } from './types';
import {
  battingLines, filterReplays, teamBattingTotals, ratio, sideForTeam, sortByDateAsc, emptyBattingLine,
  type BattingLine
} from './stats';

export const SHRINKAGE_PA = 20;
export const SMALL_SAMPLE_PA = 30;

export interface WeightedRates {
  pa: number;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  kPct: number | null;
  bbPct: number | null;
  /** Observational hard-hit rate blended the same way; null when never recorded. */
  hardHitPct: number | null;
  composite: number | null;
}

export interface WeightedEntry {
  playerId: string;
  season: BattingLine;
  recent: BattingLine;
  weighted: WeightedRates;
  sampleNote: string;
}

function shrink(rate: number | null, pa: number, teamRate: number | null): number | null {
  if (rate == null) return teamRate;
  if (teamRate == null) return rate;
  return (pa * rate + SHRINKAGE_PA * teamRate) / (pa + SHRINKAGE_PA);
}

function blend(season: number | null, recent: number | null, hasRecent: boolean, sw: number, rw: number): number | null {
  if (season == null) return null;
  if (!hasRecent || recent == null) return season;
  const total = sw + rw;
  return (sw * season + rw * recent) / (total || 1);
}

export function weightedBattingLines(
  replays: ReplayResult[],
  opts: {
    teamId: string;
    playerIds: string[];
    recentGames: number;
    seasonWeight: number;
    recentWeight: number;
    qab: Settings['qab'];
  }
): WeightedEntry[] {
  const teamGames = filterReplays(replays, { teamId: opts.teamId });
  const seasonLines = battingLines(teamGames, { teamId: opts.teamId, playerIds: opts.playerIds, qab: opts.qab });
  const recentGames = filterReplays(teamGames, { lastNGames: opts.recentGames });
  const recentLines = battingLines(recentGames, { teamId: opts.teamId, playerIds: opts.playerIds, qab: opts.qab });
  const team = teamBattingTotals(seasonLines);
  const teamK = ratio(team.so, team.pa);
  const teamBB = ratio(team.bb, team.pa);

  const byId = (lines: BattingLine[]) => new Map(lines.map((l) => [l.playerId, l]));
  const seasonMap = byId(seasonLines);
  const recentMap = byId(recentLines);

  const out: WeightedEntry[] = [];
  for (const pid of opts.playerIds) {
    const season = seasonMap.get(pid) ?? emptyLine(pid);
    const recent = recentMap.get(pid) ?? emptyLine(pid);
    const hasRecent = recent.pa > 0;

    const sObp = shrink(season.obp, season.pa, team.obp);
    const sSlg = shrink(season.slg, season.pa, team.slg);
    const sK = shrink(ratio(season.so, season.pa), season.pa, teamK);
    const sBB = shrink(ratio(season.bb, season.pa), season.pa, teamBB);
    const rObp = shrink(recent.obp, recent.pa, team.obp);
    const rSlg = shrink(recent.slg, recent.pa, team.slg);
    const rK = shrink(ratio(recent.so, recent.pa), recent.pa, teamK);
    const rBB = shrink(ratio(recent.bb, recent.pa), recent.pa, teamBB);

    const obp = blend(sObp, rObp, hasRecent, opts.seasonWeight, opts.recentWeight);
    const slg = blend(sSlg, rSlg, hasRecent, opts.seasonWeight, opts.recentWeight);
    const kPct = blend(sK, rK, hasRecent, opts.seasonWeight, opts.recentWeight);
    const bbPct = blend(sBB, rBB, hasRecent, opts.seasonWeight, opts.recentWeight);
    const hardHitPct = blend(season.hardHitPct, recent.hardHitPct, hasRecent && recent.hardHitPct != null, opts.seasonWeight, opts.recentWeight);
    const composite = obp != null && slg != null ? 1.8 * obp + slg : null;

    const notes: string[] = [`${season.pa} PA this season, ${recent.pa} in the last ${opts.recentGames} game${opts.recentGames === 1 ? '' : 's'}`];
    if (season.pa === 0) notes.push('no plate appearances recorded; shown at the team rate');
    else if (season.pa < SMALL_SAMPLE_PA) notes.push(`small sample (under ${SMALL_SAMPLE_PA} PA), shrunk toward the team rate`);
    if (!hasRecent && season.pa > 0) notes.push('no recent plate appearances; season value used alone');

    out.push({
      playerId: pid,
      season,
      recent,
      weighted: { pa: season.pa, obp, slg, ops: obp != null && slg != null ? obp + slg : null, kPct, bbPct, hardHitPct, composite },
      sampleNote: notes.join('; ')
    });
  }
  return out.sort((a, b) => (b.weighted.composite ?? -1) - (a.weighted.composite ?? -1));
}

function emptyLine(pid: string): BattingLine {
  // battingLines returns no line for a player with no PAs, so build an empty one.
  return emptyBattingLine(pid);
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export interface LineupRecommendation {
  order: Array<{ slot: number; playerId: string; reason: string }>;
  alternatives: Array<{ label: string; order: string[]; note: string }>;
  /** Approximate PA per 7-inning game by slot: slot n gets about 4.3 - (n - 1) * 0.11. */
  expectedPaPer7Innings: Record<string, number>;
  weakStretches: Array<{ slots: [number, number]; note: string }>;
  caveats: string[];
}

export function expectedPaForSlot(slot: number): number {
  return Math.round((4.3 - (slot - 1) * 0.11) * 100) / 100;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function recommendLineup(entries: WeightedEntry[], opts: { slots: number }): LineupRecommendation {
  const caveats: string[] = [
    'Heuristic ordering from blended, shrunk rates. Youth samples are small; treat differences of a few points as noise.',
    'Composite = 1.8 x OBP + SLG (wOBA-style proxy), not a run estimate.'
  ];
  const ranked = [...entries].sort((a, b) => (b.weighted.composite ?? -1) - (a.weighted.composite ?? -1));
  const eligible = ranked.slice(0, Math.max(0, opts.slots));
  if (eligible.length < opts.slots) caveats.push(`Only ${eligible.length} eligible players for ${opts.slots} slots.`);
  const small = entries.filter((e) => e.season.pa < SMALL_SAMPLE_PA);
  if (small.length) caveats.push(`Sample-size warning: ${small.length} player${small.length === 1 ? ' has' : 's have'} fewer than ${SMALL_SAMPLE_PA} PA (${small.map((e) => e.playerId).join(', ')}).`);
  if (entries.some((e) => e.weighted.composite == null)) caveats.push('Some players have no computable rates and were placed last.');

  const remaining = [...eligible];
  const take = (pick: (e: WeightedEntry) => number | null, label: string): { e: WeightedEntry; reason: string } | null => {
    if (!remaining.length) return null;
    let best = remaining[0];
    let bestV = pick(best) ?? -Infinity;
    for (const e of remaining) {
      const v = pick(e) ?? -Infinity;
      if (v > bestV) {
        best = e;
        bestV = v;
      }
    }
    remaining.splice(remaining.indexOf(best), 1);
    return { e: best, reason: label };
  };

  const order: LineupRecommendation['order'] = [];
  // Slot 1: highest adjusted OBP among the top 4 by composite
  if (remaining.length) {
    const top4 = remaining.slice(0, 4);
    let lead = top4[0];
    for (const e of top4) if ((e.weighted.obp ?? -1) > (lead.weighted.obp ?? -1)) lead = e;
    remaining.splice(remaining.indexOf(lead), 1);
    order.push({ slot: 1, playerId: lead.playerId, reason: `Highest on-base rate (${fmt(lead.weighted.obp)}) among the top four hitters` });
  }
  const s2 = take((e) => e.weighted.composite, 'Best remaining overall hitter (composite)');
  if (s2) order.push({ slot: 2, playerId: s2.e.playerId, reason: `${s2.reason} ${fmt(s2.e.weighted.composite)}` });
  // Pick slot 4 before slot 3
  const s4 = take((e) => e.weighted.slg, 'Highest remaining slugging');
  const s3 = take((e) => e.weighted.composite, 'Next best overall hitter');
  if (s3) order.push({ slot: 3, playerId: s3.e.playerId, reason: `${s3.reason} (composite ${fmt(s3.e.weighted.composite)})` });
  if (s4) order.push({ slot: 4, playerId: s4.e.playerId, reason: `${s4.reason} (SLG ${fmt(s4.e.weighted.slg)})` });
  let slot = 5;
  while (remaining.length) {
    const n = take((e) => e.weighted.composite, 'Descending composite');
    if (!n) break;
    order.push({ slot, playerId: n.e.playerId, reason: `${n.reason} ${fmt(n.e.weighted.composite)}` });
    slot += 1;
  }
  order.sort((a, b) => a.slot - b.slot);

  const compById = new Map(entries.map((e) => [e.playerId, e.weighted.composite]));
  const med = median(eligible.map((e) => e.weighted.composite ?? 0));
  const weakStretches: LineupRecommendation['weakStretches'] = [];
  if (med != null) {
    for (let i = 0; i + 2 < order.length; i++) {
      const vals = [order[i], order[i + 1], order[i + 2]].map((o) => compById.get(o.playerId) ?? 0);
      const avg = vals.reduce((a, b) => a + b, 0) / 3;
      if (avg < med) {
        weakStretches.push({ slots: [order[i].slot, order[i + 2].slot], note: `Slots ${order[i].slot} to ${order[i + 2].slot} average composite ${fmt(avg)} is below the lineup median ${fmt(med)}` });
      }
    }
  }

  const expectedPaPer7Innings: Record<string, number> = {};
  for (const o of order) expectedPaPer7Innings[o.playerId] = expectedPaForSlot(o.slot);

  const byComposite = ranked.slice(0, opts.slots).map((e) => e.playerId);
  const traditional = buildTraditional(eligible);
  const alternatives = [
    { label: 'Best hitters 1-2-3', order: byComposite, note: 'Pure composite order: most plate appearances go to the best overall hitters.' },
    { label: 'Power 3-4-5', order: traditional, note: 'Traditional shape: top two on-base hitters lead off, top three sluggers bat 3-4-5, rest by composite.' }
  ];

  return { order, alternatives, expectedPaPer7Innings, weakStretches, caveats };
}

function buildTraditional(eligible: WeightedEntry[]): string[] {
  const pool = [...eligible];
  const pickMax = (f: (e: WeightedEntry) => number | null) => {
    if (!pool.length) return null;
    let best = pool[0];
    for (const e of pool) if ((f(e) ?? -1) > (f(best) ?? -1)) best = e;
    pool.splice(pool.indexOf(best), 1);
    return best;
  };
  const slug = [pickMax((e) => e.weighted.slg), pickMax((e) => e.weighted.slg), pickMax((e) => e.weighted.slg)].filter(Boolean) as WeightedEntry[];
  const obp = [pickMax((e) => e.weighted.obp), pickMax((e) => e.weighted.obp)].filter(Boolean) as WeightedEntry[];
  const rest = pool.sort((a, b) => (b.weighted.composite ?? -1) - (a.weighted.composite ?? -1));
  // 1,2 = obp; 3,4,5 = slug (best slugger 4th)
  const slugOrdered = slug.length === 3 ? [slug[1], slug[0], slug[2]] : slug;
  return [...obp, ...slugOrdered, ...rest].map((e) => e.playerId);
}

function fmt(v: number | null): string {
  return v == null ? 'n/a' : v.toFixed(3);
}

// ---------------------------------------------------------------------------
// Monte Carlo lineup simulation (rough comparison tool)
// ---------------------------------------------------------------------------

export interface SimOutcomes {
  bb: number;
  hbp: number;
  '1B': number;
  '2B': number;
  '3B': number;
  hr: number;
  out: number;
}

/** mulberry32 PRNG: tiny, seeded, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rough Monte Carlo over 7-inning games. Outcomes are drawn from each hitter's recorded
 * outcome frequencies; runner advancement is fixed (single: batter to 1st, runners up one,
 * runner from 2nd scores half the time; double: batter to 2nd, runners up two; triple and HR
 * clear the bases). No steals, errors, or double plays. Use it to compare orders, not to
 * forecast runs.
 */
export function simulateLineupRuns(
  order: string[],
  lines: Record<string, { pa: number; outcomes: SimOutcomes }>,
  games = 2000,
  seed = 1
): { meanRuns: number; sd: number } {
  if (!order.length) return { meanRuns: 0, sd: 0 };
  const rnd = mulberry32(seed);
  const tables = order.map((pid) => {
    const l = lines[pid];
    const o = l?.outcomes;
    const total = o ? o.bb + o.hbp + o['1B'] + o['2B'] + o['3B'] + o.hr + o.out : 0;
    if (!o || total <= 0) return null;
    const cum: Array<[string, number]> = [];
    let acc = 0;
    for (const k of ['bb', 'hbp', '1B', '2B', '3B', 'hr', 'out'] as const) {
      acc += o[k] / total;
      cum.push([k, acc]);
    }
    return cum;
  });
  const draw = (idx: number): string => {
    const t = tables[idx];
    if (!t) return 'out';
    const u = rnd();
    for (const [k, c] of t) if (u <= c) return k;
    return 'out';
  };
  const results: number[] = [];
  for (let g = 0; g < games; g++) {
    let runs = 0;
    let batter = 0;
    for (let inn = 0; inn < 7; inn++) {
      let outs = 0;
      let b1 = false, b2 = false, b3 = false;
      while (outs < 3) {
        const res = draw(batter % order.length);
        batter += 1;
        switch (res) {
          case 'out':
            outs += 1;
            break;
          case 'bb':
          case 'hbp':
            if (b1 && b2 && b3) runs += 1;
            else if (b1 && b2) b3 = true;
            else if (b1) b2 = true;
            b1 = true;
            break;
          case '1B': {
            // Runner from 3rd scores; runner from 2nd scores half the time, otherwise to 3rd;
            // runner from 1st to 2nd; batter to 1st.
            if (b3) runs += 1;
            let r2ToThird = false;
            if (b2) {
              if (rnd() < 0.5) runs += 1;
              else r2ToThird = true;
            }
            b3 = r2ToThird;
            b2 = b1;
            b1 = true;
            break;
          }
          case '2B':
            if (b3) runs += 1;
            if (b2) runs += 1;
            b3 = b1;
            b2 = true;
            b1 = false;
            break;
          case '3B':
            runs += (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0);
            b1 = false; b2 = false; b3 = true;
            break;
          case 'hr':
            runs += 1 + (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0);
            b1 = false; b2 = false; b3 = false;
            break;
        }
      }
    }
    results.push(runs);
  }
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const varc = results.reduce((a, b) => a + (b - mean) * (b - mean), 0) / results.length;
  return { meanRuns: Math.round(mean * 1000) / 1000, sd: Math.round(Math.sqrt(varc) * 1000) / 1000 };
}

/** Convenience: build simulateLineupRuns input from batting lines. */
export function simOutcomesFromLine(l: BattingLine): { pa: number; outcomes: SimOutcomes } {
  const reach = l.bb + l.hbp + l.h;
  return {
    pa: l.pa,
    outcomes: { bb: l.bb, hbp: l.hbp, '1B': l.singles, '2B': l.doubles, '3B': l.triples, hr: l.hr, out: Math.max(0, l.pa - reach) }
  };
}

// ---------------------------------------------------------------------------
// Pitching workload
// ---------------------------------------------------------------------------

export interface PitcherWorkload {
  playerId: string;
  appearances: Array<{ gameId: string; date: string; outs: number; pitches: number | null; pitchSource: string }>;
  byDate: Record<string, { pitches: number | null; outs: number }>;
  lastDate: string | null;
  /** Days between the pitcher's last appearance and the most recent game date in the set. */
  daysSinceLast: number | null;
  /** Outs in the three-calendar-day window ending on the latest game date in the set. */
  weekendOuts: number;
  weekendPitches: number | null;
  flags: string[];
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const dbb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((dbb - da) / 86400000);
}

export function pitchingWorkload(replays: ReplayResult[], teamId: string, rules?: PitchingRules): PitcherWorkload[] {
  const games = sortByDateAsc(replays.filter((r) => sideForTeam(r, teamId) !== null));
  const latest = games.length ? games[games.length - 1].game.date : null;
  const map = new Map<string, PitcherWorkload & { unknownCount: number }>();
  for (const r of games) {
    const side = sideForTeam(r, teamId)!;
    for (const pl of r.pitcherLines) {
      if (pl.side !== side) continue;
      let w = map.get(pl.pitcherId);
      if (!w) {
        w = { playerId: pl.pitcherId, appearances: [], byDate: {}, lastDate: null, daysSinceLast: null, weekendOuts: 0, weekendPitches: 0, flags: [], unknownCount: 0 };
        map.set(pl.pitcherId, w);
      }
      w.appearances.push({ gameId: r.game.id, date: r.game.date, outs: pl.outs, pitches: pl.pitches, pitchSource: pl.pitchSource });
      const d = (w.byDate[r.game.date] ??= { pitches: 0, outs: 0 });
      d.outs += pl.outs;
      if (pl.pitches == null) {
        d.pitches = null;
        w.unknownCount += 1;
      } else if (d.pitches != null) d.pitches += pl.pitches;
      w.lastDate = r.game.date;
    }
  }
  const out: PitcherWorkload[] = [];
  for (const w of map.values()) {
    if (latest && w.lastDate) w.daysSinceLast = daysBetween(w.lastDate, latest);
    let wkOuts = 0;
    let wkPitches: number | null = 0;
    if (latest) {
      for (const [date, v] of Object.entries(w.byDate)) {
        const diff = daysBetween(date, latest);
        if (diff >= 0 && diff <= 2) {
          wkOuts += v.outs;
          if (v.pitches == null) wkPitches = null;
          else if (wkPitches != null) wkPitches += v.pitches;
        }
      }
    }
    w.weekendOuts = wkOuts;
    w.weekendPitches = wkPitches;
    if (w.unknownCount) w.flags.push(`pitch count unknown for ${w.unknownCount} appearance${w.unknownCount === 1 ? '' : 's'}`);
    if (rules) {
      for (const [date, v] of Object.entries(w.byDate)) {
        if (rules.maxPitchesPerDay != null && v.pitches != null && v.pitches > rules.maxPitchesPerDay) {
          w.flags.push(`${date}: ${v.pitches} pitches exceeds the daily limit of ${rules.maxPitchesPerDay}`);
        }
        if (rules.maxInningsPerDay != null && v.outs / 3 > rules.maxInningsPerDay) {
          w.flags.push(`${date}: ${outsToInnings(v.outs)} innings exceeds the daily limit of ${rules.maxInningsPerDay}`);
        }
      }
      if (rules.maxInningsPerWeekend != null && wkOuts / 3 > rules.maxInningsPerWeekend) {
        w.flags.push(`${outsToInnings(wkOuts)} innings in the weekend window exceeds the limit of ${rules.maxInningsPerWeekend}`);
      }
      if (rules.restDays?.length && w.lastDate && latest) {
        const lastDay = w.byDate[w.lastDate];
        if (lastDay?.pitches != null) {
          const rule = rules.restDays.find((x) => lastDay.pitches! >= x.minPitches && lastDay.pitches! <= x.maxPitches);
          if (rule && w.daysSinceLast != null && w.daysSinceLast < rule.restDays) {
            w.flags.push(`${lastDay.pitches} pitches on ${w.lastDate} requires ${rule.restDays} rest day${rule.restDays === 1 ? '' : 's'}; ${w.daysSinceLast} elapsed by ${latest}`);
          }
        }
      }
    }
    const { unknownCount, ...rest } = w;
    void unknownCount;
    out.push(rest);
  }
  return out.sort((a, b) => b.weekendOuts - a.weekendOuts || a.playerId.localeCompare(b.playerId));
}

export type { Position };
