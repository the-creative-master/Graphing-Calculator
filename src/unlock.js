/**
 * unlock.js
 * ---------
 * The secret code, and the detection for it.
 *
 * Kept apart from the UI so it can be unit-tested without a DOM.
 */

/** The secret code — type it into any formula box. */
export const UNLOCK_CODE = 'MinecraftPls25-';

/** Lower-cased, whitespace-free, with an optional "y =" prefix removed. */
export function normalizeCode(source) {
  return String(source)
    .replace(/\s+/g, '')
    .replace(/^y=/i, '')
    .toLowerCase();
}

/**
 * How much of the end of the code has to survive for a lossy attempt to count.
 *
 * Nine characters of `…pls25-` is already unmistakable, and nothing else that
 * can be typed into a formula box ends that way.
 */
const PARTIAL_CODE_MIN = 9;

/**
 * True when the typed text is the code (any capitalisation, no spaces).
 *
 * The code counts when it is what you just typed — i.e. when it sits at the end
 * of the field. Two things can eat the front of an attempt, and neither should
 * cost a retype: a stray character before it, and keystrokes that never reached
 * us at all (the first ones typed into an embedded view belong to the page
 * around it). So the end of the code is compared against the end of the text,
 * and everything before it is ignored.
 */
export function isUnlockCode(source) {
  const text = normalizeCode(source);
  const code = UNLOCK_CODE.toLowerCase();
  if (text.endsWith(code)) return true;
  if (text.length < PARTIAL_CODE_MIN) return false;

  const longest = Math.min(code.length, text.length);
  for (let length = longest; length >= PARTIAL_CODE_MIN; length--) {
    if (code.endsWith(text.slice(-length))) return true;
  }
  return false;
}

/**
 * True while the text is still on its way to being the code (hides parse
 * errors).
 *
 * Anything that is still a run of the code — typed from the start, or from
 * wherever a lost keystroke left off — must not flash a parse error while it is
 * being typed.
 */
export function isUnlockCandidate(source) {
  const text = normalizeCode(source);
  return text.length > 0 && UNLOCK_CODE.toLowerCase().includes(text);
}
