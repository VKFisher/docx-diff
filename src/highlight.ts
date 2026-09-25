import { diffArrays } from 'diff';
import { align } from './align';
import { rangesFor, textMap, type Span } from './text';

/**
 * How one side of a pair is marked:
 * - `strong`: removed/added text (whole tokens, or the changed characters of a token);
 * - `soft`: a token with only some characters changed, tinted so a one-letter edit stays visible;
 * - `cased`: a token that only changed case, shown as a cosmetic change.
 */
export interface Marks {
  strong: Span[];
  soft: Span[];
  cased: Span[];
}

interface Token {
  start: number;
  end: number;
  text: string;
}

/** A paragraph counts as rewritten, and gets no word marks, when at least this many changes… */
const REWRITE_FRAGMENTS = 4;
/** …cover more than this share of the combined text. */
const REWRITE_SHARE = 0.5;
/** Tokens pair up for character marks only when common prefix + suffix cover more than this share. */
const MIN_TOKEN_SHARE = 0.5;

/**
 * Two-level diff. First whole whitespace-separated tokens (`U-,` is one token),
 * so only real content can anchor the alignment; with punctuation and spaces as
 * tokens, the cheapest diff reuses separators and pairs unrelated words. Then,
 * within each changed stretch, similar tokens are paired (as `align` pairs
 * paragraphs) and marked by character.
 *
 * Strong marks separated only by spaces, punctuation or one short word merge into
 * one block. Returns null for a rewrite, where marks would be confetti and the
 * row tint says enough.
 */
export function changedSpans(a: string, b: string): { a: Marks; b: Marks } | null {
  const ta = tokens(a);
  const tb = tokens(b);
  const ma: Marks = { strong: [], soft: [], cased: [] };
  const mb: Marks = { strong: [], soft: [], cased: [] };
  let fragments = 0;
  let changed = 0;

  let i = 0;
  let j = 0;
  let dels: Token[] = [];
  let adds: Token[] = [];
  const flush = () => {
    if (!dels.length && !adds.length) return;
    fragments++;
    changed += [...dels, ...adds].reduce((n, t) => n + t.end - t.start, 0);
    for (const r of align(dels.map((t) => t.text), adds.map((t) => t.text), tokenSimilarity)) {
      if (r.kind === 'modified') markPair(dels[r.a!], adds[r.b!], ma, mb);
      else if (r.kind === 'deleted') ma.strong.push(spanOf(dels[r.a!]));
      else if (r.kind === 'added') mb.strong.push(spanOf(adds[r.b!]));
    }
    dels = [];
    adds = [];
  };
  for (const change of diffArrays(ta.map((t) => t.text), tb.map((t) => t.text))) {
    const n = change.value.length;
    if (change.removed) dels.push(...ta.slice(i, (i += n)));
    else if (change.added) adds.push(...tb.slice(j, (j += n)));
    else {
      flush();
      i += n;
      j += n;
    }
  }
  flush();

  if (fragments >= REWRITE_FRAGMENTS && changed > REWRITE_SHARE * (a.length + b.length)) return null;
  ma.strong = tidy(a, ma.strong);
  mb.strong = tidy(b, mb.strong);
  return { a: ma, b: mb };
}

/**
 * How alike two tokens are, 0..1. A partial edit (plural, tense, spelling, hyphen,
 * punctuation) changes one contiguous stretch, so this is the share of the tokens
 * covered by their common prefix plus common suffix. Letters shared at scattered
 * positions ("beans" / "peas") are chance, not an edit. Case-only changes score 1.
 */
function tokenSimilarity(x: string, y: string): number {
  if (x.toLowerCase() === y.toLowerCase()) return 1;
  const { pre, suf } = affixes(x, y);
  const share = (2 * (pre + suf)) / (x.length + y.length);
  // At half or less, different words pass ("de-scrib-es" / "de-fin-es"): keep those whole.
  return share > MIN_TOKEN_SHARE ? share : 0;
}

function affixes(x: string, y: string): { pre: number; suf: number } {
  const max = Math.min(x.length, y.length);
  let pre = 0;
  while (pre < max && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < max - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  return { pre, suf };
}

/** Marks a pair of similar tokens: case-only as cased, otherwise a soft tint with the changed middle strong. */
function markPair(d: Token, e: Token, ma: Marks, mb: Marks) {
  if (d.text.toLowerCase() === e.text.toLowerCase()) {
    ma.cased.push(spanOf(d));
    mb.cased.push(spanOf(e));
    return;
  }
  const { pre, suf } = affixes(d.text, e.text);
  ma.soft.push(spanOf(d));
  mb.soft.push(spanOf(e));
  if (d.start + pre < d.end - suf) ma.strong.push([d.start + pre, d.end - suf]);
  if (e.start + pre < e.end - suf) mb.strong.push([e.start + pre, e.end - suf]);
}

function tokens(text: string): Token[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

function spanOf(t: Token): Span {
  return [t.start, t.end];
}

/** Merges strong spans across gaps too small to leave unmarked. Character-level spans inside one token stay separate. */
function tidy(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s, e] of spans.sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    const gap = text.slice(last?.[1], s);
    if (last && /\s/.test(gap) && BRIDGE.test(gap)) last[1] = e;
    else out.push([s, e]);
  }
  return out;
}

/** Gap text too small to leave unmarked between two changes. */
const BRIDGE = /^[\s\p{P}]*(\p{L}{1,3}[\s\p{P}]*)?$/u;

export interface WordRanges {
  removed: Range[];
  added: Range[];
  removedSoft: Range[];
  addedSoft: Range[];
  cased: Range[];
}

/** Ranges of the changed words in each modified pair (word marks are skipped for rewrites). */
export function wordRanges(pairs: [HTMLElement, HTMLElement][]): WordRanges {
  const out: WordRanges = { removed: [], added: [], removedSoft: [], addedSoft: [], cased: [] };
  for (const [a, b] of segmentPairs(pairs)) {
    const ta = textMap(a);
    const tb = textMap(b);
    const marks = changedSpans(ta.text, tb.text);
    if (!marks) continue;
    out.removed.push(...rangesFor(ta, marks.a.strong));
    out.added.push(...rangesFor(tb, marks.b.strong));
    out.removedSoft.push(...rangesFor(ta, marks.a.soft));
    out.addedSoft.push(...rangesFor(tb, marks.b.soft));
    out.cased.push(...rangesFor(ta, marks.a.cased), ...rangesFor(tb, marks.b.cased));
  }
  return out;
}

/**
 * Registers named highlights with the CSS Custom Highlight API, styled by
 * `::highlight(<name>)`. The DOM is never modified. Returns a cleanup.
 */
export function paint(highlights: Record<string, Range[]>): () => void {
  if (!('highlights' in CSS)) return () => {};
  for (const [name, ranges] of Object.entries(highlights)) CSS.highlights.set(name, new Highlight(...ranges));
  return () => Object.keys(highlights).forEach((name) => CSS.highlights.delete(name));
}

/**
 * Table rows with matching cell counts are diffed cell by cell, so a change in
 * one cell can't pair with words of another.
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
