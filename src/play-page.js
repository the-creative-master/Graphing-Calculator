/**
 * src/play-page.js
 * ----------------
 * A full page (not an overlay) with three screens, driven by the router:
 *
 *   #/play              the shelf: every version and client
 *   #/play/1.8.8        the builds for one entry (skipped if there's only one)
 *   #/play/1.8.8/x      the build, running, filling the window
 *
 * Two behaviours this file is responsible for:
 *
 *  1. Fullscreen is mocked, not requested. The Fullscreen button expands the
 *     running view until it is the whole window; Esc shrinks it back. No
 *     permissions, no vendor prefixes, no "blocked" dead ends.
 *
 *  2. The keyboard belongs to whoever you meant it for. Keys go to the game;
 *     press K and they go to the page (Esc then works), press K again and they
 *     go back to the game. Clicking either surface picks it too, and the state
 *     is always visible in the control bar, so keystrokes never get eaten
 *     silently.
 */
import {
  VERSIONS,
  CLIENTS,
  MIRROR_INDEX,
  ENTRY_INDEX,
  groupMirrors,
  countBuilds,
  engineCounts,
  isDirectPlay,
  entryPath,
  mirrorPath,
} from './catalog.js';

const LOAD_HINT_DELAY = 9000;

/** Keys that would otherwise scroll or jump the page while the game has none. */
const GAMEPLAY_KEY = /^(?:[a-zA-Z0-9 ]|Arrow(?:Up|Down|Left|Right))$/;

export class PlayPage {
  constructor(root, router) {
    this.root = root;
    this.router = router;
    this.route = { view: 'calculator' };
    this.current = null; // { entry, mirror }
    this.immersive = false;
    this.keyTarget = 'page'; // 'game' | 'page'
    this.hintTimer = null;
    this.nudgeShown = false;
    this.build();
  }

  /* ------------------------------------------------------------- *
   * Shell
   * ------------------------------------------------------------- */

  build() {
    this.root.className = 'play';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="play__nav">
        <button type="button" class="play__home" data-action="calculator">← Calculator</button>
        <nav class="play__crumbs" data-crumbs aria-label="Breadcrumb"></nav>
      </header>
      <div class="play__body" data-body></div>
    `;

    this.crumbs = this.root.querySelector('[data-crumbs]');
    this.body = this.root.querySelector('[data-body]');

    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action], [data-entry], [data-mirror]');
      if (!target) return;

      // The keyboard button does its own toggling, so it must not be
      // pre-empted by the "chrome click releases the keyboard" rule below.
      if (target.dataset.action === 'keyboard') return this.toggleKeyboard();

      // Any other click on the page chrome means the player wants the page
      // (and its keys) back from the game.
      this.setKeyTarget('page', { focus: false });

      if (target.dataset.entry) return this.openEntry(ENTRY_INDEX.get(target.dataset.entry));
      if (target.dataset.mirror) return this.openMirror(target.dataset.mirror);

      switch (target.dataset.action) {
        case 'calculator':
          return this.router.navigate('/');
        case 'back':
          return this.router.back();
        case 'fullscreen':
          return this.toggleFullscreen();
        case 'restart':
          return this.reloadFrame();
        case 'another':
          return this.router.navigate(entryPath(this.current.entry));
        default:
          return undefined;
      }
    });

    // --- keyboard ----------------------------------------------------
    // This only ever runs while the *page* has focus, which is exactly when the
    // build is not receiving keys.
    this._onKeydown = (event) => {
      if (this.route.view !== 'game') return;
      if (isTextEntry(event.target)) return;

      const { key } = event;

      // K is the one shortcut the page always keeps: it hands the keyboard
      // over to the game, and hands it back.
      if (key === 'k' || key === 'K') {
        event.preventDefault();
        this.toggleKeyboard();
        return;
      }

      if (this.keyTarget === 'game') return; // never fight the game for keys

      if (key === 'Escape') {
        event.preventDefault();
        if (this.immersive) return this.setImmersive(false);
        return this.router.back();
      }

      // Swallow gameplay keys so they can't scroll the page, and explain where
      // they should be going instead.
      if (GAMEPLAY_KEY.test(key)) {
        event.preventDefault();
        this.nudgeKeyboardFocus();
      }
      return undefined;
    };

    // Focus tells us who has the keyboard: focusing the build blurs the page.
    this._onWindowBlur = () => this.route.view === 'game' && this.setKeyTarget('game', { focus: false });
    this._onWindowFocus = () => this.route.view === 'game' && this.setKeyTarget('page', { focus: false });
  }

  attachDocumentListeners() {
    document.addEventListener('keydown', this._onKeydown, false);
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('focus', this._onWindowFocus);
  }

  /* ------------------------------------------------------------- *
   * Routes
   * ------------------------------------------------------------- */

  render(route) {
    const leavingGame = this.route.view === 'game' && route.view !== 'game';
    this.route = route;

    if (route.view === 'calculator') {
      this.root.hidden = true;
      if (leavingGame) this.teardownGame();
      return;
    }

    this.root.hidden = false;
    if (leavingGame || (route.view === 'game' && !sameBuild(this.current, route))) this.teardownGame();

    switch (route.view) {
      case 'catalog':
        this.renderCatalog();
        break;
      case 'builds':
        this.renderBuilds(route.entryId);
        break;
      case 'game':
        this.renderGame(route.entryId, route.mirrorId);
        break;
      default:
        break;
    }
  }

  setCrumbs(items) {
    this.crumbs.innerHTML = items
      .map((item, index) =>
        item.action
          ? `<button type="button" class="crumb" data-action="${item.action}">${item.label}</button>${index < items.length - 1 ? '<span class="crumb__sep">/</span>' : ''}`
          : `<span class="crumb crumb--current">${item.label}</span>`,
      )
      .join('');
  }

  /** Open an entry: straight to its only build, or to the picker if it has more. */
  openEntry(entry) {
    if (!entry) return;
    if (isDirectPlay(entry)) return this.router.navigate(mirrorPath(entry, entry.mirrors[0]));
    return this.router.navigate(entryPath(entry));
  }

  renderCatalog() {
    this.setCrumbs([{ label: 'Home', action: 'calculator' }, { label: 'Play' }]);
    document.title = 'Play — Graphing Calculator';

    const section = (title, entries, blurb) => `
      <section class="shelf">
        <div class="shelf__head">
          <h2>${title}</h2>
          <span class="shelf__meta">${entries.length} · ${countBuilds(entries)} builds</span>
        </div>
        <p class="shelf__blurb">${blurb}</p>
        <div class="shelf__grid">
          ${entries
            .map((entry) => {
              const counts = engineCounts(entry);
              const direct = isDirectPlay(entry);
              return `
            <button type="button" class="entry-card" data-entry="${entry.id}">
              <span class="entry-card__top">
                <span class="entry-card__name">${entry.name}</span>
                ${entry.badge ? `<span class="badge badge--${entry.kind === 'client' ? 'client' : 'hot'}">${entry.badge}</span>` : ''}
              </span>
              <span class="entry-card__sub">${entry.subtitle}</span>
              <span class="entry-card__meta">
                ${counts.JS ? `<span class="chip">${counts.JS} × JS</span>` : ''}
                ${counts.WASM ? `<span class="chip">${counts.WASM} × WASM</span>` : ''}
                ${counts.other ? `<span class="chip">${counts.other} × mirror${counts.other > 1 ? 's' : ''}</span>` : ''}
              </span>
              <span class="entry-card__cta">${direct ? 'Play →' : 'Choose a build →'}</span>
            </button>`;
            })
            .join('')}
        </div>
      </section>`;

    this.body.innerHTML = `
      <div class="play__head">
        <h1>What are we playing?</h1>
        <p>Pick a version or a client. It opens right here, full page — nothing to install.</p>
      </div>
      ${section('Versions', VERSIONS, 'Straight-up releases, JS and WebAssembly builds.')}
      ${section('Clients', CLIENTS, 'Custom clients with their own launchers, mods and menus.')}
    `;
  }

  renderBuilds(entryId) {
    const entry = ENTRY_INDEX.get(entryId);
    if (!entry) return this.router.navigate('/play', { replace: true });
    // A single build means there is nothing to choose — open it.
    if (isDirectPlay(entry)) return this.router.navigate(mirrorPath(entry, entry.mirrors[0]), { replace: true });

    this.setCrumbs([{ label: 'Home', action: 'calculator' }, { label: 'Play', action: 'back' }, { label: entry.name }]);
    document.title = `${entry.name} — Graphing Calculator`;

    const groups = groupMirrors(entry);
    this.body.innerHTML = `
      <div class="play__head">
        <p class="eyebrow">${entry.kind === 'client' ? 'Client' : 'Version'}</p>
        <h1>${entry.name}</h1>
        <p>${entry.subtitle} — take whichever build loads fastest for you.</p>
      </div>
      ${groups
        .map(
          (group) => `
        <section class="build-group">
          <div class="build-group__label">
            ${group.key === 'any' ? '' : `<span class="engine-tag engine-tag--${group.key}">${group.key.toUpperCase()}</span>`}
            <span>${group.label}</span>
          </div>
          <ul class="build-list">
            ${group.mirrors
              .map(
                (mirror) => `
              <li>
                <button type="button" class="build-btn" data-mirror="${entry.id}::${mirror.id}">
                  <span class="build-btn__dot"></span>
                  <span class="build-btn__text">
                    <span class="build-btn__label">${mirror.label}</span>
                    ${mirror.note ? `<span class="build-btn__note${mirror.warn ? ' is-warn' : ''}">${mirror.warn ? '⚠ ' : ''}${mirror.note}</span>` : ''}
                  </span>
                  <span class="build-btn__go">Play</span>
                </button>
              </li>`,
              )
              .join('')}
          </ul>
        </section>`,
        )
        .join('')}
      <p class="play__note">
        If a build doesn't appear, just pick another one. <kbd>Esc</kbd> goes back.
      </p>
    `;
  }

  renderGame(entryId, mirrorId) {
    const found = MIRROR_INDEX.get(`${entryId}::${mirrorId}`);
    if (!found) return this.router.navigate(`/play/${entryId}`, { replace: true });

    const { entry, mirror } = found;
    this.current = { entry, mirror };
    const crumbs = [{ label: 'Home', action: 'calculator' }, { label: 'Play', action: 'back' }];
    if (!isDirectPlay(entry)) crumbs.push({ label: entry.name, action: 'another' });
    crumbs.push({ label: isDirectPlay(entry) ? entry.name : mirror.label });
    this.setCrumbs(crumbs);
    document.title = `${entry.name} · ${mirror.label} — Graphing Calculator`;

    this.body.innerHTML = `
      <div class="game-page">
        <div class="game-hud">
          <span class="game-hud__info">
            ${mirror.engine ? `<span class="engine-tag engine-tag--${mirror.engine.toLowerCase()}">${mirror.engine}</span>` : ''}
            <strong>${entry.name}</strong>
            <span class="game-hud__label">${mirror.label}</span>
            ${mirror.note ? `<span class="build-btn__note${mirror.warn ? ' is-warn' : ''}">${mirror.warn ? '⚠ ' : ''}${mirror.note}</span>` : ''}
          </span>
          <span class="game-hud__buttons">
            <button type="button" class="keys-btn" data-action="keyboard" data-keys></button>
            <button type="button" class="ghost-btn" data-action="fullscreen" aria-pressed="false">Fullscreen</button>
            <button type="button" class="ghost-btn" data-action="restart">Restart</button>
            <button type="button" class="ghost-btn" data-action="another">Another build</button>
          </span>
        </div>

        <div class="game-stage" data-stage tabindex="-1">
          <div class="game-loading" data-loading>
            <div class="spinner"></div>
            <p>Opening <strong>${entry.name}</strong>…</p>
            <p class="game-loading__hint" data-hint hidden>
              Taking longer than usual? Try <em>Another build</em>.
            </p>
          </div>
          <iframe
            data-frame
            title="${entry.name} — ${mirror.label}"
            src="${mirror.url}"
            allow="${mirror.allow}"
            allowfullscreen
            referrerpolicy="no-referrer"
            loading="eager"
          ></iframe>
          <button type="button" class="focus-toast" data-focus-toast hidden></button>
        </div>
      </div>
    `;

    this.stage = this.body.querySelector('[data-stage]');
    this.loading = this.body.querySelector('[data-loading]');
    this.hint = this.body.querySelector('[data-hint]');
    this.frame = this.body.querySelector('[data-frame]');
    this.focusToast = this.body.querySelector('[data-focus-toast]');
    this.fullscreenBtn = this.body.querySelector('[data-action="fullscreen"]');
    this.keysBtn = this.body.querySelector('[data-keys]');

    this.stage.classList.add('is-loading');
    this.stage.addEventListener('click', () => this.setKeyTarget('game'));
    this.stage.addEventListener('dblclick', () => this.toggleFullscreen());
    this.focusToast.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleKeyboard();
    });

    this.frame.addEventListener('load', () => {
      this.markLoaded();
      // Blanks fired by a restart aren't a real load; don't let them pull the
      // keyboard back while the player is clicking around the page.
      if (this.frame?.getAttribute('src') === 'about:blank') return;
      // Otherwise hand the keyboard straight to the build: that is what you came for.
      this.setKeyTarget('game');
    });

    this.nudgeShown = false;
    this.syncControls();
    this.syncKeysControl();

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (this.hint) this.hint.hidden = false;
    }, LOAD_HINT_DELAY);
  }

  /* ------------------------------------------------------------- *
   * Keyboard ownership
   * ------------------------------------------------------------- */

  /**
   * Point the keyboard at the game or at the page.
   *
   *   'game' — the build is focused, so its own keys (WASD, Esc, T, …) work.
   *   'page' — the page is focused, so K and Esc work here.
   *
   * Focus decides this in practice, so we either move focus or just record it.
   */
  setKeyTarget(target, { focus = true } = {}) {
    this.keyTarget = target === 'game' ? 'game' : 'page';

    if (focus && this.keyTarget === 'game' && this.frame) {
      try {
        this.frame.focus();
        this.frame.contentWindow?.focus?.();
      } catch {
        // a cross-origin build may refuse the inner focus; the frame focus stands
      }
    }

    if (this.keyTarget === 'page' && focus) this.keysBtn?.focus?.();

    this.syncKeysControl();
    this.syncNudge();
  }

  /** K toggles between the two. */
  toggleKeyboard() {
    const next = this.keyTarget === 'game' ? 'page' : 'game';
    this.setKeyTarget(next);
    this.onNotice?.(
      next === 'game'
        ? '🎮 Keyboard locked to the game'
        : '⌨️ Keyboard released — Esc exits fullscreen, K locks it again',
    );
  }

  syncKeysControl() {
    const locked = this.keyTarget === 'game';
    if (this.keysBtn) {
      this.keysBtn.textContent = locked ? '🎮 keyboard: game' : '⌨️ keyboard: page';
      this.keysBtn.classList.toggle('is-locked', locked);
      this.keysBtn.title = locked
        ? 'Your keys are going to the game. Click (or press K once the page has focus) to take them back.'
        : 'Your keys are going to the page. Press K to send them to the game.';
      this.keysBtn.setAttribute('aria-pressed', String(!locked));
    }
  }

  /** Only nudge while the keys are on the page and the player seems to want otherwise. */
  nudgeKeyboardFocus() {
    if (this.keyTarget === 'game') return;
    if (this.focusToast) {
      this.focusToast.textContent = '⌨️ Press K to send your keys to the game';
      this.focusToast.hidden = false;
    }
    this.nudgeShown = true;
  }

  syncNudge() {
    if (this.nudgeShown && this.focusToast) this.focusToast.hidden = this.keyTarget === 'game';
  }

  /* ------------------------------------------------------------- *
   * Running a build
   * ------------------------------------------------------------- */

  markLoaded() {
    clearTimeout(this.hintTimer);
    this.stage?.classList.remove('is-loading');
    if (!this.loading) return;
    this.loading.classList.add('is-hidden');
    setTimeout(() => {
      if (this.loading) this.loading.hidden = true;
    }, 260);
  }

  reloadFrame() {
    if (!this.frame || !this.current) return;
    const { url } = this.current.mirror;
    this.frame.src = 'about:blank';
    requestAnimationFrame(() => {
      if (this.frame) this.frame.src = url;
    });
    if (this.loading) {
      this.loading.hidden = false;
      this.loading.classList.remove('is-hidden');
    }
    this.stage?.classList.add('is-loading');
    if (this.hint) this.hint.hidden = true;
    if (this.focusToast) this.focusToast.hidden = true;
    this.nudgeShown = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint && (this.hint.hidden = false), LOAD_HINT_DELAY);
  }

  openMirror(key) {
    const found = MIRROR_INDEX.get(key);
    if (!found) return;
    this.router.navigate(mirrorPath(found.entry, found.mirror));
  }

  /** Stop the build and clear the running view. */
  teardownGame() {
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (this.frame) this.frame.src = 'about:blank';
    this.frame = null;
    this.loading = null;
    this.hint = null;
    this.stage = null;
    this.focusToast = null;
    this.fullscreenBtn = null;
    this.keysBtn = null;
    this.current = null;
    this.setImmersive(false);
    this.keyTarget = 'page';
  }

  /* ------------------------------------------------------------- *
   * Mock fullscreen: the running view becomes the whole window
   * ------------------------------------------------------------- */

  get isFullscreen() {
    return this.immersive;
  }

  toggleFullscreen() {
    this.setImmersive(!this.immersive);
  }

  setImmersive(on) {
    const next = Boolean(on) && this.route.view === 'game';
    if (this.immersive === next) {
      this.syncControls();
      return;
    }
    this.immersive = next;
    document.body.classList.toggle('is-immersive', next);
    this.root.classList.toggle('is-immersive', next);
    this.syncControls();
  }

  syncControls() {
    if (!this.fullscreenBtn) return;
    this.fullscreenBtn.textContent = this.immersive ? 'Exit fullscreen' : 'Fullscreen';
    this.fullscreenBtn.setAttribute('aria-pressed', String(this.immersive));
  }
}

/** Is the route pointing at the build we already have loaded? */
function sameBuild(current, route) {
  return Boolean(current) && current.entry.id === route.entryId && current.mirror.id === route.mirrorId;
}

/** Don't hijack typing in our own fields. */
function isTextEntry(target) {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '');
}
