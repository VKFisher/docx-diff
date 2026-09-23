// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { rangesFor, wordDiff } from './highlight';

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
