import type { Row } from './align';

/** Half-open range of row indices. */
export interface RowRange {
  start: number;
  end: number;
}

/** Maximal runs of consecutive changed rows. Navigation moves between these. */
export function hunks(rows: Row[]): RowRange[] {
  const out: RowRange[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'same') return;
    const last = out[out.length - 1];
    if (last && last.end === i) last.end++;
    else out.push({ start: i, end: i + 1 });
  });
  return out;
}

/**
 * Runs of unchanged rows to hide in changes-only mode, keeping `context` rows
 * next to each change. Runs shorter than 2 aren't worth a fold bar.
 */
export function folds(rows: Row[], context: number): RowRange[] {
  const out: RowRange[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== 'same') {
      i++;
      continue;
    }
    let e = i;
    while (e < rows.length && rows[e].kind === 'same') e++;
    const start = i > 0 ? i + context : i;
    const end = e < rows.length ? e - context : e;
    if (end - start >= 2) out.push({ start, end });
    i = e;
  }
  return out;
}
