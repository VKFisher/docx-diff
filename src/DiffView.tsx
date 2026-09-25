import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Row, RowKind } from './align';
import { formatRanges } from './format';
import { paint, wordRanges } from './highlight';
import { folds, hunks, type RowRange } from './layout';
import type { RenderedDoc, Unit } from './render';

interface Props {
  left: RenderedDoc;
  right: RenderedDoc;
  rows: Row[];
}

/** Unchanged rows kept around each change in changes-only mode. */
const CONTEXT = 2;
/** Where a change lands when jumped to, as a fraction of the viewport height. */
const ANCHOR = 0.25;

interface Marker {
  top: number;
  height: number;
  kind: RowKind;
}

/**
 * One scroll container, one grid row per aligned pair. Alignment is structural:
 * both sides of a change always share a row, so there is no scroll sync to lose.
 * Pages are drawn at their docx width and zoomed to fit the column, so line
 * breaks match the original layout.
 *
 * Folded rows stay rendered at zero height rather than being removed: list
 * numbering is done with CSS counters, which only count rendered elements.
 */
export function DiffView({ left, right, rows }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [current, setCurrent] = useState(-1);

  const changes = useMemo(() => hunks(rows), [rows]);
  const activeFolds = useMemo(
    () => (changesOnly ? folds(rows, CONTEXT).filter((f) => !expanded.has(f.start)) : []),
    [rows, changesOnly, expanded],
  );
  const foldAt = new Map(activeFolds.map((f) => [f.start, f]));
  const folded = new Uint8Array(rows.length);
  for (const f of activeFolds) folded.fill(1, f.start, f.end);

  // Change to bring back into view after the layout changes under it (fold toggle).
  const keepInView = useRef<number | null>(null);

  // Top offset of each change, in grid scroll coordinates. Refreshed by `measure` whenever layout moves.
  const tops = useRef<number[]>([]);

  const cellOf = (row: number) => grid.current!.querySelector<HTMLElement>(`[data-row="${row}"]`)!;

  const syncCurrent = () => {
    const g = grid.current!;
    const y = g.scrollTop + g.clientHeight * ANCHOR + 1;
    setCurrent(tops.current.findLastIndex((t) => t <= y));
  };

  const measure = () => {
    const g = grid.current!;
    const total = g.scrollHeight;
    const next: Marker[] = changes.map((h) => {
      const top = cellOf(h.start).offsetTop;
      const last = cellOf(h.end - 1);
      return { top, height: last.offsetTop + last.offsetHeight - top, kind: hunkKind(rows, h) };
    });
    tops.current = next.map((m) => m.top);
    setMarkers(next.map((m) => ({ ...m, top: m.top / total, height: m.height / total })));
    syncCurrent();
  };

  const jumpTo = (index: number) => {
    const g = grid.current!;
    g.scrollTop = tops.current[index] - g.clientHeight * ANCHOR;
  };

  const step = (dir: 1 | -1) => {
    const g = grid.current!;
    const y = g.scrollTop + g.clientHeight * ANCHOR;
    const index = dir > 0 ? tops.current.findIndex((t) => t > y + 1) : tops.current.findLastIndex((t) => t < y - 1);
    if (index >= 0) jumpTo(index);
  };

  // Fit pages to the column width; re-measure markers whenever layout may have moved.
  useLayoutEffect(() => {
    const el = grid.current!;
    const pageWidth = Math.max(left.pageWidth, right.pageWidth);
    const fit = () => {
      const cell = el.querySelector<HTMLElement>('.cell');
      const colWidth = cell?.clientWidth ?? el.clientWidth / 2;
      el.style.setProperty('--page-zoom', String(pageWidth ? colWidth / pageWidth : 1));
      measure();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    if (keepInView.current !== null && keepInView.current >= 0) jumpTo(keepInView.current);
    keepInView.current = null;
    // Embedded fonts can finish loading after first layout and change line heights.
    document.fonts.ready.then(() => el.isConnected && measure());
    return () => ro.disconnect();
  }, [left, right, activeFolds]);

  useLayoutEffect(() => {
    const pairsOf = (kind: RowKind) =>
      rows.flatMap((r): [HTMLElement, HTMLElement][] => (r.kind === kind ? [[left.units[r.a!].el, right.units[r.b!].el]] : []));
    // Whole deleted/added blocks get the same color as deleted/added words, so full color always means removed or added
    // text. Deleted blocks skip the strikethrough: a struck paragraph is hard to read, and the gap opposite says enough.
    const whole = (kind: RowKind) =>
      rows.flatMap((r) => {
        if (r.kind !== kind) return [];
        const range = document.createRange();
        range.selectNodeContents((kind === 'deleted' ? left.units[r.a!] : right.units[r.b!]).el);
        return [range];
      });
    const words = wordRanges(pairsOf('modified'));
    // Later entries paint on top: character marks over their token's soft tint.
    return paint({
      'diff-removed-soft': words.removedSoft,
      'diff-added-soft': words.addedSoft,
      'diff-removed': words.removed,
      'diff-removed-block': whole('deleted'),
      'diff-added': [...words.added, ...whole('added')],
      'diff-format': [...formatRanges(pairsOf('format'), left.className, right.className), ...words.cased],
    });
  }, [left, right, rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (e.key === 'n') step(1);
      else if (e.key === 'p') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div class="viewer">
      <div class="toolbar">
        <button onClick={() => step(-1)} title="Previous change (p)" disabled={!changes.length}>
          ↑ prev
        </button>
        <span class="position">
          {current >= 0 ? current + 1 : '–'} / {changes.length}
        </span>
        <button onClick={() => step(1)} title="Next change (n)" disabled={!changes.length}>
          next ↓
        </button>
        <label class="toggle">
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={(e) => {
              keepInView.current = current;
              setChangesOnly(e.currentTarget.checked);
              setExpanded(new Set());
            }}
          />
          changes only
        </label>
      </div>
      <div class="scroller">
        <div
          class="grid"
          ref={grid}
          onScroll={syncCurrent}
          style={{ counterReset: `${left.counterReset} ${right.counterReset}`.trim() || undefined }}
        >
          {rows.map((row, i) => {
            const fold = foldAt.get(i);
            const hidden = folded[i] === 1;
            return [
              fold && (
                <button key={`f${i}`} class="fold" onClick={() => setExpanded((s) => new Set(s).add(fold.start))}>
                  ⋯ {fold.end - fold.start} unchanged blocks
                </button>
              ),
              <Cell key={`${i}a`} row={i} doc={left} unit={unitOf(left, row.a)} kind={row.kind} hidden={hidden} />,
              <Cell key={`${i}b`} row={i} doc={right} unit={unitOf(right, row.b)} kind={row.kind} hidden={hidden} />,
            ];
          })}
        </div>
        <div class="minimap">
          {markers.map((m, i) => (
            <button
              key={i}
              class={`marker ${m.kind} ${i === current ? 'current' : ''}`}
              style={{ top: `${m.top * 100}%`, height: `max(3px, ${m.height * 100}%)` }}
              onClick={() => jumpTo(i)}
              aria-label={`Change ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({ row, doc, unit, kind, hidden }: { row: number; doc: RenderedDoc; unit?: Unit; kind: RowKind; hidden: boolean }) {
  const article = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (unit) article.current!.replaceChildren(unit.el);
  }, [unit]);

  const cls = `cell ${unit ? '' : 'gap'} ${isTableRow(unit) ? 'table-row' : ''} ${kind} ${hidden ? 'folded' : ''}`;
  if (!unit) return <div class={cls} data-row={row} />;
  const { width, padLeft, padRight } = unit.frame;
  return (
    <div class={cls} data-row={row}>
      {/* section/article mirror docx-preview's own structure so its selectors still match */}
      <section class={`page ${doc.className}`} style={{ width, paddingLeft: padLeft, paddingRight: padRight }}>
        <article ref={article} />
      </section>
    </div>
  );
}

/** A table cut down to one row (see render.ts). Stretched to the grid row's height, so a row that wraps shorter than its counterpart still reads as a continuous table. */
function isTableRow(unit?: Unit): boolean {
  return unit?.el instanceof HTMLTableElement && unit.el.rows.length === 1;
}

function unitOf(doc: RenderedDoc, index?: number): Unit | undefined {
  return index === undefined ? undefined : doc.units[index];
}

/** A change that only deletes (or only adds) is colored as such; anything mixed counts as modified. */
function hunkKind(rows: Row[], h: RowRange): RowKind {
  const kinds = new Set(rows.slice(h.start, h.end).map((r) => r.kind));
  return kinds.size === 1 ? [...kinds][0] : 'modified';
}
