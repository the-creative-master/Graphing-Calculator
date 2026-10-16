/**
 * End-to-end smoke test for the UI.
 *
 * Uses tests/boot-app.mjs, which loads index.html in jsdom and runs the real
 * module sources (imports stripped) as one classic script. Tests run
 * sequentially and each one finishes what it starts.
 *
 * Covers: rendering, typing, the full-page play flow (routes, versions,
 * clients, running a build), the keyboard handoff to the build, and the
 * fullscreen path including the fallback when the API is unavailable.
 *
 * Run with: node tests/app.smoke.test.mjs
 */
import { test, summary, assert } from './harness.mjs';
import { bootApp } from './boot-app.mjs';

console.log('\napp smoke test (jsdom)');

const { window, document, errors, bootError, click, type, settle, wait } = await bootApp();

const rowInputs = () => [...document.querySelectorAll('.expr-row__input')];
const play = () => document.querySelector('#play-page');
const hash = () => window.location.hash;
const visibleErrorText = () =>
  [...document.querySelectorAll('.expr-row__error')].filter((el) => !el.hidden).map((el) => el.textContent);

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
  assert.ok(document.querySelector('#table-body').children.length >= 5, 'table filled');
});

test('the play page is a full page, not an overlay', () => {
  assert.ok(play(), 'play page element exists');
  assert.equal(play().hidden, true, 'hidden while on the calculator');
  assert.equal(document.querySelectorAll('.launcher, .launcher__backdrop, [data-close]').length, 0, 'no popup markup');
  assert.equal(play().tagName, 'MAIN', 'it is a page region');
  assert.equal(document.querySelector('#app').hidden, false);
});

/* ------------------------------------------------------------------ *
 * Typing on the calculator
 * ------------------------------------------------------------------ */

test('a bad formula surfaces a friendly error, a good one does not', () => {
  const input = rowInputs()[0];
  type(input, 'sin(');
  assert.equal(visibleErrorText().length, 1);
  type(input, 'sin(x)');
  assert.deepEqual(visibleErrorText(), []);
});

test('half-typed secrets do not flash a parse error', async () => {
  type(rowInputs()[0], 'Minecraft');
  await settle();
  assert.deepEqual(visibleErrorText(), []);
  assert.equal(hash(), '', 'and do not navigate yet');
});

/* ------------------------------------------------------------------ *
 * The secret code -> the play page
 * ------------------------------------------------------------------ */

test('the code navigates to a real page with a real URL', async () => {
  type(rowInputs()[0], 'MinecraftPls25-');
  await settle();
  assert.equal(hash(), '#/play', 'the URL changed');
  assert.equal(play().hidden, false, 'play page shown');
  assert.equal(document.querySelector('#app').hidden, true, 'calculator hidden');
  assert.ok(document.body.classList.contains('view-play'));
  assert.equal(rowInputs()[0].value, '', 'the code is cleared behind us');
  assert.deepEqual(visibleErrorText(), []);
});

test('the shelf lists versions and clients', () => {
  const sections = [...document.querySelectorAll('.shelf h2')].map((el) => el.textContent);
  assert.deepEqual(sections, ['Versions', 'Clients']);
  assert.deepEqual(
    [...document.querySelectorAll('[data-entry]')].map((el) => el.dataset.entry),
    ['1.8.8', '1.12.2', '1.9.4', '1.11.2', '1.14.4', '1.5.2', 'astra', 'resent'],
  );
  const text = play().textContent;
  for (const name of ['Astra Client', 'Resent Client', '1.5.2', 'EaglercraftPhi 1.9.4', 'EaglercraftZ 1.11.2', '1.14.4']) {
    assert.ok(text.includes(name), `${name} should be listed`);
  }
  assert.match(text, /nothing to install/);
});

test('a card navigates to that entry\u2019s builds (its own URL)', async () => {
  click('[data-entry="1.5.2"]');
  await settle();
  assert.equal(hash(), '#/play/1.5.2');
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['1.5.2::152-js-1', '1.5.2::152-js-2', '1.5.2::152-js-3', '1.5.2::152-wasm-1'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('.build-group__label .engine-tag')].map((el) => el.textContent),
    ['JS', 'WASM'],
  );
});

test('the browser back button works (hash history)', async () => {
  window.history.back();
  await settle(6);
  assert.equal(hash(), '#/play', 'back to the shelf');
  assert.deepEqual(
    [...document.querySelectorAll('[data-entry]')].map((el) => el.dataset.entry),
    ['1.8.8', '1.12.2', '1.9.4', '1.11.2', '1.14.4', '1.5.2', 'astra', 'resent'],
  );
  click('[data-entry="1.5.2"]');
  await settle();
});

test('opening a build puts it on screen with its own URL', async () => {
  click('[data-mirror="1.5.2::152-wasm-1"]');
  await settle();
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1');
  const frame = play().querySelector('iframe');
  assert.ok(frame, 'the build is mounted');
  assert.equal(frame.getAttribute('src'), 'https://gx-launcher.github.io/game/1.5.2-wasm/index.html');
  assert.match(frame.getAttribute('allow'), /fullscreen/);
  assert.match(play().querySelector('.game-hud').textContent, /1\.5\.2/);
});

test('the running build has fullscreen, restart and another-build controls', () => {
  const actions = [...play().querySelectorAll('.game-hud [data-action]')].map((el) => el.dataset.action);
  assert.deepEqual(actions, ['keyboard', 'fullscreen', 'restart', 'another']);
  const hud = play().querySelector('.game-hud').textContent;
  assert.match(hud, /Fullscreen/);
  assert.match(hud, /Restart/);
  assert.match(hud, /Another build/);
});

/* ------------------------------------------------------------------ *
 * Keyboard handoff (was stealing keys from the build)
 * ------------------------------------------------------------------ */

test('the build gets the keyboard as soon as it loads', async () => {
  let focuses = 0;
  const original = window.HTMLIFrameElement.prototype.focus;
  window.HTMLIFrameElement.prototype.focus = function focus() {
    focuses++;
    return original?.call?.(this);
  };
  play().querySelector('iframe').dispatchEvent(new window.Event('load'));
  await settle();
  window.HTMLIFrameElement.prototype.focus = original;

  assert.ok(focuses > 0, 'the frame was focused so it receives keystrokes');
  assert.match(play().querySelector('[data-keys]').textContent, /keyboard: game/);
  assert.ok(play().querySelector('[data-keys]').classList.contains('is-locked'));
});

test('K locks the keyboard to the game and back again', async () => {
  const keys = play().querySelector('[data-keys]');
  const press = (key) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

  click('[data-stage]'); // start from the game holding the keys
  await settle();
  assert.match(keys.textContent, /keyboard: game/, 'the game starts with the keys');

  press('k');
  await settle();
  assert.match(keys.textContent, /keyboard: page/, 'K releases the keyboard');
  assert.ok(!keys.classList.contains('is-locked'));

  // (In a real browser the page only hears this second press while it holds the
  // keys — which is exactly the state we are in. Once the game has them, its
  // own Esc/K handling takes over.)
  press('K');
  await settle();
  assert.match(keys.textContent, /keyboard: game/, 'K locks it back to the game');
  assert.ok(keys.classList.contains('is-locked'));
});

test('clicking the game locks the keyboard to it, clicking the page releases it', async () => {
  const keys = play().querySelector('[data-keys]');
  click('[data-stage]');
  await settle();
  assert.match(keys.textContent, /keyboard: game/, 'clicking the game gives it the keys');

  click('[data-keys]'); // the control bar chip is the click-to-release affordance
  await settle();
  assert.match(keys.textContent, /keyboard: page/, 'the chip hands them back');

  click('[data-action="restart"]');
  await settle();
  assert.match(keys.textContent, /keyboard: page/, 'a restart no longer steals them back mid-click');
});

test('gameplay keys are swallowed on the page instead of scrolling it', async () => {
  const keys = play().querySelector('[data-keys]');
  if (!/keyboard: page/.test(keys.textContent)) click('[data-keys]');
  await settle();
  assert.match(keys.textContent, /keyboard: page/, 'page has the keys');

  let defaultPrevented = 0;
  const original = window.KeyboardEvent.prototype.preventDefault;
  window.KeyboardEvent.prototype.preventDefault = function preventDefault() {
    defaultPrevented++;
    return original?.call?.(this);
  };
  for (const key of ['w', 'a', 's', 'd', ' ', 'ArrowUp']) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  window.KeyboardEvent.prototype.preventDefault = original;

  assert.ok(defaultPrevented >= 6, `gameplay keys should be swallowed (${defaultPrevented})`);
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1', 'and must not navigate');
  const toast = play().querySelector('[data-focus-toast]');
  assert.equal(toast.hidden, false, 'the player is told where their keys should go');
  assert.match(toast.textContent, /press K/i);

  click('[data-stage]');
  await settle();
  assert.equal(toast.hidden, true, 'and it goes away once the game has the keys');
});

/* ------------------------------------------------------------------ *
 * Fullscreen: mocked, not requested
 * ------------------------------------------------------------------ */

test('Fullscreen fills the window and requests nothing from the browser', async () => {
  let asked = 0;
  play().requestFullscreen = () => {
    asked++;
    return Promise.resolve();
  };
  assert.equal(document.body.classList.contains('is-immersive'), false, 'starts windowed');

  click('[data-action="fullscreen"]');
  await settle();
  assert.equal(document.body.classList.contains('is-immersive'), true, 'the view fills the window');
  assert.ok(play().classList.contains('is-immersive'));
  assert.equal(play().querySelector('[data-action="fullscreen"]').textContent, 'Exit fullscreen');
  assert.equal(asked, 0, 'the Fullscreen API is never used any more');
});

test('the controls get out of the way after a second — and come back on movement', async () => {
  const hidden = () => play().classList.contains('is-hud-hidden');

  // entering fullscreen shows the controls immediately
  assert.equal(hidden(), false, 'controls are visible the moment you go fullscreen');

  await wait(1200);
  assert.equal(hidden(), true, 'after a second of stillness they fade away');

  // any mouse movement brings them back, then they fade again
  document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true }));
  assert.equal(hidden(), false, 'moving the pointer brings them back');
  await wait(1200);
  assert.equal(hidden(), true, 'and they fade again');

  // while hidden, the way out is still there: Esc works, and moving the mouse shows the button
  document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true }));
  await settle();
  assert.ok(play().querySelector('[data-action="fullscreen"]'), 'the exit button is present');
});

test('Esc shrinks it back to the windowed view', async () => {
  assert.equal(document.body.classList.contains('is-immersive'), true, 'starting full');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(document.body.classList.contains('is-immersive'), false, 'Esc leaves fullscreen');
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1', 'and stays on the build');
  assert.equal(play().querySelector('[data-action="fullscreen"]').textContent, 'Fullscreen');
  assert.equal(play().classList.contains('is-hud-hidden'), false, 'and the controls are back for good');
});

test('Esc goes back only when it is not fullscreen, and never while the game has the keys', async () => {
  // windowed + page keys -> Esc navigates up
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(hash(), '#/play/1.5.2', 'Esc left the build');

  click('[data-mirror="1.5.2::152-wasm-1"]');
  await settle();
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1', 'back on the build');

  // now the game has the keys: the page must not act on Esc at all
  click('[data-stage]');
  await settle();
  assert.match(play().querySelector('[data-keys]').textContent, /keyboard: game/);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1', 'Esc belongs to the game now');
});

/* ------------------------------------------------------------------ *
 * Clients
 * ------------------------------------------------------------------ */

test('Astra Client lists two JS builds and three WASM builds', async () => {
  click('[data-action="back"]'); // game -> builds
  await settle();
  click('[data-action="back"]'); // builds -> shelf
  await settle();
  click('[data-entry="astra"]');
  await settle();
  assert.equal(hash(), '#/play/astra');
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['astra::astra-js-1', 'astra::astra-js-2', 'astra::astra-wasm-1', 'astra::astra-wasm-2', 'astra::astra-wasm-3'],
  );
});

test('Resent Client shows three mirrors and warns that mirror 3 is older', async () => {
  click('[data-action="back"]'); // back to the shelf
  await settle();
  click('[data-entry="resent"]');
  await settle();
  assert.equal(hash(), '#/play/resent');
  assert.equal(document.querySelectorAll('[data-mirror]').length, 3);
  assert.equal(document.querySelectorAll('.build-group').length, 1, 'no engine split for plain mirrors');

  const notes = [...document.querySelectorAll('.build-btn__note')];
  assert.equal(notes.length, 1, 'only mirror 3 carries a note');
  assert.ok(notes[0].classList.contains('is-warn'));
  assert.match(notes[0].textContent, /older version of Resent Client/i);
  assert.match(document.querySelector('[data-mirror="resent::resent-3"]').textContent, /older version/i);
});

test('a client build opens like any other', async () => {
  click('[data-mirror="resent::resent-3"]');
  await settle();
  assert.equal(hash(), '#/play/resent/resent-3');
  assert.equal(play().querySelector('iframe').getAttribute('src'), 'https://client.eaglercraft.win/eagler-files/1.8/resent4.0/index.html');
});

/* ------------------------------------------------------------------ *
 * Back to the calculator
 * ------------------------------------------------------------------ */

test('the back-to-calculator button restores the graph untouched', async () => {
  type(rowInputs()[0], 'x^2 - 3'); // something to come back to
  click('[data-action="calculator"]');
  await settle();
  assert.equal(play().hidden, true);
  assert.equal(document.querySelector('#app').hidden, false);
  assert.equal(document.body.classList.contains('view-play'), false);
  assert.equal(rowInputs()[0].value, 'x^2 - 3', 'formula survived the trip');
  assert.deepEqual(visibleErrorText(), []);
});

test('the launcher never mentions where the builds come from', () => {
  const text = document.querySelector('#play-page').textContent.toLowerCase();
  for (const word of ['iframe', 'third-party', 'third party', 'http:', 'embed', 'mirror url']) {
    assert.ok(!text.includes(word), `play page copy should not mention "${word}"`);
  }
});

test('the calculator still works after the detour', () => {
  const input = rowInputs()[0];
  type(input, 'sin(x) + 2x');
  assert.deepEqual(visibleErrorText(), []);
});

await summary('app smoke test');
