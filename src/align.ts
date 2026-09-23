import { diffArrays } from 'diff';

export type RowKind = 'same' | 'modified' | 'deleted' | 'added';

/** One line of the side-by-side view. `a` indexes the old units, `b` the new ones. */
export interface Row {
  kind: RowKind;
  a?: number;
  b?: number;
}

/**
 * Aligns two sequences of unit keys into rows.
 * Equal keys are matched first (Myers diff). Each unmatched stretch is then
 * paired position by position: leftovers on one side become deleted/added.
 */
export function align(a: string[], b: string[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  let removed: number[] = [];
  let addedIdx: number[] = [];

  const flush = () => {
    const n = Math.max(removed.length, addedIdx.length);
    for (let k = 0; k < n; k++) {
      const ra = removed[k];
      const rb = addedIdx[k];
      const kind: RowKind = ra !== undefined && rb !== undefined ? 'modified' : ra !== undefined ? 'deleted' : 'added';
      rows.push({ kind, a: ra, b: rb });
    }
    removed = [];
    addedIdx = [];
  };

  for (const change of diffArrays(a, b)) {
    const count = change.value.length;
    if (change.removed) {
      for (let k = 0; k < count; k++) removed.push(i++);
    } else if (change.added) {
      for (let k = 0; k < count; k++) addedIdx.push(j++);
    } else {
      flush();
      for (let k = 0; k < count; k++) rows.push({ kind: 'same', a: i++, b: j++ });
    }
  }
  flush();
  return rows;
}
