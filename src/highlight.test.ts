// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { changedSpans, segmentPairs } from './highlight';

const marked = (text: string, spans: [number, number][]) => spans.map(([s, e]) => text.slice(s, e));

describe('changedSpans', () => {
  it('marks removed and added words', () => {
    const a = 'the quick brown fox';
    const b = 'the quick red fox';
    const { a: ma, b: mb } = changedSpans(a, b)!;
    expect(marked(a, ma.strong)).toEqual(['brown']);
    expect(marked(b, mb.strong)).toEqual(['red']);
  });

  it('returns no marks for equal texts', () => {
    const empty = { strong: [], soft: [], cased: [] };
    expect(changedSpans('same text', 'same text')).toEqual({ a: empty, b: empty });
  });

  it('anchors on content, not on shared punctuation', () => {
    const a = 'codes C-, A-, H-, U-, FQ-, AQ-';
    const b = 'codes C-, A-, U-, E-, RO-, FQ-, AQ-';
    const { a: ma, b: mb } = changedSpans(a, b)!;
    expect(marked(a, ma.strong)).toEqual(['H-,']);
    expect(marked(b, mb.strong)).toEqual(['E-, RO-,']);
  });

  it('marks only the changed characters of a similar swapped word, tinting the word', () => {
    const a = 'send the events now';
    const b = 'send the event now';
    const { a: ma, b: mb } = changedSpans(a, b)!;
    expect(marked(a, ma.soft)).toEqual(['events']);
    expect(marked(a, ma.strong)).toEqual(['s']);
    expect(marked(b, mb.soft)).toEqual(['event']);
    expect(mb.strong).toEqual([]);
  });

  it('marks dissimilar swapped words whole, even when they share scattered letters', () => {
    const { a: ma } = changedSpans('version 4 applies', 'version 5 applies')!;
    expect(ma.soft).toEqual([]);
    expect(ma.strong).toEqual([[8, 9]]);
    const beans = changedSpans('plant beans daily', 'plant peas daily')!;
    expect(beans.a.soft).toEqual([]);
    expect(marked('plant beans daily', beans.a.strong)).toEqual(['beans']);
    expect(changedSpans('it describes x', 'it defines x')!.a.soft).toEqual([]);
  });

  it('pairs a similar token even when the change adds or drops other words', () => {
    const a = 'behavior of the current IET, cited as J-numbers';
    const { a: ma, b: mb } = changedSpans(a, 'behavior of the current IET')!;
    expect(marked(a, ma.strong)).toEqual([', cited as J-numbers']);
    expect(mb.strong).toEqual([]);
  });

  it('marks the one changed stretch inside a word', () => {
    const a = 'the colour red';
    const { a: ma, b: mb } = changedSpans(a, 'the color red')!;
    expect(marked(a, ma.strong)).toEqual(['u']);
    expect(mb.strong).toEqual([]);
    expect(mb.soft).toEqual([[4, 9]]);
  });

  it('reports case-only changes separately', () => {
    const a = 'see chapter 4';
    const b = 'see Chapter 4';
    const { a: ma, b: mb } = changedSpans(a, b)!;
    expect(marked(a, ma.cased)).toEqual(['chapter']);
    expect(marked(b, mb.cased)).toEqual(['Chapter']);
    expect([...ma.strong, ...mb.strong, ...ma.soft, ...mb.soft]).toEqual([]);
  });

  it('merges fragments separated by a short word or punctuation', () => {
    const a = 'Plant beans, water daily, and weed the rows each week before the harvest.';
    const b = 'Sow peas, water weekly, and weed the rows each week before the harvest.';
    const spans = changedSpans(a, b)!;
    expect(marked(a, spans.a.strong)).toEqual(['Plant beans,', 'daily,']);
    expect(marked(b, spans.b.strong)).toEqual(['Sow peas,', 'weekly,']);
    // "daily" -> "weekly" is two words away from "beans": not bridged.
    const c = 'Plant beans in rows and water them daily until the harvest.';
    const d = 'Plant peas in rows and water them weekly until the harvest.';
    expect(marked(c, changedSpans(c, d)!.a.strong)).toEqual(['beans', 'daily']);
  });

  it('keeps small edits marked, even when the whole text changes', () => {
    expect(changedSpans('May', 'June')!.a.strong).toEqual([[0, 3]]);
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
