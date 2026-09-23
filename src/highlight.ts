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
  for (const [a, b] of pairs) {
    const spans = wordDiff(a.textContent ?? '', b.textContent ?? '');
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
