import { test, summary, assert } from './harness.mjs';
import { UNLOCK_PHRASE, isUnlockPhrase, normalizeForUnlock } from '../src/unlock.js';

console.log('\nunlock phrase');

test('normalises case, whitespace and a "y =" prefix', () => {
  assert.equal(normalizeForUnlock('  Gimme Minecraft Now I Dont  Wanna Do Boring Stuff Like Sin (X) '), UNLOCK_PHRASE);
  assert.equal(normalizeForUnlock('y = GimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(x)'), UNLOCK_PHRASE);
  assert.equal(normalizeForUnlock('\tGimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(x)\n'), UNLOCK_PHRASE);
});

test('exact phrase matches', () => {
  assert.equal(UNLOCK_PHRASE, 'gimmeminecraftnowidontwannadoboringstufflikesin(x)');
  assert.ok(isUnlockPhrase('GimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(X)'));
  assert.ok(isUnlockPhrase('gimmeminecraftnowidontwannadoboringstufflikesin(x)'));
  assert.ok(isUnlockPhrase('GIMMEMINECRAFTNOWIDONTWANNADOBORINGSTUFFLIKESIN(x)'));
});

test('lookalikes do not match', () => {
  assert.ok(!isUnlockPhrase('sin(x)'));
  assert.ok(!isUnlockPhrase(''));
  assert.ok(!isUnlockPhrase('GimmeMinecraftNow'));
  assert.ok(!isUnlockPhrase('GimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(y)'));
  assert.ok(!isUnlockPhrase('GimmeMinecraftNowIDontWannaDoBoringStuffLikeSin(x)+1'));
  // a normal "y = 2x" style entry is untouched by the prefix stripper
  assert.equal(normalizeForUnlock('y = 2x'), '2x');
  assert.equal(normalizeForUnlock('y = sin(x)'), 'sin(x)');
});

await summary('unlock phrase');
