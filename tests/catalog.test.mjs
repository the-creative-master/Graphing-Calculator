import { test, summary, assert } from './harness.mjs';
import {
  CATALOG,
  VERSIONS,
  CLIENTS,
  MIRROR_INDEX,
  ENTRY_INDEX,
  groupMirrors,
  countBuilds,
  engineCounts,
  entryPath,
  mirrorPath,
  isDirectPlay,
} from '../src/catalog.js';

console.log('\ncatalog');

const all = CATALOG.flatMap((entry) => entry.mirrors.map((mirror) => ({ entry, mirror })));
const urlsOf = (entry) => Object.fromEntries(entry.mirrors.map((mirror) => [mirror.label, mirror.url]));
const jsCount = (entry) => entry.mirrors.filter((m) => m.engine === 'JS').length;
const wasmCount = (entry) => entry.mirrors.filter((m) => m.engine === 'WASM').length;

test('nine versions and five clients are on the shelf', () => {
  assert.deepEqual(
    VERSIONS.map((v) => v.id),
    ['1.8.8', '1.5.2', '1.9.4', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5'],
  );
  assert.deepEqual(
    CLIENTS.map((c) => c.id),
    ['astra', 'resent', 'ayuncraft', 'precision', 'reflex'],
  );
  assert.deepEqual(
    CATALOG.map((entry) => entry.id),
    ['1.8.8', '1.5.2', '1.9.4', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', 'astra', 'resent', 'ayuncraft', 'precision', 'reflex'],
  );
  assert.equal(countBuilds(), 42, '30 version builds + 12 client builds');
});

test('entries are tagged by kind so the page can section them', () => {
  assert.ok(VERSIONS.every((v) => v.kind === 'version'));
  assert.ok(CLIENTS.every((c) => c.kind === 'client'));
});

test('every build URL is absolute https and unique', () => {
  const seen = new Set();
  for (const { mirror } of all) {
    assert.equal(new URL(mirror.url).protocol, 'https:', mirror.url);
    assert.ok(!seen.has(mirror.url), `duplicate url ${mirror.url}`);
    seen.add(mirror.url);
    assert.match(mirror.allow, /fullscreen/, `${mirror.id} should allow fullscreen`);
  }
});

test('ids are unique across the whole catalog', () => {
  const entryIds = CATALOG.map((entry) => entry.id);
  assert.equal(new Set(entryIds).size, entryIds.length);
  assert.equal(ENTRY_INDEX.size, entryIds.length);

  const mirrorIds = all.map(({ mirror }) => mirror.id);
  assert.equal(new Set(mirrorIds).size, mirrorIds.length);
  assert.equal(MIRROR_INDEX.size, mirrorIds.length);

  // and the compound keys resolve to the right pair
  const { entry, mirror } = MIRROR_INDEX.get('astra::astra-wasm-2');
  assert.equal(entry.id, 'astra');
  assert.equal(mirror.label, 'WASM Mirror 2');
});

test('versions keep the documented URL pattern', () => {
  const expected = {
    '1.8.8': {
      'JS Mirror 1': 'https://gx-launcher.github.io/game/1.8.8/index.html',
      'JS Mirror 2': 'https://yee.pages.dev/#/MS44anM',
      'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.8.8/index.html',
      'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.8.8-wasm/index.html',
      'WASM Mirror 2': 'https://yee.pages.dev/#/MS44d2FzbQ',
      'WASM Mirror 3': 'https://gx-launcher-v1.github.io/1.8.8-wasm/index.html',
    },
    '1.12.2': {
      'JS Mirror 1': 'https://gx-launcher.github.io/game/1.12.2/index.html',
      'JS Mirror 2': 'https://yee.pages.dev/#/MS4xMmpz',
      'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.12.2/index.html',
      'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.12.2-wasm/index.html',
      'WASM Mirror 2': 'https://yee.pages.dev/#/MS4xMndhc20',
      'WASM Mirror 3': 'https://gx-launcher-v1.github.io/1.12.2-wasm/index.html',
    },
  };
  for (const [id, urls] of Object.entries(expected)) {
    assert.deepEqual(urlsOf(ENTRY_INDEX.get(id)), urls, id);
  }
});

test('1.5.2 keeps its single WASM build', () => {
  const version = ENTRY_INDEX.get('1.5.2');
  assert.deepEqual(urlsOf(version), {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.5.2/index.html',
    'JS Mirror 2': 'https://yee.pages.dev/#/MS41',
    'JS Mirror 3': 'https://gx-launcher-v1.github.io/1.5.2/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.5.2-wasm/index.html',
  });
  assert.equal(wasmCount(version), 1, 'no WASM mirror 2 or 3 for 1.5.2');
});

test('EaglercraftPhi 1.9.4 has its two mirrors', () => {
  const version = ENTRY_INDEX.get('1.9.4');
  assert.equal(version.name, 'EaglercraftPhi 1.9.4');
  assert.deepEqual(urlsOf(version), {
    'Mirror 1': 'https://gx-launcher-v1.github.io/1.9.4/index.html',
    'Mirror 2': 'https://d3vtoo1s.github.io/Eaglercraft-1.9.4/clients/Eaglercraft.html',
  });
  assert.equal(isDirectPlay(version), false, 'two mirrors => still worth a menu');
  const groups = groupMirrors(version);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'any', 'no engine split for plain mirrors');
});

test('EaglercraftZ 1.11.2 has a single mirror and skips the picker', () => {
  const version = ENTRY_INDEX.get('1.11.2');
  assert.equal(version.name, 'EaglercraftZ 1.11.2');
  assert.deepEqual(urlsOf(version), {
    'Mirror 1': 'https://gx-launcher-v1.github.io/1.11.2/index.html',
  });
  assert.equal(isDirectPlay(version), true, 'one mirror => open it straight away');
  assert.equal(mirrorPath(version, version.mirrors[0]), '/play/1.11.2/1112-1');
});

test('isDirectPlay is true for exactly the single-build entries', () => {
  const direct = CATALOG.filter(isDirectPlay).map((entry) => entry.id);
  assert.deepEqual(direct, ['1.11.2', 'ayuncraft', 'reflex']);
});

test('Ayuncraft has its one build and plays straight away', () => {
  const client = ENTRY_INDEX.get('ayuncraft');
  assert.equal(client.kind, 'client');
  assert.equal(client.name, 'Ayuncraft');
  assert.deepEqual(urlsOf(client), {
    'Mirror 1': 'https://gx-launcher-v1.github.io/Ayuncraft/index.html',
  });
  assert.equal(isDirectPlay(client), true, 'nothing to choose');
  assert.equal(mirrorPath(client, client.mirrors[0]), '/play/ayuncraft/ayuncraft-1');
  assert.equal(groupMirrors(client).length, 1, 'no engine split for a plain mirror');
});

test('1.13.2 has two JS builds and one WASM build', () => {
  const version = ENTRY_INDEX.get('1.13.2');
  assert.deepEqual(urlsOf(version), {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.13.2/index.html',
    'JS Mirror 2': 'https://userarham.github.io/1.13.1-Eaglercraft-UNFORKED/',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.13.2-wasm/index.html',
  });
  assert.deepEqual(groupMirrors(version).map((g) => g.key), ['js', 'wasm']);
});

test('the 1.13.2 second mirror carries an honest note', () => {
  const mirror = ENTRY_INDEX.get('1.13.2').mirrors.find((m) => m.id === '1132-js-2');
  assert.match(mirror.note, /1\.13\.1/);
  assert.match(mirror.note, /not vanilla/i);
  assert.notEqual(mirror.warn, true, 'it is a note, not a warning');
});

test('1.15.2 offers one JS build and one WASM build', () => {
  const version = ENTRY_INDEX.get('1.15.2');
  assert.deepEqual(urlsOf(version), {
    'JS Mirror 1': 'https://eaglercraft.vip/clients/1.15/JS/vanilla/',
    'WASM Mirror 1': 'https://eaglercraft.vip/clients/1.15/WASM/vanilla/',
  });
  assert.deepEqual(groupMirrors(version).map((g) => g.key), ['js', 'wasm']);
  assert.equal(isDirectPlay(version), false, 'two builds is still a choice');
});

test('1.16.5 has one JS build and two WASM builds', () => {
  const version = ENTRY_INDEX.get('1.16.5');
  assert.deepEqual(urlsOf(version), {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.16.5/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.16.5-wasm/index.html',
    'WASM Mirror 2':
      'https://10aoi21.github.io/Eaglercraft-1.16.5-Fixed-Version/eaglercraft-1.16.5-u3-Fixed.html',
  });
  assert.equal(wasmCount(version), 2);
});

test('every version reads in ascending order (after the popular one)', () => {
  const parse = (id) => id.split('.').map(Number);
  const ids = VERSIONS.slice(1).map((version) => version.id);
  for (let i = 0; i < ids.length - 1; i++) {
    const [a, b] = [parse(ids[i]), parse(ids[i + 1])];
    const ascending = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    assert.ok(ascending, `${ids[i]} should come before ${ids[i + 1]}`);
  }
  assert.equal(VERSIONS[0].badge, 'Popular', 'the one everybody looks for leads');
});

test('1.14.4 has one JS build and two WASM builds', () => {
  const version = ENTRY_INDEX.get('1.14.4');
  assert.deepEqual(urlsOf(version), {
    'JS Mirror 1': 'https://gx-launcher.github.io/game/1.14.4/index.html',
    'WASM Mirror 1': 'https://gx-launcher.github.io/game/1.14.4-wasm/index.html',
    'WASM Mirror 2': 'https://eaglercraft-1-14-4-u4.vercel.app/',
  });
  assert.equal(jsCount(version), 1);
  assert.equal(wasmCount(version), 2);
  assert.deepEqual(groupMirrors(version).map((g) => g.key), ['js', 'wasm']);
  assert.equal(isDirectPlay(version), false, 'three builds means a picker');
});

test('Astra Client has two JS builds and three WASM builds', () => {
  const client = ENTRY_INDEX.get('astra');
  assert.deepEqual(urlsOf(client), {
    'JS Mirror 1': 'https://astraclientorg.github.io/play/js/18/',
    'JS Mirror 2': 'https://client.eaglercraft.win/eagler-files/1.8/AstraClient/index.html',
    'WASM Mirror 1': 'https://astraclientorg.github.io/play/wasm/18/',
    'WASM Mirror 2': 'https://client.eaglercraft.win/eagler-files/wasm/1.8/AstraClient/index.html',
    'WASM Mirror 3': 'https://gx-launcher-v1.github.io/Astra%20Client/index.html',
  });
  assert.equal(jsCount(client), 2);
  assert.equal(wasmCount(client), 3);
  assert.deepEqual(groupMirrors(client).map((g) => g.key), ['js', 'wasm']);
});

test('Resent Client has three plain mirrors, the last one flagged as older', () => {
  const client = ENTRY_INDEX.get('resent');
  assert.deepEqual(urlsOf(client), {
    'Mirror 1': 'https://gx-launcher-v1.github.io/Resent%20Client/index.html',
    'Mirror 2': 'https://gx-launcher.github.io/game/Resent%20Client/index.html',
    'Mirror 3': 'https://client.eaglercraft.win/eagler-files/1.8/resent4.0/index.html',
  });

  const older = client.mirrors[2];
  assert.equal(older.warn, true, 'mirror 3 should be flagged');
  assert.match(older.note, /older version of Resent Client/i);
  assert.equal(client.mirrors[0].warn, undefined);
  assert.equal(client.mirrors[1].warn, undefined);
});

test('Precision Client has two mirrors, the second with texture packs', () => {
  const client = ENTRY_INDEX.get('precision');
  assert.equal(client.name, 'Precision Client');
  assert.deepEqual(urlsOf(client), {
    'Mirror 1': 'https://gx-launcher.github.io/game/Precision%20Client/index.html',
    'Mirror 2': 'https://playerepic76.github.io/PrecisionUnblocked/',
  });

  const packs = client.mirrors[1];
  assert.match(packs.note, /texture packs/i);
  assert.notEqual(packs.warn, true, 'it is a nice thing to have, not a caution');
  assert.equal(client.mirrors[0].note, undefined, 'only the second mirror says so');
  assert.equal(isDirectPlay(client), false, 'two mirrors is still a choice');
});

test('Reflex Client has a single mirror and skips the picker', () => {
  const client = ENTRY_INDEX.get('reflex');
  assert.equal(client.name, 'Reflex Client');
  assert.deepEqual(urlsOf(client), {
    'Mirror 1': 'https://gx-launcher.github.io/game/Reflex%20Client/index.html',
  });
  assert.equal(isDirectPlay(client), true);
  assert.equal(mirrorPath(client, client.mirrors[0]), '/play/reflex/reflex-1');
});

test('builds without an engine group neutrally', () => {
  const groups = groupMirrors(ENTRY_INDEX.get('resent'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'any');
  assert.equal(groups[0].mirrors.length, 3);
});

test('engine counts drive the chips on each card', () => {
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('1.5.2')), { JS: 3, WASM: 1, other: 0 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('astra')), { JS: 2, WASM: 3, other: 0 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('resent')), { JS: 0, WASM: 0, other: 3 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('precision')), { JS: 0, WASM: 0, other: 2 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('reflex')), { JS: 0, WASM: 0, other: 1 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('1.9.4')), { JS: 0, WASM: 0, other: 2 });
  assert.deepEqual(engineCounts(ENTRY_INDEX.get('1.11.2')), { JS: 0, WASM: 0, other: 1 });
});

test('paths are stable and encoded', () => {
  const astra = ENTRY_INDEX.get('astra');
  assert.equal(entryPath(astra), '/play/astra');
  assert.equal(mirrorPath(astra, astra.mirrors[0]), '/play/astra/astra-js-1');
  assert.equal(mirrorPath(ENTRY_INDEX.get('1.8.8'), ENTRY_INDEX.get('1.8.8').mirrors[1]), '/play/1.8.8/188-js-2');
});

await summary('catalog');
