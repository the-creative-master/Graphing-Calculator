/**
 * src/mirrors.js
 * --------------
 * Registry for the secret launcher: game versions, each with its mirrors.
 *
 * All game content is loaded from third-party sites in an <iframe>. Nothing is
 * hosted, proxied, modified or copied by this project — the launcher only knows
 * URLs. If a mirror goes down or blocks framing, it is simply a dead link here.
 *
 * To add a version: append an entry to VERSIONS. To add a mirror: append to its
 * `mirrors` array. Nothing else in the app needs to change.
 *
 * mirror = {
 *   id:      unique string (used in DOM ids)
 *   label:   what the user sees
 *   url:     iframe target
 *   engine:  'JS' | 'WASM' (shown as a badge)
 *   note:    optional small print
 *   allow:   optional iframe allow attribute override
 * }
 */

/** Allow-list tuned for browser games: pointer lock, fullscreen, audio, storage. */
const GAME_IFRAME_ALLOW =
  'fullscreen; autoplay; gamepad; microphone; accelerometer; gyroscope; ' +
  'clipboard-read; clipboard-write; cross-origin-isolated; xr-spatial-tracking';

/** Sensible fallback bits for a full-screen game canvas inside an iframe. */
const GAME_EMBED_FLAGS = 'mozallowfullscreen="true" webkitallowfullscreen="true"';

export const VERSIONS = [
  {
    id: '1.8.8',
    name: '1.8.8',
    subtitle: 'The classic PvP build',
    badge: 'Popular',
    tag: 'stable',
    mirrors: [
      {
        id: '188-js-1',
        label: 'JS Mirror 1',
        url: 'https://gx-launcher.github.io/game/1.8.8/index.html',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '188-js-2',
        label: 'JS Mirror 2',
        url: 'https://yee.pages.dev/#/MS44anM',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '188-js-3',
        label: 'JS Mirror 3',
        url: 'https://gx-launcher-v1.github.io/1.8.8/index.html',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '188-wasm-1',
        label: 'WASM Mirror 1',
        url: 'https://gx-launcher.github.io/game/1.8.8-wasm/index.html',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '188-wasm-2',
        label: 'WASM Mirror 2',
        url: 'https://yee.pages.dev/#/MS44d2FzbQ',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '188-wasm-3',
        label: 'WASM Mirror 3',
        url: 'https://gx-launcher-v1.github.io/1.8.8-wasm/index.html',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
    ],
  },
  {
    id: '1.12.2',
    name: '1.12.2',
    subtitle: 'Modded-era favourite',
    tag: 'stable',
    mirrors: [
      {
        id: '1122-js-1',
        label: 'JS Mirror 1',
        url: 'https://gx-launcher.github.io/game/1.12.2/index.html',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '1122-js-2',
        label: 'JS Mirror 2',
        url: 'https://yee.pages.dev/#/MS4xMmpz',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '1122-js-3',
        label: 'JS Mirror 3',
        url: 'https://gx-launcher-v1.github.io/1.12.2/index.html',
        engine: 'JS',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '1122-wasm-1',
        label: 'WASM Mirror 1',
        url: 'https://gx-launcher.github.io/game/1.12.2-wasm/index.html',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '1122-wasm-2',
        label: 'WASM Mirror 2',
        url: 'https://yee.pages.dev/#/MS4xMndhc20',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
      {
        id: '1122-wasm-3',
        label: 'WASM Mirror 3',
        url: 'https://gx-launcher-v1.github.io/1.12.2-wasm/index.html',
        engine: 'WASM',
        allow: GAME_IFRAME_ALLOW,
        flags: GAME_EMBED_FLAGS,
      },
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

/** Mirrors grouped by engine, in display order. */
export function groupMirrors(version) {
  const groups = [
    { engine: 'JS', label: 'JavaScript build', mirrors: [] },
    { engine: 'WASM', label: 'WebAssembly build', mirrors: [] },
  ];
  for (const mirror of version.mirrors) {
    const group = groups.find((g) => g.engine === mirror.engine);
    (group ? group.mirrors : groups[0].mirrors).push(mirror);
  }
  return groups.filter((g) => g.mirrors.length > 0);
}

export function countMirrors() {
  return VERSIONS.reduce((total, version) => total + version.mirrors.length, 0);
}
