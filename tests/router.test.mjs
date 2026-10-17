import { test, summary, assert } from './harness.mjs';
import { parseRoute, parentPath, Router } from '../src/router.js';

console.log('\nrouter');

test('the calculator is the default route', () => {
  for (const hash of ['', '#', '#/', '#/whatever']) {
    assert.equal(parseRoute(hash).view, 'calculator', `"${hash}"`);
  }
});

test('the play page is a real URL', () => {
  assert.deepEqual(parseRoute('#/play'), { view: 'catalog', path: '/play', key: 'catalog' });
  assert.equal(parseRoute('#/play/').view, 'catalog');
});

test('builds and running builds have their own URLs', () => {
  const builds = parseRoute('#/play/1.8.8');
  assert.equal(builds.view, 'builds');
  assert.equal(builds.entryId, '1.8.8');
  assert.equal(builds.path, '/play/1.8.8');

  const game = parseRoute('#/play/1.8.8/188-js-2');
  assert.equal(game.view, 'game');
  assert.equal(game.entryId, '1.8.8');
  assert.equal(game.mirrorId, '188-js-2');
  assert.equal(game.key, 'game:1.8.8:188-js-2');
});

test('client ids route just like versions', () => {
  assert.equal(parseRoute('#/play/astra').entryId, 'astra');
  assert.equal(parseRoute('#/play/resent/resent-3').mirrorId, 'resent-3');
});

test('paths are decoded', () => {
  assert.equal(parseRoute('#/play/1.5.2/152-wasm-1').mirrorId, '152-wasm-1');
  assert.equal(parseRoute('#/play/Astra%20Client').entryId, 'Astra Client');
});

test('every route knows its parent, so back is predictable', () => {
  assert.equal(parentPath(parseRoute('#/play/1.8.8/188-js-1')), '/play/1.8.8');
  assert.equal(parentPath(parseRoute('#/play/1.8.8')), '/play');
  assert.equal(parentPath(parseRoute('#/play')), '/');
  assert.equal(parentPath(parseRoute('#/')), null, 'the calculator is the root');
});

/**
 * A stand-in for the browser window, where the hash can be moved without the
 * browser ever delivering a hashchange event — which is what an embedded page
 * can see, and what made a secret code seem to need typing twice.
 */
function fakeWindow({ refuse = false } = {}) {
  let hash = '';
  const listeners = new Map();
  return {
    location: {
      get hash() {
        return hash;
      },
      set hash(value) {
        if (refuse) throw new Error('the page refused');
        hash = value;
      },
    },
    history: {
      replaceState(_state, _title, value) {
        if (refuse) throw new Error('the page refused');
        hash = value;
      },
    },
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener() {},
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

test('navigating draws the page itself, without waiting for a hashchange', () => {
  const win = fakeWindow(); // no event will ever arrive
  const seen = [];
  const router = new Router({ window: win, onChange: (route) => seen.push(route.view) });
  router.start();

  router.navigate('/play');
  assert.deepEqual(seen, ['calculator', 'catalog'], 'the page is drawn on the spot');
  assert.equal(win.location.hash, '#/play', 'and the URL really moved');
  assert.equal(router.route.view, 'catalog', 'the router knows where it is');
});

test('the same route is never drawn twice', () => {
  const win = fakeWindow();
  const seen = [];
  const router = new Router({ window: win, onChange: (route) => seen.push(route.view) });
  router.start();

  router.navigate('/play');
  router.navigate('/play');
  win.fire('hashchange'); // the browser gets there in the end
  win.fire('hashchange');
  assert.deepEqual(seen, ['calculator', 'catalog'], 'no duplicate work');

  router.navigate('/play/1.8.8');
  assert.deepEqual(seen, ['calculator', 'catalog', 'builds'], 'a new route still draws');
});

test('a refused URL still changes the page', () => {
  const win = fakeWindow({ refuse: true });
  const seen = [];
  const router = new Router({ window: win, onChange: (route) => seen.push(route.view) });
  router.start();

  router.navigate('/play');
  assert.deepEqual(seen, ['calculator', 'catalog'], 'the page changes even if the URL cannot');
  assert.equal(router.route.view, 'catalog');
});

test('a failed render is not remembered as done', () => {
  const win = fakeWindow();
  let attempts = 0;
  const router = new Router({
    window: win,
    onChange: (route) => {
      if (route.view !== 'catalog') return; // the boot render is not the one under test
      attempts++;
      if (attempts === 1) throw new Error('boom');
    },
  });
  router.start();

  assert.throws(() => router.navigate('/play'), /boom/, 'the first attempt failed');
  router.navigate('/play'); // the retry, e.g. the next keystroke
  assert.equal(attempts, 2, 'and the retry was allowed through');
});

test('stepping back goes through the same drawing path', () => {
  const win = fakeWindow();
  const seen = [];
  const router = new Router({ window: win, onChange: (route) => seen.push(route.view) });
  router.start();

  router.navigate('/play/1.8.8/188-js-1');
  assert.equal(router.back(), true);
  assert.deepEqual(seen, ['calculator', 'game', 'builds']);
  assert.equal(win.location.hash, '#/play/1.8.8');
});

await summary('router');
