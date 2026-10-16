/**
 * End-to-end smoke test for the UI.
 *
 * Uses tests/boot-app.mjs, which loads index.html in jsdom and runs the real
 * module sources (imports stripped) as one classic script. Tests run
 * sequentially and each one finishes what it starts.
 *
 * Run with: node tests/app.smoke.test.mjs
 */
import { test, summary, assert } from './harness.mjs';
import { bootApp } from './boot-app.mjs';

console.log('\napp smoke test (jsdom)');

const { window, document, errors, bootError, click, type, settle } = await bootApp();

const rowInputs = () => [...document.querySelectorAll('.expr-row__input')];
const launcher = () => document.querySelector('#launcher-root');
const visibleErrorText = () =>
  [...document.querySelectorAll('.expr-row__error')]
    .filter((el) => !el.hidden)
    .map((el) => el.textContent);

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

test('bundle boots without uncaught errors', () => {
  assert.equal(bootError, null, bootError ? String(bootError) : '');
  assert.ok(window.__APP_LOADED__);
});

test('initial UI is rendered', () => {
  assert.ok(document.querySelector('#graph-canvas'), 'canvas exists');
  assert.equal(document.querySelectorAll('.expr-row').length, 2, 'starter row + an empty one');
  assert.equal(rowInputs()[0].value, 'sin(x)', 'starter curve');
  assert.equal(rowInputs()[0].placeholder, 'type a formula…');
  assert.ok(document.querySelector('#table-body').children.length >= 5, 'table filled');
  assert.equal(document.querySelector('#angle-mode').textContent, 'RAD');
  assert.equal(document.querySelector('#expression-list').closest('.composer') !== null, true, 'rows live in the composer');
});

test('the formula box is focused on load so you can just type', () => {
  assert.equal(document.activeElement, rowInputs().at(-1), 'empty row is focused');
});

test('no engine errors were logged while drawing', () => {
  assert.deepEqual(errors, []);
});

/* ------------------------------------------------------------------ *
 * Typing
 * ------------------------------------------------------------------ */

test('invalid input surfaces a friendly error', () => {
  const input = rowInputs()[0];
  type(input, 'sin(');
  assert.deepEqual(visibleErrorText().length, 1, 'one visible error');
  type(input, 'sin(x)');
  assert.deepEqual(visibleErrorText(), []);
});

test('example chips fill a row and graph it', () => {
  const chips = [...document.querySelectorAll('.example-chip')];
  assert.deepEqual(chips.slice(0, 3).map((el) => el.textContent), ['sin(x)', 'x^2 - 3', '1/x']);
  chips[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const values = rowInputs().map((el) => el.value);
  assert.ok(values.includes('1/x'), `chip should fill a row, got ${JSON.stringify(values)}`);
});

test('adding and removing rows works', () => {
  const before = document.querySelectorAll('.expr-row').length;
  click('#add-expression');
  assert.equal(document.querySelectorAll('.expr-row').length, before + 1);
  document.querySelectorAll('.expr-row__remove')[before].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(document.querySelectorAll('.expr-row').length, before);
});

test('the detail rail toggles', () => {
  const app = document.querySelector('#app');
  const toggle = document.querySelector('#toggle-rail');
  toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const opened = app.classList.contains('rail-open');
  assert.ok(opened || app.classList.contains('rail-closed'), 'the rail state changes on click');
  toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // put it back
});

/* ------------------------------------------------------------------ *
 * The hidden launcher
 * ------------------------------------------------------------------ */

test('half-typed secrets do not flash a parse error', async () => {
  const input = rowInputs()[0];
  type(input, 'TWlu');
  await settle();
  assert.deepEqual(visibleErrorText(), [], 'prefix of the code must not show "Unknown name"');
  assert.equal(launcher().hidden, true, 'and must not unlock yet');
});

test('the secret code opens the launcher, clears the field and lists versions', async () => {
  type(rowInputs()[0], 'TWluZWNyYWZ0');
  await settle();
  assert.equal(launcher().hidden, false, 'launcher visible');
  assert.equal(rowInputs()[0].value, '', 'field cleared');
  assert.deepEqual(
    [...document.querySelectorAll('[data-version]')].map((el) => el.dataset.version),
    ['1.8.8', '1.12.2', '1.5.2'],
  );
  assert.deepEqual(visibleErrorText(), [], 'the code must not leave a parse error behind');
});

test('1.8.8 lists six mirrors in two engine groups', async () => {
  click('[data-version="1.8.8"]');
  await settle();
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['1.8.8::188-js-1', '1.8.8::188-js-2', '1.8.8::188-js-3', '1.8.8::188-wasm-1', '1.8.8::188-wasm-2', '1.8.8::188-wasm-3'],
  );
  assert.equal(document.querySelectorAll('.mirror-group').length, 2);
});

test('picking a build opens it', async () => {
  click('[data-mirror="1.8.8::188-js-2"]');
  await settle();
  const iframe = launcher().querySelector('iframe');
  assert.ok(iframe, 'running view rendered');
  assert.equal(iframe.getAttribute('src'), 'https://yee.pages.dev/#/MS44anM');
  assert.match(iframe.getAttribute('allow'), /fullscreen/);
  assert.equal(iframe.getAttribute('referrerpolicy'), 'no-referrer');
});

test('reload keeps the same target', async () => {
  click('[data-action="reload"]');
  await settle();
  assert.equal(launcher().querySelector('iframe').getAttribute('src'), 'https://yee.pages.dev/#/MS44anM');
});

test('swapping to the 1.12.2 WASM mirror works', async () => {
  click('[data-action="switch"]');
  await settle();
  click('[data-version="1.12.2"]');
  await settle();
  click('[data-mirror="1.12.2::1122-wasm-2"]');
  await settle();
  const iframe = launcher().querySelector('iframe');
  assert.equal(iframe.getAttribute('src'), 'https://yee.pages.dev/#/MS4xMndhc20');
  assert.equal(launcher().querySelector('.game-bar .engine-tag').textContent, 'WASM');
  assert.match(launcher().querySelector('.game-bar').textContent, /1\.12\.2/);
});

test('1.5.2 offers three JS builds and exactly one WASM build', async () => {
  click('[data-action="switch"]');
  await settle();
  click('[data-version="1.5.2"]');
  await settle();
  const mirrors = [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror);
  assert.deepEqual(mirrors, ['1.5.2::152-js-1', '1.5.2::152-js-2', '1.5.2::152-js-3', '1.5.2::152-wasm-1']);
  const groups = [...document.querySelectorAll('.mirror-group')].map((el) => el.querySelector('.engine-tag').textContent);
  assert.deepEqual(groups, ['JS', 'WASM']);
});

test('the running build has fullscreen, restart and another-build controls', async () => {
  click('[data-mirror="1.5.2::152-js-1"]');
  await settle();
  const actions = [...document.querySelectorAll('#launcher-root .game-bar [data-action]')].map((el) => el.dataset.action);
  assert.deepEqual(actions, ['fullscreen', 'reload', 'switch']);
  const bar = document.querySelector('#launcher-root .game-bar').textContent;
  assert.match(bar, /Fullscreen/);
  assert.match(bar, /Restart/);
  assert.match(bar, /Another build/);
});

test('fullscreen is requested on the running view', async () => {
  let requested = null;
  const view = document.querySelector('#launcher-root .game-view');
  view.requestFullscreen = (options) => {
    requested = options ?? {};
    return Promise.resolve();
  };
  click('[data-action="fullscreen"]');
  await settle();
  assert.ok(requested !== null, 'requestFullscreen was called');
  assert.equal(requested.navigationUI, 'hide');
});

test('escape steps back to the build list, then closes and tears the frame down', async () => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.ok(document.querySelector('[data-mirror]'), 'back on the build list');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(launcher().hidden, true, 'closed');
  assert.equal(launcher().querySelectorAll('iframe').length, 0, 'frame removed from the DOM');
});

test('lookalike codes are ignored', async () => {
  const input = rowInputs()[0];
  for (const near of ['TWluZWNyYWZ0X', 'twlunewnyywz0', 'TWluZWNyYWZ0 1']) {
    type(input, near);
    await settle();
    assert.equal(launcher().hidden, true, `"${near}" must not unlock`);
  }
  type(input, '2x + 1');
  assert.equal(input.value, '2x + 1');
});

test('the launcher never mentions where the builds come from', () => {
  const text = launcher().textContent.toLowerCase();
  for (const word of ['iframe', 'third-party', 'third party', 'eaglercraft', 'http']) {
    assert.ok(!text.includes(word), `launcher copy should not mention "${word}"`);
  }
  assert.match(launcher().textContent, /nothing to install/);
});

test('the calculator still works after the detour', () => {
  const input = rowInputs()[0];
  type(input, 'sin(x) + 2x');
  assert.deepEqual(visibleErrorText(), [], 'valid expression shows no error');
  assert.equal(document.querySelector('#graph-canvas') !== null, true);
});

await summary('app smoke test');
