import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useGames, useTeams, useSnapshots, fmtDate, useIsDesktop } from '../hooks';
import { db, storageHealth, type StorageHealth } from '../../db/db';
import { buildArchive, readArchive, planImport, commitImport, defaultDecisions, shareOrDownload, type ArchiveContents, type ImportPlan, type GameDecision, type ImportResult } from '../../io/archive';
import { rollbackSnapshot } from '../../io/gamechanger';
import { Sheet, Confirm, useToast } from '../components/Sheet';
import { APP_VERSION } from '../version';

export function TransferPage() {
  const games = useGames();
  const teams = useTeams();
  const snapshots = useSnapshots();
  const desktop = useIsDesktop();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [archive, setArchive] = useState<ArchiveContents | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [decisions, setDecisions] = useState<Record<string, GameDecision>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rollback, setRollback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const transfers = useTransfers();

  useEffect(() => {
    storageHealth().then(setHealth);
  }, []);

  const finals = games.filter((g) => g.status === 'final');
  const unexported = finals.filter((g) => !g.lastExportedAt);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.shortName ?? teams.find((t) => t.id === id)?.name ?? '?';

  const selectUnexported = () => setSelected(new Set(unexported.map((g) => g.id)));
  const selectAll = () => setSelected(new Set(games.map((g) => g.id)));
  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const exportSelected = async (ids: string[], label: string) => {
    if (!ids.length) return;
    setBusy(label);
    try {
      const { bytes, fileName } = await buildArchive(db, { gameIds: ids, includeSnapshots: true, appVersion: APP_VERSION });
      const how = await shareOrDownload(bytes, fileName);
      toast.show(how === 'shared' ? 'Shared. Save it to Files or AirDrop it to your computer.' : `Downloaded ${fileName}`);
      setSelected(new Set());
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.show(`Export failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const fullBackup = async () => {
    setBusy('backup');
    try {
      const { bytes, fileName } = await buildArchive(db, { gameIds: games.map((g) => g.id), includeSnapshots: true, includeAllTeamsAndPlayers: true, appVersion: APP_VERSION });
      await shareOrDownload(bytes, fileName.replace('dugout-dad_', 'dugout-dad_FULL-BACKUP_'));
      toast.show('Full backup created');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.show(`Backup failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const exportSqlite = async () => {
    setBusy('sqlite');
    try {
      const { buildSqliteDatabase } = await import('../../io/sqlite');
      const bytes = await buildSqliteDatabase(db, { appVersion: APP_VERSION });
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await shareOrDownload(bytes, `dugout-dad_${stamp}.sqlite`, 'application/x-sqlite3');
      toast.show('SQLite database exported');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.show(`SQLite export failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    setBusy('read');
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const a = await readArchive(bytes);
      const p = await planImport(db, a);
      setArchive(a);
      setPlan(p);
      setDecisions(defaultDecisions(p));
    } catch (e: any) {
      toast.show(`Could not read archive: ${e?.message ?? e}`, 3500);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commit = async () => {
    if (!archive || !plan) return;
    setBusy('commit');
    try {
      const r = await commitImport(db, archive, plan, { gameDecisions: decisions, importSnapshots: true });
      setResult(r);
      setArchive(null);
      setPlan(null);
    } catch (e: any) {
      toast.show(`Import failed: ${e?.message ?? e}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>Transfer and backup</h1>

      {health && (
        <div className={`banner ${health.verdict === 'install' ? 'warn' : 'info'}`}>
          {health.message}
          {health.usageBytes != null ? ` · using ${(health.usageBytes / 1024 / 1024).toFixed(1)} MB` : ''}
          {health.quotaBytes != null ? ` of about ${Math.round(health.quotaBytes / 1024 / 1024)} MB available` : ''}
        </div>
      )}

      <div className="card">
        <h2>Export games</h2>
        <p className="muted small">One ZIP with every selected game, the rosters they use, and checksums. Share it to Files, AirDrop it, or save it, then import it on your computer.</p>
        <div className="row wrap" style={{ margin: '8px 0' }}>
          <button className="btn sm" onClick={selectUnexported} disabled={!unexported.length}>Select not-yet-exported ({unexported.length})</button>
          <button className="btn sm" onClick={selectAll} disabled={!games.length}>Select all ({games.length})</button>
          <button className="btn sm ghost" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear</button>
        </div>
        <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {games.map((g) => (
            <label key={g.id} className="item" style={{ minHeight: 48, padding: '8px 12px' }}>
              <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} style={{ width: 22, height: 22 }} />
              <span className="grow">
                <span className="title">{fmtDate(g.date)} vs {teamName(g.opponentTeamId)}</span>
                <span className="sub"> · {g.status}{g.lastExportedAt ? ' · exported' : ''}</span>
              </span>
            </label>
          ))}
          {games.length === 0 && <div className="empty">No games to export yet.</div>}
        </div>
        <button className="btn primary lg block" style={{ marginTop: 10 }} disabled={!selected.size || !!busy} onClick={() => exportSelected([...selected], 'export')}>
          {busy === 'export' ? 'Building archive…' : `Export ${selected.size || ''} game${selected.size === 1 ? '' : 's'}`}
        </button>
        {unexported.length > 0 && selected.size === 0 && (
          <button className="btn block" style={{ marginTop: 8 }} disabled={!!busy} onClick={() => exportSelected(unexported.map((g) => g.id), 'export')}>
            Export the weekend ({unexported.length} new)
          </button>
        )}
      </div>

      <div className="card">
        <h2>Import games</h2>
        <p className="muted small">Open an archive exported from your phone. Games already here are matched by id, so importing the same weekend twice changes nothing.</p>
        <input ref={fileRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <DropZone onFile={onFile} onClick={() => fileRef.current?.click()} label={busy === 'read' ? 'Reading…' : desktop ? 'Drop a Dugout Dad archive here, or click to choose' : 'Tap to choose an archive'} />
        {result && (
          <div className="banner info" style={{ marginTop: 10 }}>
            Imported: {result.gamesAdded} new, {result.gamesUpdated} updated, {result.gamesSkipped} skipped. {(result as any).summary ?? ''}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <Link className="btn block" to="/transfer/gamechanger">Import a GameChanger season export (CSV)</Link>
        </div>
      </div>

      <div className="card">
        <h2>Backups</h2>
        <p className="muted small">Browser storage can be cleared by the device. Keep a copy somewhere else after every weekend.</p>
        <div className="row wrap">
          <button className="btn" onClick={fullBackup} disabled={!!busy}>{busy === 'backup' ? 'Building…' : 'Full backup (ZIP)'}</button>
          <button className="btn" onClick={exportSqlite} disabled={!!busy}>{busy === 'sqlite' ? 'Building…' : 'Export SQLite database'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>The ZIP restores everything through Import. The SQLite file opens in DB Browser for SQLite, Excel add-ins, Python, or any tool that reads SQLite, with every plate appearance, defensive interval, and pitcher line as tables.</p>
      </div>

      {snapshots.length > 0 && (
        <div className="card">
          <h2>Imported GameChanger snapshots</h2>
          <div className="list">
            {snapshots.map((s) => (
              <div key={s.id} className="item">
                <div className="grow">
                  <div className="title">{s.label}</div>
                  <div className="sub">as of {fmtDate(s.asOfDate)} · {s.rows.length} players · {s.fileName}</div>
                </div>
                <button className="btn sm" onClick={() => setRollback(s.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {transfers.length > 0 && (
        <div className="card">
          <h2>History</h2>
          <div className="list">
            {transfers.slice(0, 10).map((t) => (
              <div key={t.id} className="item" style={{ minHeight: 44 }}>
                <span className="pill">{t.direction}</span>
                <span className="grow small">{t.summary}</span>
                <span className="muted small">{t.at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan && archive && (
        <Sheet
          title="Import preview"
          onClose={() => { setPlan(null); setArchive(null); }}
          footer={
            <>
              <button className="btn" onClick={() => { setPlan(null); setArchive(null); }}>Cancel</button>
              <button className="btn primary" onClick={commit} disabled={busy === 'commit'}>{busy === 'commit' ? 'Importing…' : 'Import'}</button>
            </>
          }
        >
          <p className="small muted">{plan.summary}</p>
          <div className="list">
            {plan.games.map((g) => (
              <div key={g.gameId} className="item" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="title">{g.label}</div>
                  <div className="sub">{g.detail}</div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end' }}>
                  <span className={`pill ${g.disposition === 'new' ? 'ok' : g.disposition === 'conflict' ? 'bad' : g.disposition === 'update' ? 'warn' : ''}`}>{g.disposition}</span>
                  {g.disposition !== 'unchanged' && (
                    <select className="input" style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} value={decisions[g.gameId] ?? 'skip'} onChange={(e) => setDecisions({ ...decisions, [g.gameId]: e.target.value as GameDecision })}>
                      <option value="apply">{g.disposition === 'conflict' ? 'Replace mine with archive' : 'Apply'}</option>
                      <option value="skip">Skip</option>
                      {g.disposition === 'conflict' && <option value="overwrite">Overwrite (force)</option>}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Teams: {plan.teams.filter((t) => t.disposition === 'new').length} new · Players: {plan.players.filter((t) => t.disposition === 'new').length} new · Snapshots: {plan.snapshots.filter((s) => s.disposition === 'new').length} new
          </p>
        </Sheet>
      )}
      {rollback && (
        <Confirm
          title="Remove this snapshot?"
          text="The imported season totals are removed. Players created by the import stay on the roster. Games you scored are not affected."
          danger
          yesLabel="Remove"
          onNo={() => setRollback(null)}
          onYes={async () => {
            await rollbackSnapshot(db, rollback);
            setRollback(null);
            toast.show('Snapshot removed');
          }}
        />
      )}
      {toast.el}
    </div>
  );
}

function useTransfers() {
  return useLiveQuery(() => db.transfers.orderBy('at').reverse().toArray(), [], []) ?? [];
}

export function DropZone({ onFile, onClick, label, accept }: { onFile: (f: File) => void; onClick: () => void; label: string; accept?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      role="button"
    >
      {label}
      {accept && <div className="small muted" style={{ marginTop: 4 }}>{accept}</div>}
    </div>
  );
}
