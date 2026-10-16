import { test, summary, assert } from './harness.mjs';
import { UNLOCK_CODE, isUnlockCode, isUnlockCandidate, normalizeCode } from '../src/unlock.js';

console.log('\nsecret code');

test('the code is the short one, and it decodes to something fun', () => {
  assert.equal(UNLOCK_CODE, 'TWluZWNyYWZ0');
  assert.equal(UNLOCK_CODE.length, 12, 'short enough to type');
  assert.equal(Buffer.from(UNLOCK_CODE, 'base64').toString('utf8'), 'Minecraft');
});

test('whitespace and a "y =" prefix are tolerated', () => {
  assert.equal(normalizeCode(' TWluZW NyY WZ0 '), UNLOCK_CODE);
  assert.equal(normalizeCode('y = TWluZWNyYWZ0'), UNLOCK_CODE);
  assert.ok(isUnlockCode('  TWluZWNyYWZ0'));
  assert.ok(isUnlockCode('y=TWluZWNyYWZ0'));
});

test('case matters (it is base64, not a phrase)', () => {
  assert.ok(!isUnlockCode('twlunewnyywz0'));
  assert.ok(!isUnlockCode('TwLuWeNyYwZ0'));
});

test('lookalikes do not unlock', () => {
  for (const near of ['', 'TWluZWNyYWZ0X', 'TWluZWNyY', 'X TWluZWNyYWZ0', 'sin(x)', '2x + 1', 'TWluZWNyYWZ0 1']) {
    assert.ok(!isUnlockCode(near), `"${near}" must not unlock`);
  }
});

test('candidates cover every prefix but not the whole code', () => {
  assert.ok(isUnlockCandidate('T'));
  assert.ok(isUnlockCandidate('TWlu'));
  assert.ok(isUnlockCandidate(UNLOCK_CODE.slice(0, -1)));
  assert.ok(!isUnlockCandidate(''), 'empty input is not a candidate');
  assert.ok(!isUnlockCandidate('Q'), 'unrelated input is not a candidate');
  // a complete code is handled by isUnlockCode, not left as a candidate error
  assert.ok(!isUnlockCandidate(UNLOCK_CODE.slice(0, -1) + 'X'));
});

await summary('secret code');
