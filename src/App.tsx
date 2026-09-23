import { useEffect, useState } from 'preact/hooks';
import { align, type Row } from './align';
import { DiffView } from './DiffView';
import { renderDocx, type RenderedDoc } from './render';

interface Result {
  left: RenderedDoc;
  right: RenderedDoc;
  rows: Row[];
}

type Status = { state: 'idle' } | { state: 'working' } | { state: 'error'; message: string } | { state: 'done'; result: Result };

export function App() {
  const [oldFile, setOldFile] = useState<File>();
  const [newFile, setNewFile] = useState<File>();
  const [status, setStatus] = useState<Status>({ state: 'idle' });

  useEffect(() => {
    if (!oldFile || !newFile) return;
    let cancelled = false;
    let docs: RenderedDoc[] = [];
    setStatus({ state: 'working' });
    (async () => {
      try {
        const settled = await Promise.allSettled([renderDocx(oldFile, 'docx-old'), renderDocx(newFile, 'docx-new')]);
        const rendered = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
        const failure = settled.find((s) => s.status === 'rejected');
        if (cancelled || failure) {
          rendered.forEach((d) => d.dispose());
          if (failure) throw failure.reason;
          return;
        }
        docs = rendered;
        const [left, right] = docs;
        const rows = align(
          left.units.map((u) => u.key),
          right.units.map((u) => u.key),
        );
        setStatus({ state: 'done', result: { left, right, rows } });
      } catch (e) {
        if (!cancelled) setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
      docs.forEach((d) => d.dispose());
    };
  }, [oldFile, newFile]);

  return (
    <div class="app">
      <header>
        <FilePick label="Old" file={oldFile} onPick={setOldFile} />
        <FilePick label="New" file={newFile} onPick={setNewFile} />
        <StatusLine status={status} />
      </header>
      {status.state === 'done' ? (
        <DiffView {...status.result} />
      ) : (
        <main class="empty">Pick two .docx files to compare. Nothing leaves your browser.</main>
      )}
    </div>
  );
}

function FilePick({ label, file, onPick }: { label: string; file?: File; onPick: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      class={`pick ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer?.files[0];
        if (f) onPick(f);
      }}
    >
      <span class="pick-label">{label}</span>
      <span class="pick-name">{file?.name ?? 'choose or drop a .docx'}</span>
      <input
        type="file"
        accept=".docx"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.state === 'working') return <span class="status">Rendering…</span>;
  if (status.state === 'error') return <span class="status error">{status.message}</span>;
  if (status.state !== 'done') return null;
  const counts = { modified: 0, deleted: 0, added: 0 };
  for (const r of status.result.rows) if (r.kind !== 'same') counts[r.kind]++;
  return (
    <span class="status">
      <b class="modified">{counts.modified}</b> modified · <b class="deleted">{counts.deleted}</b> deleted ·{' '}
      <b class="added">{counts.added}</b> added
    </span>
  );
}
