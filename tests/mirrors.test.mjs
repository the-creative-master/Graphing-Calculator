import { test, summary, assert } from './harness.mjs';
import { VERSIONS, MIRROR_INDEX, VERSION_INDEX, groupMirrors, countMirrors } from '../src/mirrors.js';

console.log('\nmirror registry');

const all = VERSIONS.flatMap((version) => version.mirrors.map((mirror) => ({ version, mirror })));

test('two versions are registered', () => {
  assert.deepEqual(
    VERSIONS.map((v) => v.id),
    ['1.8.8', '1.12.2'],
  );
  assert.equal(countMirrors(), 12);
});

test('every version has 3 JS + 3 WASM mirrors', () => {
  for (const version of VERSIONS) {
    const groups = groupMirrors(version);
    assert.equal(groups.length, 2, `${version.id} should have two engine groups`);
    assert.equal(groups[0].engine, 'JS');
    assert.equal(groups[1].engine, 'WASM');
    assert.equal(groups[0].mirrors.length, 3, `${version.id} JS mirrors`);
    assert.equal(groups[1].mirrors.length, 3, `${version.id} WASM mirrors`);
  }
});

test('mirror urls are absolute https and unique', () => {
  const seen = new Set();
  for (const { mirror } of all) {
    const url = new URL(mirror.url);
    assert.equal(url.protocol, 'https:', mirror.url);
    assert.ok(!seen.has(mirror.url), `duplicate url ${mirror.url}`);
    seen.add(mirror.url);
    assert.ok(mirror.allow.includes('fullscreen'), `${mirror.id} should allow fullscreen`);
  }
});

test('ids are unique across the registry', () => {
  const ids = all.map(({ mirror }) => mirror.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(MIRROR_INDEX.size, ids.length);
});

test('1.8.8 urls match the specification', () => {
  const expected = {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.8.8/index.html',
    'JS Mirror 2': 'https://yee.pages.dev/#/MS44anM',
    'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.8.8/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.8.8-wasm/index.html',
    'WASM Mirror 2': 'https://yee.pages.dev/#/MS44d2FzbQ',
    'WASM Mirror 3': 'https://gx-launcher-v1.github.io/1.8.8-wasm/index.html',
  };
  const version = VERSION_INDEX.get('1.8.8');
  for (const mirror of version.mirrors) {
    assert.equal(mirror.url, expected[mirror.label], `${mirror.label} url`);
  }
});

test('1.12.2 urls follow the same pattern', () => {
  const expected = {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.12.2/index.html',
    'JS Mirror 2': 'https://yee.pages.dev/#/MS4xMmpz',
    'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.12.2/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.12.2-wasm/index.html',
    'WASM Mirror 2': 'https://yee.pages.dev/#/MS4xMndhc20',
    'WASM Mirror 3': 'https://gx-launcher-v1.github.io/1.12.2-wasm/index.html',
  };
  const version = VERSION_INDEX.get('1.12.2');
  for (const mirror of version.mirrors) {
    assert.equal(mirror.url, expected[mirror.label], `${mirror.label} url`);
  }
});

await summary('mirror registry');
