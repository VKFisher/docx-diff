import { describe, expect, it } from 'vitest';
import { align } from './align';

describe('align', () => {
  it('matches identical sequences as same', () => {
    expect(align(['a', 'b'], ['a', 'b'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'same', a: 1, b: 1 },
    ]);
  });

  it('puts a deletion on its own row with nothing on the right', () => {
    expect(align(['a', 'x', 'b'], ['a', 'b'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'deleted', a: 1, b: undefined },
      { kind: 'same', a: 2, b: 1 },
    ]);
  });

  it('puts an insertion on its own row with nothing on the left', () => {
    expect(align(['a', 'b'], ['a', 'y', 'b'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'added', a: undefined, b: 1 },
      { kind: 'same', a: 1, b: 2 },
    ]);
  });

  it('pairs a replaced unit as modified', () => {
    expect(align(['a', 'x', 'b'], ['a', 'y', 'b'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'modified', a: 1, b: 1 },
      { kind: 'same', a: 2, b: 2 },
    ]);
  });

  it('covers every unit of both sides exactly once, in order', () => {
    const a = ['p', 'q', 'r', 's', 't'];
    const b = ['q', 'x', 's', 'y', 'z', 't'];
    const rows = align(a, b);
    expect(rows.flatMap((r) => (r.a === undefined ? [] : [r.a]))).toEqual([0, 1, 2, 3, 4]);
    expect(rows.flatMap((r) => (r.b === undefined ? [] : [r.b]))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
