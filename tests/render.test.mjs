/**
 * Pixel-level render test.
 *
 * The jsdom smoke test stubs the 2D context, so it can prove the code runs but
 * not that anything is actually visible. This one uses a real canvas
 * implementation (@napi-rs/canvas): it renders the graph off-screen, reads the
 * pixels back and asserts that grid lines, a curve in the expression's colour
 * and the drop-in of new expressions all reach the framebuffer.
 *
 * It also writes docs/graph-preview.png so the README can show the result.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { test, summary, assert } from './harness.mjs';
import { Graph } from '../src/graph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\ngraph rendering (real canvas)');

/* --- minimal window/document shim for src/graph.js ------------------- */

const CSS_VARS = {
  '--grid-line': 'rgba(255,255,255,0.055)',
  '--grid-line-strong': 'rgba(255,255,255,0.11)',
  '--axis-line': 'rgba(255,255,255,0.42)',
  '--axis-label': '#8b93a7',
  '--accent': '#5b8cff',
};

globalThis.window = globalThis.window ?? {};
globalThis.window.devicePixelRatio = 2;
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => CSS_VARS[name] ?? '' });
globalThis.requestAnimationFrame = (fn) => {
  fn();
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

/** Wrap a real canvas so it looks like a DOM canvas element. */
function makeCanvasElement(width, height) {
  const canvas = createCanvas(width, height);
  canvas.clientWidth = width;
  canvas.clientHeight = height;
  canvas.classList = { add() {}, remove() {}, toggle() {} };
  canvas.addEventListener = () => {};
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 });
  return canvas;
}

/** Count pixels matching a colour (tolerance per channel). */
function colourHistogram(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], n: 1 });
  }
  return counts;
}

const near = (channel, target, tolerance = 40) => Math.abs(channel - target) <= tolerance;

const WIDTH = 1000;
const HEIGHT = 620;
const element = makeCanvasElement(WIDTH, HEIGHT);
const graph = new Graph(element, {});

/* ------------------------------------------------------------------ */

test('canvas is sized for the device pixel ratio', () => {
  assert.equal(element.width, WIDTH * 2);
  assert.equal(element.height, HEIGHT * 2);
});

test('an empty graph still draws a grid and axes', () => {
  graph.render();
  const counts = colourHistogram(element);
  const lit = [...counts.values()].filter((entry) => entry.n > 200);
  assert.ok(lit.length >= 2, `expected grid + axis pixels, got ${lit.length} tone(s)`);
  const total = [...counts.values()].reduce((sum, entry) => sum + entry.n, 0);
  assert.ok(total > WIDTH * HEIGHT * 0.9, 'framebuffer should be written');
});

test('typing an expression puts a curve in that colour on the screen', () => {
  graph.setExpressions([{ id: 'a', color: '#5b8cff', visible: true, source: 'sin(x)' }]);
  graph.render();

  const counts = colourHistogram(element);
  const curve = [...counts.values()].filter(
    (entry) => entry.n > 500 && near(entry.r, 0x5b) && near(entry.g, 0x8c) && near(entry.b, 0xff),
  );
  assert.ok(curve.length >= 1, 'expected pixels in the curve colour #5b8cff');
  const pixels = curve.reduce((sum, entry) => sum + entry.n, 0);
  assert.ok(pixels > 2000, `curve looks too thin (${pixels} px)`);
});

test('the curve actually spans the viewport (not a stub in one corner)', () => {
  const ctx = element.getContext('2d');
  const { width, height } = element;
  const { data } = ctx.getImageData(0, 0, width, height);
  const columns = new Array(width).fill(0);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (near(data[i], 0x5b) && near(data[i + 1], 0x8c) && near(data[i + 2], 0xff) && data[i + 3] > 100) {
        columns[x]++;
      }
    }
  }
  const painted = columns.filter((count) => count > 0).length;
  assert.ok(painted > width * 0.9, `curve should cover most columns, covered ${painted}/${width}`);
});

test('multiple expressions render side by side in their own colours', () => {
  graph.setExpressions([
    { id: 'a', color: '#5b8cff', visible: true, source: 'sin(x)' },
    { id: 'b', color: '#ff6b8b', visible: true, source: 'x^2/4 - 2' },
  ]);
  graph.render();
  const counts = colourHistogram(element);
  const blue = [...counts.values()].some((e) => e.n > 500 && near(e.r, 0x5b) && near(e.g, 0x8c) && near(e.b, 0xff));
  const red = [...counts.values()].some((e) => e.n > 500 && near(e.r, 0xff) && near(e.g, 0x6b) && near(e.b, 0x8b));
  assert.ok(blue, 'blue curve missing');
  assert.ok(red, 'red curve missing');
});

test('hiding an expression removes its curve', () => {
  graph.setExpressions([{ id: 'a', color: '#5b8cff', visible: false, source: 'sin(x)' }]);
  graph.render();
  const counts = colourHistogram(element);
  const blue = [...counts.values()].some((e) => e.n > 500 && near(e.r, 0x5b) && near(e.g, 0x8c) && near(e.b, 0xff));
  assert.ok(!blue, 'hidden curve should not be drawn');
});

test('an invalid expression draws nothing but does not throw', () => {
  const compiled = graph.setExpressions([{ id: 'a', color: '#5b8cff', visible: true, source: 'sin(' }]);
  assert.ok(compiled[0].error, 'parser error should be reported');
  graph.render();
  assert.ok(true);
});

/** Order-sensitive checksum of the framebuffer — different image, different value. */
function pixelChecksum(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 4) {
    hash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

test('zoom, pan and reset change what is drawn', () => {
  graph.setExpressions([{ id: 'a', color: '#5b8cff', visible: true, source: 'sin(x)' }]);
  graph.resetView();
  graph.render();
  const before = pixelChecksum(element);
  graph.zoomIn();
  graph.render();
  const zoomed = pixelChecksum(element);
  assert.notEqual(before, zoomed, 'zooming should change the image');

  graph.resetView();
  graph.render();
  assert.equal(pixelChecksum(element), before, 'reset should restore the original image');

  graph.setView(-5, 15, -6.5, 6.5);
  graph.render();
  assert.notEqual(pixelChecksum(element), before, 'panning should change the image');
  graph.resetView(); // leave the viewport as we found it
});

/* --- regression: curves used to lose every branch before a domain hole --- */

const spanOf = (segments) => segments.map((segment) => [segment[0].x, segment.at(-1).x]);
const covers = (segments, point, tolerance = 0.1) =>
  segments.some((segment) => segment[0].x <= point + tolerance && segment.at(-1).x >= point - tolerance);

test('a hole in the domain no longer deletes the branch before it', () => {
  graph.resetView();
  const [expr] = graph.setExpressions([{ id: 'a', color: '#3ddc97', visible: true, source: '2 sin(x) / x' }]);
  const segments = graph.sampleSegments(expr, 800);
  assert.equal(segments.length, 2, `expected two branches, got ${JSON.stringify(spanOf(segments))}`);
  assert.ok(covers(segments, -8), 'left branch must be drawn');
  assert.ok(covers(segments, 8), 'right branch must be drawn');
});

test('reciprocal and tangent keep all of their branches', () => {
  const [reciprocal] = graph.setExpressions([{ id: 'a', color: '#3ddc97', visible: true, source: '1/x' }]);
  const rSegments = graph.sampleSegments(reciprocal, 800);
  assert.equal(rSegments.length, 2);
  assert.ok(covers(rSegments, -5) && covers(rSegments, 5));

  const [tangent] = graph.setExpressions([{ id: 'b', color: '#3ddc97', visible: true, source: 'tan(x)' }]);
  const tSegments = graph.sampleSegments(tangent, 800);
  assert.ok(tSegments.length >= 5, `tan(x) should break at each asymptote, got ${tSegments.length}`);
  assert.ok(tSegments.every((segment) => segment.length > 2), 'no single-point fragments');
});

test('domain-limited functions start where they are defined', () => {
  for (const [source, start] of [
    ['sqrt(x)', 0],
    ['ln(x)', 0],
  ]) {
    const [expr] = graph.setExpressions([{ id: 'a', color: '#3ddc97', visible: true, source }]);
    const segments = graph.sampleSegments(expr, 800);
    assert.equal(segments.length, 1, `${source} should be one branch`);
    assert.ok(segments[0][0].x >= start - 1e-9, `${source} must not draw left of ${start}`);
    assert.ok(segments[0].at(-1).x > 9, `${source} should reach the right edge`);
  }
});

test('values are correct, not just pretty', () => {
  const [expr] = graph.setExpressions([{ id: 'a', color: '#5b8cff', visible: true, source: 'x^2' }]);
  assert.equal(graph.evaluate(expr, 3), 9);
  assert.equal(graph.evaluate(expr, -4), 16);
  const [trig] = graph.setExpressions([{ id: 'b', color: '#5b8cff', visible: true, source: 'sin(x)' }]);
  assert.ok(Math.abs(graph.evaluate(trig, Math.PI / 2) - 1) < 1e-12);
});

test('a nice preview image can be produced', async () => {
  // fresh, dpr-1 canvas so the committed PNG stays small
  globalThis.window.devicePixelRatio = 1;
  const png = makeCanvasElement(1000, 620);
  const preview = new Graph(png, {});
  preview.setExpressions([
    { id: 'a', color: '#5b8cff', visible: true, source: 'sin(x)' },
    { id: 'b', color: '#ff6b8b', visible: true, source: 'x^2 / 4 - 2' },
    { id: 'c', color: '#3ddc97', visible: true, source: '2 sin(x) / x' },
  ]);
  preview.setPoints([{ x: Math.PI / 2, y: 1, color: '#ffd166', label: '(1.571, 1)' }]);
  preview.resetView();
  preview.render();
  globalThis.window.devicePixelRatio = 2;

  // paint the app's dark backdrop behind the curves
  const ctx = png.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const gradient = ctx.createLinearGradient(0, 0, 0, png.height);
  gradient.addColorStop(0, '#0d1220');
  gradient.addColorStop(1, '#070a12');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, png.width, png.height);
  ctx.restore();

  await mkdir(path.join(ROOT, 'docs'), { recursive: true });
  const buffer = png.toBuffer('image/png');
  await writeFile(path.join(ROOT, 'docs', 'graph-preview.png'), buffer);
  assert.ok(buffer.length > 10_000, `preview png looks empty (${buffer.length} bytes)`);
});

await summary('graph rendering');
