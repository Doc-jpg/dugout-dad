import React, { useEffect } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { TeamsPage, TeamDetailPage } from './pages/TeamsPage';
import { NewGamePage } from './pages/NewGamePage';
import { LineupPage } from './pages/LineupPage';
import { LiveGamePage } from './pages/LiveGamePage';
import { GameLogPage } from './pages/GameLogPage';
import { GameSummaryPage } from './pages/GameSummaryPage';
import { TransferPage } from './pages/TransferPage';
import { StatsPage } from './pages/StatsPage';
import { PlayerPage } from './pages/PlayerPage';
import { PositionsPage } from './pages/PositionsPage';
import { LineupLabPage } from './pages/LineupLabPage';
import { PitchingPage } from './pages/PitchingPage';
import { TournamentsPage } from './pages/TournamentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ImportGameChangerPage } from './pages/ImportGameChangerPage';
import { requestPersistence } from '../db/db';

const Icon = {
  games: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M7 5c3 3 3 11 0 14M17 5c-3 3-3 11 0 14" /></svg>,
  teams: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-3.5 4.5-3.5S22 16 22 18" /></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  transfer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M4 17v3h16v-3" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
};

export function App() {
  useEffect(() => {
    // Ask once for persistent storage so the browser is less likely to evict game data.
    requestPersistence();
  }, []);
  return (
    <div className="app">
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/games">{Icon.games}<span>Games</span></NavLink>
        <NavLink to="/teams">{Icon.teams}<span>Teams</span></NavLink>
        <NavLink to="/stats">{Icon.stats}<span>Stats</span></NavLink>
        <NavLink to="/transfer">{Icon.transfer}<span>Transfer</span></NavLink>
        <NavLink to="/settings">{Icon.settings}<span>Settings</span></NavLink>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/games" replace />} />
          <Route path="/games" element={<HomePage />} />
          <Route path="/games/new" element={<NewGamePage />} />
          <Route path="/games/:gameId/lineup" element={<LineupPage />} />
          <Route path="/games/:gameId/live" element={<LiveGamePage />} />
          <Route path="/games/:gameId/log" element={<GameLogPage />} />
          <Route path="/games/:gameId" element={<GameSummaryPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/stats/player/:playerId" element={<PlayerPage />} />
          <Route path="/stats/positions" element={<PositionsPage />} />
          <Route path="/stats/lineup" element={<LineupLabPage />} />
          <Route path="/stats/pitching" element={<PitchingPage />} />
          <Route path="/stats/tournaments" element={<TournamentsPage />} />
          <Route path="/transfer" element={<TransferPage />} />
          <Route path="/transfer/gamechanger" element={<ImportGameChangerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/games" replace />} />
        </Routes>
      </main>
    </div>
  );
}
