import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadSampleData, removePracticeGames } from '../../db/sample';
import { useToast } from '../components/Sheet';

/** Plain-language walkthrough plus the practice-mode controls. */
export function HelpPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { liveGameId } = await loadSampleData();
      toast.show('Practice games loaded');
      nav(`/games/${liveGameId}/live`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <Link to="/games" className="btn ghost sm">‹ Games</Link>
      </div>
      <h1>How Dugout Dad works</h1>

      <div className="card">
        <h2>Try it first (practice mode)</h2>
        <p className="muted small">Loads your roster, a practice opponent, one finished game with a full box score, and one game paused in the third inning so you can tap through real plays. Nothing you do in a practice game affects anything else, and one tap removes them all.</p>
        <div className="row wrap">
          <button className="btn primary" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Load practice games'}</button>
          <button className="btn" onClick={async () => { const n = await removePracticeGames(); toast.show(n ? `Removed ${n} practice game${n > 1 ? 's' : ''}` : 'No practice games to remove'); }}>Remove practice games</button>
        </div>
      </div>

      <div className="card">
        <h2>The five screens</h2>
        <ol style={{ paddingLeft: 20, margin: '6px 0 0' }}>
          <li><strong>Games</strong>: start a game, pick up one in progress, open a finished one.</li>
          <li><strong>Teams</strong>: your roster. Add a player as "number name" (for example "1 Eli Flesher"). Opponents get made during game setup.</li>
          <li><strong>Stats</strong>: everything calculated from what you scored, plus the GameChanger history you import.</li>
          <li><strong>Transfer</strong>: export the weekend to a file, import it on the computer, import GameChanger files, backups.</li>
          <li><strong>Settings</strong>: who you track (Eli), default scoring depth, what counts as a quality at-bat.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Scoring a game, start to finish</h2>
        <ol style={{ paddingLeft: 20, margin: '6px 0 0' }} className="col">
          <li><strong>New game.</strong> Opponent name (or "Unknown"), are we home or away, date. Tap Next.</li>
          <li><strong>Lineups.</strong> Tap your players in batting order. Tap Defense, then "Fill from batting order", then fix any spots by tapping a position and a player. For the other team, tap "Unknown lineup: 9 batters" unless you know their names. Tap Start game.</li>
          <li><strong>Each at-bat:</strong> tap <strong>Record at-bat</strong>, then what happened. Strikeout, Swinging, Confirm. Hit, Single, Skip, Confirm. Out, Groundout, tap the shortstop then first base, Next, Confirm. The app proposes where the runners went; change a chip if it guessed wrong.</li>
          <li><strong>Between at-bats</strong> (steal, wild pitch, passed ball, pickoff): tap <strong>Runner</strong>.</li>
          <li><strong>Someone moved positions or a new pitcher came in:</strong> tap <strong>Defense</strong>, tap the position, tap the player. Picking a player who is already in the field swaps the two.</li>
          <li><strong>You missed something:</strong> tap <strong>Fix</strong>. Add runs the other team scored while you were talking, set the inning and outs to match the scoreboard, enter a pitch count, or leave a note. The app records that you fixed it instead of making up plays.</li>
          <li><strong>Wrong tap:</strong> <strong>Undo</strong> takes back the last play. The <strong>Log</strong> (top right) lets you change or remove any play from any inning.</li>
          <li><strong>Game over:</strong> tap End game and why (regulation, time limit, mercy). It is saved on the phone. Start the next one.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Quick, Enhanced, Full</h2>
        <p className="small">Quick is the result and the runners, nothing else. Enhanced adds optional contact detail (ground ball or line drive, soft or hard, tap where it went on the field) and pitch counts; you can skip all of it on any play. Full adds pitch by pitch. Switch any time from the button at the top right of the game screen.</p>
      </div>

      <div className="card">
        <h2>After the weekend</h2>
        <ol style={{ paddingLeft: 20, margin: '6px 0 0' }}>
          <li>Transfer, <strong>Export the weekend</strong>. Send the file to yourself (Files, AirDrop, Mail).</li>
          <li>On the computer, open Dugout Dad, Transfer, drop the file on <strong>Import games</strong>.</li>
          <li>Stats: tap Eli's name for his page, Position comparison for who has played shortstop, Lineup lab for batting order ideas.</li>
        </ol>
        <p className="small muted" style={{ marginTop: 8 }}>The phone keeps every game until you delete it; a game is a few hundred kilobytes, so dozens fit without a second thought. The export is the backup.</p>
      </div>

      <div className="card">
        <h2>What the numbers mean</h2>
        <ul style={{ paddingLeft: 20, margin: '6px 0 0' }} className="small">
          <li>Innings like <strong>1.2</strong> mean one inning and two outs, the way baseball writes it.</li>
          <li>"Hard%" and "routine play converted" are what you saw from the stands, not measurements. The app labels them that way and shows how many plays they are based on.</li>
          <li>A dash means not recorded, never zero.</li>
          <li>Imported GameChanger totals stay separate from what you score here unless the dates make combining them safe.</li>
        </ul>
      </div>
      {toast.el}
    </div>
  );
}
