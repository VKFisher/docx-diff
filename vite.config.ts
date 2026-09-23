import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Documents never leave the browser, and the built page can't send them anywhere:
 * `connect-src 'none'` blocks fetch/XHR/WebSocket/beacons, `form-action 'none'`
 * blocks form posts. Images and fonts from the docx are blob: URLs; docx-preview
 * writes <style> elements and style attributes, hence 'unsafe-inline' for styles.
 * Build only: the dev server needs a websocket for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "connect-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

export default defineConfig({
  base: './',
  plugins: [preact(), csp()],
});
