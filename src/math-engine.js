/**
 * math-engine.js
 * ----------------
 * A small, dependency-free expression engine for the graphing calculator.
 *
 *   import { parse, compile, collectVariables, formatNumber } from './math-engine.js';
 *
 *   const ast = parse('2x^2 - sin(x) + a');
 *   const vars = collectVariables(ast);          // Set { 'x', 'a' }
 *   const f = compile(ast, { deg: false });
 *   f({ x: 1, a: 2 });                            // -> number
 *
 * Features
 *  - operators:  + - * / % ^ ! ( ) with correct precedence, unary minus,
 *    right-associative powers, postfix factorial.
 *  - implicit multiplication: 2x, 3(x+1), x(x-1), 2sin(x), sin(x)cos(x)
 *  - functions:  trig (+ inverses + hyperbolics), ln/log, sqrt/cbrt,
 *    abs/sign/floor/ceil/round, min/max, mod, exp, nCr/nPr, gcd/lcm ...
 *  - constants:  pi/π, tau/τ, e, phi/φ, infinity/∞
 *  - case-insensitive names, radians or degrees, unicode operators (− × ÷ √ π)
 *  - compiled closures: safe (no eval) and fast enough to sample thousands of
 *    points per frame.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const PHI = (1 + Math.sqrt(5)) / 2;

export const CONSTANTS = Object.freeze({
  pi: Math.PI,
  'π': Math.PI,
  tau: Math.PI * 2,
  'τ': Math.PI * 2,
  e: Math.E,
  phi: PHI,
  'φ': PHI,
  infinity: Infinity,
  '∞': Infinity,
});

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

const UNICODE_FIXUPS = {
  '−': '-', // U+2212 minus
  '–': '-',
  '—': '-',
  '×': '*',
  '·': '*',
  '⋅': '*',
  '÷': '/',
  '∕': '/',
  '⁄': '/',
  '√': '\u0001', // sentinel: square-root prefix operator (handled below)
  '∛': '\u0002', // sentinel: cube-root prefix operator
  '**': '^',
};

const PREFIX_ROOTS = { '\u0001': 'sqrt', '\u0002': 'cbrt' };

const GREEK_CONSTANTS = 'πτφ∞';

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdentPart = (c) => /[A-Za-z0-9_]/.test(c);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/**
 * Turn a string into tokens: { type, value, pos }
 * types: num | ident | op | lparen | rparen | comma
 */
export function tokenize(input) {
  // normalize unicode operators/superscripts
  let src = String(input);
  for (const [from, to] of Object.entries(UNICODE_FIXUPS)) {
    if (src.includes(from)) src = src.split(from).join(to);
  }
  // common superscript shortcuts people type: ² ³
  src = src.replace(/²/g, '^2').replace(/³/g, '^3');
  // "y = 2x + 1" -> plot the right-hand side (only when there is one '=')
  const eq = src.indexOf('=');
  if (eq !== -1 && !src.slice(eq + 1).includes('=')) {
    const right = src.slice(eq + 1).trim();
    if (right) src = right;
  }

  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (isSpace(c)) {
      i++;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      let seenDot = false;
      while (j < src.length && (isDigit(src[j]) || (src[j] === '.' && !seenDot))) {
        if (src[j] === '.') seenDot = true;
        j++;
      }
      tokens.push({ type: 'num', value: Number(src.slice(i, j)), pos: i });
      i = j;
      continue;
    }

    if (GREEK_CONSTANTS.includes(c)) {
      // π τ φ ∞ act as their own single-character identifiers (so "2π" works)
      tokens.push({ type: 'ident', value: c, pos: i });
      i++;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (c === '\u0001' || c === '\u0002') {
      tokens.push({ type: 'ident', value: PREFIX_ROOTS[c], pos: i, root: true });
      i++;
      continue;
    }

    if (c === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: i });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: i });
      i++;
      continue;
    }
    if (c === ',' || c === ';') {
      tokens.push({ type: 'comma', value: ',', pos: i });
      i++;
      continue;
    }
    if (c === '>' || c === '<') {
      throw new SyntaxError(`Unexpected "${c}" — this calculator plots equations, not inequalities.`);
    }

    if ('+-*/^%!'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: i });
      i++;
      continue;
    }

    throw new SyntaxError(`Unexpected character "${c}"`);
  }

  return tokens;
}

/* ------------------------------------------------------------------ *
 * Function table
 * ------------------------------------------------------------------ */

const FACTORIAL_LIMIT = 170;

/** Lanczos approximation — lets factorial/gamma work off the integers too. */
function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = 7;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  let x = C[0];
  for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function factorial(n) {
  if (Number.isInteger(n) && n >= 0) {
    if (n > FACTORIAL_LIMIT) return Infinity;
    let out = 1;
    for (let k = 2; k <= n; k++) out *= k;
    return out;
  }
  return gamma(n + 1); // allows things like 0.5!
}

function nCr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0) return NaN;
  if (r > n) return 0;
  r = Math.min(r, n - r);
  let out = 1;
  for (let k = 1; k <= r; k++) out = (out * (n - r + k)) / k;
  return Math.round(out);
}

function nPr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) return NaN;
  let out = 1;
  for (let k = 0; k < r; k++) out *= n - k;
  return out;
}

function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

/**
 * Functions get (args, scope) where scope = { deg, rand, ... }.
 * `needsAngle` functions receive radians regardless of mode.
 */
export const FUNCTIONS = {
  // --- trigonometry ---
  sin: { fn: (a) => Math.sin(a), n: 1, angle: 'in' },
  cos: { fn: (a) => Math.cos(a), n: 1, angle: 'in' },
  tan: { fn: (a) => Math.tan(a), n: 1, angle: 'in' },
  csc: { fn: (a) => 1 / Math.sin(a), n: 1, angle: 'in' },
  sec: { fn: (a) => 1 / Math.cos(a), n: 1, angle: 'in' },
  cot: { fn: (a) => 1 / Math.tan(a), n: 1, angle: 'in' },
  asin: { fn: (a) => Math.asin(a), n: 1, angle: 'out' },
  acos: { fn: (a) => Math.acos(a), n: 1, angle: 'out' },
  atan: { fn: (a) => Math.atan(a), n: 1, angle: 'out' },
  atan2: { fn: (a, b) => Math.atan2(a, b), n: 2, angle: 'out' },
  arctan: { fn: (a) => Math.atan(a), n: 1, angle: 'out' },
  arcsin: { fn: (a) => Math.asin(a), n: 1, angle: 'out' },
  arccos: { fn: (a) => Math.acos(a), n: 1, angle: 'out' },
  sinh: { fn: (a) => Math.sinh(a), n: 1 },
  cosh: { fn: (a) => Math.cosh(a), n: 1 },
  tanh: { fn: (a) => Math.tanh(a), n: 1 },
  csch: { fn: (a) => 1 / Math.sinh(a), n: 1 },
  sech: { fn: (a) => 1 / Math.cosh(a), n: 1 },
  coth: { fn: (a) => 1 / Math.tanh(a), n: 1 },
  asinh: { fn: (a) => Math.asinh(a), n: 1 },
  acosh: { fn: (a) => Math.acosh(a), n: 1 },
  atanh: { fn: (a) => Math.atanh(a), n: 1 },

  // --- logs & roots ---
  ln: { fn: (a) => Math.log(a), n: 1 },
  log: { fn: (a) => Math.log10(a), n: 1 },
  log10: { fn: (a) => Math.log10(a), n: 1 },
  log2: { fn: (a) => Math.log2(a), n: 1 },
  logb: { fn: (a, b) => Math.log(b) / Math.log(a), n: 2 },
  exp: { fn: (a) => Math.exp(a), n: 1 },
  sqrt: { fn: (a) => Math.sqrt(a), n: 1 },
  cbrt: { fn: (a) => Math.cbrt(a), n: 1 },
  nthroot: { fn: (a, b) => Math.sign(b) * Math.pow(Math.abs(b), 1 / a), n: 2 },

  // --- rounding / misc ---
  abs: { fn: (a) => Math.abs(a), n: 1 },
  sign: { fn: (a) => Math.sign(a), n: 1 },
  floor: { fn: (a) => Math.floor(a), n: 1 },
  ceil: { fn: (a) => Math.ceil(a), n: 1 },
  round: { fn: (a) => Math.round(a), n: 1 },
  trunc: { fn: (a) => Math.trunc(a), n: 1 },
  min: { fn: (a, ...rest) => Math.min(a, ...rest), n: [1, 4] },
  max: { fn: (a, ...rest) => Math.max(a, ...rest), n: [1, 4] },
  mod: { fn: (a, b) => ((a % b) + b) % b, n: 2 },
  hypot: { fn: (a, b) => Math.hypot(a, b), n: 2 },
  pow: { fn: (a, b) => Math.pow(a, b), n: 2 },
  gamma: { fn: (a) => gamma(a), n: 1 },
  ncr: { fn: nCr, n: 2 },
  npr: { fn: nPr, n: 2 },
  gcd: { fn: gcd, n: 2 },
  lcm: { fn: (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0), n: 2 },
  random: { fn: (a) => (a === undefined ? Math.random() : Math.floor(Math.random() * a)), n: [0, 1] },
  avg: { fn: (a, ...rest) => (a + rest.reduce((s, v) => s + v, 0)) / (rest.length + 1), n: [1, 8] },
};

/* ------------------------------------------------------------------ *
 * Parser  (recursive descent / precedence climbing)
 * ------------------------------------------------------------------ */

const canEndOperand = (tok) =>
  tok && (tok.type === 'num' || tok.type === 'ident' || tok.type === 'rparen' || (tok.type === 'op' && tok.value === '!'));

const canStartOperand = (tok) =>
  tok && (tok.type === 'num' || tok.type === 'ident' || tok.type === 'lparen');

export function parse(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new SyntaxError('Empty expression');

  let pos = 0;
  const peek = (offset = 0) => tokens[pos + offset];
  const next = () => tokens[pos++];

  function expect(type, value) {
    const tok = peek();
    if (!tok || tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new SyntaxError(`Expected ${value ?? type}`);
    }
    return next();
  }

  function parseExpression() {
    let node = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      node = { type: 'binary', op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseUnary();
    for (;;) {
      const tok = peek();
      if (!tok) break;
      if (tok.type === 'op' && (tok.value === '*' || tok.value === '/' || tok.value === '%')) {
        next();
        node = { type: 'binary', op: tok.value, left: node, right: parseUnary() };
        continue;
      }
      // implicit multiplication: 2x, 3(x+1), x sin(x), sin(x)(x+1)
      if (canEndOperand(tokens[pos - 1]) && canStartOperand(tok)) {
        const left = node;
        const right = parseUnary();
        node = { type: 'binary', op: '*', left, right, implicit: true };
        continue;
      }
      break;
    }
    return node;
  }

  function parseUnary() {
    const tok = peek();
    if (tok && tok.type === 'op' && (tok.value === '-' || tok.value === '+')) {
      next();
      const arg = parseUnary();
      return tok.value === '-' ? { type: 'unary', op: '-', arg } : arg;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();
    const tok = peek();
    if (tok && tok.type === 'op' && tok.value === '^') {
      next();
      // right associative, and the exponent may itself be unary: 2^-3
      return { type: 'binary', op: '^', left: base, right: parseUnary() };
    }
    return base;
  }

  function parsePostfix() {
    let node = parsePrimary();
    for (;;) {
      const tok = peek();
      if (tok && tok.type === 'op' && tok.value === '!') {
        next();
        node = { type: 'factorial', arg: node };
        continue;
      }
      break;
    }
    return node;
  }

  function parseArgs() {
    expect('lparen');
    const args = [];
    if (peek() && peek().type === 'rparen') {
      next();
      return args;
    }
    for (;;) {
      args.push(parseExpression());
      const tok = peek();
      if (tok && tok.type === 'comma') {
        next();
        continue;
      }
      expect('rparen');
      break;
    }
    return args;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new SyntaxError('Unexpected end of expression');

    if (tok.type === 'num') {
      next();
      return { type: 'number', value: tok.value };
    }

    if (tok.type === 'lparen') {
      const args = parseArgs();
      if (args.length !== 1) throw new SyntaxError('Too many values in parentheses');
      return { type: 'group', arg: args[0] };
    }

    if (tok.type === 'ident') {
      const name = tok.value.toLowerCase();
      const isFunction = name in FUNCTIONS;

      // function call: sin(x), max(a, b) ...
      if (isFunction) {
        next();
        const spec = FUNCTIONS[name];
        if (peek() && peek().type === 'lparen') {
          const args = parseArgs();
          checkArity(name, args.length, spec);
          return { type: 'call', name, args };
        }
        // bare function with a single implicit argument: sin x  ->  sin(x)
        if (spec.n === 1 || spec.n === undefined) {
          const arg = parseUnary();
          return { type: 'call', name, args: [arg] };
        }
        throw new SyntaxError(`"${name}(" needs ${spec.n} arguments`);
      }

      if (name in CONSTANTS) {
        next();
        return { type: 'number', value: CONSTANTS[name], name };
      }

      if (name.length === 1) {
        next();
        return { type: 'variable', name };
      }

      throw new SyntaxError(`Unknown name "${tok.value}"`);
    }

    throw new SyntaxError(`Unexpected ${tok.value}`);
  }

  function checkArity(name, given, spec) {
    const want = spec.n;
    if (Array.isArray(want)) {
      if (given < want[0] || given > want[1]) {
        throw new SyntaxError(`${name}() expects ${want[0]}–${want[1]} arguments, got ${given}`);
      }
    } else if (want !== undefined && given !== want) {
      throw new SyntaxError(`${name}() expects ${want} argument${want === 1 ? '' : 's'}, got ${given}`);
    }
  }

  const ast = parseExpression();
  if (pos !== tokens.length) {
    throw new SyntaxError(`Unexpected "${tokens[pos].value}"`);
  }
  return ast;
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

/** All free variable names used by the expression (lowercased), `x` included. */
export function collectVariables(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  switch (node.type) {
    case 'variable':
      out.add(node.name);
      break;
    case 'binary':
      collectVariables(node.left, out);
      collectVariables(node.right, out);
      break;
    case 'unary':
      collectVariables(node.arg, out);
      break;
    case 'group':
      collectVariables(node.arg, out);
      break;
    case 'factorial':
      collectVariables(node.arg, out);
      break;
    case 'call':
      for (const arg of node.args) collectVariables(arg, out);
      break;
    default:
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Compiler — AST -> closure(scope) -> number
 * ------------------------------------------------------------------ */

export function compile(node, options = {}) {
  const deg = !!options.deg;
  const rand = options.rand ?? Math.random;
  const scope = { deg, rand, x: 0 };

  const evalNode = build(node);

  return function evaluate(scopeValues = {}) {
    for (const key in scopeValues) scope[key] = scopeValues[key];
    return evalNode(scope);
  };

  function build(n) {
    switch (n.type) {
      case 'number':
        return () => n.value;
      case 'variable':
        return (s) => {
          const v = s[n.name];
          return v === undefined ? NaN : v;
        };
      case 'group':
        return build(n.arg);
      case 'unary':
        return withArg(n.arg, (a) => -a);
      case 'factorial':
        return withArg(n.arg, (a) => factorial(a));
      case 'binary':
        return buildBinary(n);
      case 'call':
        return buildCall(n);
      default:
        throw new SyntaxError(`Cannot compile node of type ${n.type}`);
    }

    function withArg(argNode, fn) {
      const arg = build(argNode);
      return (s) => fn(arg(s));
    }

    function buildBinary(n) {
      if (n.op === '^') {
        const l = build(n.left);
        const r = build(n.right);
        return (s) => Math.pow(l(s), r(s));
      }
      const l = build(n.left);
      const r = build(n.right);
      switch (n.op) {
        case '+':
          return (s) => l(s) + r(s);
        case '-':
          return (s) => l(s) - r(s);
        case '*':
          return (s) => l(s) * r(s);
        case '/':
          return (s) => l(s) / r(s);
        case '%':
          return (s) => ((l(s) % r(s)) + r(s)) % r(s);
        default:
          throw new SyntaxError(`Unknown operator "${n.op}"`);
      }
    }

    function buildCall(n) {
      const spec = FUNCTIONS[n.name];
      if (!spec) throw new SyntaxError(`Unknown function "${n.name}"`);
      const argFns = n.args.map(build);
      const isDeg = deg && spec.angle === 'in';
      const outDeg = deg && spec.angle === 'out';
      const isRandom = n.name === 'random';

      return (s) => {
        const args = argFns.map((f) => f(s));
        if (isDeg) for (let i = 0; i < args.length; i++) args[i] = deg2rad(args[i]);
        let out;
        if (isRandom) {
          out = spec.fn(args[0] === undefined ? undefined : args[0]);
        } else {
          out = spec.fn(...args);
        }
        if (outDeg) out = rad2deg(out);
        return out;
      };
    }
  }
}

/** Convenience: parse + compile in one go. Throws on bad input. */
export function makeFunction(expression, options) {
  return compile(parse(expression), options);
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

/** Pretty-print a number for readouts/tables (max ~7 significant digits). */
export function formatNumber(value, digits = 6) {
  if (value === null || value === undefined) return '';
  if (Number.isNaN(value)) return 'undefined';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return '0';

  const abs = Math.abs(value);
  if (abs >= 1e9 || abs < 1e-6) {
    return value.toExponential(Math.min(digits - 1, 9)).replace('e+', 'e').replace('e-', 'e−');
  }
  const rounded = Number(value.toPrecision(digits));
  let out = String(rounded);
  if (out.includes('e')) return out.replace('e+', 'e').replace('e-', 'e−');
  return out;
}

/** Format an axis tick label, preferring short decimals. */
export function formatTick(value, step) {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-4) {
    return value.toExponential(1).replace('e+', 'e').replace('e-', 'e−');
  }
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step)) + 1));
  const out = Number(value.toFixed(decimals));
  return String(out).replace('-', '−');
}
