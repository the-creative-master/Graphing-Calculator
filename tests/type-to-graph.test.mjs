/**
 * The headline behaviour, end to end:
 *
 *   type a formula into the real input box  ->  pixels appear on the canvas
 *
 * This boots the actual app in jsdom with a real raster canvas behind it, so it
 * checks the whole chain: input event -> parser -> compiler -> sampler ->
 * renderer -> framebuffer.
 */
import { test, summary, assert } from './harness.mjs';
import { bootApp } from './boot-app.mjs';

console.log('\ntype → graph (real pixels)');

const app = await bootApp({ realCanvas: true });
const { document } = app;

const FIRST = '#5b8cff'; // colour of the first expression row
const rowInput = (index = 0) => document.querySelectorAll('.expr-row__input')[index];
const rowColour = (index = 0) => document.querySelectorAll('.expr-row__color')[index].value;

test('the app booted against a real canvas', () => {
  assert.equal(app.bootError, null, app.bootError ? String(app.bootError.stack ?? app.bootError) : '');
  assert.ok(app.canvas, 'raster canvas exists');
  assert.equal(rowColour(0), FIRST, 'first row uses the first palette colour');
});

test('a starter curve is already drawn on load', async () => {
  await app.settle();
  const { count } = app.countColour(FIRST);
  assert.ok(count > 2000, `expected a visible sine curve, found ${count} px`);
});

test('typing a formula draws it immediately', async () => {
  const input = rowInput(0);
  app.type(input, '');
  await app.settle();
  const empty = app.countColour(FIRST).count;

  app.type(input, 'x^2 - 3');
  await app.settle();
  const drawn = app.countColour(FIRST).count;

  assert.ok(empty < 300, `clearing the formula should clear the curve (${empty} px left)`);
  assert.ok(drawn > 2000, `typing x^2 - 3 should draw a parabola, found ${drawn} px`);
});

test('changing the formula changes the picture', async () => {
  const input = rowInput(0);
  app.type(input, 'sin(x)');
  await app.settle();
  const sine = app.countColour(FIRST).count;

  app.type(input, 'x^2 / 4 - 2');
  await app.settle();
  const parabola = app.countColour(FIRST).count;

  assert.ok(sine > 2000 && parabola > 2000, 'both formulas draw');
  assert.notEqual(sine, parabola, 'the two curves should not be pixel-identical');
});

test('both branches of 1/x reach the canvas (regression)', async () => {
  const input = rowInput(0);
  app.type(input, '1/x');
  await app.settle();
  const { left, right } = app.countColourSides(FIRST);
  assert.ok(left > 300, `left branch missing (${left} px)`);
  assert.ok(right > 300, `right branch missing (${right} px)`);
});

test('a formula typed by the user follows their colour choice', async () => {
  const input = rowInput(0);
  const swatch = document.querySelectorAll('.expr-row__color')[0];
  swatch.value = '#ffb347';
  swatch.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  app.type(input, 'sin(2x)');
  await app.settle();

  const original = app.countColour(FIRST).count;
  const recoloured = app.countColour('#ffb347').count;
  assert.ok(recoloured > 2000, `expected curve in the new colour, found ${recoloured} px`);
  assert.ok(original < 300, `old colour should be gone, found ${original} px`);
});

test('two formulas draw two curves at once', async () => {
  const second = document.querySelectorAll('.expr-row__input')[1];
  app.type(rowInput(0), 'sin(x)');
  app.type(second, 'x^2 / 4 - 2');
  await app.settle();

  const first = app.countColour('#ffb347').count; // row 1 (recoloured above)
  const other = document.querySelectorAll('.expr-row__color')[1].value;
  const secondCount = app.countColour(other).count;
  assert.ok(first > 2000, `first curve missing (${first} px)`);
  assert.ok(secondCount > 2000, `second curve missing (${secondCount} px)`);
});

test('hiding a row removes its curve, showing it brings it back', async () => {
  const toggle = document.querySelectorAll('.expr-row__toggle')[0];
  app.click(toggle);
  await app.settle();
  const hidden = app.countColour('#ffb347').count;
  assert.ok(hidden < 300, `hidden curve still visible (${hidden} px)`);

  app.click(toggle);
  await app.settle();
  assert.ok(app.countColour('#ffb347').count > 2000, 'shown again');
});

test('zoom actually redraws the same formula bigger', async () => {
  app.click('#reset-view');
  await app.settle();
  const normal = app.countColour('#ffb347').count;
  app.click('#zoom-in');
  await app.settle();
  const zoomed = app.countColour('#ffb347').count;
  assert.ok(normal > 2000 && zoomed > 2000, 'both draws produced a curve');
  assert.notEqual(normal, zoomed, 'zoom should change the rendering');
});

test('an example chip graphs with one click', async () => {
  app.click('#reset-view');
  document.querySelectorAll('.example-chip')[0].dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
  await app.settle();
  const values = [...document.querySelectorAll('.expr-row__input')].map((el) => el.value);
  assert.ok(values.includes('sin(x)'), `chip should fill a row (${JSON.stringify(values)})`);
});

await summary('type → graph');
