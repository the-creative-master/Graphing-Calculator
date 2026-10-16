# Graphing Calculator

A modern, fast graphing calculator. Dark UI, no build step, no dependencies at
runtime, no tracking — just an expression list, a canvas you can pan and zoom,
trace readouts and a live table of values.

```bash
npm start          # http://localhost:3000
npm test           # unit tests + jsdom UI smoke test
```

`PORT=8080 npm start` if you want it somewhere else. The server binds to
`0.0.0.0`, so it works in containers, sandboxes and LAN previews.

## Features

**Math engine** (`src/math-engine.js`) — hand-written tokenizer + recursive
descent parser + compiled closures (no `eval`):

- operators `+ - * / % ^ !`, parentheses, unary minus, right-associative powers
- implicit multiplication: `2x`, `3(x+1)`, `x(x-1)`, `2sin(x)`, `sin(x)cos(x)`
- functions: `sin cos tan csc sec cot asin acos atan atan2 sinh cosh tanh …`,
  `ln log log2 logb exp sqrt cbrt nthroot`, `abs sign floor ceil round trunc`,
  `min max mod hypot pow gamma ncr npr gcd lcm avg random`
- constants `pi π tau τ e phi φ infinity ∞`, and `√ ∛ − × ÷ · ² ³` are accepted
- free parameters: `a·sin(b·x)` works, `x` is the plotting variable
- radians or degrees, `y = …` prefixes tolerated, readable error messages
- factorial/gamma (`5!`, `0.5!`), mathematical `mod` (`-7 % 3 = 2`)
- `tests/math.test.mjs` holds ~90 assertions covering the above

**Grapher** (`src/graph.js`) — DPI-aware canvas, 1-2-5 grid with labelled
ticks, pan (drag), zoom (wheel and buttons), square zoom, centre-origin,
automatic discontinuity/asymptote splitting, nearest-curve trace on hover,
click-to-drop markers, live table of values, viewport/expressions persisted in
`localStorage`.

## Project layout

```
index.html            app shell
styles.css            UI theme (dark, CSS custom properties)
server.js             zero-dependency static server
src/math-engine.js    tokenizer, parser, compiler, formatting
src/graph.js          canvas viewport, sampling, rendering, interaction
src/app.js            UI wiring: expression rows, table, toolbar, shortcuts
src/unlock.js         detection for the hidden launcher trigger
src/launcher.js       the hidden launcher overlay (version → mirror → frame)
src/mirrors.js        the mirror registry: versions and their URLs
tests/*.mjs           dependency-free test harness (jsdom for the UI test)
```

## Keyboard & mouse

| Action | Input |
| --- | --- |
| Pan | drag on the canvas |
| Zoom | scroll wheel, `+` / `-`, toolbar buttons |
| Reset view | double-click, `0`, toolbar `⟲` |
| Trace a curve | hover near it |
| Drop a marker | click empty space |
| New expression | `Enter` in the last expression row |
| Move between rows | `↑` / `↓` |

## Hidden launcher (easter egg)

Typing the unlock phrase into an expression field opens the overlay in
`src/launcher.js`: pick a **version**, then pick a **mirror** (JavaScript or
WebAssembly build), and the chosen mirror loads in a full-size `<iframe>` with
its own control bar (reload / swap mirror / open in new tab / close).

- The phrase itself lives in `src/unlock.js`; matching ignores case, spaces and
  an optional `y =` prefix.
- **Nothing is hosted, proxied, mirrored or downloaded by this project.** Every
  game URL is a third-party page embedded as an iframe, straight from the
  browser, exactly as if you had visited it yourself. This repo contains URLs
  and UI code only.
- To add versions or mirrors, edit `src/mirrors.js` — the launcher UI builds
  itself from that list, and `tests/mirrors.test.mjs` checks the URLs stay
  well formed.

## Notes

- Everything is client-side; there is no backend, no analytics, no cookies.
- The static server sets `Cache-Control: no-store` so edited files always load
  fresh while hacking.
