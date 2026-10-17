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
 * The code counts when it is really there — it does not have to be the only
 * thing in the field, or even in one piece. Three things can go wrong while
 * somebody types it, and none of them should cost a retype:
 *
 *   - a stray character before it or after it (a mis-key, or a keyboard adding
 *     something of its own);
 *   - keystrokes that never reached us at all, so the attempt arrives missing
 *     its opening characters (the first keystrokes typed into an embedded view
 *     belong to the page around it);
 *   - the same, but with the loss in the middle.
 *
 * So any long-enough run of the end of the code, found anywhere in the text,
 * counts. Nothing else that can be typed into a formula box looks like nine
 * characters of this.
 */
export function isUnlockCode(source) {
  const text = normalizeCode(source);
  const code = UNLOCK_CODE.toLowerCase();
  if (!text) return false;

  for (let length = code.length; length >= PARTIAL_CODE_MIN; length--) {
    if (text.includes(code.slice(-length))) return true;
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
