import React, { useEffect, useState } from 'react';
import { useSettings, useTeams, useAllPlayers } from '../hooks';
import { saveSettings, storageHealth, requestPersistence, db, playerName, type StorageHealth } from '../../db/db';
import type { ScoringLevel } from '../../engine/types';
import { Confirm, useToast } from '../components/Sheet';
import { APP_VERSION } from '../version';

export function SettingsPage() {
  const settings = useSettings();
  const teams = useTeams();
  const players = useAllPlayers();
  const toast = useToast();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [wipe, setWipe] = useState(false);
  useEffect(() => {
    storageHealth().then(setHealth);
  }, []);
  const myTeams = teams.filter((t) => t.isMine);
  const roster = players.filter((p) => p.teamId === (settings.myTeamId ?? myTeams[0]?.id));
  const set = async (patch: Parameters<typeof saveSettings>[0]) => {
    await saveSettings(patch);
    toast.show('Saved');
  };
  const isStandalone = typeof window !== 'undefined' && ((window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches);

  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>Settings</h1>

      <div className="card">
        <h2>Who I follow</h2>
        <div className="field">
          <label>My team</label>
          <select className="input" value={settings.myTeamId ?? ''} onChange={(e) => set({ myTeamId: e.target.value || undefined })}>
            <option value="">Choose…</option>
            {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Player I'm tracking (highlighted everywhere)</label>
          <select className="input" value={settings.focusPlayerId ?? ''} onChange={async (e) => { const id = e.target.value || undefined; await db.players.where('isFocus').equals(1 as any).modify({ isFocus: false }).catch(() => {}); if (id) await db.players.update(id, { isFocus: true }); set({ focusPlayerId: id }); }}>
            <option value="">None</option>
            {roster.map((p) => <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{playerName(p)}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <h2>Scoring defaults</h2>
        <div className="field">
          <label>Default scoring depth for new games</label>
          <div className="chips">
            {(['A', 'B'] as ScoringLevel[]).map((l) => (
              <button key={l} className={`chip ${settings.defaultScoringLevel === l ? 'on' : ''}`} onClick={() => set({ defaultScoringLevel: l })}>{l === 'A' ? 'Quick' : 'Enhanced'}</button>
            ))}
          </div>
        </div>
        <div className="inline-fields">
          <div className="field">
            <label>Scheduled innings</label>
            <select className="input" value={settings.defaultScheduledInnings} onChange={(e) => set({ defaultScheduledInnings: parseInt(e.target.value, 10) })}>{[5, 6, 7, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="field">
            <label>ERA basis (innings)</label>
            <select className="input" value={settings.defaultEraInnings} onChange={(e) => set({ defaultEraInnings: parseInt(e.target.value, 10) })}>{[6, 7, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
        </div>
        <div className="field">
          <label>Remind me to export after this many finished games</label>
          <select className="input" value={settings.exportReminderGames} onChange={(e) => set({ exportReminderGames: parseInt(e.target.value, 10) })}>{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </div>
      </div>

      <div className="card">
        <h2>Quality at-bat definition</h2>
        <p className="muted small">A plate appearance counts as a QAB if any checked condition is met. The exact definition travels with your exports.</p>
        {(
          [
            ['hit', 'Any hit'],
            ['walkOrHbp', 'Walk or hit by pitch'],
            ['hardContact', 'Hard contact (observed), even if out'],
            ['sacrifice', 'Sacrifice bunt or fly'],
            ['rbi', 'Any RBI'],
            ['sixPlusPitches', '6 or more pitches (when recorded)'],
            ['threePlusAfterTwoStrikes', '3 or more pitches after two strikes (pitch-by-pitch only)']
          ] as Array<[keyof typeof settings.qab, string]>
        ).map(([k, l]) => (
          <label key={k} className="switch">
            <span>{l}</span>
            <input type="checkbox" checked={settings.qab[k]} onChange={(e) => set({ qab: { ...settings.qab, [k]: e.target.checked } })} style={{ width: 24, height: 24 }} />
          </label>
        ))}
      </div>

      <div className="card">
        <h2>This device</h2>
        <p className="small">
          {isStandalone ? 'Running as an installed app.' : 'Running in the browser. On iPhone: Share, then "Add to Home Screen" to install; installed apps keep their data far more reliably and open offline.'}
        </p>
        {health && (
          <p className="small muted">
            {health.message}
            {health.usageBytes != null ? ` · ${(health.usageBytes / 1024 / 1024).toFixed(1)} MB used` : ''}
          </p>
        )}
        {health?.verdict === 'install' && (
          <button className="btn sm" onClick={async () => { const ok = await requestPersistence(); setHealth(await storageHealth()); toast.show(ok ? 'Persistent storage granted' : 'Browser declined; install the app and export regularly'); }}>Request persistent storage</button>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>No account, no server, no tracking. Everything lives on this device until you export it. Dugout Dad {APP_VERSION}.</p>
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => setWipe(true)}>Erase all data on this device</button>
      </div>

      {wipe && (
        <Confirm
          title="Erase everything on this device?"
          text="Teams, players, games and imports are deleted from this device. Export a full backup first if you have not."
          danger
          yesLabel="Erase"
          onNo={() => setWipe(false)}
          onYes={async () => {
            await Promise.all([db.teams.clear(), db.players.clear(), db.seasons.clear(), db.tournaments.clear(), db.games.clear(), db.events.clear(), db.audit.clear(), db.snapshots.clear(), db.transfers.clear(), db.settings.clear()]);
            setWipe(false);
            toast.show('Erased');
          }}
        />
      )}
      {toast.el}
    </div>
  );
}
