/**
 * src/play-page.js
 * ----------------
 * A full page (not an overlay) with three screens, driven by the router:
 *
 *   #/play              the shelf: every version and client
 *   #/play/1.8.8        the builds for one entry
 *   #/play/1.8.8/x      the build, running, filling the window
 *
 * Two things this file is careful about, because they used to be broken:
 *
 *  1. Keyboard — keys belong to the running build. The frame is focused as soon
 *     as it loads and whenever the player clicks it, no single-letter shortcuts
 *     are stolen, and the page tells the player when the browser is still
 *     sending its keystrokes to the page instead.
 *  2. Fullscreen — the real API is used when it is available (with vendor
 *     prefixes), and when a browser or embedding context refuses, the page falls
 *     back to an immersive full-window mode *with an explanation* rather than
 *     silently doing nothing.
 */
import {
  VERSIONS,
  CLIENTS,
  MIRROR_INDEX,
  ENTRY_INDEX,
  groupMirrors,
  countBuilds,
  engineCounts,
  entryPath,
  mirrorPath,
} from './catalog.js';

const LOAD_HINT_DELAY = 9000;

/* ------------------------------------------------------------------ *
 * Fullscreen helpers (vendor prefixes included)
 * ------------------------------------------------------------------ */

const requestFullscreen = (element) =>
  element.requestFullscreen?.({ navigationUI: 'hide' }) ??
  element.webkitRequestFullscreen?.() ??
  element.mozRequestFullScreen?.() ??
  element.msRequestFullscreen?.();

const exitFullscreen = (doc) =>
  doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.() ?? doc.mozCancelFullScreen?.() ?? doc.msExitFullscreen?.();

const fullscreenElement = (doc) =>
  doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement ?? doc.msFullscreenElement ?? null;

const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];

export class PlayPage {
  constructor(root, router) {
    this.root = root;
    this.router = router;
    this.route = { view: 'calculator' };
    this.current = null; // { entry, mirror }
    this.immersive = false;
    this.hintTimer = null;
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
        <div class="play__nav-tools">
          <span class="keys-chip" data-keys hidden></span>
        </div>
      </header>
      <div class="play__body" data-body></div>
    `;

    this.nav = this.root.querySelector('.play__nav');
    this.crumbs = this.root.querySelector('[data-crumbs]');
    this.keysChip = this.root.querySelector('[data-keys]');
    this.body = this.root.querySelector('[data-body]');

    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action], [data-entry], [data-mirror]');
      if (!target) return;

      if (target.dataset.entry) return this.router.navigate(entryPath(ENTRY_INDEX.get(target.dataset.entry)));
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

    // --- keyboard ---------------------------------------------------
    this._onKeydown = (event) => {
      if (this.route.view !== 'game') return;

      // These only ever run while the *page* has focus: once the running build
      // has focus, a cross-origin frame swallows the keystrokes, which is
      // exactly what we want.
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.immersive) return this.setImmersive(false);
        return this.router.back();
      }
      if (event.key === 'Tab') return undefined; // let focus move on purpose
      // Anything else means the player is typing into the page, not the build.
      return this.nudgeKeyboardFocus();
    };

    // --- fullscreen state -------------------------------------------
    this._onFullscreenChange = () => {
      if (fullscreenElement(document)) this.setImmersive(false); // real fullscreen wins
      this.syncControls();
    };

    // --- focus tracking ---------------------------------------------
    // When the build takes focus the parent window blurs; when the player comes
    // back to the page it fires focus. That is a cheap, reliable signal.
    this._onWindowBlur = () => this.route.view === 'game' && this.setKeyTarget('game');
    this._onWindowFocus = () => {
      if (this.route.view !== 'game') return;
      this.setKeyTarget('page');
    };
  }

  attachDocumentListeners() {
    document.addEventListener('keydown', this._onKeydown, false);
    for (const name of FULLSCREEN_EVENTS) document.addEventListener(name, this._onFullscreenChange);
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

  renderCatalog() {
    this.setCrumbs([{ label: 'Home', action: 'calculator' }, { label: 'Play' }]);
    this.keysChip.hidden = true;
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
                ${counts.other ? `<span class="chip">${counts.other} × mirror</span>` : ''}
              </span>
              <span class="entry-card__cta">Choose a build →</span>
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

    this.setCrumbs([{ label: 'Home', action: 'calculator' }, { label: 'Play', action: 'back' }, { label: entry.name }]);
    this.keysChip.hidden = true;
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

    this.setCrumbs([
      { label: 'Home', action: 'calculator' },
      { label: 'Play', action: 'back' },
      { label: entry.name, action: 'another' },
      { label: mirror.label },
    ]);
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
          <button type="button" class="focus-toast" data-focus-toast hidden>
            ⌨️ Click the game so it gets your keystrokes
          </button>
        </div>
      </div>
    `;

    this.stage = this.body.querySelector('[data-stage]');
    this.loading = this.body.querySelector('[data-loading]');
    this.hint = this.body.querySelector('[data-hint]');
    this.frame = this.body.querySelector('[data-frame]');
    this.focusToast = this.body.querySelector('[data-focus-toast]');
    this.fullscreenBtn = this.body.querySelector('[data-action="fullscreen"]');

    this.stage.classList.add('is-loading');
    this.stage.addEventListener('click', () => this.focusGame());
    this.stage.addEventListener('dblclick', () => this.toggleFullscreen());
    this.focusToast.addEventListener('click', () => this.focusGame());

    this.frame.addEventListener('load', () => {
      this.markLoaded();
      this.focusGame(); // the build gets the keyboard straight away
    });

    this.setKeyTarget('page');
    this.syncControls();

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (this.hint) this.hint.hidden = false;
    }, LOAD_HINT_DELAY);
  }

  /* ------------------------------------------------------------- *
   * Running a build
   * ------------------------------------------------------------- */

  /** Hand the keyboard to the running build. */
  focusGame() {
    if (!this.frame) return;
    try {
      this.frame.focus();
      this.frame.contentWindow?.focus?.();
    } catch {
      // cross-origin frames may refuse the inner focus() — the frame focus above is enough
    }
    this.setKeyTarget('game');
    this.hideFocusToast();
  }

  setKeyTarget(target) {
    this.keyTarget = target;
    if (!this.keysChip) return;
    if (this.route.view !== 'game') {
      this.keysChip.hidden = true;
      return;
    }
    this.keysChip.hidden = false;
    const toGame = target === 'game';
    this.keysChip.textContent = toGame ? '⌨️ keys → build' : '⌨️ click the game';
    this.keysChip.classList.toggle('is-warn', !toGame);
  }

  /**
   * The page got a keystroke, which means the build does not have focus — so
   * the player's keys are going nowhere useful. Say so. It disappears the
   * moment the build takes focus again, so it only ever appears when it is true.
   */
  nudgeKeyboardFocus() {
    this.setKeyTarget('page');
    if (this.focusToast) this.focusToast.hidden = false;
  }

  hideFocusToast() {
    if (this.focusToast) this.focusToast.hidden = true;
  }

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
    this.hideFocusToast();
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
    this.current = null;
    this.setImmersive(false);
    this.setKeyTarget('page');
  }

  /* ------------------------------------------------------------- *
   * Fullscreen (with a fallback that actually does something)
   * ------------------------------------------------------------- */

  get isFullscreen() {
    return Boolean(fullscreenElement(document));
  }

  /** True when the browser will even allow a fullscreen request here. */
  get fullscreenAvailable() {
    const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true;
    return Boolean(enabled && (this.root.requestFullscreen || this.root.webkitRequestFullscreen));
  }

  async toggleFullscreen() {
    // Either flavour of "big" toggles off: real fullscreen, or the immersive
    // fallback we used when the browser refused the real thing.
    if (this.isFullscreen || this.immersive) {
      await this.exitFullscreen();
      return;
    }
    await this.enterFullscreen();
  }

  async enterFullscreen() {
    if (!this.route || this.route.view !== 'game') return;

    if (this.fullscreenAvailable) {
      try {
        await requestFullscreen(this.root);
        this.setImmersive(false); // real fullscreen takes over from any fallback
        this.syncControls();
        return;
      } catch {
        // blocked (permissions policy, sandboxed frame, user denial) — fall through
      }
    }
    this.setImmersive(true, this.fullscreenAvailable ? 'blocked' : 'unsupported');
  }

  async exitFullscreen() {
    if (this.isFullscreen) {
      try {
        await exitFullscreen(document);
      } catch {
        /* nothing else we can do */
      }
    }
    this.setImmersive(false);
    this.syncControls();
  }

  /**
   * Full-window mode that works even where the Fullscreen API is blocked:
   * the site chrome steps aside so the build fills the window.
   */
  setImmersive(on, reason) {
    const next = Boolean(on) && this.route.view === 'game';
    if (this.immersive === next) {
      if (next && reason) this.announceImmersion(reason);
      return;
    }
    this.immersive = next;
    document.body.classList.toggle('is-immersive', next);
    if (next && reason) this.announceImmersion(reason);
    this.syncControls();
    this.focusGame();
  }

  announceImmersion(reason) {
    this.onNotice?.(
      reason === 'blocked'
        ? 'Browser fullscreen is blocked here — filling the window instead.'
        : "This browser won't do fullscreen — filling the window instead.",
    );
  }

  syncControls() {
    if (!this.fullscreenBtn) return;
    const active = this.isFullscreen || this.immersive;
    this.fullscreenBtn.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    this.fullscreenBtn.setAttribute('aria-pressed', String(active));
    this.root.classList.toggle('is-immersive', this.immersive);
  }
}

/** Is the route pointing at the build we already have loaded? */
function sameBuild(current, route) {
  return Boolean(current) && current.entry.id === route.entryId && current.mirror.id === route.mirrorId;
}
