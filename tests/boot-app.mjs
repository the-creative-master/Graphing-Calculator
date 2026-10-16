/**
 * Boots the real app (index.html + the actual ES modules) inside jsdom.
 *
 * jsdom cannot execute ES modules, so the module sources are concatenated with
 * their import/export syntax stripped and evaluated as one classic script. That
 * still runs the genuine app.js / graph.js / launcher.js code — element lookups,
 * event wiring, overlay screens, iframes.
 *
 * `realCanvas: true` swaps jsdom's missing canvas for an actual raster canvas
 * (@napi-rs/canvas) so tests can read back pixels and prove that typing really
 * draws something.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MODULE_FILES = ['src/math-engine.js', 'src/mirrors.js', 'src/unlock.js', 'src/graph.js', 'src/launcher.js', 'src/app.js'];

/** Strip ES module syntax so the file can live inside a classic script. */
const stripModuleSyntax = (source) =>
  source
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class|async function)\b/gm, '$1')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

async function bundle() {
  const parts = [];
  for (const file of MODULE_FILES) {
    parts.push(`/* ==== ${file} ==== */\n${stripModuleSyntax(await readFile(path.join(ROOT, file), 'utf8'))}`);
  }
  return `(function(){\n${parts.join('\n')}\nwindow.__APP_LOADED__ = true;\n})();`;
}

function stubContext() {
  const noop = () => {};
  return {
    canvas: null,
    save: noop,
    restore: noop,
    clearRect: noop,
    setTransform: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    setLineDash: noop,
    measureText: () => ({ width: 10 }),
  };
}

export async function bootApp({ width = 900, height = 600, realCanvas = false } = {}) {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(`${error.type ?? 'error'}: ${error.message}`));
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));

  const dom = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  const document = window.document;

  /* --- canvas ------------------------------------------------------- */
  const raster = realCanvas ? createCanvas(width, height) : null;

  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    if (raster) return raster.getContext('2d');
    const ctx = stubContext();
    ctx.canvas = this;
    return ctx;
  };

  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
  });

  for (const [prop, value] of [
    ['clientWidth', width],
    ['clientHeight', height],
  ]) {
    Object.defineProperty(window.HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }

  window.ResizeObserver =
    window.ResizeObserver ??
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  window.Element.prototype.setPointerCapture = function setPointerCapture() {};
  window.Element.prototype.releasePointerCapture = function releasePointerCapture() {};

  // jsdom always reports matches:false; pretend to be a desktop pointer on a
  // wide screen so the autofocus and rail-default code paths run.
  window.matchMedia = (query) => ({
    matches: /hover:\s*hover|pointer:\s*fine|min-width:\s*1181/.test(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });

  /* --- run the app -------------------------------------------------- */
  let bootError = null;
  try {
    window.eval(await bundle());
  } catch (error) {
    bootError = error;
  }

  /* --- helpers ------------------------------------------------------ */
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  /**
   * Wait for queued renders to land on the canvas. jsdom's rAF fires on its own
   * timer, so a timeout between frames is needed — a bare rAF can resolve before
   * the app's own callback has run.
   */
  const settle = async (rounds = 3) => {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      await frame();
    }
  };

  const click = (selector) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return el;
  };

  const type = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    return el;
  };

  /** Pixels of the raster canvas, as { data, width, height }. */
  const pixels = () => {
    if (!raster) throw new Error('bootApp({ realCanvas: true }) is required to read pixels');
    const ctx = raster.getContext('2d');
    return ctx.getImageData(0, 0, raster.width, raster.height);
  };

  /** Count pixels close to a hex colour. */
  const countColour = (hex, { minAlpha = 140, tolerance = 45 } = {}) => {
    const target = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const { data, width, height } = pixels();
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < minAlpha) continue;
      if (
        Math.abs(data[i] - target[0]) <= tolerance &&
        Math.abs(data[i + 1] - target[1]) <= tolerance &&
        Math.abs(data[i + 2] - target[2]) <= tolerance
      ) {
        count++;
      }
    }
    return { count, width, height };
  };

  /** Count colour pixels in the left / right half of the canvas. */
  const countColourSides = (hex, options) => {
    const target = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const { data, width, height } = pixels();
    let left = 0;
    let right = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < (options?.minAlpha ?? 140)) continue;
        if (
          Math.abs(data[i] - target[0]) <= (options?.tolerance ?? 45) &&
          Math.abs(data[i + 1] - target[1]) <= (options?.tolerance ?? 45) &&
          Math.abs(data[i + 2] - target[2]) <= (options?.tolerance ?? 45)
        ) {
          if (x < width / 2) left++;
          else right++;
        }
      }
    }
    return { left, right, width, height };
  };

  return { dom, window, document, canvas: raster, errors, bootError, frame, settle, click, type, pixels, countColour, countColourSides, ROOT };
}
