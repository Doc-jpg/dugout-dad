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
          <li><strong>Lineups.</strong> Tap your players in batting order. Under "Not here today?", tap anyone who did not make it; everyone else on the roster counts as here, and whoever is not in the order is on the bench. Tap Defense, then "Fill from batting order", then fix any spots by tapping a position and a player. For the other team, tap "Unknown lineup: 9 players" unless you know their names. Tap Start game.</li>
          <li><strong>Each pitch:</strong> tap <strong>Ball</strong>, <strong>Strike</strong> or <strong>Foul</strong>. The count shows next to the batter. Ball four opens the walk with the forced runners already set; strike three asks swinging or looking. A foul with two strikes counts a pitch and a strike for the pitcher and leaves the count alone.</li>
          <li><strong>Ball put in play:</strong> tap <strong>In play</strong>, then what happened. Hit, Single, Skip, Confirm. Out, Groundout, tap the shortstop then first base, Next, Confirm. The app proposes where the runners went; change a chip if it guessed wrong. That last pitch is counted as a strike for the pitcher automatically, so a full count and then a single is six pitches, three and three.</li>
          <li><strong>Pitch got away with runners on:</strong> tap <strong>Wild pitch / passed ball</strong> (or Runner, then the same). It asks whether that pitch was a ball, a strike, or already tapped, so the pitch is counted exactly once, then where each runner ended up. Rule of thumb: the pitch result first, everything that happened after it is added on top.</li>
          <li><strong>Pickoff throws:</strong> <strong>Runner</strong>, then "Pickoff attempt (pitcher)" or "Back-pick (catcher)" and which base. If the runner was out, use "Picked off (out)".</li>
          <li><strong>Lefty or righty:</strong> tap the pitcher's name (or the batter's name, then Edit) to set throws, bats, name and number as you learn them. Works for the other team too.</li>
          <li><strong>Between at-bats</strong> (steal, wild pitch, passed ball, pickoff): tap <strong>Runner</strong>.</li>
          <li><strong>Someone moved positions or a new pitcher came in:</strong> tap <strong>Defense</strong>, tap the position, tap the player. Picking a player who is already in the field swaps the two.</li>
          <li><strong>Someone got hurt, went home, or showed up late:</strong> tap <strong>Fix</strong>, then <strong>Who's here</strong>, tap the player, then Hurt, Left early, or Here / back in. Hurt and gone clear his position so you can fill it from Defense, and his expected playing time stops right there. If a kid marked hurt bats or fields anyway, the app counts him as back in and leaves a note.</li>
          <li><strong>You missed something:</strong> tap <strong>Fix</strong>. Add runs the other team scored while you were talking, set the inning and outs to match the scoreboard, enter a pitch count, or leave a note. The app records that you fixed it instead of making up plays.</li>
          <li><strong>Wrong tap:</strong> <strong>Undo</strong> takes back the last play. The <strong>Log</strong> (top right) lets you change or remove any play from any inning.</li>
          <li><strong>Game over:</strong> tap End game and why (regulation, time limit, mercy). It is saved on the phone. Start the next one.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Quick, Enhanced, pitches</h2>
        <p className="small">Quick is the result and the runners, nothing else. Enhanced adds optional contact detail (ground ball or line drive, soft or hard, tap where it went on the field); you can skip all of it on any play. "Log every pitch" is a separate switch, on by default. Change any of it from the button at the top right of the game screen.</p>
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
          <li><strong>Bench</strong> is innings a player was here and healthy but not in the field. <strong>DNP</strong> is a game he was here and never played; <strong>DNB</strong> is a game he was here while the team batted and never in the order. Absent games count against none of that. <strong>PA share</strong> is his plate appearances per team plate appearance while he was here; nine batters rotating evenly sit near 11%.</li>
          <li>"Hard%" and "routine play converted" are what you saw from the stands, not measurements. The app labels them that way and shows how many plays they are based on.</li>
          <li>A dash means not recorded, never zero.</li>
          <li>Imported GameChanger totals stay separate from what you score here unless the dates make combining them safe.</li>
        </ul>
      </div>
      {toast.el}
    </div>
  );
}
