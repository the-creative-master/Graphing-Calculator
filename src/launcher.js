/**
 * launcher.js
 * -----------
 * The overlay that appears when the secret code is typed.
 *
 * Screen 1: pick a version.
 * Screen 2: pick a build (JavaScript / WebAssembly) for it.
 * Screen 3: the build, running full-size, with a control bar
 *           (fullscreen / restart / another build / close).
 */
import { VERSIONS, MIRROR_INDEX, VERSION_INDEX, groupMirrors, countMirrors } from './mirrors.js';

const SLOW_HINT_DELAY = 9000;

export class Launcher {
  constructor(root) {
    this.root = root;
    this.lastFocus = null;
    this.current = null; // { version, mirror }
    this.hintTimer = null;
    this.build();
  }

  /* ------------------------------------------------------------- *
   * DOM scaffolding
   * ------------------------------------------------------------- */

  build() {
    this.root.className = 'launcher';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Versions');
    this.root.innerHTML = `
      <div class="launcher__backdrop" data-close></div>
      <div class="launcher__panel">
        <header class="launcher__header">
          <div class="launcher__titles">
            <h2 class="launcher__title" data-title>Pick a version</h2>
            <p class="launcher__subtitle" data-subtitle></p>
          </div>
          <div class="launcher__actions">
            <button type="button" class="icon-btn" data-action="back" hidden title="Back">←</button>
            <button type="button" class="icon-btn" data-action="close" title="Close (Esc)">✕</button>
          </div>
        </header>

        <div class="launcher__body">
          <section class="launcher__screen" data-screen="versions" aria-label="Versions"></section>
          <section class="launcher__screen" data-screen="mirrors" hidden aria-label="Builds"></section>
          <section class="launcher__screen launcher__screen--game" data-screen="game" hidden aria-label="Running build"></section>
        </div>
      </div>
    `;

    this.panel = this.root.querySelector('.launcher__panel');
    this.screens = {
      versions: this.root.querySelector('[data-screen="versions"]'),
      mirrors: this.root.querySelector('[data-screen="mirrors"]'),
      game: this.root.querySelector('[data-screen="game"]'),
    };
    this.titleEl = this.root.querySelector('[data-title]');
    this.subtitle = this.root.querySelector('[data-subtitle]');
    this.backBtn = this.root.querySelector('[data-action="back"]');

    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-close], [data-action], [data-version], [data-mirror]');
      if (!target) return;

      if (target.hasAttribute('data-close') || target.dataset.action === 'close') return this.close();
      if (target.dataset.action === 'back') return this.back();
      if (target.dataset.version) return this.showMirrors(target.dataset.version);
      if (target.dataset.mirror) return this.openMirror(target.dataset.mirror);
      if (target.dataset.action === 'fullscreen') return this.toggleFullscreen();
      if (target.dataset.action === 'reload') return this.reloadFrame();
      if (target.dataset.action === 'switch') return this.showMirrors(this.current?.version.id);
    });

    this._onKeydown = (event) => {
      if (this.root.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.screen === 'game' && this.current) return this.showMirrors(this.current.version.id);
        return this.close();
      }
      if ((event.key === 'f' || event.key === 'F') && this.screen === 'game') {
        event.preventDefault();
        this.toggleFullscreen();
      }
    };
    document.addEventListener('keydown', this._onKeydown, true);

    this._onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      if (this.fullscreenBtn) {
        this.fullscreenBtn.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
        this.fullscreenBtn.setAttribute('aria-pressed', String(active));
      }
    };
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
  }

  /* ------------------------------------------------------------- *
   * Screens
   * ------------------------------------------------------------- */

  renderVersions() {
    this.screens.versions.innerHTML = `
      <div class="launcher__grid">
        ${VERSIONS.map(
          (version) => `
          <button type="button" class="version-card" data-version="${version.id}">
            <span class="version-card__top">
              <span class="version-card__name">${version.name}</span>
              ${version.badge ? `<span class="badge badge--hot">${version.badge}</span>` : ''}
            </span>
            <span class="version-card__sub">${version.subtitle}</span>
            <span class="version-card__meta">
              <span class="chip">${version.mirrors.filter((m) => m.engine === 'JS').length} × JS</span>
              <span class="chip">${version.mirrors.filter((m) => m.engine === 'WASM').length} × WASM</span>
            </span>
            <span class="version-card__cta">Choose a build →</span>
          </button>`,
        ).join('')}
      </div>
      <p class="launcher__note">
        Pick a version, then a build. It opens right here in the page — nothing to install,
        nothing to wait for. <kbd>Esc</kbd> closes this and puts your calculator back.
      </p>
    `;
  }

  renderMirrors(version) {
    this.screens.mirrors.innerHTML = `
      <div class="mirror-head">
        <h3 class="mirror-head__title">Version ${version.name}</h3>
        <p class="mirror-head__sub">${version.subtitle} — take whichever build loads fastest for you.</p>
      </div>
      ${groupMirrors(version)
        .map(
          (group) => `
        <div class="mirror-group">
          <div class="mirror-group__label">
            <span class="engine-tag engine-tag--${group.engine.toLowerCase()}">${group.engine}</span>
            <span>${group.label}</span>
          </div>
          <ul class="mirror-list">
            ${group.mirrors
              .map(
                (mirror) => `
              <li>
                <button type="button" class="mirror-btn" data-mirror="${version.id}::${mirror.id}">
                  <span class="mirror-btn__dot"></span>
                  <span class="mirror-btn__label">${mirror.label}</span>
                  <span class="mirror-btn__go">Play</span>
                </button>
              </li>`,
              )
              .join('')}
          </ul>
        </div>`,
        )
        .join('')}
      <p class="launcher__note launcher__note--tight">
        If a build doesn't appear, just pick another one. <kbd>Esc</kbd> comes back here.
      </p>
    `;
  }

  renderGame(version, mirror) {
    this.screens.game.innerHTML = `
      <div class="game-view">
        <div class="game-bar">
          <div class="game-bar__info">
            <span class="engine-tag engine-tag--${mirror.engine.toLowerCase()}">${mirror.engine}</span>
            <strong>${version.name}</strong>
            <span class="game-bar__dot">·</span>
            <span class="game-bar__label">${mirror.label}</span>
          </div>
          <div class="game-bar__buttons">
            <button type="button" class="ghost-btn" data-action="fullscreen" aria-pressed="false">Fullscreen</button>
            <button type="button" class="ghost-btn" data-action="reload">Restart</button>
            <button type="button" class="ghost-btn" data-action="switch">Another build</button>
          </div>
        </div>
        <div class="game-stage" data-stage>
          <div class="game-loading" data-loading>
            <div class="spinner"></div>
            <p>Opening <strong>${version.name}</strong>…</p>
            <p class="game-loading__hint" data-hint hidden>
              Taking longer than usual? Try <em>Another build</em>.
            </p>
          </div>
          <iframe
            data-frame
            title="${version.name} — ${mirror.label}"
            src="${mirror.url}"
            allow="${mirror.allow}"
            allowfullscreen
            referrerpolicy="no-referrer"
            loading="eager"
          ></iframe>
        </div>
      </div>
    `;

    const stage = this.screens.game.querySelector('[data-stage]');
    this.gameView = this.screens.game.querySelector('.game-view');
    this.loading = this.screens.game.querySelector('[data-loading]');
    this.hint = this.screens.game.querySelector('[data-hint]');
    this.frame = this.screens.game.querySelector('[data-frame]');
    this.fullscreenBtn = this.screens.game.querySelector('[data-action="fullscreen"]');
    this._onFullscreenChange();

    this.frame.addEventListener('load', () => this.markLoaded());
    stage.classList.add('is-loading');
    stage.addEventListener('dblclick', () => this.toggleFullscreen());
    this.stage = stage;

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (this.hint) this.hint.hidden = false;
    }, SLOW_HINT_DELAY);
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
    this.hint && (this.hint.hidden = true);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint && (this.hint.hidden = false), SLOW_HINT_DELAY);
  }

  /** Fullscreen the whole running view, control bar included. */
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (this.gameView) {
        await this.gameView.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // A browser that refuses (or denies) fullscreen: the game itself may
      // still offer its own button, so this stays a no-op.
    }
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    this.screen = name;
    if (this.titleEl && name === 'versions') this.titleEl.textContent = 'Pick a version';
    this.backBtn.hidden = name !== 'mirrors';
    this.panel.classList.toggle('launcher__panel--wide', name === 'game');
    if (name !== 'game' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  showMirrors(versionId) {
    const version = VERSION_INDEX.get(versionId);
    if (!version) return;
    this.destroyFrame();
    this.renderMirrors(version);
    this.titleEl.textContent = `Version ${version.name}`;
    this.subtitle.textContent = `${version.mirrors.length} builds — take your pick`;
    this.showScreen('mirrors');
  }

  openMirror(key) {
    const entry = MIRROR_INDEX.get(key);
    if (!entry) return;
    this.destroyFrame();
    this.current = entry;
    this.renderGame(entry.version, entry.mirror);
    this.titleEl.textContent = `Running ${entry.version.name}`;
    this.subtitle.textContent = `${entry.mirror.label} · press F for fullscreen, Esc to go back`;
    this.showScreen('game');
  }

  /** Stop the build and drop the game screen from the DOM. */
  destroyFrame() {
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (this.frame) this.frame.src = 'about:blank';
    this.frame = null;
    this.loading = null;
    this.hint = null;
    this.gameView = null;
    this.fullscreenBtn = null;
    this.stage = null;
    if (this.screens?.game) this.screens.game.textContent = '';
  }

  back() {
    if (this.screen === 'game' && this.current) return this.showMirrors(this.current.version.id);
    if (this.screen === 'mirrors') {
      this.destroyFrame();
      this.titleEl.textContent = 'Pick a version';
      this.subtitle.textContent = this.defaultSubtitle();
      return this.showScreen('versions');
    }
    return this.close();
  }

  /* ------------------------------------------------------------- *
   * Open / close
   * ------------------------------------------------------------- */

  defaultSubtitle() {
    return `${VERSIONS.length} versions · ${countMirrors()} builds`;
  }

  open() {
    if (!this.root.hidden) return;
    this.lastFocus = document.activeElement;
    this.renderVersions();
    this.titleEl.textContent = 'Pick a version';
    this.subtitle.textContent = this.defaultSubtitle();
    this.showScreen('versions');
    this.root.hidden = false;
    document.body.classList.add('has-launcher');
    this.panel.querySelector('button')?.focus();
  }

  close() {
    if (this.root.hidden) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.destroyFrame();
    this.current = null;
    this.root.hidden = true;
    document.body.classList.remove('has-launcher');
    this.lastFocus?.focus?.();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** True when the running build is displayed fullscreen. */
  get isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  /** Label for the currently displayed build, or null. */
  get currentLabel() {
    return this.current ? `${this.current.version.name} · ${this.current.mirror.label}` : null;
  }
}
