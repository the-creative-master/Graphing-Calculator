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
 * True when the typed text is the code (any capitalisation, no spaces).
 *
 * The code also counts when it is what you just typed — i.e. when it sits at the
 * end of the field. That way a stray earlier character (a mis-key, or a
 * keystroke that landed before the box had focus) doesn't force a retype.
 */
export function isUnlockCode(source) {
  const text = normalizeCode(source);
  const code = UNLOCK_CODE.toLowerCase();
  return text === code || text.endsWith(code);
}

/** True while the text is still being typed towards the code (hides parse errors). */
export function isUnlockCandidate(source) {
  const text = normalizeCode(source);
  return text.length > 0 && UNLOCK_CODE.toLowerCase().startsWith(text);
}
