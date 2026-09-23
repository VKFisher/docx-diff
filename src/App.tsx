import { useEffect, useRef, useState } from 'preact/hooks';
import { align, type Row } from './align';
import { DiffView } from './DiffView';
import { markFormatChanges } from './format';
import { renderDocx, type RenderedDoc } from './render';

interface Result {
  /** Distinguishes comparisons, so the view resets its state for new files. */
  id: number;
  left: RenderedDoc;
  right: RenderedDoc;
  rows: Row[];
}

type Status = { state: 'idle' } | { state: 'working' } | { state: 'error'; message: string } | { state: 'done'; result: Result };

type Side = 'old' | 'new';

export function App() {
  const [files, setFiles] = useState<{ old?: File; new?: File }>({});
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const renders = useRenderCache();

  useEffect(() => {
    renders.keepOnly([files.old, files.new]);
    const { old: oldFile, new: newFile } = files;
    if (!oldFile || !newFile) return;
    let cancelled = false;
    setStatus({ state: 'working' });
    Promise.all([renders.get(oldFile), renders.get(newFile)]).then(
      ([left, right]) => {
        if (cancelled) return;
        const keys = (d: RenderedDoc) => d.units.map((u) => u.key);
        const rows = markFormatChanges(align(keys(left), keys(right)), left, right);
        setStatus({ state: 'done', result: { id: Date.now(), left, right, rows } });
      },
      (e) => {
        if (!cancelled) setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [files]);

  /**
   * Two or more files fill both sides, older (by modification time) as Old.
   * One file goes to `side`, or to the first empty side when dropped elsewhere.
   */
  const accept = (list: FileList | null | undefined, side?: Side) => {
    const docs = [...(list ?? [])].filter((f) => f.name.toLowerCase().endsWith('.docx'));
    if (docs.length >= 2) {
      const [a, b] = docs.sort((x, y) => x.lastModified - y.lastModified);
      setFiles({ old: a, new: b });
    } else if (docs.length === 1) {
      const target = side ?? (!files.old ? 'old' : !files.new ? 'new' : undefined);
      if (target) setFiles({ ...files, [target]: docs[0] });
    }
  };

  const done = status.state === 'done';
  const pick = (side: Side, big: boolean) => (
    <FilePick side={side} big={big} file={files[side]} onFiles={(list) => accept(list, side)} />
  );

  return (
    <div
      class="app"
      // Files dropped outside a drop zone: accept instead of letting the browser open them.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        accept(e.dataTransfer?.files);
      }}
    >
      <header>
        {done ? (
          <>
            {pick('old', false)}
            <button class="swap" title="Swap old and new" onClick={() => setFiles({ old: files.new, new: files.old })}>
              ⇄
            </button>
            {pick('new', false)}
          </>
        ) : (
          <span class="title">docx diff</span>
        )}
        <StatusLine status={status} />
      </header>
      {done ? (
        <DiffView key={status.result.id} {...status.result} />
      ) : (
        <main class="dropzones">
          {pick('old', true)}
          {pick('new', true)}
          <p class="hint">Drop both files at once to fill both sides. Nothing leaves your browser.</p>
        </main>
      )}
    </div>
  );
}

/**
 * Rendered documents keyed by File, so swapping sides or replacing one file
 * doesn't re-render the other. Each render gets its own class prefix, so any
 * two can be shown together.
 */
function useRenderCache() {
  const cache = useRef(new Map<File, Promise<RenderedDoc>>()).current;
  const seq = useRef(0);
  return {
    get(file: File): Promise<RenderedDoc> {
      let doc = cache.get(file);
      if (!doc) {
        doc = renderDocx(file, `docx-${++seq.current}`);
        cache.set(file, doc);
        const failed = doc;
        failed.catch(() => cache.get(file) === failed && cache.delete(file));
      }
      return doc;
    },
    /** Disposes renders of files no longer picked. */
    keepOnly(keep: (File | undefined)[]) {
      for (const [file, doc] of cache) {
        if (keep.includes(file)) continue;
        cache.delete(file);
        doc.then((d) => d.dispose(), () => {});
      }
    },
  };
}

function FilePick({ side, big, file, onFiles }: { side: Side; big: boolean; file?: File; onFiles: (files: FileList | null | undefined) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      class={`pick ${big ? 'big' : ''} ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onFiles(e.dataTransfer?.files);
      }}
    >
      <span class="pick-label">{side === 'old' ? 'Old' : 'New'}</span>
      <span class="pick-name">{file?.name ?? (big ? 'Drop a .docx here, or click to choose' : 'choose or drop a .docx')}</span>
      <input
        type="file"
        accept=".docx"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.state === 'working') return <span class="status">Rendering…</span>;
  if (status.state === 'error') return <span class="status error">{status.message}</span>;
  if (status.state !== 'done') return null;
  const counts = { modified: 0, format: 0, deleted: 0, added: 0 };
  for (const r of status.result.rows) if (r.kind !== 'same') counts[r.kind]++;
  return (
    <span class="status">
      <b class="modified">{counts.modified}</b> modified · <b class="format">{counts.format}</b> formatting ·{' '}
      <b class="deleted">{counts.deleted}</b> deleted · <b class="added">{counts.added}</b> added
    </span>
  );
}
