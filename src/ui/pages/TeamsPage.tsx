import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTeams, usePlayers, useSettings } from '../hooks';
import { createTeam, createPlayer, updatePlayer, db, playerName, saveSettings, mergePlayers } from '../../db/db';
import type { Player, PlayerStatus, Team } from '../../engine/types';
import { nowIso } from '../../engine/types';
import { Sheet, Confirm, useToast } from '../components/Sheet';

const STATUS_LABEL: Record<PlayerStatus, string> = {
  regular: 'Regular roster',
  pickup: 'Temporary pickup',
  guest: 'Guest player',
  inactive: 'Inactive',
  former: 'Former player'
};

export function TeamsPage() {
  const teams = useTeams();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [isMine, setIsMine] = useState(teams.filter((t) => t.isMine).length === 0);

  const add = async () => {
    if (!name.trim()) return;
    const t = await createTeam({ name: name.trim(), shortName: shortName.trim() || undefined, isMine });
    if (isMine) await saveSettings({ myTeamId: t.id });
    setAdding(false);
    setName('');
    setShortName('');
    nav(`/teams/${t.id}`);
  };

  const mine = teams.filter((t) => t.isMine);
  const others = teams.filter((t) => !t.isMine);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1>Teams</h1>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Team
        </button>
      </div>
      <div className="section-title">
        <h3>My team</h3>
      </div>
      {mine.length === 0 && <div className="empty">Add your team first (for example, Oklahoma Rattlers 13U).</div>}
      <div className="list">
        {mine.map((t) => (
          <TeamRow key={t.id} team={t} />
        ))}
      </div>
      <div className="section-title">
        <h3>Opponents</h3>
        <span className="muted small">{others.length}</span>
      </div>
      {others.length === 0 && <div className="empty">Opponents are created when you set up a game and are reused next time you play them.</div>}
      <div className="list">
        {others.map((t) => (
          <TeamRow key={t.id} team={t} />
        ))}
      </div>

      {adding && (
        <Sheet
          title="New team"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add} disabled={!name.trim()}>
                Save
              </button>
            </>
          }
        >
          <div className="field">
            <label>Team name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Oklahoma Rattlers 13U" autoFocus />
          </div>
          <div className="field">
            <label>Short name (scoreboard)</label>
            <input className="input" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Rattlers" />
          </div>
          <div className="switch">
            <span>This is my team (the one I follow)</span>
            <input type="checkbox" checked={isMine} onChange={(e) => setIsMine(e.target.checked)} style={{ width: 24, height: 24 }} />
          </div>
        </Sheet>
      )}
    </div>
  );
}

function TeamRow({ team }: { team: Team }) {
  const players = usePlayers(team.id);
  const nav = useNavigate();
  const active = players.filter((p) => p.status === 'regular' || p.status === 'pickup' || p.status === 'guest').length;
  return (
    <div className="item tappable" onClick={() => nav(`/teams/${team.id}`)}>
      <div className="grow">
        <div className="title">{team.name}</div>
        <div className="sub">
          {active} active player{active === 1 ? '' : 's'}
          {players.some((p) => p.isPlaceholder) ? ' · some names unknown' : ''}
        </div>
      </div>
      <span className="chev">›</span>
    </div>
  );
}

export function TeamDetailPage() {
  const { teamId = '' } = useParams();
  const teams = useTeams();
  const team = teams.find((t) => t.id === teamId);
  const players = usePlayers(teamId);
  const settings = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState<Player | null | 'new'>(null);
  const [merging, setMerging] = useState<Player | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);
  const nav = useNavigate();

  if (!team) return <div className="empty">Team not found.</div>;

  const sorted = [...players].sort((a, b) => {
    const order: Record<PlayerStatus, number> = { regular: 0, pickup: 1, guest: 2, inactive: 3, former: 4 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const na = parseInt(a.number ?? '999', 10) || 999;
    const nb = parseInt(b.number ?? '999', 10) || 999;
    if (na !== nb) return na - nb;
    return playerName(a, 'last').localeCompare(playerName(b, 'last'));
  });

  const quickAdd = async (text: string) => {
    // "7 Eli Flesher" or "Eli Flesher" or "#12"
    const m = /^#?(\d{1,2})?\s*(.*)$/.exec(text.trim());
    const number = m?.[1];
    const rest = (m?.[2] ?? '').trim();
    if (!rest && !number) return;
    const parts = rest.split(/\s+/).filter(Boolean);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
    const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    await createPlayer({ teamId, firstName, lastName: lastName || (parts.length ? '' : `#${number}`), number, isPlaceholder: !rest });
    toast.show('Player added');
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link to="/teams" className="btn ghost sm">
          ‹ Teams
        </Link>
      </div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h1>{team.name}</h1>
          <div className="muted small">{team.isMine ? 'My team' : 'Opponent'}</div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Player
        </button>
      </div>

      <QuickAdd onAdd={quickAdd} />

      <div className="list" style={{ marginTop: 12 }}>
        {sorted.map((p) => (
          <div key={p.id} className="item tappable" onClick={() => setEditing(p)}>
            <div className="num" style={{ width: 34, fontWeight: 800, color: 'var(--ink-3)' }}>
              {p.number ?? ''}
            </div>
            <div className="grow">
              <div className="title">
                {playerName(p)} {p.isFocus && <span className="pill ok">Tracking</span>}
                {p.isPlaceholder && <span className="pill">name unknown</span>}
              </div>
              <div className="sub">
                {STATUS_LABEL[p.status]}
                {p.bats ? ` · bats ${p.bats}` : ''}
              </div>
            </div>
            <span className="chev">›</span>
          </div>
        ))}
        {players.length === 0 && <div className="empty">No players yet. Type a number and name above, one per line.</div>}
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <button className="btn ghost sm danger" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDelete(team)}>
          Delete team
        </button>
      </div>

      {editing && (
        <PlayerEditor
          teamId={teamId}
          player={editing === 'new' ? null : editing}
          isFocus={editing !== 'new' && settings.focusPlayerId === editing.id}
          onClose={() => setEditing(null)}
          onMerge={(p) => {
            setEditing(null);
            setMerging(p);
          }}
        />
      )}
      {merging && (
        <MergeSheet
          from={merging}
          candidates={players.filter((p) => p.id !== merging.id)}
          onClose={() => setMerging(null)}
          onDone={() => {
            setMerging(null);
            toast.show('Players merged');
          }}
        />
      )}
      {confirmDelete && (
        <Confirm
          title="Delete team?"
          text="This removes the team and its roster. Games already recorded keep their data but lose the team's name."
          danger
          yesLabel="Delete"
          onNo={() => setConfirmDelete(null)}
          onYes={async () => {
            await db.players.where('teamId').equals(teamId).delete();
            await db.teams.delete(teamId);
            nav('/teams');
          }}
        />
      )}
      {toast.el}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const submit = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) await onAdd(l);
    setText('');
  };
  return (
    <div className="card">
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Quick add (number then name, one per line)</label>
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Eli Flesher\n24 Hudson Fuerst\n#12  (number only, name unknown)'} />
      </div>
      <button className="btn sm" onClick={submit} disabled={!text.trim()}>
        Add players
      </button>
    </div>
  );
}

function PlayerEditor({ teamId, player, isFocus, onClose, onMerge }: { teamId: string; player: Player | null; isFocus: boolean; onClose: () => void; onMerge: (p: Player) => void }) {
  const [first, setFirst] = useState(player?.firstName ?? '');
  const [last, setLast] = useState(player?.lastName ?? '');
  const [number, setNumber] = useState(player?.number ?? '');
  const [bats, setBats] = useState<Player['bats'] | ''>(player?.bats ?? '');
  const [status, setStatus] = useState<PlayerStatus>(player?.status ?? 'regular');
  const [focus, setFocus] = useState(isFocus || !!player?.isFocus);
  const [del, setDel] = useState(false);

  const save = async () => {
    const patch: Partial<Player> = {
      firstName: first.trim(),
      lastName: last.trim(),
      number: number.trim() || undefined,
      bats: bats || undefined,
      status,
      isFocus: focus,
      isPlaceholder: !first.trim() && !last.trim() ? true : false
    };
    if (player) {
      await updatePlayer(player.id, patch);
      if (focus) await saveSettings({ focusPlayerId: player.id });
    } else {
      const p = await createPlayer({ teamId, firstName: patch.firstName!, lastName: patch.lastName!, number: patch.number, bats: patch.bats, status, isFocus: focus });
      if (focus) await saveSettings({ focusPlayerId: p.id });
    }
    onClose();
  };

  return (
    <Sheet
      title={player ? 'Edit player' : 'New player'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!first.trim() && !last.trim() && !number.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="inline-fields">
        <div className="field">
          <label>First name</label>
          <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="field">
          <label>Last name</label>
          <input className="input" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <div className="inline-fields">
        <div className="field">
          <label>Number</label>
          <input className="input" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="field">
          <label>Bats</label>
          <select className="input" value={bats ?? ''} onChange={(e) => setBats(e.target.value as any)}>
            <option value="">Unknown</option>
            <option value="R">Right</option>
            <option value="L">Left</option>
            <option value="S">Switch</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Roster status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlayerStatus)}>
          {(Object.keys(STATUS_LABEL) as PlayerStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="switch">
        <span>Track this player's development (Eli)</span>
        <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} style={{ width: 24, height: 24 }} />
      </div>
      {player && (
        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button className="btn sm" onClick={() => onMerge(player)}>
            Merge into another player…
          </button>
          <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => setDel(true)}>
            Delete
          </button>
        </div>
      )}
      {del && player && (
        <Confirm
          title="Delete player?"
          text="If this player appears in recorded games, those events keep the id but lose the name. Prefer 'Merge' or set the status to Former."
          danger
          yesLabel="Delete"
          onNo={() => setDel(false)}
          onYes={async () => {
            await db.players.delete(player.id);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function MergeSheet({ from, candidates, onClose, onDone }: { from: Player; candidates: Player[]; onClose: () => void; onDone: () => void }) {
  const [into, setInto] = useState<string>('');
  return (
    <Sheet
      title={`Merge ${playerName(from)} into…`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!into}
            onClick={async () => {
              await mergePlayers(from.id, into);
              onDone();
            }}
          >
            Merge
          </button>
        </>
      }
    >
      <p className="muted small">Every recorded event for {playerName(from)} will point to the player you choose. Use this when the same kid ended up as two entries (for example "#12" and "Jayden Watts").</p>
      <div className="list">
        {candidates.map((c) => (
          <label key={c.id} className="item">
            <input type="radio" name="into" checked={into === c.id} onChange={() => setInto(c.id)} />
            <span className="grow">
              {c.number ? `#${c.number} ` : ''}
              {playerName(c)}
            </span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}

export { STATUS_LABEL };
