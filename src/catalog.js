/**
 * src/catalog.js
 * --------------
 * Everything on the shelf: game versions and clients, each with the builds
 * they offer.
 *
 * To add an entry, append to VERSIONS or CLIENTS; to add a build, append to its
 * `mirrors` array. Nothing else needs to change — the play page and the tests
 * both read this catalog.
 *
 * mirror = {
 *   id, label, url,
 *   engine?: 'JS' | 'WASM',   // omit for a build that isn't engine-specific
 *   note?: string,            // small print shown next to the button
 *   warn?: boolean,           // render the note as a caution chip
 * }
 */

/** Allow-list so a build can go fullscreen, use a gamepad, play sound. */
const GAME_ANY = 'fullscreen; autoplay; gamepad; microphone; accelerometer; gyroscope; clipboard-read; clipboard-write';

const jsBuild = (id, label, url, extra = {}) => ({ id, label, url, engine: 'JS', allow: GAME_ANY, ...extra });
const wasmBuild = (id, label, url, extra = {}) => ({ id, label, url, engine: 'WASM', allow: GAME_ANY, ...extra });
const anyBuild = (id, label, url, extra = {}) => ({ id, label, url, allow: GAME_ANY, ...extra });

export const VERSIONS = [
  {
    id: '1.8.8',
    kind: 'version',
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
    kind: 'version',
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
    id: '1.9.4',
    kind: 'version',
    name: 'EaglercraftPhi 1.9.4',
    subtitle: 'Phi build of 1.9.4',
    mirrors: [
      anyBuild('194-1', 'Mirror 1', 'https://gx-launcher-v1.github.io/1.9.4/index.html'),
      anyBuild('194-2', 'Mirror 2', 'https://d3vtoo1s.github.io/Eaglercraft-1.9.4/clients/Eaglercraft.html'),
    ],
  },
  {
    id: '1.11.2',
    kind: 'version',
    name: 'EaglercraftZ 1.11.2',
    subtitle: 'Z build of 1.11.2',
    mirrors: [
      // single build: the shelf skips the picker and opens it directly
      anyBuild('1112-1', 'Mirror 1', 'https://gx-launcher-v1.github.io/1.11.2/index.html'),
    ],
  },
  {
    id: '1.5.2',
    kind: 'version',
    name: '1.5.2',
    subtitle: 'Golden-age survival',
    mirrors: [
      jsBuild('152-js-1', 'JS Mirror 1', 'https://gx-launcher.github.io/game/1.5.2/index.html'),
      jsBuild('152-js-2', 'JS Mirror 2', 'https://yee.pages.dev/#/MS41'),
      jsBuild('152-js-3', 'JS Mirror 3', 'https://gx-launcher-v1.github.io/1.5.2/index.html'),
      // 1.5.2 ships a single WASM build
      wasmBuild('152-wasm-1', 'WASM Mirror 1', 'https://gx-launcher.github.io/game/1.5.2-wasm/index.html'),
    ],
  },
];

export const CLIENTS = [
  {
    id: 'astra',
    kind: 'client',
    name: 'Astra Client',
    subtitle: 'Modern PvP client build',
    badge: 'Client',
    mirrors: [
      jsBuild('astra-js-1', 'JS Mirror 1', 'https://astraclientorg.github.io/play/js/18/'),
      jsBuild('astra-js-2', 'JS Mirror 2', 'https://client.eaglercraft.win/eagler-files/1.8/AstraClient/index.html'),
      wasmBuild('astra-wasm-1', 'WASM Mirror 1', 'https://astraclientorg.github.io/play/wasm/18/'),
      wasmBuild(
        'astra-wasm-2',
        'WASM Mirror 2',
        'https://client.eaglercraft.win/eagler-files/wasm/1.8/AstraClient/index.html',
      ),
      wasmBuild('astra-wasm-3', 'WASM Mirror 3', 'https://gx-launcher-v1.github.io/Astra%20Client/index.html'),
    ],
  },
  {
    id: 'resent',
    kind: 'client',
    name: 'Resent Client',
    subtitle: 'The one with all the modules',
    badge: 'Client',
    mirrors: [
      anyBuild('resent-1', 'Mirror 1', 'https://gx-launcher-v1.github.io/Resent%20Client/index.html'),
      anyBuild('resent-2', 'Mirror 2', 'https://gx-launcher.github.io/game/Resent%20Client/index.html'),
      anyBuild('resent-3', 'Mirror 3', 'https://client.eaglercraft.win/eagler-files/1.8/resent4.0/index.html', {
        note: 'Older version of Resent Client',
        warn: true,
      }),
    ],
  },
];

/** Versions first, then clients. */
export const CATALOG = [...VERSIONS, ...CLIENTS];

export const ENTRY_INDEX = new Map(CATALOG.map((entry) => [entry.id, entry]));

export const MIRROR_INDEX = new Map();
for (const entry of CATALOG) {
  for (const mirror of entry.mirrors) MIRROR_INDEX.set(`${entry.id}::${mirror.id}`, { entry, mirror });
}

/**
 * Builds grouped for display:
 *   [{ key: 'js' | 'wasm' | 'any', label, mirrors }]
 * Versions have JS/WASM groups; clients without engine-specific builds get a
 * single neutral group.
 */
export function groupMirrors(entry) {
  const groups = [
    { key: 'js', label: 'JavaScript build', mirrors: [] },
    { key: 'wasm', label: 'WebAssembly build', mirrors: [] },
    { key: 'any', label: 'Mirrors', mirrors: [] },
  ];

  for (const mirror of entry.mirrors) {
    const key = mirror.engine === 'JS' ? 'js' : mirror.engine === 'WASM' ? 'wasm' : 'any';
    groups.find((group) => group.key === key).mirrors.push(mirror);
  }

  return groups.filter((group) => group.mirrors.length > 0);
}

export function countBuilds(list = CATALOG) {
  return list.reduce((total, entry) => total + entry.mirrors.length, 0);
}

/** { JS: n, WASM: n, other: n } for the little chips on a catalog card. */
export function engineCounts(entry) {
  const counts = { JS: 0, WASM: 0, other: 0 };
  for (const mirror of entry.mirrors) {
    if (mirror.engine === 'JS') counts.JS++;
    else if (mirror.engine === 'WASM') counts.WASM++;
    else counts.other++;
  }
  return counts;
}

/** True when there is nothing to choose: open it straight away. */
export const isDirectPlay = (entry) => entry.mirrors.length === 1;

/** Canonical link for an entry (builds page) and for a build (running page). */
export const entryPath = (entry) => `/play/${encodeURIComponent(entry.id)}`;
export const mirrorPath = (entry, mirror) => `${entryPath(entry)}/${encodeURIComponent(mirror.id)}`;
