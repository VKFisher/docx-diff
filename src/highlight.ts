import { diffWordsWithSpace } from 'diff';

/** Half-open character range [start, end) into an element's textContent. */
export type Span = [number, number];

/**
 * Word-level differences between two texts. `removed` spans index into `a`,
 * `added` spans into `b`.
 */
export function wordDiff(a: string, b: string): { removed: Span[]; added: Span[] } {
  const removed: Span[] = [];
  const added: Span[] = [];
  let i = 0;
  let j = 0;
  for (const change of diffWordsWithSpace(a, b)) {
    const n = change.value.length;
    if (change.removed) {
      removed.push([i, (i += n)]);
    } else if (change.added) {
      added.push([j, (j += n)]);
    } else {
      i += n;
      j += n;
    }
  }
  return { removed, added };
}

/** A paragraph counts as rewritten, and gets no word marks, when at least this many fragments… */
const REWRITE_FRAGMENTS = 4;
/** …cover more than this share of the combined text. */
const REWRITE_SHARE = 0.5;

/**
 * The spans worth marking. Fragments separated only by spaces, punctuation or
 * one short word ("a", "the", "of") merge into one block; whitespace-only spans
 * are dropped. Returns null for a rewrite, where marks would be confetti and
 * the row tint says enough.
 */
export function changedSpans(a: string, b: string): { removed: Span[]; added: Span[] } | null {
  const raw = wordDiff(a, b);
  const removed = tidy(a, raw.removed);
  const added = tidy(b, raw.added);
  const changed = [...removed, ...added].reduce((n, [s, e]) => n + e - s, 0);
  // Counted before tidying: tidying hides confetti by merging it into large blocks.
  const fragments = Math.max(raw.removed.length, raw.added.length);
  if (fragments >= REWRITE_FRAGMENTS && changed > REWRITE_SHARE * (a.length + b.length)) return null;
  return { removed, added };
}

function tidy(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s, e] of spans) {
    const last = out[out.length - 1];
    if (last && BRIDGE.test(text.slice(last[1], s))) last[1] = e;
    else out.push([s, e]);
  }
  return out.filter(([s, e]) => text.slice(s, e).trim() !== '');
}

/** Gap text too small to leave unmarked between two changes. */
const BRIDGE = /^[\s\p{P}]*(\p{L}{1,3}[\s\p{P}]*)?$/u;

/**
 * Maps text spans of `root.textContent` to DOM Ranges over its text nodes.
 * Ranges can cross element boundaries (runs, table cells), which is what lets
 * us mark words without changing the rendered DOM.
 */
export function rangesFor(root: Node, spans: Span[]): Range[] {
  const texts: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    texts.push({ node: n, start: pos, end: (pos += n.data.length) });
  }

  return spans.flatMap(([start, end]) => {
    const from = texts.find((t) => t.start <= start && start < t.end);
    const to = texts.find((t) => t.start < end && end <= t.end);
    if (!from || !to) return [];
    const range = document.createRange();
    range.setStart(from.node, start - from.start);
    range.setEnd(to.node, end - to.start);
    return [range];
  });
}

/**
 * Marks changed words in every modified pair using the CSS Custom Highlight API
 * (`::highlight(diff-removed)` / `::highlight(diff-added)`). Returns a cleanup.
 */
export function highlightPairs(pairs: [HTMLElement, HTMLElement][]): () => void {
  if (!('highlights' in CSS)) return () => {};
  const removed: Range[] = [];
  const added: Range[] = [];
  for (const [a, b] of segmentPairs(pairs)) {
    const spans = changedSpans(a.textContent ?? '', b.textContent ?? '');
    if (!spans) continue;
    removed.push(...rangesFor(a, spans.removed));
    added.push(...rangesFor(b, spans.added));
  }
  CSS.highlights.set('diff-removed', new Highlight(...removed));
  CSS.highlights.set('diff-added', new Highlight(...added));
  return () => {
    CSS.highlights.delete('diff-removed');
    CSS.highlights.delete('diff-added');
  };
}

/**
 * Table rows with matching cell counts are diffed cell by cell: textContent
 * joins cells with no separator, so whole-row diffs glue words across cells.
 */
export function segmentPairs(pairs: [HTMLElement, HTMLElement][]): [HTMLElement, HTMLElement][] {
  return pairs.flatMap(([a, b]): [HTMLElement, HTMLElement][] => {
    const ca = cellsOf(a);
    const cb = cellsOf(b);
    return ca && cb && ca.length === cb.length ? ca.map((c, i) => [c, cb[i]]) : [[a, b]];
  });
}

function cellsOf(el: HTMLElement): HTMLElement[] | undefined {
  return el instanceof HTMLTableElement && el.rows.length === 1 ? [...el.rows[0].cells] : undefined;
}
