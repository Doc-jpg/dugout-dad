import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGame, useEvents, usePlayerMap, useTeams } from '../hooks';
import { replayGame } from '../../engine/reducer';
import type { GameEvent, PlateAppearanceEvent } from '../../engine/types';
import { deleteEvent, editEvent } from '../../db/db';
import { describeEvent } from './LiveGamePage';
import { PAFlow } from '../components/PAFlow';
import { Sheet, Confirm, useToast } from '../components/Sheet';

/**
 * Every event in order, with the inning context it happened in. Plate appearances can be
 * re-recorded (edited in place); any event can be deleted. The game replays from the log.
 */
export function GameLogPage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);
  const events = useEvents(gameId);
  const players = usePlayerMap();
  const teams = useTeams();
  const toast = useToast();
  const [editing, setEditing] = useState<PlateAppearanceEvent | null>(null);
  const [deleting, setDeleting] = useState<GameEvent | null>(null);
  const [viewing, setViewing] = useState<GameEvent | null>(null);

  // Context (inning/half/outs before) for each event: replay prefixes. Cheap at youth game sizes.
  const contexts = useMemo(() => {
    if (!game) return new Map<string, { inning: number; half: string; outs: number; score: string }>();
    const map = new Map<string, { inning: number; half: string; outs: number; score: string }>();
    for (let i = 0; i < events.length; i++) {
      const r = replayGame(game, events.slice(0, i));
      map.set(events[i].id, { inning: r.state.inning, half: r.state.half, outs: r.state.outs, score: `${r.state.away.runs}-${r.state.home.runs}` });
    }
    return map;
  }, [game, events]);

  if (!game) return <div className="empty">Game not found.</div>;
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.shortName ?? teams.find((t) => t.id === id)?.name ?? '?';

  const replayBefore = (ev: GameEvent) => replayGame(game, events.filter((e) => e.seq < ev.seq));

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <Link to={game.status === 'final' ? `/games/${gameId}` : `/games/${gameId}/live`} className="btn ghost sm">‹ {game.status === 'final' ? 'Summary' : 'Game'}</Link>
        <span className="muted small">{events.length} events</span>
      </div>
      <h1 style={{ marginBottom: 4 }}>Play log</h1>
      <p className="muted small">{nameOf(game.teamId)} vs {nameOf(game.opponentTeamId)} · {game.date}. Tap a play to fix or remove it; everything downstream recalculates.</p>
      <div className="card" style={{ padding: 0 }}>
        {events.map((ev) => {
          const c = contexts.get(ev.id);
          const isPA = ev.type === 'plate_appearance';
          return (
            <div key={ev.id} className="log-item" onClick={() => (isPA ? setEditing(ev as PlateAppearanceEvent) : setViewing(ev))} style={{ cursor: 'pointer' }}>
              <div className="seq">{ev.seq}</div>
              <div className="desc">
                <div>{describeEvent(ev, players)}</div>
                {c && <div className="ctx">{c.half === 'top' ? 'Top' : 'Bot'} {c.inning}, {c.outs} out · {c.score}{ev.note ? ` · ${ev.note}` : ''}</div>}
              </div>
              <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setDeleting(ev); }} aria-label="Delete">✕</button>
            </div>
          );
        })}
        {events.length === 0 && <div className="empty">Nothing recorded yet.</div>}
      </div>

      {editing && (
        <PAFlow
          replay={replayBefore(editing)}
          side={editing.side}
          batter={{ playerId: editing.batterId, slot: editing.slot }}
          level={game.scoringLevel}
          players={players}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await editEvent({ ...editing, ...payload, id: editing.id, gameId, seq: editing.seq, ts: editing.ts } as PlateAppearanceEvent);
            setEditing(null);
            toast.show('Play updated');
          }}
        />
      )}
      {viewing && (
        <Sheet title="Event" onClose={() => setViewing(null)}>
          <p>{describeEvent(viewing, players)}</p>
          <pre className="small mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-sunk)', padding: 10, borderRadius: 8 }}>{JSON.stringify(viewing, null, 2)}</pre>
          <p className="muted small">Lineup, defense, correction and note events can be removed here; to change one, remove it and record it again from the game screen.</p>
        </Sheet>
      )}
      {deleting && (
        <Confirm
          title="Remove this event?"
          text={`${describeEvent(deleting, players)}. The game will replay without it. This is kept in the audit trail.`}
          danger
          yesLabel="Remove"
          onNo={() => setDeleting(null)}
          onYes={async () => {
            await deleteEvent(deleting.id);
            setDeleting(null);
            toast.show('Removed');
          }}
        />
      )}
      {toast.el}
    </div>
  );
}
