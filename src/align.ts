import { diffArrays } from 'diff';

/** `format`: same text, different formatting (set after alignment, see format.ts). */
export type RowKind = 'same' | 'format' | 'modified' | 'deleted' | 'added';

/** One line of the side-by-side view. `a` indexes the old units, `b` the new ones. */
export interface Row {
  kind: RowKind;
  a?: number;
  b?: number;
}

/** Scores how alike two keys are, 0..1. Pairs scoring below `PAIR_THRESHOLD` are not shown as modified. */
export type Similarity = (a: string, b: string) => number;

export const PAIR_THRESHOLD = 0.5;

const MAX_GAP_CELLS = 250_000;

/**
 * Aligns two sequences of unit keys into rows.
 *
 * 1. Equal keys are matched (Myers diff) and become `same` rows.
 * 2. Within each unmatched stretch, units are paired in order to maximize total
 *    similarity; a pair counts only if it scores at least `PAIR_THRESHOLD`.
 *    Pairs become `modified` rows. Unpaired units become `deleted` / `added`
 *    rows, deletions first.
 *
 * Every unit of both sides appears in exactly one row, in original order.
 */
export function align(a: string[], b: string[], similarity: Similarity = keySimilarity): Row[] {
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  let removed: number[] = [];
  let added: number[] = [];

  const flush = () => {
    rows.push(...pairGap(removed, added, (x, y) => similarity(a[x], b[y])));
    removed = [];
    added = [];
  };

  for (const change of diffArrays(a, b)) {
    const count = change.value.length;
    if (change.removed) {
      for (let k = 0; k < count; k++) removed.push(i++);
    } else if (change.added) {
      for (let k = 0; k < count; k++) added.push(j++);
    } else {
      flush();
      for (let k = 0; k < count; k++) rows.push({ kind: 'same', a: i++, b: j++ });
    }
  }
  flush();
  return rows;
}

/** Order-preserving maximum-similarity pairing of one gap (dynamic programming, like sequence alignment). */
function pairGap(dels: number[], adds: number[], sim: (a: number, b: number) => number): Row[] {
  const p = dels.length;
  const q = adds.length;
  // Huge gaps (whole documents rewritten) would take seconds to score; show them unpaired.
  if (p === 0 || q === 0 || p * q > MAX_GAP_CELLS) {
    return [...dels.map((a): Row => ({ kind: 'deleted', a })), ...adds.map((b): Row => ({ kind: 'added', b }))];
  }

  // best[x][y]: best total score pairing dels[x..] with adds[y..].
  const score = dels.map((d) => adds.map((e) => sim(d, e)));
  const best = Array.from({ length: p + 1 }, () => new Float64Array(q + 1));
  for (let x = p - 1; x >= 0; x--) {
    for (let y = q - 1; y >= 0; y--) {
      const s = score[x][y];
      const pair = s >= PAIR_THRESHOLD ? best[x + 1][y + 1] + s : -Infinity;
      best[x][y] = Math.max(pair, best[x + 1][y], best[x][y + 1]);
    }
  }

  const rows: Row[] = [];
  let pendingDel: number[] = [];
  let pendingAdd: number[] = [];
  const flushPending = () => {
    rows.push(...pendingDel.map((a): Row => ({ kind: 'deleted', a })), ...pendingAdd.map((b): Row => ({ kind: 'added', b })));
    pendingDel = [];
    pendingAdd = [];
  };

  let x = 0;
  let y = 0;
  while (x < p && y < q) {
    const s = score[x][y];
    if (s >= PAIR_THRESHOLD && best[x][y] === best[x + 1][y + 1] + s) {
      flushPending();
      rows.push({ kind: 'modified', a: dels[x++], b: adds[y++] });
    } else if (best[x][y] === best[x + 1][y]) {
      pendingDel.push(dels[x++]);
    } else {
      pendingAdd.push(adds[y++]);
    }
  }
  while (x < p) pendingDel.push(dels[x++]);
  while (y < q) pendingAdd.push(adds[y++]);
  flushPending();
  return rows;
}

/**
 * Default similarity for keys of the form `TAG|text`: 0 across different tags,
 * otherwise the Dice coefficient of the two texts' word multisets.
 */
export function keySimilarity(a: string, b: string): number {
  const [tagA, textA] = splitKey(a);
  const [tagB, textB] = splitKey(b);
  if (tagA !== tagB) return 0;
  const wa = words(textA);
  const wb = words(textB);
  if (wa.length === 0 && wb.length === 0) return 1;
  if (wa.length === 0 || wb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wb) {
    const c = counts.get(w);
    if (c) {
      common++;
      counts.set(w, c - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

function splitKey(key: string): [string, string] {
  const bar = key.indexOf('|');
  return bar < 0 ? ['', key] : [key.slice(0, bar), key.slice(bar + 1)];
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
