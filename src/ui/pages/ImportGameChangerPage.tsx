import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTeams, usePlayers, useSettings, todayIso } from '../hooks';
import { db, playerName } from '../../db/db';
import { parseGameChangerCsv, suggestPlayerMatches, importGameChangerSnapshot, DuplicateImportError, GameChangerFormatError, type ParsedGameChanger } from '../../io/gamechanger';
import { outsToInnings } from '../../engine/types';
import { DropZone } from './TransferPage';
import { useToast } from '../components/Sheet';

/**
 * GameChanger season-export wizard: read, detect sections, match players, preview, commit.
 * The original file text is stored with the snapshot so it can always be re-parsed or rolled back.
 */
export function ImportGameChangerPage() {
  const teams = useTeams();
  const settings = useSettings();
  const nav = useNavigate();
  const toast = useToast();
  const myTeam = teams.find((t) => t.id === settings.myTeamId) ?? teams.find((t) => t.isMine);
  const [teamId, setTeamId] = useState(myTeam?.id ?? '');
  const roster = usePlayers(teamId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedGameChanger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [asOf, setAsOf] = useState(todayIso());
  const [coverageStart, setCoverageStart] = useState('');
  const [coverageEnd, setCoverageEnd] = useState('');
  const [matches, setMatches] = useState<Record<number, string | null>>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!teamId && myTeam) setTeamId(myTeam.id);
  }, [myTeam, teamId]);
  const suggestions = useMemo(() => (parsed ? suggestPlayerMatches(parsed.rows, roster) : []), [parsed, roster]);
  React.useEffect(() => {
    if (!parsed) return;
    const m: Record<number, string | null> = {};
    for (const s of suggestions) m[s.rowIndex] = s.playerId;
    setMatches(m);
  }, [parsed, suggestions]);

  const onFile = async (f: File) => {
    setError(null);
    try {
      const t = await f.text();
      const p = parseGameChangerCsv(t);
      setText(t);
      setFileName(f.name);
      setParsed(p);
      if (!label) setLabel(`GameChanger export ${f.name.replace(/\.csv$/i, '')}`);
    } catch (e: any) {
      setParsed(null);
      setError(e instanceof GameChangerFormatError ? e.message : `Could not read file: ${e?.message ?? e}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commit = async () => {
    if (!parsed || !text || !teamId) return;
    setBusy(true);
    try {
      const { snapshot, createdPlayers } = await importGameChangerSnapshot(db, {
        text,
        fileName,
        teamId,
        label: label || fileName,
        asOfDate: asOf,
        coverageStart: coverageStart || undefined,
        coverageEnd: coverageEnd || undefined,
        playerIdByRow: matches,
        createMissingPlayers: createMissing
      });
      toast.show(`Imported ${snapshot.rows.length} players${createdPlayers.length ? `, created ${createdPlayers.length}` : ''}`);
      setTimeout(() => nav('/stats'), 900);
    } catch (e: any) {
      setError(e instanceof DuplicateImportError ? 'This exact file was already imported. Remove the earlier snapshot first if you want to re-import it.' : `Import failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const unmatched = parsed ? parsed.rows.filter((_, i) => !matches[i]).length : 0;

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}><Link to="/transfer" className="btn ghost sm">‹ Transfer</Link></div>
      <h1>Import GameChanger season stats</h1>
      <p className="muted small">Season totals are stored as a dated snapshot, separate from games you score here, so nothing is double counted. The file is kept verbatim for rollback.</p>

      <div className="card">
        <div className="field">
          <label>Team these stats belong to</label>
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Choose…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <DropZone onFile={onFile} onClick={() => fileRef.current?.click()} label={parsed ? `${fileName} (${parsed.rows.length} players, ${parsed.headers.length} columns)` : 'Drop the GameChanger CSV here, or tap to choose'} />
        {error && <div className="banner danger" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {parsed && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Detected layout</h3>
            <div className="row wrap">
              {parsed.columnSections.map((s) => <span key={s.section} className="pill ok">{s.section}: columns {s.start + 1}-{s.end + 1} ({s.end - s.start + 1})</span>)}
            </div>
            {parsed.warnings.length > 0 && <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            <p className="small muted" style={{ marginTop: 8 }}>Repeated column names (BB, SO, H, SB…) are read by section, so batting walks and pitching walks stay separate. Innings columns are read as outs (1.2 is one inning and two outs).</p>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>About this export</h3>
            <div className="field"><label>Label</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            <div className="field"><label>Stats are current as of</label><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
            <div className="inline-fields">
              <div className="field"><label>First game covered (optional)</label><input className="input" type="date" value={coverageStart} onChange={(e) => setCoverageStart(e.target.value)} /></div>
              <div className="field"><label>Last game covered (optional)</label><input className="input" type="date" value={coverageEnd} onChange={(e) => setCoverageEnd(e.target.value)} /></div>
            </div>
            <p className="small muted">"Last game covered" is what lets Dugout Dad combine these totals with games you score afterward. Leave it blank and the two stay side by side.</p>
          </div>

          <div className="card">
            <div className="row between"><h3>Match players</h3><span className="muted small">{unmatched} unmatched</span></div>
            <div className="list" style={{ marginTop: 8 }}>
              {parsed.rows.map((r, i) => {
                const s = suggestions.find((x) => x.rowIndex === i);
                return (
                  <div key={i} className="item" style={{ minHeight: 48, padding: '8px 12px' }}>
                    <div className="grow">
                      <div className="title">{r.number ? `#${r.number} ` : ''}{r.first} {r.last}</div>
                      <div className="sub">{r.batting['PA']?.raw ?? '-'} PA · {r.fielding['Total']?.outs != null ? outsToInnings(r.fielding['Total'].outs!) : '-'} INN{s && s.confidence !== 'none' ? ` · suggested: ${s.confidence}` : ''}</div>
                    </div>
                    <select className="input" style={{ width: 170, minHeight: 36, padding: '4px 8px' }} value={matches[i] ?? ''} onChange={(e) => setMatches({ ...matches, [i]: e.target.value || null })}>
                      <option value="">{createMissing ? 'Create new player' : 'Skip (unmatched)'}</option>
                      {roster.map((p) => <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{playerName(p)}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <label className="switch" style={{ marginTop: 8 }}>
              <span>Create roster entries for unmatched players</span>
              <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} style={{ width: 24, height: 24 }} />
            </label>
            {parsed.totals && <p className="small muted">The Totals row ({parsed.totals.batting['PA']?.raw} PA) is kept as the export's own team total, not as a player.</p>}
          </div>

          <button className="btn primary lg block" disabled={!teamId || busy} onClick={commit}>{busy ? 'Importing…' : 'Import snapshot'}</button>
        </>
      )}
      {toast.el}
    </div>
  );
}
