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

  /** Navigate to a path like '/play/1.8.8' (a leading # is optional). */
  navigate(path, { replace = false } = {}) {
    const target = `#${String(path).replace(/^#/, '')}`;
    if (this.window.location.hash === target) {
      this._emit();
      return;
    }
    if (replace && this.window.history?.replaceState) {
      this.window.history.replaceState(null, '', target);
      this._emit();
    } else {
      // Assigning the hash pushes a history entry, so Back works.
      this.window.location.hash = target;
    }
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

  _emit() {
    const route = parseRoute(this.window.location.hash);
    if (this.current && this.current.key === route.key) return; // no duplicate work
    this.current = route;
    this.onChange(route);
  }
}
