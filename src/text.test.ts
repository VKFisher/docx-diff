// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { rangesFor, textMap } from './text';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild!;
};

describe('textMap', () => {
  it('separates paragraphs, so their words do not glue together', () => {
    expect(textMap(el('<div><p>directory,</p><p>The rest</p></div>')).text).toBe('directory,\nThe rest');
  });

  it('keeps runs of one paragraph contiguous', () => {
    expect(textMap(el('<p><span>the qui</span><b>ck</b></p>')).text).toBe('the quick');
  });
});

describe('rangesFor', () => {
  it('maps spans across text nodes of different elements', () => {
    const map = textMap(el('<p><span>the qui</span><b>ck brown</b> fox</p>'));
    const start = map.text.indexOf('quick');
    const [range] = rangesFor(map, [[start, start + 'quick brown'.length]]);
    expect(range.toString()).toBe('quick brown');
  });

  it('handles a span that ends exactly at a node boundary', () => {
    const [range] = rangesFor(textMap(el('<p><span>alpha</span><span>beta</span></p>')), [[0, 5]]);
    expect(range.toString()).toBe('alpha');
    expect(range.endContainer.textContent).toBe('alpha');
  });

  it('maps spans on both sides of a paragraph separator', () => {
    const map = textMap(el('<div><p>one</p><p>two</p></div>'));
    expect(rangesFor(map, [[0, 7]])[0].toString()).toBe('onetwo');
  });
});
