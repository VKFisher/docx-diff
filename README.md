# docx diff

Compare two Word documents side by side in the browser.

- **Aligned, not synced.** Each change sits on one row with the old version on the left and the new on the right. Added or deleted sections leave a gap on the other side, so the two sides can't drift apart.
- **Looks like the document.** Rendering is done by [docx-preview](https://github.com/VolodymyrBaydalka/docxjs): fonts, lists, tables and images come through.
- **Nothing leaves your browser.** Files are read locally. The page's Content-Security-Policy (`connect-src 'none'`) stops it from sending data anywhere.

Changed words are highlighted within each modified paragraph or table row; a paragraph that was largely rewritten is tinted instead. Formatting-only changes (same text, e.g. bold added or a style changed) are marked separately. Use `n` / `p` to jump between changes, or "changes only" to fold unchanged text.

Drop both files at once to fill both sides (the older file becomes Old); ⇄ swaps them.

A document that contains tracked changes is compared as if all its changes were accepted.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

`fixtures/make.py` generates a small old/new pair covering every kind of change (needs `python-docx`).

Pushing to `main` deploys to GitHub Pages.
