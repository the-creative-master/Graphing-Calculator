import { test, summary, assert } from './harness.mjs';
import { parse, compile, makeFunction, collectVariables, formatNumber, tokenize } from '../src/math-engine.js';

const near = (a, b, tolerance = 1e-9) => {
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `expected ${a} ≈ ${b}`);
};

const at = (source, x, options) => makeFunction(source, options)({ x });

console.log('\nmath-engine');

test('arithmetic and precedence', () => {
  near(at('1+2*3', 0), 7);
  near(at('(1+2)*3', 0), 9);
  near(at('10/4', 0), 2.5);
  near(at('2^3^2', 0), 512); // right associative
  near(at('-2^2', 0), -4); // unary binds looser than power
  near(at('2^-2', 0), 0.25);
  near(at('10%3', 0), 1);
  near(at('-7%3', 0), 2); // mathematical modulo
});

test('implicit multiplication', () => {
  near(at('2x', 3), 6);
  near(at('3(x+1)', 2), 9);
  near(at('x(x-1)', 5), 20);
  near(at('2x^2', 3), 18);
  near(at('(x+1)(x-1)', 4), 15);
});

test('functions', () => {
  near(at('sqrt(9)', 0), 3);
  near(at('cbrt(27)', 0), 3);
  near(at('ln(e)', 0), 1);
  near(at('log(1000)', 0), 3);
  near(at('log2(8)', 0), 3);
  near(at('logb(2,8)', 0), 3);
  near(at('abs(-4)', 0), 4);
  near(at('floor(2.9)', 0), 2);
  near(at('ceil(2.1)', 0), 3);
  near(at('round(2.5)', 0), 3);
  near(at('max(1,2,3)', 0), 3);
  near(at('min(1,2,3)', 0), 1);
  near(at('hypot(3,4)', 0), 5);
  near(at('mod(7,3)', 0), 1);
  near(at('ncr(5,2)', 0), 10);
  near(at('npr(5,2)', 0), 20);
  near(at('gcd(12,18)', 0), 6);
  near(at('lcm(4,6)', 0), 12);
});

test('trig in radians and degrees', () => {
  near(at('sin(x)', Math.PI / 2), 1);
  near(at('cos(x)', 0), 1);
  near(at('sin(90)', 0, { deg: true }), 1);
  near(at('cos(180)', 0, { deg: true }), -1);
  near(at('asin(1)', 0, { deg: true }), 90);
  near(at('atan(1)', 0, { deg: true }), 45);
  near(at('asin(1)', 0), Math.PI / 2);
});

test('constants and unicode', () => {
  near(at('pi', 0), Math.PI);
  near(at('π', 0), Math.PI);
  near(at('tau', 0), Math.PI * 2);
  near(at('2π', 0), Math.PI * 2);
  near(at('e', 0), Math.E);
  near(at('√16', 0), 4);
  near(at('2√9', 0), 6);
  near(at('∛27', 0), 3);
  near(at('3×4', 0), 12);
  near(at('(−2)', 0), -2);
  near(at('x²', 3), 9);
});

test('factorial and gamma', () => {
  near(at('5!', 0), 120);
  near(at('0!', 0), 1);
  near(at('3!+2', 0), 8);
  near(at('2^2!', 0), 4); // factorial binds tighter than power
  near(at('0.5!', 0), Math.sqrt(Math.PI) / 2, 1e-6);
});

test('free parameters', () => {
  const f = makeFunction('a*sin(b*x)+c');
  near(f({ x: Math.PI / 2, a: 2, b: 1, c: 1 }), 3);
  assert.deepEqual([...collectVariables(parse('a*sin(b*x)+c'))].sort(), ['a', 'b', 'c', 'x']);
});

test('"y = ..." prefixes are accepted', () => {
  near(at('y = 2x + 1', 3), 7);
  near(at('y=sin(x)', Math.PI / 2), 1);
});

test('numbers and formatting', () => {
  assert.deepEqual(tokenize('1.5 + .5'), [
    { type: 'num', value: 1.5, pos: 0 },
    { type: 'op', value: '+', pos: 4 },
    { type: 'num', value: 0.5, pos: 6 },
  ]);
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1 / 3), '0.333333');
  assert.equal(formatNumber(-2.5), '-2.5');
  assert.equal(formatNumber(NaN), 'undefined');
  assert.equal(formatNumber(Infinity), '∞');
  assert.equal(formatNumber(-Infinity), '−∞');
});

test('domain edges behave (no throw)', () => {
  assert.ok(Number.isNaN(at('log(-1)', 0)));
  assert.ok(Number.isNaN(at('sqrt(-1)', 0)));
  assert.equal(at('1/0', 0), Infinity);
  assert.ok(Number.isNaN(at('0/0', 0)));
  assert.equal(at('x', 1e308) * 10, Infinity);
});

test('bad input throws readable errors', () => {
  const bad = [
    ['sin(', /Expected|Unexpected/],
    ['1++', /Unexpected|Expected/],
    ['nope(2)', /Unknown name/],
    ['sin(1,2)', /argument/],
    ['', /Empty/],
    ['2 <> 3', /Unexpected/],
  ];
  for (const [source, pattern] of bad) {
    assert.throws(() => parse(source), pattern, `"${source}" should throw`);
  }
});

test('compiled function is reusable and side-effect free', () => {
  const f = makeFunction('x^2 + a');
  near(f({ x: 2, a: 1 }), 5);
  near(f({ x: 3, a: 0 }), 9);
  near(compile(parse('x'), {})({ x: 42 }), 42);
});

await summary('math-engine');
