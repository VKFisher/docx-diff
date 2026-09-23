import { describe, expect, it } from 'vitest';
import type { Row, RowKind } from './align';
import { folds, hunks } from './layout';

const rows = (kinds: string): Row[] =>
  [...kinds].map((c) => ({ kind: ({ s: 'same', m: 'modified', d: 'deleted', a: 'added' } as Record<string, RowKind>)[c] }));

describe('hunks', () => {
  it('groups consecutive changed rows', () => {
    expect(hunks(rows('ssmdsssa'))).toEqual([
      { start: 2, end: 4 },
      { start: 7, end: 8 },
    ]);
  });

  it('is empty when nothing changed', () => {
    expect(hunks(rows('sss'))).toEqual([]);
  });
});

describe('folds', () => {
  it('keeps context rows on both sides of a change', () => {
    // 0..9 same, 10 modified, 11..20 same
    expect(folds(rows('ssssssssssmssssssssss'), 2)).toEqual([
      { start: 0, end: 8 },
      { start: 13, end: 21 },
    ]);
  });

  it('keeps context around both changes inside a run between them', () => {
    expect(folds(rows('msssssssm'), 2)).toEqual([{ start: 3, end: 6 }]);
  });

  it('skips runs too short to fold', () => {
    expect(folds(rows('msssssm'), 2)).toEqual([]);
  });

  it('folds an unchanged document entirely', () => {
    expect(folds(rows('ssss'), 2)).toEqual([{ start: 0, end: 4 }]);
  });
});
