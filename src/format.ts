import type { Row } from './align';
import { rangesFor, textMap, type Span, type TextMap } from './text';
import type { RenderedDoc } from './render';

/**
 * Formatting-only changes: same text, different look (bold added, style changed,
 * a column resized). Compared per non-whitespace character rather than per run,
 * because Word splits runs arbitrarily: identical formatting can arrive in
 * different run boundaries.
 */

interface Chars {
  /** TextMap offset of each non-whitespace character. */
  offsets: number[];
  /** Its formatting: the (tag, classes, inline style) chain from the block root down. */
  formats: string[];
}

/**
 * Character spans whose formatting differs, for each side. Null when the texts
 * don't correspond character for character (they aren't a same-text pair).
 * `prefixA`/`prefixB` are the docx-preview class prefixes of each document.
 */
export function formatDiff(a: TextMap, prefixA: string, b: TextMap, prefixB: string): { a: Span[]; b: Span[] } | null {
  const ca = chars(a, prefixA);
  const cb = chars(b, prefixB);
  if (ca.offsets.length !== cb.offsets.length) return null;
  const differing = ca.formats.flatMap((f, i) => (f === cb.formats[i] ? [] : [i]));
  return { a: toSpans(differing, ca.offsets), b: toSpans(differing, cb.offsets) };
}

function chars(map: TextMap, prefix: string): Chars {
  const offsets: number[] = [];
  const formats: string[] = [];
  for (const { node, start } of map.nodes) {
    const format = chainOf(node.parentElement!, map.root, prefix);
    for (let i = 0; i < node.data.length; i++) {
      if (/\S/.test(node.data[i])) {
        offsets.push(start + i);
        formats.push(format);
      }
    }
  }
  return { offsets, formats };
}

function chainOf(el: HTMLElement, root: Node, prefix: string): string {
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
    const diff = formatDiff(textMap(left.units[r.a!].el), left.className, textMap(right.units[r.b!].el), right.className);
    return diff && diff.a.length + diff.b.length > 0 ? { ...r, kind: 'format' } : r;
  });
}

/** Ranges of the characters whose formatting changed, on both sides of each pair. */
export function formatRanges(pairs: [HTMLElement, HTMLElement][], prefixA: string, prefixB: string): Range[] {
  return pairs.flatMap(([a, b]) => {
    const [ta, tb] = [textMap(a), textMap(b)];
    const diff = formatDiff(ta, prefixA, tb, prefixB);
    return diff ? [...rangesFor(ta, diff.a), ...rangesFor(tb, diff.b)] : [];
  });
}
