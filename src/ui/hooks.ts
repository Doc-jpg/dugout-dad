import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/db';
import type { Game, GameEvent, Player, Team, Settings } from '../engine/types';
import { DEFAULT_SETTINGS } from '../engine/types';
import { replayGame, type ReplayResult } from '../engine/reducer';

export function useTeams(): Team[] {
  return useLiveQuery(() => db.teams.orderBy('name').toArray(), [], []) ?? [];
}

export function usePlayers(teamId?: string): Player[] {
  return useLiveQuery(async () => (teamId ? db.players.where('teamId').equals(teamId).toArray() : db.players.toArray()), [teamId], []) ?? [];
}

export function useAllPlayers(): Player[] {
  return useLiveQuery(() => db.players.toArray(), [], []) ?? [];
}

export function usePlayerMap(): Map<string, Player> {
  const players = useAllPlayers();
  return useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
}

export function useGames(): Game[] {
  return useLiveQuery(() => db.games.orderBy('date').reverse().toArray(), [], []) ?? [];
}

export function useGame(gameId?: string): Game | undefined {
  return useLiveQuery(() => (gameId ? db.games.get(gameId) : undefined), [gameId]);
}

export function useEvents(gameId?: string): GameEvent[] {
  return (
    useLiveQuery(async () => {
      if (!gameId) return [];
      const evs = await db.events.where('gameId').equals(gameId).toArray();
      return evs.sort((a, b) => a.seq - b.seq);
    }, [gameId], []) ?? []
  );
}

/** Live replay of one game; recomputes whenever its events change. */
export function useReplay(gameId?: string): ReplayResult | undefined {
  const game = useGame(gameId);
  const events = useEvents(gameId);
  return useMemo(() => (game ? replayGame(game, events) : undefined), [game, events]);
}

/** Replays for every game (final or in progress), for stats pages. */
export function useAllReplays(): ReplayResult[] | undefined {
  return useLiveQuery(async () => {
    const games = await db.games.toArray();
    const events = await db.events.toArray();
    const byGame = new Map<string, GameEvent[]>();
    for (const e of events) {
      const arr = byGame.get(e.gameId) ?? [];
      arr.push(e);
      byGame.set(e.gameId, arr);
    }
    return games
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt.localeCompare(b.createdAt)))
      .map((g) => replayGame(g, (byGame.get(g.id) ?? []).sort((a, b) => a.seq - b.seq)));
  }, []);
}

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS;
}

export function useSnapshots() {
  return useLiveQuery(() => db.snapshots.orderBy('asOfDate').reverse().toArray(), [], []) ?? [];
}

export function useTournaments() {
  return useLiveQuery(() => db.tournaments.orderBy('startDate').reverse().toArray(), [], []) ?? [];
}

export function useSeasons(teamId?: string) {
  return useLiveQuery(async () => (teamId ? db.seasons.where('teamId').equals(teamId).toArray() : db.seasons.toArray()), [teamId], []) ?? [];
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useIsDesktop(): boolean {
  const [d, setD] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : false));
  useEffect(() => {
    const onR = () => setD(window.innerWidth >= 900);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return d;
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmt3(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '-';
  const s = v.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}
export function fmt2(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '-';
  return v.toFixed(2);
}
export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null || !isFinite(v)) return '-';
  return `${(v * 100).toFixed(digits)}%`;
}
