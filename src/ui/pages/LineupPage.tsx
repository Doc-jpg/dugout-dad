import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame, useEvents, usePlayers, useTeams, usePlayerMap } from '../hooks';
import { appendEvent, createPlaceholderPlayer, createPlayer, db, playerName, updatePlayer } from '../../db/db';
import type { LineupSlot, Position, Side, Player, DefenseSetEvent, LineupSetEvent } from '../../engine/types';
import { POSITION_LABEL, nowIso } from '../../engine/types';
import { replayGame } from '../../engine/reducer';
import { Diamond, ALL_POSITIONS } from '../components/Diamond';
import { Sheet, useToast } from '../components/Sheet';

type Draft = { slots: LineupSlot[]; defense: Partial<Record<Position, string>> };

/**
 * Batting orders and starting defense for both sides. Also used mid-game to
 * re-enter a lineup (writes a new lineup_set / defense_set event).
 */
export function LineupPage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);
  const events = useEvents(gameId);
  const teams = useTeams();
  const players = usePlayerMap();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<'mine' | 'opp'>('mine');
  const [drafts, setDrafts] = useState<Record<Side, Draft>>({ home: { slots: [], defense: {} }, away: { slots: [], defense: {} } });
  const [loaded, setLoaded] = useState(false);

  // Seed drafts from the current replay state (if any)
  useEffect(() => {
    if (!game || loaded) return;
    const r = replayGame(game, events);
    setDrafts({
      home: { slots: r.state.home.lineup.map((s) => ({ ...s })), defense: { ...r.state.home.defense } },
      away: { slots: r.state.away.lineup.map((s) => ({ ...s })), defense: { ...r.state.away.defense } }
    });
    setLoaded(true);
  }, [game, events, loaded]);

  if (!game) return <div className="empty">Game not found.</div>;
  const mySide = game.mySide;
  const oppSide: Side = mySide === 'home' ? 'away' : 'home';
  const side: Side = tab === 'mine' ? mySide : oppSide;
  const teamId = tab === 'mine' ? game.teamId : game.opponentTeamId;
  const team = teams.find((t) => t.id === teamId);
  const draft = drafts[side];
  const setDraft = (d: Draft) => setDrafts((prev) => ({ ...prev, [side]: d }));

  const myReady = drafts[mySide].slots.length >= 1 && drafts[mySide].defense[1];
  const started = events.some((e) => e.type === 'plate_appearance' || e.type === 'baserunning');

  const save = async () => {
    for (const s of ['home', 'away'] as Side[]) {
      const d = drafts[s];
      // A side with nobody at pitcher gets a placeholder so pitches and pitching lines have an owner.
      // Rename it from the game screen (tap the pitcher's name) once you know who it is.
      if (d.slots.length && !d.defense[1]) {
        const tid = s === mySide ? game.teamId : game.opponentTeamId;
        const existing = (await db.players.where('teamId').equals(tid).toArray()).find((p) => p.isPlaceholder && /^Pitcher/.test(p.lastName));
        const p = existing ?? (await createPlaceholderPlayer(tid, 'Pitcher'));
        d.defense = { ...d.defense, 1: p.id };
      }
      const slots = d.slots.map((sl, i) => ({ slot: i + 1, playerId: sl.playerId, position: (Object.entries(d.defense).find(([, pid]) => pid === sl.playerId)?.[0] ?? 0) as unknown as Position }));
      if (slots.length) await appendEvent<LineupSetEvent>(gameId, { type: 'lineup_set', side: s, slots } as any);
      if (Object.keys(d.defense).length) await appendEvent<DefenseSetEvent>(gameId, { type: 'defense_set', side: s, assignments: d.defense } as any);
    }
    if (game.status === 'setup') await db.games.update(gameId, { status: 'in_progress', updatedAt: nowIso() });
    nav(`/games/${gameId}/live`, { replace: true });
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="btn ghost sm" onClick={() => nav(started ? `/games/${gameId}/live` : '/games')}>
          ‹ {started ? 'Game' : 'Games'}
        </button>
        <button className="btn primary" onClick={save} disabled={!myReady}>
          {started ? 'Save changes' : 'Start game'}
        </button>
      </div>
      <h1 style={{ marginBottom: 8 }}>Lineups</h1>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>
          {teams.find((t) => t.id === game.teamId)?.shortName ?? 'My team'} ({drafts[mySide].slots.length})
        </button>
        <button className={`chip ${tab === 'opp' ? 'on' : ''}`} onClick={() => setTab('opp')}>
          {teams.find((t) => t.id === game.opponentTeamId)?.shortName ?? teams.find((t) => t.id === game.opponentTeamId)?.name ?? 'Opponent'} ({drafts[oppSide].slots.length})
        </button>
      </div>
      {!myReady && tab === 'mine' && <div className="banner info">Add at least one batter and a pitcher to start. You can fix anything later.</div>}
      <SideEditor key={side} side={side} teamId={teamId} teamName={team?.name ?? ''} isMine={tab === 'mine'} draft={draft} setDraft={setDraft} players={players} toast={toast.show} />
      {toast.el}
    </div>
  );
}

function SideEditor({
  side,
  teamId,
  teamName,
  isMine,
  draft,
  setDraft,
  players,
  toast
}: {
  side: Side;
  teamId: string;
  teamName: string;
  isMine: boolean;
  draft: Draft;
  setDraft: (d: Draft) => void;
  players: Map<string, Player>;
  toast: (m: string) => void;
}) {
  const roster = usePlayers(teamId);
  const [mode, setMode] = useState<'order' | 'defense'>('order');
  const [selPos, setSelPos] = useState<Position | null>(null);
  const [quick, setQuick] = useState('');
  const inOrder = new Set(draft.slots.map((s) => s.playerId));
  const available = roster
    .filter((p) => !inOrder.has(p.id) && p.status !== 'former' && p.status !== 'inactive')
    .sort((a, b) => (parseInt(a.number ?? '999', 10) || 999) - (parseInt(b.number ?? '999', 10) || 999));
  const bench = roster.filter((p) => p.status === 'inactive');
  void bench;

  const addToOrder = (pid: string) => setDraft({ ...draft, slots: [...draft.slots, { slot: draft.slots.length + 1, playerId: pid, position: 0 }] });
  const remove = (pid: string) => {
    const defense = { ...draft.defense };
    for (const [pos, id] of Object.entries(defense)) if (id === pid) delete defense[Number(pos) as Position];
    setDraft({ slots: draft.slots.filter((s) => s.playerId !== pid), defense });
  };
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...draft.slots];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setDraft({ ...draft, slots: arr });
  };
  const posOf = (pid: string): Position => (Number(Object.entries(draft.defense).find(([, id]) => id === pid)?.[0] ?? 0) as Position);

  const assign = (pos: Position, pid: string | null) => {
    const defense = { ...draft.defense };
    const displaced = defense[pos];
    const prevPosOfPid = pid ? posOf(pid) : 0;
    if (pid) {
      if (prevPosOfPid) delete defense[prevPosOfPid];
      defense[pos] = pid;
      // Swap: whoever was here takes the mover's old spot when there was one.
      if (displaced && prevPosOfPid && displaced !== pid) defense[prevPosOfPid] = displaced;
    } else delete defense[pos];
    setDraft({ ...draft, defense });
  };

  const autoFill = () => {
    // Assign positions 1-9 to the first nine batters in order, keeping any existing assignments.
    const defense = { ...draft.defense };
    const taken = new Set(Object.values(defense));
    const openPositions = ALL_POSITIONS.filter((p) => !defense[p]);
    for (const s of draft.slots) {
      if (taken.has(s.playerId)) continue;
      const p = openPositions.shift();
      if (!p) break;
      defense[p] = s.playerId;
    }
    setDraft({ ...draft, defense });
  };

  const generatePlaceholders = async (n: number) => {
    const slots = [...draft.slots];
    for (let i = slots.length; i < n; i++) {
      const p = await createPlaceholderPlayer(teamId, `Batter ${i + 1}`);
      slots.push({ slot: i + 1, playerId: p.id, position: 0 });
    }
    setDraft({ ...draft, slots });
  };

  const quickAdd = async () => {
    const lines = quick.split('\n').map((l) => l.trim()).filter(Boolean);
    const slots = [...draft.slots];
    for (const line of lines) {
      const m = /^#?(\d{1,2})?\s*(.*)$/.exec(line);
      const number = m?.[1];
      const rest = (m?.[2] ?? '').trim();
      // Reuse an existing player with the same number or name on this team
      let existing = roster.find((p) => (rest && playerName(p).toLowerCase() === rest.toLowerCase()) || (!rest && number && p.number === number));
      if (!existing) {
        const parts = rest.split(/\s+/).filter(Boolean);
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
        const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        existing = await createPlayer({ teamId, firstName, lastName: lastName || (rest ? '' : `#${number ?? '?'}`), number, isPlaceholder: !rest });
      }
      if (!slots.some((s) => s.playerId === existing!.id)) slots.push({ slot: slots.length + 1, playerId: existing.id, position: 0 });
    }
    setDraft({ ...draft, slots });
    setQuick('');
  };

  return (
    <div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${mode === 'order' ? 'on' : ''}`} onClick={() => setMode('order')}>
          Batting order
        </button>
        <button className={`chip ${mode === 'defense' ? 'on' : ''}`} onClick={() => setMode('defense')}>
          Defense {isMine ? '' : '(optional)'}
        </button>
      </div>

      {mode === 'order' && (
        <>
          <div className="list">
            {draft.slots.map((s, i) => {
              const p = players.get(s.playerId);
              const pos = posOf(s.playerId);
              return (
                <div key={s.playerId} className="item">
                  <div className="num" style={{ width: 24, fontWeight: 800, color: 'var(--ink-3)' }}>
                    {i + 1}
                  </div>
                  <div className="grow">
                    <div className="title">
                      {p?.number ? `#${p.number} ` : ''}
                      {playerName(p)}
                    </div>
                    <div className="sub">{pos ? POSITION_LABEL[pos] : isMine ? 'no position yet' : ''}</div>
                  </div>
                  <button className="btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    ▲
                  </button>
                  <button className="btn sm ghost" onClick={() => move(i, 1)} disabled={i === draft.slots.length - 1} aria-label="Move down">
                    ▼
                  </button>
                  <button className="btn sm ghost" onClick={() => remove(s.playerId)} aria-label="Remove">
                    ✕
                  </button>
                </div>
              );
            })}
            {draft.slots.length === 0 && <div className="empty">Tap players below to build the order{isMine ? '' : ', or generate unknown batters'}.</div>}
          </div>

          {available.length > 0 && (
            <>
              <div className="section-title">
                <h3>Tap to add</h3>
                <span className="muted small">{available.length} available</span>
              </div>
              <div className="chips add-chips">
                {available.map((p) => (
                  <button key={p.id} className="chip" onClick={() => addToOrder(p.id)}>
                    {p.number ? `#${p.number} ` : ''}
                    {playerName(p, 'short')}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>{isMine ? 'Add players not on the roster (pickups)' : 'Opponent batters: names, numbers, or both'}</label>
              <textarea className="input" rows={2} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={isMine ? '15 Pickup Player' : '#12\n#4 Smith\nJohn Doe'} />
            </div>
            <div className="row wrap">
              <button className="btn sm" onClick={quickAdd} disabled={!quick.trim()}>
                Add to order
              </button>
              {!isMine && (
                <>
                  <button className="btn sm" onClick={() => generatePlaceholders(9)}>
                    Unknown lineup: 9 batters
                  </button>
                  <button className="btn sm" onClick={() => generatePlaceholders(draft.slots.length + 1)}>
                    + 1 unknown batter
                  </button>
                </>
              )}
            </div>
            {!isMine && <p className="muted small" style={{ marginTop: 8 }}>Unknown batters can be renamed any time (Teams page) and keep every event recorded for them.</p>}
          </div>
        </>
      )}

      {mode === 'defense' && (
        <>
          <p className="muted small">Tap a position, then tap the player. Tap an occupied position to change it.</p>
          <Diamond assignments={draft.defense} players={players} selected={selPos} onSelect={(p) => setSelPos(selPos === p ? null : p)} />
          <div className="row between" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={autoFill} disabled={draft.slots.length === 0}>
              Fill from batting order
            </button>
            {selPos && (
              <button className="btn sm" onClick={() => assign(selPos, null)}>
                Clear {POSITION_LABEL[selPos]}
              </button>
            )}
          </div>
          {selPos && (
            <div className="section">
              <h3 style={{ marginBottom: 8 }}>Who plays {POSITION_LABEL[selPos]}?</h3>
              <div className="chips">
                {[...draft.slots.map((s) => players.get(s.playerId)).filter(Boolean), ...roster.filter((p) => !inOrder.has(p.id) && p.status !== 'former')].map((p) => {
                  if (!p) return null;
                  const cur = posOf(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`chip ${draft.defense[selPos] === p.id ? 'on' : ''}`}
                      onClick={() => {
                        assign(selPos, p.id);
                        setSelPos(null);
                      }}
                    >
                      {p.number ? `#${p.number} ` : ''}
                      {playerName(p, 'short')}
                      {cur && cur !== selPos ? ` (${POSITION_LABEL[cur]})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="section">
            <h3 style={{ marginBottom: 8 }}>Not in the field</h3>
            <div className="chips">
              {draft.slots
                .filter((s) => !posOf(s.playerId))
                .map((s) => (
                  <span key={s.playerId} className="pill">
                    {playerName(players.get(s.playerId), 'short')} (EH)
                  </span>
                ))}
              {draft.slots.every((s) => posOf(s.playerId)) && <span className="muted small">Everyone in the order has a position.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
