import { renderAsync } from 'docx-preview';

/** Page geometry of the docx section a unit came from, in CSS px. */
export interface Frame {
  width: number;
  padLeft: number;
  padRight: number;
}

/** A top-level block of the document (paragraph or table) and its alignment key. */
export interface Unit {
  el: HTMLElement;
  key: string;
  frame: Frame;
}

export interface RenderedDoc {
  units: Unit[];
  /** docx-preview's CSS classes are prefixed with this, e.g. `section.<className>`. */
  className: string;
  /** Widest page in the document, px. */
  pageWidth: number;
  /** List counter resets; must be applied on an ancestor of all this document's units. */
  counterReset: string;
  /** Removes the document's <style> elements from the page. */
  dispose: () => void;
}

/**
 * Renders a docx with docx-preview as one continuous flow (no pages) and cuts it
 * into top-level units. The generated <style> elements stay in the document until
 * `dispose` is called; `className` must differ between documents shown together.
 *
 * Tracked changes are shown accepted: insertions rendered, deletions dropped.
 */
export async function renderDocx(file: Blob, className: string): Promise<RenderedDoc> {
  // Rendered attached (but invisible) so page geometry can be measured.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden';
  const styles = document.createElement('div');
  styles.dataset.docxStyles = className;
  document.body.append(host, styles);

  try {
    await renderAsync(file, host, styles, {
      className,
      inWrapper: false,
      breakPages: false,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: false,
      renderFooters: false,
      renderChanges: false,
      renderComments: false,
      experimental: true,
    });

    const units: Unit[] = [];
    for (const section of host.querySelectorAll<HTMLElement>(`section.${className}`)) {
      const cs = getComputedStyle(section);
      const frame: Frame = {
        width: section.getBoundingClientRect().width,
        padLeft: parseFloat(cs.paddingLeft) || 0,
        padRight: parseFloat(cs.paddingRight) || 0,
      };
      for (const el of section.querySelectorAll<HTMLElement>(':scope > article > *')) {
        units.push({ el, key: keyOf(el), frame });
      }
    }

    return {
      units,
      className,
      pageWidth: Math.max(0, ...units.map((u) => u.frame.width)),
      counterReset: takeRootCounterReset(styles),
      dispose: () => styles.remove(),
    };
  } catch (e) {
    styles.remove();
    throw e;
  } finally {
    host.remove();
  }
}

/**
 * docx-preview resets list counters with `:root { counter-reset: ... }`. With two
 * documents on one page, the second document's rule overrides the first, and every
 * list item of the first then counts from 1. This removes the declaration and returns
 * its value, so the caller can apply both documents' resets on one shared ancestor
 * (counter names are prefixed with the className, so they don't collide).
 */
function takeRootCounterReset(styles: HTMLElement): string {
  const resets: string[] = [];
  for (const style of styles.querySelectorAll('style')) {
    for (const rule of style.sheet?.cssRules ?? []) {
      if (rule instanceof CSSStyleRule && rule.selectorText === ':root' && rule.style.counterReset) {
        resets.push(rule.style.counterReset);
        rule.style.removeProperty('counter-reset');
      }
    }
  }
  return resets.join(' ');
}

/** Alignment key: element kind + whitespace-normalized text (+ image count, since images have no text). */
function keyOf(el: HTMLElement): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const images = el.querySelectorAll('img').length;
  return `${el.tagName}|${text}${images ? `|img${images}` : ''}`;
}
