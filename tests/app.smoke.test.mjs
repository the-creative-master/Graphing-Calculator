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

const { window, document, errors, bootError, click, type, settle } = await bootApp();

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
  type(rowInputs()[0], 'TWlu');
  await settle();
  assert.deepEqual(visibleErrorText(), []);
  assert.equal(hash(), '', 'and do not navigate yet');
});

/* ------------------------------------------------------------------ *
 * The secret code -> the play page
 * ------------------------------------------------------------------ */

test('the code navigates to a real page with a real URL', async () => {
  type(rowInputs()[0], 'TWluZWNyYWZ0');
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
    ['1.8.8', '1.12.2', '1.5.2', 'astra', 'resent'],
  );
  const text = play().textContent;
  for (const name of ['Astra Client', 'Resent Client', '1.5.2']) {
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
    ['1.8.8', '1.12.2', '1.5.2', 'astra', 'resent'],
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
  assert.deepEqual(actions, ['fullscreen', 'restart', 'another']);
  const hud = play().querySelector('.game-hud').textContent;
  assert.match(hud, /Fullscreen/);
  assert.match(hud, /Restart/);
  assert.match(hud, /Another build/);
});

/* ------------------------------------------------------------------ *
 * Keyboard handoff (was stealing keys from the build)
 * ------------------------------------------------------------------ */

test('the build is focused as soon as it loads', async () => {
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
  assert.match(play().querySelector('[data-keys]').textContent, /keys → build/);
});

test('no single-letter shortcut is stolen from the build', async () => {
  let fullscreenRequests = 0;
  play().requestFullscreen = () => {
    fullscreenRequests++;
    return Promise.resolve();
  };
  for (const key of ['f', 'F', 'w', 'a', 's', 'd', 'e', 'q', 't']) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  }
  await settle();
  assert.equal(fullscreenRequests, 0, '"f" must not toggle fullscreen any more');
  assert.equal(play().hidden, false, 'and nothing navigated away');
});

test('typing on the page nudges you to click the game', async () => {
  // hand focus to the build first: that is the normal state
  click('[data-stage]');
  await settle();
  const toast = play().querySelector('[data-focus-toast]');
  const chip = play().querySelector('[data-keys]');
  assert.ok(toast, 'hint element exists');
  assert.equal(toast.hidden, true, 'nothing to say while the build has the keys');
  assert.ok(!chip.classList.contains('is-warn'), 'chip shows the keys reach the build');

  // now the page gets a keystroke, which means the build does NOT have focus
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true }));
  assert.equal(toast.hidden, false, 'explains where the keystrokes are going');
  assert.match(toast.textContent, /click the game/i);
  assert.ok(chip.classList.contains('is-warn'), 'keyboard chip warns too');

  click('[data-stage]');
  await settle();
  assert.equal(toast.hidden, true, 'clicking the game hands the keys over');
  assert.ok(!chip.classList.contains('is-warn'));
});

/* ------------------------------------------------------------------ *
 * Fullscreen, including the fallback
 * ------------------------------------------------------------------ */

test('fullscreen uses the API when it is available', async () => {
  let requested = null;
  play().requestFullscreen = (options) => {
    requested = options ?? {};
    // pretend the browser accepted and entered fullscreen
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => play() });
    document.dispatchEvent(new window.Event('fullscreenchange'));
    return Promise.resolve();
  };
  click('[data-action="fullscreen"]');
  await settle();
  assert.ok(requested !== null, 'requestFullscreen was called');
  assert.equal(requested.navigationUI, 'hide');
  assert.equal(play().querySelector('[data-action="fullscreen"]').textContent, 'Exit fullscreen');
  assert.ok(play().querySelector('[data-action="fullscreen"]').getAttribute('aria-pressed') === 'true');
});

test('when the API is refused it falls back to immersive and says why', async () => {
  // leaving fullscreen first
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  document.dispatchEvent(new window.Event('fullscreenchange'));
  await settle();

  play().requestFullscreen = () => Promise.reject(new window.DOMException('denied', 'NotAllowedError'));
  let notice = null;
  // the notice surfaces through the page's toast hook
  click('[data-action="fullscreen"]');
  await settle();
  const toast = document.querySelector('#toast');
  notice = toast.textContent;
  assert.equal(document.body.classList.contains('is-immersive'), true, 'fills the window instead');
  assert.match(notice, /blocked|fullscreen/i, `expected an explanation, got "${notice}"`);
  assert.equal(play().querySelector('[data-action="fullscreen"]').textContent, 'Exit fullscreen');

  click('[data-action="fullscreen"]');
  await settle();
  assert.equal(document.body.classList.contains('is-immersive'), false, 'toggles back off');
  assert.equal(play().querySelector('[data-action="fullscreen"]').textContent, 'Fullscreen');
});

test('escape leaves immersive mode before it navigates away', async () => {
  // set up its own state: the API is refused here, so we land in immersive mode
  play().requestFullscreen = () => Promise.reject(new window.DOMException('denied', 'NotAllowedError'));
  click('[data-action="fullscreen"]');
  await settle();
  assert.equal(document.body.classList.contains('is-immersive'), true, 'starting immersive');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(document.body.classList.contains('is-immersive'), false, 'immersive off');
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1', 'still on the build');

  // a second escape now walks up the stack
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  assert.equal(hash(), '#/play/1.5.2', 'back on the build list');

  // and forward again for the remaining tests
  click('[data-mirror="1.5.2::152-wasm-1"]');
  await settle();
  assert.equal(hash(), '#/play/1.5.2/152-wasm-1');
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
  for (const word of ['iframe', 'third-party', 'third party', 'eaglercraft', 'http:', 'eagler']) {
    assert.ok(!text.includes(word), `play page copy should not mention "${word}"`);
  }
});

test('the calculator still works after the detour', () => {
  const input = rowInputs()[0];
  type(input, 'sin(x) + 2x');
  assert.deepEqual(visibleErrorText(), []);
});

await summary('app smoke test');
