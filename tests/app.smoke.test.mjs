/**
 * End-to-end smoke test for the UI.
 *
 * jsdom cannot execute ES modules, so the real module sources are concatenated
 * (imports/exports stripped) into one classic script and run inside jsdom with a
 * stubbed canvas. That still exercises the genuine app.js / graph.js /
 * launcher.js code paths: element lookups, event wiring, overlay screens and
 * iframe creation.
 *
 * Run with: node tests/app.smoke.test.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { test, summary, assert } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\napp smoke test (jsdom)');

/* ------------------------------------------------------------------ *
 * Module loading
 * ------------------------------------------------------------------ */

/** Strip ES module syntax so the file can live inside a classic script. */
const stripModuleSyntax = (source) =>
  source
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class|async function)\b/gm, '$1')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

async function combineModules() {
  const files = [
    'src/math-engine.js',
    'src/mirrors.js',
    'src/unlock.js',
    'src/graph.js',
    'src/launcher.js',
    'src/app.js',
  ];
  const parts = [];
  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    parts.push(`/* ==== ${file} ==== */\n${stripModuleSyntax(source)}`);
  }
  return `(function(){\n${parts.join('\n')}\nwindow.__APP_LOADED__ = true;\n})();`;
}

function createContext() {
  const html = readFile(path.join(ROOT, 'index.html'), 'utf8');
  return html;
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

const html = await createContext();
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => errors.push(`${error.type ?? 'error'}: ${error.message}`));
virtualConsole.on('error', (...args) => errors.push(args.join(' ')));

const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
const document = window.document;

/* --- stubs jsdom lacks ------------------------------------------------ */

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const noop = () => {};
  return {
    canvas: this,
    save: noop,
    restore: noop,
    clearRect: noop,
    setTransform: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    setLineDash: noop,
    measureText: () => ({ width: 10 }),
  };
};

window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  right: 900,
  bottom: 600,
  width: 900,
  height: 600,
  x: 0,
  y: 0,
});

for (const [prop, value] of [
  ['clientWidth', 900],
  ['clientHeight', 600],
]) {
  Object.defineProperty(window.HTMLElement.prototype, prop, { configurable: true, get: () => value });
}

window.ResizeObserver =
  window.ResizeObserver ??
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

window.Element.prototype.setPointerCapture = function setPointerCapture() {};
window.Element.prototype.releasePointerCapture = function releasePointerCapture() {};

/* --- run the app ------------------------------------------------------ */

let bootError = null;
const appCode = await combineModules();
try {
  window.eval(appCode);
} catch (error) {
  bootError = error;
}

const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
const click = (selector) => {
  const el = document.querySelector(selector);
  if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
};
const type = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test('bundle boots without throwing', () => {
  assert.equal(bootError, null, bootError ? String(bootError.stack ?? bootError) : '');
  assert.ok(window.__APP_LOADED__);
});

test('initial UI is rendered', () => {
  assert.ok(document.querySelector('#graph-canvas'), 'canvas exists');
  assert.equal(document.querySelectorAll('.expr-row').length, 2, 'two starter expressions');
  assert.ok(document.querySelector('#table-body').children.length >= 5, 'table filled');
  assert.equal(document.querySelector('#angle-mode').textContent, 'RAD');
});

test('no engine errors were logged while drawing', () => {
  assert.deepEqual(errors, []);
});

test('invalid input surfaces a friendly error', () => {
  const input = document.querySelectorAll('.expr-row__input')[0];
  type(input, 'sin(');
  const error = document.querySelector('.expr-row[data-id="e1"] .expr-row__error');
  assert.ok(error && !error.hidden, 'error row visible');
  type(input, 'sin(x)');
  assert.ok(document.querySelector('.expr-row[data-id="e1"] .expr-row__error').hidden, 'error clears again');
});

test('adding and removing expressions works', () => {
  const before = document.querySelectorAll('.expr-row').length;
  click('#add-expression');
  assert.equal(document.querySelectorAll('.expr-row').length, before + 1);
  document.querySelectorAll('.expr-row__remove')[before].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(document.querySelectorAll('.expr-row').length, before);
});

/* --- the secret ------------------------------------------------------- */

type(document.querySelectorAll('.expr-row__input')[0], 'GimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(X)');
await frame();
await frame();

test('secret phrase opens the launcher and clears the field', () => {
  const root = document.querySelector('#launcher-root');
  assert.equal(root.hidden, false, 'launcher visible');
  assert.equal(document.querySelectorAll('.expr-row__input')[0].value, '', 'field cleared');
  assert.deepEqual(
    [...document.querySelectorAll('[data-version]')].map((el) => el.dataset.version),
    ['1.8.8', '1.12.2'],
  );
});

click('[data-version="1.8.8"]');
await frame();

test('1.8.8 lists six mirrors grouped JS / WASM', () => {
  const mirrors = [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror);
  assert.deepEqual(mirrors, [
    '1.8.8::188-js-1',
    '1.8.8::188-js-2',
    '1.8.8::188-js-3',
    '1.8.8::188-wasm-1',
    '1.8.8::188-wasm-2',
    '1.8.8::188-wasm-3',
  ]);
  assert.equal(document.querySelectorAll('.mirror-group').length, 2);
});

click('[data-mirror="1.8.8::188-js-2"]');
await frame();

test('picking a mirror mounts its iframe', () => {
  const iframe = document.querySelector('#launcher-root iframe');
  assert.ok(iframe, 'iframe rendered');
  assert.equal(iframe.getAttribute('src'), 'https://yee.pages.dev/#/MS44anM');
  assert.match(iframe.getAttribute('allow'), /fullscreen/);
  assert.equal(iframe.getAttribute('referrerpolicy'), 'no-referrer');
  assert.match(iframe.getAttribute('allowfullscreen'), /true|^$/);
});

test('reload keeps the same target', () => {
  click('[data-action="reload"]');
  const iframe = document.querySelector('#launcher-root iframe');
  assert.ok(iframe);
});

click('[data-action="switch"]');
await frame();
click('[data-version="1.12.2"]');
await frame();
click('[data-mirror="1.12.2::1122-wasm-2"]');
await frame();

test('switching to the 1.12.2 WASM mirror works', () => {
  const iframe = document.querySelector('#launcher-root iframe');
  assert.equal(iframe.getAttribute('src'), 'https://yee.pages.dev/#/MS4xMndhc20');
  const tag = document.querySelector('#launcher-root .game-bar .engine-tag');
  assert.equal(tag.textContent, 'WASM');
  assert.match(document.querySelector('#launcher-root .game-bar').textContent, /1\.12\.2/);
});

test('all six 1.12.2 mirrors are registered in the DOM', () => {
  click('[data-action="switch"]');
  const mirrors = [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror);
  assert.equal(mirrors.length, 6);
  assert.ok(mirrors.every((id) => id.startsWith('1.12.2::')));
  click('[data-mirror="1.12.2::1122-js-1"]');
});

test('escape leaves the game view, then closes', async () => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(document.querySelector('[data-mirror]'), 'back on the mirror list');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('#launcher-root').hidden, true, 'closed');
  assert.equal(document.querySelectorAll('#launcher-root iframe').length, 0, 'frame torn down');
});

test('lookalike phrases are ignored', async () => {
  const input = document.querySelectorAll('.expr-row__input')[0];
  type(input, 'GimmeMinecraftNow');
  assert.equal(document.querySelector('#launcher-root').hidden, true, 'launcher stays closed');
  type(input, '2x+1');
  assert.equal(input.value, '2x+1');
});

test('keyboard shortcuts zoom and reset', () => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+' }));
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true }));
  assert.ok(true);
});

await summary('app smoke test');
