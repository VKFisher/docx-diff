import { describe, expect, it } from 'vitest';
import { align, keySimilarity } from './align';

const p = (text: string) => `P|${text}`;

describe('align', () => {
  it('matches identical sequences as same', () => {
    expect(align([p('a'), p('b')], [p('a'), p('b')])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'same', a: 1, b: 1 },
    ]);
  });

  it('puts a deletion on its own row with nothing on the right', () => {
    expect(align([p('a'), p('x'), p('b')], [p('a'), p('b')])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'deleted', a: 1 },
      { kind: 'same', a: 2, b: 1 },
    ]);
  });

  it('puts an insertion on its own row with nothing on the left', () => {
    expect(align([p('a'), p('b')], [p('a'), p('y'), p('b')])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'added', b: 1 },
      { kind: 'same', a: 1, b: 2 },
    ]);
  });

  it('pairs an edited paragraph as modified', () => {
    const rows = align([p('a'), p('the quick brown fox jumps'), p('b')], [p('a'), p('the quick red fox jumps'), p('b')]);
    expect(rows[1]).toEqual({ kind: 'modified', a: 1, b: 1 });
  });

  it('shows a rewritten paragraph as deleted + added, not modified', () => {
    const rows = align([p('a'), p('alpha beta gamma'), p('b')], [p('a'), p('delta epsilon zeta'), p('b')]);
    expect(rows.slice(1, 3)).toEqual([
      { kind: 'deleted', a: 1 },
      { kind: 'added', b: 1 },
    ]);
  });

  it('pairs by similarity, not position, inside a gap', () => {
    // Old: one edited paragraph. New: an inserted paragraph, then the edited one.
    const old = [p('a'), p('services and their operations are specified here'), p('b')];
    const neu = [p('a'), p('an entirely new remark'), p('components and their services are specified here'), p('b')];
    expect(align(old, neu).slice(1, 3)).toEqual([
      { kind: 'added', b: 1 },
      { kind: 'modified', a: 1, b: 2 },
    ]);
  });

  it('never pairs units of different kinds', () => {
    const rows = align([p('a'), 'TR|x y z', p('b')], [p('a'), p('x y z'), p('b')]);
    expect(rows.map((r) => r.kind)).toEqual(['same', 'deleted', 'added', 'same']);
  });

  it('covers every unit of both sides exactly once, in order', () => {
    const a = ['p', 'q r', 'r s', 's', 't u v'].map(p);
    const b = ['q r x', 'x', 's', 'y', 't u', 'z'].map(p);
    const rows = align(a, b);
    expect(rows.flatMap((r) => (r.a === undefined ? [] : [r.a]))).toEqual([0, 1, 2, 3, 4]);
    expect(rows.flatMap((r) => (r.b === undefined ? [] : [r.b]))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('keySimilarity', () => {
  it('is 1 for equal text and 0 across tags', () => {
    expect(keySimilarity('P|same words', 'P|same words')).toBe(1);
    expect(keySimilarity('P|same words', 'TR|same words')).toBe(0);
  });

  it('ignores case and punctuation', () => {
    expect(keySimilarity('P|Hello, world.', 'P|hello world')).toBe(1);
  });
});
