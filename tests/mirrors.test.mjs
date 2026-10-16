import { test, summary, assert } from './harness.mjs';
import { VERSIONS, MIRROR_INDEX, VERSION_INDEX, groupMirrors, countMirrors } from '../src/mirrors.js';

console.log('\nmirror registry');

const all = VERSIONS.flatMap((version) => version.mirrors.map((mirror) => ({ version, mirror })));

/** Expected shape of each version: how many JS and WASM builds it offers. */
const EXPECTED = {
  '1.8.8': { js: 3, wasm: 3 },
  '1.12.2': { js: 3, wasm: 3 },
  '1.5.2': { js: 3, wasm: 1 }, // 1.5.2 WASM ships a single build
};

test('three versions are registered', () => {
  assert.deepEqual(
    VERSIONS.map((v) => v.id),
    ['1.8.8', '1.12.2', '1.5.2'],
  );
  assert.equal(countMirrors(), 16);
});

test('each version has the expected JS / WASM builds, in order', () => {
  for (const version of VERSIONS) {
    const groups = groupMirrors(version);
    assert.equal(groups.length, 2, `${version.id} should have two engine groups`);
    assert.equal(groups[0].engine, 'JS', `${version.id} lists JS first`);
    assert.equal(groups[1].engine, 'WASM');
    assert.equal(groups[0].mirrors.length, EXPECTED[version.id].js, `${version.id} JS builds`);
    assert.equal(groups[1].mirrors.length, EXPECTED[version.id].wasm, `${version.id} WASM builds`);
  }
});

test('mirror urls are absolute https and unique', () => {
  const seen = new Set();
  for (const { mirror } of all) {
    assert.equal(new URL(mirror.url).protocol, 'https:', mirror.url);
    assert.ok(!seen.has(mirror.url), `duplicate url ${mirror.url}`);
    seen.add(mirror.url);
    assert.match(mirror.allow, /fullscreen/, `${mirror.id} should allow fullscreen`);
  }
});

test('ids are unique across the registry', () => {
  const ids = all.map(({ mirror }) => mirror.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(MIRROR_INDEX.size, ids.length);
  assert.equal(VERSION_INDEX.size, VERSIONS.length);
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
  for (const mirror of VERSION_INDEX.get('1.8.8').mirrors) {
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
  for (const mirror of VERSION_INDEX.get('1.12.2').mirrors) {
    assert.equal(mirror.url, expected[mirror.label], `${mirror.label} url`);
  }
});

test('1.5.2 follows the pattern, with a single WASM build', () => {
  const version = VERSION_INDEX.get('1.5.2');
  const expected = {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.5.2/index.html',
    'JS Mirror 2': 'https://yee.pages.dev/#/MS41',
    'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.5.2/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.5.2-wasm/index.html',
  };
  assert.equal(version.mirrors.length, 4, '3 JS + 1 WASM');
  for (const mirror of version.mirrors) {
    assert.equal(mirror.url, expected[mirror.label], `${mirror.label} url`);
  }
  const wasm = version.mirrors.filter((m) => m.engine === 'WASM');
  assert.equal(wasm.length, 1, '1.5.2 WASM has no mirror 2 or 3');
  assert.equal(wasm[0].label, 'WASM Mirror 1');
});

await summary('mirror registry');
