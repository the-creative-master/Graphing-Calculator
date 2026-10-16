/**
 * launcher.js
 * -----------
 * The overlay that appears when the secret unlock phrase is typed.
 *
 * Screen 1: pick a version.
 * Screen 2: pick a mirror (JS / WASM) for that version.
 * Screen 3: the chosen mirror, running in a full-size <iframe> plus a small
 *           control bar (reload / open in new tab / switch mirror / close).
 *
 * Nothing here fetches, downloads or hosts game files: iframes only.
 */
import { VERSIONS, MIRROR_INDEX, VERSION_INDEX, groupMirrors, countMirrors } from './mirrors.js';

const UNLOADED_HINT_DELAY = 9000;

export class Launcher {
  constructor(root) {
    this.root = root;
    this.lastFocus = null;
    this.history = [];
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
    this.root.setAttribute('aria-label', 'Version launcher');
    this.root.innerHTML = `
      <div class="launcher__backdrop" data-close></div>
      <div class="launcher__panel">
        <header class="launcher__header">
          <div class="launcher__titles">
            <h2 class="launcher__title">Version launcher</h2>
            <p class="launcher__subtitle" data-subtitle>${VERSIONS.length} versions · ${countMirrors()} mirrors · nothing hosted here</p>
          </div>
          <div class="launcher__actions">
            <button type="button" class="icon-btn" data-action="back" hidden title="Back">←</button>
            <button type="button" class="icon-btn" data-action="close" title="Close (Esc)">✕</button>
          </div>
        </header>

        <div class="launcher__body">
          <section class="launcher__screen" data-screen="versions" aria-label="Versions"></section>
          <section class="launcher__screen" data-screen="mirrors" hidden aria-label="Mirrors"></section>
          <section class="launcher__screen launcher__screen--game" data-screen="game" hidden aria-label="Game"></section>
        </div>
      </div>
    `;

    this.panel = this.root.querySelector('.launcher__panel');
    this.screens = {
      versions: this.root.querySelector('[data-screen="versions"]'),
      mirrors: this.root.querySelector('[data-screen="mirrors"]'),
      game: this.root.querySelector('[data-screen="game"]'),
    };
    this.subtitle = this.root.querySelector('[data-subtitle]');
    this.backBtn = this.root.querySelector('[data-action="back"]');

    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-close], [data-action], [data-version], [data-mirror]');
      if (!target) return;

      if (target.hasAttribute('data-close')) return this.close();
      if (target.dataset.action === 'close') return this.close();
      if (target.dataset.action === 'back') return this.back();
      if (target.dataset.version) return this.showMirrors(target.dataset.version);
      if (target.dataset.mirror) return this.openMirror(target.dataset.mirror);
      if (target.dataset.action === 'reload') return this.reloadFrame();
      if (target.dataset.action === 'external') return this.openExternal();
      if (target.dataset.action === 'switch') return this.showMirrors(this.current?.version.id);
    });

    this._onKeydown = (event) => {
      if (this.root.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.current && this.screen === 'game') return this.showMirrors(this.current.version.id);
        return this.close();
      }
    };
    document.addEventListener('keydown', this._onKeydown, true);
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
            <span class="version-card__cta">Choose mirror →</span>
          </button>`,
        ).join('')}
      </div>
      <p class="launcher__note">
        Everything below is embedded straight from third-party sites with an
        <code>&lt;iframe&gt;</code>. No game files are hosted, downloaded or modified here —
        if a mirror is offline or refuses to be framed, try another one.
      </p>
    `;
  }

  renderMirrors(version) {
    this.screens.mirrors.innerHTML = `
      <div class="mirror-head">
        <h3 class="mirror-head__title">Version ${version.name}</h3>
        <p class="mirror-head__sub">${version.subtitle} — pick any mirror. If one is blank, grab the next.</p>
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
                  <span class="mirror-btn__host">${safeHost(mirror.url)}</span>
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
        Tip: <kbd>Esc</kbd> returns to this list, and the button bar inside the game
        lets you switch mirrors whenever one misbehaves.
      </p>
    `;
  }

  renderGame(version, mirror) {
    this.screens.game.innerHTML = `
      <div class="game-bar">
        <div class="game-bar__info">
          <span class="engine-tag engine-tag--${mirror.engine.toLowerCase()}">${mirror.engine}</span>
          <strong>${version.name}</strong>
          <span class="game-bar__dot">·</span>
          <span class="game-bar__label">${mirror.label}</span>
        </div>
        <div class="game-bar__buttons">
          <button type="button" class="ghost-btn" data-action="reload">Reload</button>
          <button type="button" class="ghost-btn" data-action="switch">Swap mirror</button>
          <button type="button" class="ghost-btn" data-action="external">Open in new tab ↗</button>
          <button type="button" class="ghost-btn ghost-btn--danger" data-action="close">Close</button>
        </div>
      </div>
      <div class="game-stage">
        <div class="game-loading" data-loading>
          <div class="spinner"></div>
          <p>Loading <strong>${mirror.label}</strong>…</p>
          <p class="game-loading__hint" data-hint hidden>
            Still blank? Some hosts refuse to be embedded. Use <em>Swap mirror</em> or
            <em>Open in new tab</em>.
          </p>
        </div>
        <iframe
          data-frame
          title="${version.name} ${mirror.engine} — ${mirror.label}"
          src="${mirror.url}"
          allow="${mirror.allow}"
          ${mirror.flags}
          referrerpolicy="no-referrer"
          loading="eager"
          allowfullscreen
        ></iframe>
      </div>
    `;

    this.loading = this.screens.game.querySelector('[data-loading]');
    this.hint = this.screens.game.querySelector('[data-hint]');
    this.frame = this.screens.game.querySelector('[data-frame]');
    this.frameTitle = `${version.name} · ${mirror.label}`;

    this.frame.addEventListener('load', () => this.markLoaded());

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (!this.hint) return;
      this.hint.hidden = false;
    }, UNLOADED_HINT_DELAY);
  }

  markLoaded() {
    clearTimeout(this.hintTimer);
    if (this.loading) {
      this.loading.classList.add('is-hidden');
      setTimeout(() => {
        if (this.loading) this.loading.hidden = true;
      }, 260);
    }
  }

  reloadFrame() {
    if (!this.frame || !this.current) return;
    this.showScreen('game');
    // Re-assign src: works around frames that cache a failed load.
    const { url } = this.current.mirror;
    this.frame.src = 'about:blank';
    requestAnimationFrame(() => {
      if (this.frame) this.frame.src = url;
    });
    if (this.loading) {
      this.loading.hidden = false;
      this.loading.classList.remove('is-hidden');
    }
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint && (this.hint.hidden = false), UNLOADED_HINT_DELAY);
  }

  openExternal() {
    if (!this.current) return;
    window.open(this.current.mirror.url, '_blank', 'noopener,noreferrer');
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    this.screen = name;
    this.backBtn.hidden = name !== 'mirrors';
    this.panel.classList.toggle('launcher__panel--wide', name === 'game');
  }

  showMirrors(versionId) {
    const version = VERSION_INDEX.get(versionId);
    if (!version) return;
    this.destroyFrame();
    this.renderMirrors(version);
    this.subtitle.textContent = `${version.mirrors.length} mirrors · JS + WASM · iframed from third parties`;
    this.showScreen('mirrors');
  }

  openMirror(key) {
    const entry = MIRROR_INDEX.get(key);
    if (!entry) return;
    this.destroyFrame();
    this.current = entry;
    this.renderGame(entry.version, entry.mirror);
    this.subtitle.textContent = `${entry.version.name} · ${entry.mirror.engine} · ${entry.mirror.label}`;
    this.showScreen('game');
  }

  /** Stop the frame (blank it) and drop the whole game screen from the DOM. */
  destroyFrame() {
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (this.frame) this.frame.src = 'about:blank';
    this.frame = null;
    this.loading = null;
    this.hint = null;
    if (this.screens?.game) this.screens.game.textContent = '';
  }

  back() {
    if (this.screen === 'game' && this.current) return this.showMirrors(this.current.version.id);
    if (this.screen === 'mirrors') {
      this.destroyFrame();
      this.subtitle.textContent = `${VERSIONS.length} versions · ${countMirrors()} mirrors · nothing hosted here`;
      return this.showScreen('versions');
    }
    return this.close();
  }

  /* ------------------------------------------------------------- *
   * Open / close
   * ------------------------------------------------------------- */

  open() {
    if (!this.root.hidden) return;
    this.lastFocus = document.activeElement;
    this.renderVersions();
    this.showScreen('versions');
    this.subtitle.textContent = `${VERSIONS.length} versions · ${countMirrors()} mirrors · nothing hosted here`;
    this.root.hidden = false;
    document.body.classList.add('has-launcher');
    // start on top, on versions
    this.panel.querySelector('button')?.focus();
  }

  close() {
    if (this.root.hidden) return;
    this.destroyFrame();
    this.current = null;
    this.root.hidden = true;
    document.body.classList.remove('has-launcher');
    if (this.lastFocus && typeof this.lastFocus.focus === 'function') this.lastFocus.focus();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  get frameSrc() {
    return this.frame?.getAttribute('src') ?? null;
  }

  /** Label for the currently displayed mirror, or null. */
  get currentLabel() {
    if (!this.current) return null;
    return `${this.current.version.name} · ${this.current.mirror.label}`;
  }
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
