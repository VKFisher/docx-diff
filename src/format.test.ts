// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatDiff } from './format';
import { textMap } from './text';

const p = (html: string, cls = 'docx-old') => {
  const el = document.createElement('p');
  el.className = `${cls}_Normal`;
  el.innerHTML = html;
  return el;
};
const marked = (el: HTMLElement, spans: [number, number][]) => spans.map(([s, e]) => el.textContent!.slice(s, e));

describe('formatDiff', () => {
  it('sees no change when only run boundaries differ', () => {
    const a = p('<span>Plant the </span><span>beans</span>');
    const b = p('<span>Plant the beans</span>', 'docx-new');
    expect(formatDiff(textMap(a), 'docx-old', textMap(b), 'docx-new')).toEqual({ a: [], b: [] });
  });

  it('marks the words whose formatting changed', () => {
    const a = p('<span>Plant the beans now</span>');
    const b = p('<span>Plant the </span><span style="font-weight: bold;">beans now</span>', 'docx-new');
    const diff = formatDiff(textMap(a), 'docx-old', textMap(b), 'docx-new')!;
    expect(marked(a, diff.a)).toEqual(['beans now']);
    expect(marked(b, diff.b)).toEqual(['beans now']);
  });

  it('marks everything when the paragraph style changes', () => {
    const a = p('<span>Beds</span>');
    const b = p('<span>Beds</span>', 'docx-new');
    b.className = 'docx-new_Heading1';
    expect(marked(b, formatDiff(textMap(a), 'docx-old', textMap(b), 'docx-new')!.b)).toEqual(['Beds']);
  });

  it('ignores list renumbering', () => {
    const a = p('<span>Tomatoes</span>');
    const b = p('<span>Tomatoes</span>', 'docx-new');
    a.classList.add('docx-old-num-1-0');
    b.classList.add('docx-new-num-7-0');
    expect(formatDiff(textMap(a), 'docx-old', textMap(b), 'docx-new')).toEqual({ a: [], b: [] });
  });

  it('returns null when the texts differ', () => {
    expect(formatDiff(textMap(p('abc')), 'docx-old', textMap(p('abcd', 'docx-new')), 'docx-new')).toBeNull();
  });
});
