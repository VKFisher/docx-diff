import type { Row } from './align';
import { rangesFor, type Span } from './highlight';
import type { RenderedDoc } from './render';

/**
 * Formatting-only changes: same text, different look (bold added, style changed,
 * a column resized). Compared per non-whitespace character rather than per run,
 * because Word splits runs arbitrarily: identical formatting can arrive in
 * different run boundaries.
 */

interface Chars {
  /** textContent offset of each non-whitespace character. */
  offsets: number[];
  /** Its formatting: the (tag, classes, inline style) chain from the block root down. */
  formats: string[];
}

/**
 * Character spans whose formatting differs, for each side. Null when the texts
 * don't correspond character for character (they aren't a same-text pair).
 * `prefixA`/`prefixB` are the docx-preview class prefixes of each document.
 */
export function formatDiff(a: HTMLElement, prefixA: string, b: HTMLElement, prefixB: string): { a: Span[]; b: Span[] } | null {
  const ca = chars(a, prefixA);
  const cb = chars(b, prefixB);
  if (ca.offsets.length !== cb.offsets.length) return null;
  const differing = ca.formats.flatMap((f, i) => (f === cb.formats[i] ? [] : [i]));
  return { a: toSpans(differing, ca.offsets), b: toSpans(differing, cb.offsets) };
}

function chars(root: HTMLElement, prefix: string): Chars {
  const offsets: number[] = [];
  const formats: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const format = chainOf(n.parentElement!, root, prefix);
    for (let i = 0; i < n.data.length; i++) {
      if (/\S/.test(n.data[i])) {
        offsets.push(pos + i);
        formats.push(format);
      }
    }
    pos += n.data.length;
  }
  return { offsets, formats };
}

function chainOf(el: HTMLElement, root: HTMLElement, prefix: string): string {
  const parts: string[] = [];
  for (let e: HTMLElement | null = el; e; e = e === root ? null : e.parentElement) {
    parts.push(`${e.tagName}.${classesOf(e, prefix)}{${e.getAttribute('style') ?? ''}}`);
  }
  return parts.reverse().join('>');
}

/**
 * Class names without the per-document prefix. List numbering ids are dropped
 * too (`-num-3-0` -> `-num-0`): edits renumber lists without changing their look.
 */
function classesOf(el: HTMLElement, prefix: string): string {
  return [...el.classList]
    .map((c) => (c.startsWith(prefix) ? c.slice(prefix.length) : c).replace(/-num-\d+-/, '-num-'))
    .sort()
    .join('.');
}

/** Groups sorted character indices into spans over consecutive characters. */
function toSpans(indices: number[], offsets: number[]): Span[] {
  const spans: Span[] = [];
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const last = spans[spans.length - 1];
    if (last && k > 0 && indices[k - 1] === i - 1) last[1] = offsets[i] + 1;
    else spans.push([offsets[i], offsets[i] + 1]);
  }
  return spans;
}

/** Same-text rows whose formatting differs become `format` rows. */
export function markFormatChanges(rows: Row[], left: RenderedDoc, right: RenderedDoc): Row[] {
  return rows.map((r) => {
    if (r.kind !== 'same') return r;
    const diff = formatDiff(left.units[r.a!].el, left.className, right.units[r.b!].el, right.className);
    return diff && diff.a.length + diff.b.length > 0 ? { ...r, kind: 'format' } : r;
  });
}

/** Ranges of the characters whose formatting changed, on both sides of each pair. */
export function formatRanges(pairs: [HTMLElement, HTMLElement][], prefixA: string, prefixB: string): Range[] {
  return pairs.flatMap(([a, b]) => {
    const diff = formatDiff(a, prefixA, b, prefixB);
    return diff ? [...rangesFor(a, diff.a), ...rangesFor(b, diff.b)] : [];
  });
}
