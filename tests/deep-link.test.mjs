/**
 * A build URL should open the build — the whole point of the play page being a
 * page instead of a popup. These boot the app with a hash already in the URL.
 */
import { test, summary, assert } from './harness.mjs';
import { bootApp } from './boot-app.mjs';

console.log('\ndeep links');

const at = async (hash) => {
  const app = await bootApp({ url: `http://localhost:3000/${hash}` });
  await app.settle();
  return app;
};

const text = (document, selector) => (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

test('opening a build URL starts on that build', async () => {
  const { document, bootError } = await at('#/play/1.8.8/188-js-2');
  assert.equal(bootError, null, bootError ? String(bootError) : '');
  assert.equal(document.querySelector('#app').hidden, true, 'calculator stays out of the way');
  const frame = document.querySelector('.game-stage iframe');
  assert.ok(frame, 'the build is mounted straight away');
  assert.equal(frame.getAttribute('src'), 'https://yee.pages.dev/#/MS44anM');
  assert.match(text(document, '.play__crumbs'), /1\.8\.8/);
});

test('opening a client build URL works too', async () => {
  const { document } = await at('#/play/astra/astra-wasm-2');
  const frame = document.querySelector('.game-stage iframe');
  assert.equal(frame.getAttribute('src'), 'https://client.eaglercraft.win/eagler-files/wasm/1.8/AstraClient/index.html');
});

test('opening the shelf URL lists everything', async () => {
  const { document } = await at('#/play');
  assert.deepEqual(
    [...document.querySelectorAll('[data-entry]')].map((el) => el.dataset.entry),
    ['1.8.8', '1.5.2', '1.9.4', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', 'astra', 'resent', 'ayuncraft', 'precision', 'reflex'],
  );
  assert.equal(document.querySelectorAll('.game-stage').length, 0, 'nothing is running yet');
});

test('opening a builds URL lists just that entry', async () => {
  const { document } = await at('#/play/1.5.2');
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['1.5.2::152-js-1', '1.5.2::152-js-2', '1.5.2::152-js-3', '1.5.2::152-wasm-1'],
  );
});

test('1.14.4 splits its builds into JS and WASM', async () => {
  const { document } = await at('#/play/1.14.4');
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['1.14.4::1144-js-1', '1.14.4::1144-wasm-1', '1.14.4::1144-wasm-2'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('.build-group__label .engine-tag')].map((el) => el.textContent),
    ['JS', 'WASM'],
  );
});

test('1.13.2, 1.15.2 and 1.16.5 expose their builds', async () => {
  const expected = {
    '1.13.2': ['1.13.2::1132-js-1', '1.13.2::1132-js-2', '1.13.2::1132-wasm-1'],
    '1.15.2': ['1.15.2::1152-js-1', '1.15.2::1152-wasm-1'],
    '1.16.5': ['1.16.5::1165-js-1', '1.16.5::1165-wasm-1', '1.16.5::1165-wasm-2'],
  };
  for (const [id, mirrors] of Object.entries(expected)) {
    const { document } = await at(`#/play/${id}`);
    assert.deepEqual(
      [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
      mirrors,
      id,
    );
  }
});

test('the 1.13.2 note explains that mirror 2 is 1.13.1 and not vanilla', async () => {
  const { document } = await at('#/play/1.13.2');
  const notes = [...document.querySelectorAll('.build-btn__note')];
  assert.equal(notes.length, 1);
  assert.match(notes[0].textContent, /1\.13\.1/);
  assert.match(notes[0].textContent, /not vanilla/i);
});

test('a single-mirror entry skips straight to running', async () => {
  const { document, window } = await at('#/play/1.11.2');
  const frame = document.querySelector('.game-stage iframe');
  assert.equal(window.location.hash, '#/play/1.11.2/1112-1', 'redirected to its only build');
  assert.ok(frame, 'and the build is mounted');
  assert.equal(frame.getAttribute('src'), 'https://gx-launcher-v1.github.io/1.11.2/index.html');
  assert.equal(document.querySelectorAll('[data-mirror]').length, 0, 'no picker was shown');
});

test('an entry with several mirrors still shows the picker', async () => {
  const { document } = await at('#/play/1.9.4');
  assert.deepEqual(
    [...document.querySelectorAll('[data-mirror]')].map((el) => el.dataset.mirror),
    ['1.9.4::194-1', '1.9.4::194-2'],
  );
});

test('the shelf card for a single-mirror entry plays immediately', async () => {
  const app = await at('#/play');
  app.click('[data-entry="1.11.2"]');
  await app.settle(); // the hash change renders on the next turn
  assert.equal(app.window.location.hash, '#/play/1.11.2/1112-1');
  assert.ok(app.document.querySelector('.game-stage iframe'), 'the build is mounted');
  assert.equal(app.document.querySelectorAll('[data-mirror]').length, 0, 'no picker in between');
});

test('Ayuncraft plays from its own URL without a picker', async () => {
  const app = await at('#/play/ayuncraft');
  await app.settle();
  assert.equal(app.window.location.hash, '#/play/ayuncraft/ayuncraft-1', 'it went straight to the build');
  assert.equal(
    app.document.querySelector('.game-stage iframe').getAttribute('src'),
    'https://gx-launcher-v1.github.io/Ayuncraft/index.html',
  );
});

test('the new clients open from their own URLs', async () => {
  const precision = await at('#/play/precision/precision-2');
  assert.equal(
    precision.document.querySelector('.game-stage iframe').getAttribute('src'),
    'https://playerepic76.github.io/PrecisionUnblocked/',
  );
  assert.match(precision.document.querySelector('.game-hud').textContent, /texture packs/i);

  const reflex = await at('#/play/reflex');
  await reflex.settle();
  assert.equal(reflex.window.location.hash, '#/play/reflex/reflex-1', 'its single build opens straight away');
  assert.equal(
    reflex.document.querySelector('.game-stage iframe').getAttribute('src'),
    'https://gx-launcher.github.io/game/Reflex%20Client/index.html',
  );
});

test('a nonsense URL falls back instead of breaking', async () => {
  const shelf = await at('#/play/not-a-thing');
  assert.ok(shelf.document.querySelector('[data-entry]'), 'unknown entry lands on the shelf');

  const build = await at('#/play/1.8.8/not-a-build');
  assert.ok(build.document.querySelector('[data-mirror]'), 'unknown build lands on the build list');
  assert.equal(build.document.querySelectorAll('.game-stage').length, 0, 'and nothing is mounted');
});

test('the plain calculator URL still shows the calculator', async () => {
  const { document } = await at('');
  assert.equal(document.querySelector('#app').hidden, false);
  assert.equal(document.querySelector('#play-page').hidden, true);
  assert.equal(document.querySelector('.expr-row__input').value, 'sin(x)');
});

await summary('deep links');
