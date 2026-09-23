import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Row } from './align';
import { highlightPairs } from './highlight';
import type { RenderedDoc, Unit } from './render';

interface Props {
  left: RenderedDoc;
  right: RenderedDoc;
  rows: Row[];
}

/**
 * One scroll container, one grid row per aligned pair. Alignment is structural:
 * both sides of a change always share a row, so there is no scroll sync to lose.
 * Pages are drawn at their docx width and zoomed to fit the column, so line
 * breaks match the original layout.
 */
export function DiffView({ left, right, rows }: Props) {
  const grid = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = grid.current!;
    const pageWidth = Math.max(left.pageWidth, right.pageWidth);
    const fit = () => {
      const cell = el.querySelector<HTMLElement>('.cell');
      const colWidth = cell?.clientWidth ?? el.clientWidth / 2;
      el.style.setProperty('--page-zoom', String(pageWidth ? colWidth / pageWidth : 1));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [left, right]);

  useLayoutEffect(() => {
    const pairs = rows.flatMap((r): [HTMLElement, HTMLElement][] =>
      r.kind === 'modified' ? [[left.units[r.a!].el, right.units[r.b!].el]] : [],
    );
    return highlightPairs(pairs);
  }, [left, right, rows]);

  return (
    <div class="grid" ref={grid} style={{ counterReset: `${left.counterReset} ${right.counterReset}`.trim() || undefined }}>
      {rows.map((row, i) => [
        <Cell key={`${i}a`} doc={left} unit={row.a === undefined ? undefined : left.units[row.a]} kind={row.kind} />,
        <Cell key={`${i}b`} doc={right} unit={row.b === undefined ? undefined : right.units[row.b]} kind={row.kind} />,
      ])}
    </div>
  );
}

function Cell({ doc, unit, kind }: { doc: RenderedDoc; unit?: Unit; kind: Row['kind'] }) {
  const article = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (unit) article.current!.replaceChildren(unit.el);
  }, [unit]);

  if (!unit) return <div class={`cell gap ${kind}`} />;
  const { width, padLeft, padRight } = unit.frame;
  return (
    <div class={`cell ${kind}`}>
      {/* section/article mirror docx-preview's own structure so its selectors still match */}
      <section class={`page ${doc.className}`} style={{ width, paddingLeft: padLeft, paddingRight: padRight }}>
        <article ref={article} />
      </section>
    </div>
  );
}
