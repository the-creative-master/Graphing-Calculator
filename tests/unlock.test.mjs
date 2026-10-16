import { test, summary, assert } from './harness.mjs';
import { UNLOCK_CODE, isUnlockCode, isUnlockCandidate, normalizeCode } from '../src/unlock.js';

console.log('\nsecret code');

test('the code is short enough to type', () => {
  assert.equal(UNLOCK_CODE, 'MinecraftPls25-');
  assert.equal(UNLOCK_CODE.length, 15);
  assert.ok(UNLOCK_CODE.endsWith('-'), 'the trailing dash is part of it');
});

test('whitespace and a "y =" prefix are tolerated', () => {
  assert.equal(normalizeCode(' Minecraft Pls 25- '), 'minecraftpls25-');
  assert.equal(normalizeCode('y = MinecraftPls25-'), 'minecraftpls25-');
  assert.ok(isUnlockCode('  MinecraftPls25-'));
  assert.ok(isUnlockCode('y=MinecraftPls25-'));
});

test('capitalisation does not matter', () => {
  assert.ok(isUnlockCode('minecraftpls25-'));
  assert.ok(isUnlockCode('MINECRAFTPLS25-'));
  assert.ok(isUnlockCode('MiNeCrAfTpLs25-'));
});

test('lookalikes do not unlock', () => {
  const near = [
    '',
    'MinecraftPls25',
    'MinecraftPls25-1',
    'Minecraft',
    'MinecraftPls25-X',
    'sin(x)',
    '2x + 1',
  ];
  for (const text of near) {
    assert.ok(!isUnlockCode(text), `"${text}" must not unlock`);
  }
});

test('candidates cover every prefix but not a wrong character', () => {
  assert.ok(isUnlockCandidate('M'));
  assert.ok(isUnlockCandidate('mine'));
  assert.ok(isUnlockCandidate(UNLOCK_CODE.slice(0, -1)));
  assert.ok(!isUnlockCandidate(''), 'empty input is not a candidate');
  assert.ok(!isUnlockCandidate('Q'), 'unrelated input is not a candidate');
  assert.ok(!isUnlockCandidate(UNLOCK_CODE.slice(0, -1) + 'X'));
});

await summary('secret code');
