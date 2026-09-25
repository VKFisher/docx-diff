/** Half-open character range [start, end) into a `TextMap`'s text. */
export type Span = [number, number];

/**
 * An element's text, with where each character came from. Unlike `textContent`,
 * text from different blocks (paragraphs, cells) is separated by a newline, so
 * the last word of one paragraph doesn't glue onto the first word of the next.
 * The separators belong to no node.
 */
export interface TextMap {
  root: Node;
  text: string;
  nodes: { node: Text; start: number; end: number }[];
}

const BLOCK = 'p, li, td, th, h1, h2, h3, h4, h5, h6, div';

export function textMap(root: Node): TextMap {
  const nodes: TextMap['nodes'] = [];
  let text = '';
  let block: Element | null | undefined;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCK);
    if (block !== undefined && b !== block) text += '\n';
    block = b;
    nodes.push({ node: n, start: text.length, end: (text += n.data).length });
  }
  return { root, text, nodes };
}

/**
 * Maps spans of a TextMap's text to DOM Ranges over its text nodes. Ranges can
 * cross element boundaries (runs, table cells), which is what lets us mark words
 * without changing the rendered DOM.
 */
export function rangesFor(map: TextMap, spans: Span[]): Range[] {
  return spans.flatMap(([start, end]) => {
    const from = map.nodes.find((t) => t.end > start);
    const to = map.nodes.findLast((t) => t.start < end);
    if (!from || !to || from.start >= end) return [];
    const range = document.createRange();
    range.setStart(from.node, Math.max(0, start - from.start));
    range.setEnd(to.node, Math.min(to.node.data.length, end - to.start));
    return [range];
  });
}
