// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { changedSpans, rangesFor, segmentPairs, wordDiff } from './highlight';

describe('wordDiff', () => {
  it('returns spans of removed and added words', () => {
    const a = 'the quick brown fox';
    const b = 'the quick red fox';
    const { removed, added } = wordDiff(a, b);
    expect(removed.map(([s, e]) => a.slice(s, e))).toEqual(['brown']);
    expect(added.map(([s, e]) => b.slice(s, e))).toEqual(['red']);
  });

  it('returns nothing for equal texts', () => {
    expect(wordDiff('same text', 'same text')).toEqual({ removed: [], added: [] });
  });
});

describe('changedSpans', () => {
  const marked = (text: string, spans: [number, number][]) => spans.map(([s, e]) => text.slice(s, e));

  it('merges fragments separated by a short word or punctuation', () => {
    const a = 'Plant beans, water daily, and weed the rows each week before the harvest.';
    const b = 'Sow peas, water weekly, and weed the rows each week before the harvest.';
    const spans = changedSpans(a, b)!;
    expect(marked(a, spans.removed)).toEqual(['Plant beans', 'daily']);
    expect(marked(b, spans.added)).toEqual(['Sow peas', 'weekly']);
    // "daily" -> "weekly" is two words away from "beans": not bridged.
    const c = 'Plant beans in rows and water them daily until the harvest.';
    const d = 'Plant peas in rows and water them weekly until the harvest.';
    expect(marked(c, changedSpans(c, d)!.removed)).toEqual(['beans', 'daily']);
  });

  it('keeps small edits marked, even when the whole text changes', () => {
    expect(changedSpans('May', 'June')).toEqual({ removed: [[0, 3]], added: [[0, 4]] });
  });

  it('returns null for a rewrite: many fragments covering most of the text', () => {
    const a = 'Both gardeners and neighbours can use one shed. The shed holds only the tools that each bed needs.';
    const b = 'A neighbour can borrow several tools, and a gardener can lend tools to anyone. The shed is shared, open all day, and the key stays with each bed.';
    expect(changedSpans(a, b)).toBeNull();
  });
});

describe('segmentPairs', () => {
  const row = (...cells: string[]) => {
    const t = document.createElement('table');
    const tr = t.insertRow();
    for (const c of cells) tr.insertCell().textContent = c;
    return t;
  };

  it('pairs table rows cell by cell, so words never glue across cells', () => {
    const segs = segmentPairs([[row('Plant tomatoes', 'May'), row('Plant tomatoes', 'June')]]);
    expect(segs.map(([a, b]) => [a.textContent, b.textContent])).toEqual([
      ['Plant tomatoes', 'Plant tomatoes'],
      ['May', 'June'],
    ]);
  });

  it('diffs whole elements when cell counts differ', () => {
    const [a, b] = [row('x', 'y'), row('x', 'y', 'z')];
    expect(segmentPairs([[a, b]])).toEqual([[a, b]]);
  });
});

describe('rangesFor', () => {
  it('maps spans across text nodes of different elements', () => {
    const p = document.createElement('p');
    p.innerHTML = '<span>the qui</span><b>ck brown</b> fox';
    const text = p.textContent!;
    const start = text.indexOf('quick');
    const [range] = rangesFor(p, [[start, start + 'quick brown'.length]]);
    expect(range.toString()).toBe('quick brown');
  });

  it('handles a span that ends exactly at a node boundary', () => {
    const p = document.createElement('p');
    p.innerHTML = '<span>alpha</span><span>beta</span>';
    const [range] = rangesFor(p, [[0, 5]]);
    expect(range.toString()).toBe('alpha');
    expect(range.endContainer.textContent).toBe('alpha');
  });
});
