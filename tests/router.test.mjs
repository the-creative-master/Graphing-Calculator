import { test, summary, assert } from './harness.mjs';
import { parseRoute, parentPath } from '../src/router.js';

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

await summary('router');
