/**
 * unlock.js
 * ---------
 * Detection for the secret phrase typed into an expression field.
 *
 * Kept apart from the UI so it can be unit-tested without a DOM.
 */

/** The phrase, normalised (lowercase, no whitespace). */
export const UNLOCK_PHRASE = 'gimmeminecraftnowidontwannadoboringstufflikesin(x)';

/**
 * Normalise an expression the same way the matcher sees it:
 * lowercase, whitespace stripped, and an optional leading "y =" removed.
 */
export function normalizeForUnlock(source) {
  return String(source)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^[a-z]\w*=(?=.*[a-z(])/, '');
}

/** True when the typed text is the secret phrase (in any casing/spacing). */
export function isUnlockPhrase(source) {
  return normalizeForUnlock(source) === UNLOCK_PHRASE;
}
