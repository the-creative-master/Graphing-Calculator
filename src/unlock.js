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

/** True when the typed text is the code (any capitalisation, no spaces). */
export function isUnlockCode(source) {
  return normalizeCode(source) === UNLOCK_CODE.toLowerCase();
}

/** True while the text is still being typed towards the code (hides parse errors). */
export function isUnlockCandidate(source) {
  const text = normalizeCode(source);
  return text.length > 0 && UNLOCK_CODE.toLowerCase().startsWith(text);
}
