/**
 * src/router.js
 * -------------
 * A tiny hash router, so the launcher is a real page with real URLs instead of
 * a popup: the browser Back button, refresh and deep links all work.
 *
 *   #/                          the calculator
 *   #/play                      everything on the shelf
 *   #/play/1.8.8                builds for one entry
 *   #/play/1.8.8/188-js-2       a build, running
 */

/** Turn a location hash into a route object. */
export function parseRoute(hash) {
  const parts = String(hash ?? '')
    .replace(/^#/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);

  if (parts[0] !== 'play') return { view: 'calculator', path: '/', key: 'calculator' };
  if (parts.length === 1) return { view: 'catalog', path: '/play', key: 'catalog' };

  const entryId = parts[1];
  if (parts.length === 2) {
    return { view: 'builds', entryId, path: `/play/${entryId}`, key: `builds:${entryId}` };
  }

  const mirrorId = parts[2];
  return {
    view: 'game',
    entryId,
    mirrorId,
    path: `/play/${entryId}/${mirrorId}`,
    key: `game:${entryId}:${mirrorId}`,
  };
}

/** The route one step up the stack (game -> builds -> catalog -> calculator). */
export function parentPath(route) {
  switch (route.view) {
    case 'game':
      return `/play/${route.entryId}`;
    case 'builds':
      return '/play';
    case 'catalog':
      return '/';
    default:
      return null;
  }
}

export class Router {
  constructor({ onChange, window: win = globalThis.window } = {}) {
    this.window = win;
    this.onChange = onChange ?? (() => {});
    this.current = null;
    this.rendered = null; // the route key that is actually on screen
    this._onHashChange = () => this._emit();
  }

  start() {
    this.window.addEventListener('hashchange', this._onHashChange);
    this._emit();
    return this;
  }

  stop() {
    this.window.removeEventListener('hashchange', this._onHashChange);
  }

  get route() {
    return this.current;
  }

  /**
   * Navigate to a path like '/play/1.8.8' (a leading # is optional).
   *
   * The URL moves *and* the page is rendered before this returns. It used to be
   * the URL's job alone: assigning the hash, then waiting for the browser's
   * hashchange event to draw the new page. An embedded page can have that event
   * arrive late, arrive not at all, or have the assignment itself refused — and
   * then the URL says one thing while the screen says another. Worst of all, the
   * *next* navigation looks like a no-op (the hash is already right) and only
   * then draws the page, which is what made a secret code seem to need typing
   * twice: the first attempt cleared the box and went nowhere.
   */
  navigate(path, { replace = false } = {}) {
    const target = `#${String(path).replace(/^#/, '')}`;
    const route = parseRoute(target);

    try {
      if (this.window.location.hash !== target) {
        if (replace && this.window.history?.replaceState) {
          this.window.history.replaceState(null, '', target);
        } else {
          // Assigning the hash pushes a history entry, so Back works.
          this.window.location.hash = target;
        }
      }
    } catch {
      // Refused. The page below still changes, which is the part that matters.
    }

    // Draw it now. The hashchange, if it comes, finds nothing left to do.
    this._emit(route);
  }

  /** Step up one level, or hand control back to the caller. */
  back() {
    const path = parentPath(this.current ?? parseRoute(''));
    if (path === null) return false;
    this.navigate(path);
    return true;
  }

  /** Called when the URL changes (without a popstate we still have a real URL). */
  handlePopState() {
    this._emit();
  }

  _emit(route = parseRoute(this.window.location.hash)) {
    this.current = route;
    if (this.rendered === route.key) return; // already on screen: no duplicate work
    this.rendered = route.key;
    try {
      this.onChange(route);
    } catch (error) {
      // It never made it onto the screen, so don't leave it marked as done —
      // the next navigation (or focus, or hashchange) should try again.
      this.rendered = null;
      throw error;
    }
  }
}
