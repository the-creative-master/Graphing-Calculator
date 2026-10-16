/**
 * src/mirrors.js
 * Registry of playable versions and the builds each one offers.
 *
 * To add a version, append an entry to VERSIONS; to add a build, append to its
 * `mirrors` array. Nothing else needs to change — the launcher UI and the tests
 * both read this list.
 *
 * mirror = { id, label, url, engine: 'JS' | 'WASM' }
 */

/** Allow-list for a full-screen, gamepad-capable build inside a frame. */
const GAME_ANY = 'fullscreen; autoplay; gamepad; microphone; accelerometer; gyroscope; clipboard-read; clipboard-write';

const JS = 'JS';
const WASM = 'WASM';

const jsBuild = (id, label, url) => ({ id, label, url, engine: JS, allow: GAME_ANY });
const wasmBuild = (id, label, url) => ({ id, label, url, engine: WASM, allow: GAME_ANY });

export const VERSIONS = [
  {
    id: '1.8.8',
    name: '1.8.8',
    subtitle: 'The classic PvP build',
    badge: 'Popular',
    mirrors: [
      jsBuild('188-js-1', 'JS Mirror 1', 'https://gx-launcher.github.io/game/1.8.8/index.html'),
      jsBuild('188-js-2', 'JS Mirror 2', 'https://yee.pages.dev/#/MS44anM'),
      jsBuild('188-js-3', 'JS Mirror 3', 'https://gx-launcher-v1.github.io/1.8.8/index.html'),
      wasmBuild('188-wasm-1', 'WASM Mirror 1', 'https://gx-launcher.github.io/game/1.8.8-wasm/index.html'),
      wasmBuild('188-wasm-2', 'WASM Mirror 2', 'https://yee.pages.dev/#/MS44d2FzbQ'),
      wasmBuild('188-wasm-3', 'WASM Mirror 3', 'https://gx-launcher-v1.github.io/1.8.8-wasm/index.html'),
    ],
  },
  {
    id: '1.12.2',
    name: '1.12.2',
    subtitle: 'Modded-era favourite',
    mirrors: [
      jsBuild('1122-js-1', 'JS Mirror 1', 'https://gx-launcher.github.io/game/1.12.2/index.html'),
      jsBuild('1122-js-2', 'JS Mirror 2', 'https://yee.pages.dev/#/MS4xMmpz'),
      jsBuild('1122-js-3', 'JS Mirror 3', 'https://gx-launcher-v1.github.io/1.12.2/index.html'),
      wasmBuild('1122-wasm-1', 'WASM Mirror 1', 'https://gx-launcher.github.io/game/1.12.2-wasm/index.html'),
      wasmBuild('1122-wasm-2', 'WASM Mirror 2', 'https://yee.pages.dev/#/MS4xMndhc20'),
      wasmBuild('1122-wasm-3', 'WASM Mirror 3', 'https://gx-launcher-v1.github.io/1.12.2-wasm/index.html'),
    ],
  },
  {
    id: '1.5.2',
    name: '1.5.2',
    subtitle: 'Golden-age survival',
    mirrors: [
      jsBuild('152-js-1', 'JS Mirror 1', 'https://gx-launcher.github.io/game/1.5.2/index.html'),
      jsBuild('152-js-2', 'JS Mirror 2', 'https://yee.pages.dev/#/MS41'),
      jsBuild('152-js-3', 'JS Mirror 3', 'https://gx-launcher-v1.github.io/1.5.2/index.html'),
      wasmBuild('152-wasm-1', 'WASM Mirror 1', 'https://gx-launcher.github.io/game/1.5.2-wasm/index.html'),
    ],
  },
];

/** Handy lookups used by the launcher UI. */
export const MIRROR_INDEX = new Map();
export const VERSION_INDEX = new Map();

for (const version of VERSIONS) {
  VERSION_INDEX.set(version.id, version);
  for (const mirror of version.mirrors) MIRROR_INDEX.set(`${version.id}::${mirror.id}`, { version, mirror });
}

/** Builds grouped by engine, in display order. */
export function groupMirrors(version) {
  const groups = [
    { engine: JS, label: 'JavaScript build', mirrors: [] },
    { engine: WASM, label: 'WebAssembly build', mirrors: [] },
  ];
  for (const mirror of version.mirrors) {
    const group = groups.find((g) => g.engine === mirror.engine);
    (group ?? groups[0]).mirrors.push(mirror);
  }
  return groups.filter((g) => g.mirrors.length > 0);
}

export function countMirrors() {
  return VERSIONS.reduce((total, version) => total + version.mirrors.length, 0);
}
