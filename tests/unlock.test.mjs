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
  const near = ['', 'MinecraftPls25', 'Minecraft', 'Minecr', 'pls25-', 'ftpls25-', 'sin(x)', '2x + 1'];
  for (const text of near) {
    assert.ok(!isUnlockCode(text), `"${text}" must not unlock`);
  }
});

test('the code counts when it is what you just typed', () => {
  // a stray character earlier in the box (a mis-key, or a keystroke that landed
  // before the field had focus) must not force a retype
  assert.ok(isUnlockCode('2x MinecraftPls25-'), 'code typed after other text');
  assert.ok(isUnlockCode('nMinecraftPls25-'), 'one stray keystroke before it');
  // a stray character after it must not cost a retype either — whatever the
  // keyboard added, the code itself is right there
  assert.ok(isUnlockCode('MinecraftPls25-x'));
  assert.ok(isUnlockCode('MinecraftPls25-2'));
  assert.ok(isUnlockCode('MinecraftPls25- '), 'whitespace never counts');
  assert.ok(isUnlockCode('xMinecraftPls25- y'));
});

test('a keystroke lost before the code is not a retype either', () => {
  // The first thing typed into an embedded view goes to the page around it, so
  // an attempt can arrive missing its opening characters. The end of the code is
  // still there, character for character.
  assert.ok(isUnlockCode('inecraftPls25-'), 'one lost first keystroke');
  assert.ok(isUnlockCode('inecraftpls25-'), 'and capitalisation still does not matter');
  assert.ok(isUnlockCode('2x inecraftPls25-'), 'lost first keystroke after other text');
  assert.ok(isUnlockCode('craftpls25-'), 'several lost first keystrokes');

  // a fragment too short to be sure is not the code
  assert.ok(!isUnlockCode('pls25-'), 'six characters is not enough');
  assert.ok(!isUnlockCode('ftpls25-'), 'eight characters is not enough either');
  assert.ok(!isUnlockCode('2x pls25-'), 'and not when it follows a formula');
  assert.ok(!isUnlockCode('inecraftPls25'), 'the ending still has to be there');
  assert.ok(!isUnlockCode('minecraftpls'), 'a run with no ending in it is not the code');
});

test('candidates cover every prefix, and every start of a lost attempt', () => {
  assert.ok(isUnlockCandidate('M'));
  assert.ok(isUnlockCandidate('mine'));
  assert.ok(isUnlockCandidate(UNLOCK_CODE.slice(0, -1)));
  assert.ok(!isUnlockCandidate(''), 'empty input is not a candidate');
  assert.ok(!isUnlockCandidate('Q'), 'unrelated input is not a candidate');
  assert.ok(!isUnlockCandidate(UNLOCK_CODE.slice(0, -1) + 'X'));

  // a lost opening keystroke leaves the rest of a run of the code behind
  assert.ok(isUnlockCandidate('i'), 'the first character after a lost one');
  assert.ok(isUnlockCandidate('inecraft'), 'a run from the middle of the code');
  assert.ok(!isUnlockCandidate('inecraftx'), 'a wrong character ends it');
});

await summary('secret code');
