/**
 * app.js
 * ------
 * Wires the UI together: expression list, canvas, table, settings, and the
 * (entirely mundane) input handling.
 */
import { Graph } from './graph.js';
import { PlayPage } from './play-page.js';
import { Router } from './router.js';
import { formatNumber, formatTick } from './math-engine.js';
import { isUnlockCode, isUnlockCandidate } from './unlock.js';

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const COLORS = [
  '#5b8cff',
  '#ff6b8b',
  '#3ddc97',
  '#ffb347',
  '#b183ff',
  '#2fd6e8',
  '#ff8ad4',
  '#c3d94a',
];

const STORAGE_KEY = 'graphing-calculator:v1';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

let nextId = 1;
const EXAMPLES = ['sin(x)', 'x^2 - 3', '1/x', 'tan(x)', '2 sin(x) / x', 'sqrt(x)', 'e^x', 'x^3 - 3x'];

const state = {
  // one clean curve on first visit; the empty second row invites typing
  expressions: [
    { id: 'e1', color: COLORS[0], visible: true, source: 'sin(x)' },
    { id: 'e2', color: COLORS[1], visible: true, source: '' },
  ],
  radians: true,
  pinned: [],
};

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('graph-canvas');
const rowsHost = document.getElementById('expression-list');
const examplesHost = document.getElementById('examples');
const tableBody = document.getElementById('table-body');
const tableHead = document.getElementById('table-head');
const cursorReadout = document.getElementById('cursor-readout');
const cursorCoords = document.getElementById('cursor-coords');
const cursorValue = document.getElementById('cursor-value');
const pinnedList = document.getElementById('pinned-list');
const toast = document.getElementById('toast');

const appEl = document.getElementById('app');
const router = new Router({
  onChange: (route) => {
    const playing = route.view !== 'calculator';
    appEl.hidden = playing;
    document.body.classList.toggle('view-play', playing);
    playPage.render(route);
    if (!playing) {
      // the calculator was display:none while playing — re-measure on the way back
      graph.resize();
      updateTable();
    }
  },
});
const playPage = new PlayPage(document.getElementById('play-page'), router);

const graph = new Graph(canvas, {
  onCursor: handleCursor,
  onViewport: (view) => {
    updateTable();
    document.getElementById('view-x').textContent = `${formatTick(view.xMin, 1)} … ${formatTick(view.xMax, 1)}`;
    document.getElementById('view-y').textContent = `${formatTick(view.yMin, 1)} … ${formatTick(view.yMax, 1)}`;
  },
});

renderExamples();
renderExpressions();
syncExpressions(); // hand the starter formulas to the graph immediately
renderPinned();
restoreSession(); // may replace the above with a saved session

playPage.attachDocumentListeners();
router.start();

// Ask for the keyboard, then put the caret in the formula box, so "type and it
// graphs" needs zero clicks. In an embedded page the keystroke you type first
// belongs to whoever had focus before us, which is how a whole attempt at typing
// used to disappear. (The caret is only claimed on devices with a real pointer —
// focusing on a touch screen would pop the keyboard open by itself.)
reclaimCaret();

/* ------------------------------------------------------------------ *
 * Expression list
 * ------------------------------------------------------------------ */

function renderExamples() {
  examplesHost.innerHTML = '<span class="examples__label">Examples:</span>';
  for (const example of EXAMPLES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'example-chip';
    chip.textContent = example;
    chip.title = `Graph ${example}`;
    chip.addEventListener('click', () => {
      // fill the first empty row, otherwise add a fresh one
      const target = state.expressions.find((item) => !item.source.trim()) ?? addExpression();
      target.source = example;
      renderExpressions();
      syncExpressions();
      persist();
      focusExpression(target.id);
    });
    examplesHost.append(chip);
  }
}

function renderExpressions() {
  rowsHost.textContent = '';

  for (const expression of state.expressions) {
    const row = document.createElement('div');
    row.className = 'expr-row';
    row.dataset.id = expression.id;

    const prefix = document.createElement('span');
    prefix.className = 'expr-row__prefix';
    prefix.textContent = 'ƒ(x) =';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'expr-row__color';
    swatch.value = expression.color;
    swatch.title = 'Curve colour';
    swatch.setAttribute('aria-label', `Colour for expression ${expression.source || 'new'}`);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'expr-row__input';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.value = expression.source;
    input.placeholder = 'type a formula…';
    input.setAttribute('aria-label', 'Expression');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'expr-row__toggle';
    toggle.textContent = expression.visible ? '👁' : '🚫';
    toggle.title = expression.visible ? 'Hide curve' : 'Show curve';
    toggle.setAttribute('aria-pressed', String(expression.visible));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'expr-row__remove';
    remove.textContent = '✕';
    remove.title = 'Remove expression';
    remove.setAttribute('aria-label', 'Remove expression');

    const error = document.createElement('div');
    error.className = 'expr-row__error';
    error.hidden = true;

    input.addEventListener('input', () => {
      expression.source = input.value;
      if (isUnlockCode(input.value)) return triggerUnlock();
      syncExpressions();
      persist();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (isUnlockCode(input.value)) return triggerUnlock();
        if (expression === state.expressions.at(-1) && input.value.trim()) addExpression();
        else focusNext(input, 1);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusNext(input, 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusNext(input, -1);
      }
    });

    swatch.addEventListener('input', () => {
      expression.color = swatch.value;
      syncExpressions();
      persist();
    });

    toggle.addEventListener('click', () => {
      expression.visible = !expression.visible;
      toggle.textContent = expression.visible ? '👁' : '🚫';
      toggle.setAttribute('aria-pressed', String(expression.visible));
      row.classList.toggle('is-muted', !expression.visible);
      syncExpressions();
      persist();
    });

    remove.addEventListener('click', () => {
      state.expressions = state.expressions.filter((item) => item !== expression);
      if (state.expressions.length === 0) state.expressions.push(newExpression());
      renderExpressions();
      syncExpressions();
      persist();
    });

    row.append(swatch, prefix, input, toggle, remove, error);
    if (!expression.visible) row.classList.add('is-muted');
    rowsHost.append(row);
  }
}

function newExpression() {
  const index = state.expressions.length;
  return {
    id: `e${nextId++}`,
    color: COLORS[index % COLORS.length],
    visible: true,
    source: '',
  };
}

function addExpression() {
  const created = newExpression();
  state.expressions.push(created);
  renderExpressions();
  focusLastInput();
  persist();
  return created;
}

function focusNext(input, delta) {
  const inputs = [...rowsHost.querySelectorAll('.expr-row__input')];
  const index = inputs.indexOf(input);
  const target = inputs[index + delta];
  if (target) target.focus();
}

/** Focus (and select) the formula box for one expression row. */
function focusExpression(id) {
  const input = rowsHost.querySelector(`.expr-row[data-id="${id}"] .expr-row__input`);
  if (!input) return;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange?.(end, end);
}

function focusLastInput() {
  focusExpression(state.expressions.at(-1)?.id);
}

/** Push state into the graph and refresh error messages. */
function syncExpressions() {
  const compiled = graph.setExpressions(state.expressions);
  for (const item of compiled) {
    const row = rowsHost.querySelector(`.expr-row[data-id="${item.id}"]`);
    if (!row) continue;
    const error = row.querySelector('.expr-row__error');
    // A half-typed secret is not a maths error: stay quiet until it is either
    // finished (and unlocks) or clearly abandoned. This is decided on every
    // sync, so another row's edit can't bring the message back.
    const quiet = isUnlockCandidate(item.source ?? '');
    const message = quiet ? '' : (item.error ?? '');
    error.hidden = !message;
    error.textContent = message;
    row.classList.toggle('has-error', Boolean(message));
  }
  updateTable();
}

/* ------------------------------------------------------------------ *
 * Cursor / trace / pinned points
 * ------------------------------------------------------------------ */

function handleCursor(payload) {
  if (payload.pin) {
    pinPoint(payload.pin);
    return;
  }

  const { world, snap, expression } = payload;
  if (!world) {
    cursorReadout.hidden = true;
    return;
  }

  cursorReadout.hidden = false;
  const shown = snap ?? world;
  cursorCoords.textContent = `(${formatNumber(shown.x, 4)}, ${formatNumber(shown.y, 4)})`;

  if (snap && expression) {
    cursorValue.hidden = false;
    cursorValue.textContent = `${expression.source}  →  ${formatNumber(snap.y, 6)}`;
  } else {
    cursorValue.hidden = true;
  }
}

function pinPoint(world) {
  state.pinned.push({ x: world.x, y: world.y, label: `(${formatNumber(world.x, 3)}, ${formatNumber(world.y, 3)})` });
  if (state.pinned.length > 6) state.pinned.shift();
  renderPinned();
}

function renderPinned() {
  graph.setPoints(state.pinned.map((point) => ({ ...point, color: '#ffd166' })));
  if (state.pinned.length === 0) {
    pinnedList.innerHTML = '<li class="pinned__empty">Click a spot on the canvas to drop a marker.</li>';
    return;
  }
  pinnedList.innerHTML = state.pinned
    .map(
      (point, index) => `
      <li class="pinned__item">
        <span class="pinned__dot"></span>
        <code>${point.label}</code>
        <button type="button" class="pinned__remove" data-remove="${index}" title="Remove marker">✕</button>
      </li>`,
    )
    .join('');
  pinnedList.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      state.pinned.splice(Number(button.dataset.remove), 1);
      renderPinned();
    });
  });
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

function updateTable() {
  const step = graph.niceStep(graph.xSpan, Math.max(4, Math.round(graph.width / 110))) / 2 || 0.5;
  const center = graph.tableX ?? 0;
  const rows = [];
  for (let i = -5; i <= 5; i++) rows.push(Number((center + i * step).toFixed(10)));

  tableHead.innerHTML = `<tr><th>x</th>${state.expressions
    .map((expression) => `<th><span class="table__color" style="background:${expression.color}"></span>${escapeHtml(expression.source || '—')}</th>`)
    .join('')}</tr>`;

  tableBody.innerHTML = rows
    .map((x) => {
      const cells = state.expressions
        .map((expression) => {
          const compiled = graph.expressions.find((item) => item.id === expression.id);
          const value = compiled && compiled.fn && compiled.params.size <= 1 ? graph.evaluate(compiled, x) : NaN;
          return `<td>${Number.isNaN(value) ? '—' : formatNumber(value, 5)}</td>`;
        })
        .join('');
      return `<tr><td class="table__x">${formatTick(x, step)}</td>${cells}</tr>`;
    })
    .join('');

  document.getElementById('table-step').textContent = `step ${formatNumber(step, 3)}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/* ------------------------------------------------------------------ *
 * Toolbar
 * ------------------------------------------------------------------ */

document.getElementById('add-expression').addEventListener('click', () => addExpression());

const railToggle = document.getElementById('toggle-rail');
const railVisibleByDefault = () => window.matchMedia?.('(min-width: 1181px)').matches;
railToggle.setAttribute('aria-expanded', String(railVisibleByDefault()));
railToggle.addEventListener('click', () => {
  const open = appEl.classList.contains('rail-open') || (railVisibleByDefault() && !appEl.classList.contains('rail-closed'));
  appEl.classList.toggle('rail-open', !open);
  appEl.classList.toggle('rail-closed', open);
  railToggle.setAttribute('aria-expanded', String(!open));
  railToggle.textContent = open ? 'Panel' : 'Hide panel';
  graph.resize();
  updateTable();
});
document.getElementById('zoom-in').addEventListener('click', () => graph.zoomIn());
document.getElementById('zoom-out').addEventListener('click', () => graph.zoomOut());
document.getElementById('reset-view').addEventListener('click', () => graph.resetView());
document.getElementById('square-zoom').addEventListener('click', () => graph.squareZoom());
document.getElementById('center-origin').addEventListener('click', () => graph.centerOrigin());

const angleToggle = document.getElementById('angle-mode');
angleToggle.addEventListener('click', () => {
  state.radians = !state.radians;
  graph.setAngleMode(state.radians);
  angleToggle.textContent = state.radians ? 'RAD' : 'DEG';
  angleToggle.classList.toggle('is-deg', !state.radians);
  updateTable();
  persist();
});

document.getElementById('clear-markers').addEventListener('click', () => {
  state.pinned = [];
  renderPinned();
});
document.getElementById('clear-all').addEventListener('click', () => {
  state.expressions.length = 0;
  state.expressions.push(newExpression());
  state.pinned = [];
  renderPinned();
  renderExpressions();
  syncExpressions();
  persist();
  focusLastInput();
  showToast('Cleared');
});

/* ------------------------------------------------------------------ *
 * Resizing
 * ------------------------------------------------------------------ */

const resizeObserver = new ResizeObserver(() => {
  graph.resize();
  updateTable();
});
resizeObserver.observe(canvas);

window.addEventListener('resize', () => graph.resize());

/**
 * If the page has focus but no field does, the first character typed should land
 * in the formula box rather than nowhere. (Autofocus is skipped on touch devices
 * and can be missed on some setups, and a swallowed keystroke is the most
 * frustrating possible bug: you type the formula — or the code — and nothing
 * happens, so you type it again.)
 *
 * @returns {boolean} true when the keystroke was consumed here
 */
function typeIntoFormulaBox(event) {
  if (event.defaultPrevented) return false; // already spoken for (e.g. the code)
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.length !== 1) return false; // printable characters only
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '')) return false;

  const rows = [...rowsHost.querySelectorAll('.expr-row__input')];
  const target = rows.find((input) => !input.value) ?? rows.at(-1);
  if (!target) return false;

  event.preventDefault();
  target.focus();
  const caret = target.value.length;
  target.value = target.value.slice(0, caret) + event.key;
  target.setSelectionRange?.(target.value.length, target.value.length);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/* ------------------------------------------------------------------ *
 * The whole point of this file (secret unlock)
 * ------------------------------------------------------------------ */

function triggerUnlock() {
  // Drop the code so the calculator looks untouched afterwards.
  //
  // The row being typed into is emptied whatever it holds: by the time we get
  // here the last keystroke may have been stopped before it landed, so the field
  // can hold fourteen fifteenths of the code, and that is not something to leave
  // lying in the box. Everything else is scrubbed wherever the code turned up —
  // it can have landed in more than one row — and the remaining fields are put
  // back in step with what is actually being plotted.
  const active = document.activeElement;
  const activeId = active?.closest?.('.expr-row')?.dataset.id;

  for (const item of state.expressions) {
    if (item.id === activeId || isUnlockCode(item.source ?? '')) item.source = '';
  }

  for (const input of rowsHost.querySelectorAll('.expr-row__input')) {
    if (input === active) {
      input.value = '';
      continue;
    }
    const id = input.closest('.expr-row')?.dataset.id;
    const item = state.expressions.find((candidate) => candidate.id === id);
    const next = item ? item.source : isUnlockCode(input.value) ? '' : input.value;
    if (input.value !== next) input.value = next;
  }

  syncExpressions();
  persist();

  router.navigate('/play');
  showToast('✦');
}

/* ------------------------------------------------------------------ *
 * Toast + persistence
 * ------------------------------------------------------------------ */

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expressions: state.expressions,
        radians: state.radians,
        view: graph.view,
      }),
    );
  } catch {
    /* storage disabled — no big deal */
  }
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  if (!saved) {
    renderPinned();
    return;
  }
  if (Array.isArray(saved.expressions) && saved.expressions.length) {
    state.expressions = saved.expressions.map((item) => ({ ...newExpression(), ...item, id: `e${nextId++}` }));
    renderExpressions();
    syncExpressions();
  }
  if (typeof saved.radians === 'boolean') {
    state.radians = saved.radians;
    graph.setAngleMode(state.radians);
    angleToggle.textContent = state.radians ? 'RAD' : 'DEG';
    angleToggle.classList.toggle('is-deg', !state.radians);
  }
  if (saved.view && Number.isFinite(saved.view.xMin)) {
    graph.setView(saved.view.xMin, saved.view.xMax, saved.view.yMin, saved.view.yMax);
  }
  renderPinned();
}

/* Save the viewport when the user stops fiddling. */
let viewSaveTimer = null;
graph.onViewport = (view) => {
  updateTable();
  document.getElementById('view-x').textContent = `${formatTick(view.xMin, 1)} … ${formatTick(view.xMax, 1)}`;
  document.getElementById('view-y').textContent = `${formatTick(view.yMin, 1)} … ${formatTick(view.yMax, 1)}`;
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(persist, 400);
};

/* ------------------------------------------------------------------ *
 * Focus, and where typing is heard
 * ------------------------------------------------------------------ */

/**
 * Ask for the keyboard whenever we can.
 *
 * When the calculator is embedded in another page — a preview, a frame on a
 * site — the keystroke typed before anything inside the frame is clicked goes to
 * that other page, so a whole attempt at typing can vanish before any of our
 * code runs. Asking for focus is free when it is refused, and it means the caret
 * is usually already in the box by the time you type.
 */
function askForKeyboard() {
  try {
    window.focus();
  } catch {
    /* refused — the formula box is focused below instead */
  }
}

/** Ask for the keyboard, then put the caret back in the formula box. */
function reclaimCaret() {
  askForKeyboard();
  if (router.route.view !== 'calculator') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  focusLastInput();
}

window.addEventListener('load', reclaimCaret);
window.addEventListener('pageshow', reclaimCaret);
window.addEventListener('focus', reclaimCaret);
document.addEventListener('visibilitychange', () => !document.hidden && reclaimCaret());
/**
 * A click anywhere on the calculator means "I'm here" — put the caret in the
 * formula box while we have the chance.
 *
 * The first keystrokes typed into an embedded view can belong to the page
 * around it, and the one thing a page is always allowed to do is react to a
 * click. So the first click gives the caret somewhere to land, and the typing
 * that follows can't miss. Mice only: on a touch screen this would pop the
 * keyboard open every time somebody panned the graph.
 */
document.addEventListener(
  'pointerdown',
  (event) => {
    askForKeyboard();
    if (router.route.view !== 'calculator') return;
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (document.activeElement?.closest?.('.expr-row')) return; // already typing
    if (event.target?.closest?.('button, a, input, textarea, select, [contenteditable]')) return;
    focusLastInput();
  },
  true,
);
// The first time the pointer moves over us, take the keyboard too. By then the
// person is plainly here, and it is the one nudge that keeps a first attempt at
// typing from going to the page that embeds us.
document.addEventListener('pointermove', reclaimCaret, { once: true, capture: true, passive: true });

/**
 * The tail of what has just been typed, anywhere on the page.
 *
 * Focus is not something a page can take for granted, and the keystroke that
 * unlocks is too important to lose to a stray detail (a field that never got the
 * character, a caret that ended up somewhere else, the first character going to
 * the page that embeds us). So the code is recognised from the document level,
 * in the capture phase — before any of our own handlers — and it counts as soon
 * as it is what you just typed. Only the tail is compared, so an earlier
 * character that went nowhere cannot force a retype.
 */
let typedTail = '';
const TYPED_TAIL_LIMIT = 48;

/**
 * Open the play page if this text is the code.
 *
 * Used by every route text can take into the page, because keys are only one of
 * them: a phone keyboard commits a word through composition, an IME sends it
 * whole, a paste arrives in one go, and a keyboard that reports its keys as
 * "Unidentified" produces text without telling us what was pressed. Whatever
 * the route, the field ends up holding the text — so the fields are watched as
 * well as the keys, and the code never depends on one particular event.
 *
 * @returns {boolean} true when the page is on its way to the play page
 */
function unlockIfCode(text) {
  if (!text || router.route.view !== 'calculator') return false;
  if (!isUnlockCode(text)) return false;
  typedTail = '';
  triggerUnlock();
  return true;
}

// The keys, wherever they are heard.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (router.route.view !== 'calculator') {
      typedTail = '';
      return;
    }
    if (event.key === 'Backspace') {
      typedTail = typedTail.slice(0, -1);
      return;
    }
    if (event.key.length !== 1) return; // Enter, arrows, Tab, Shift…

    typedTail = (typedTail + event.key).slice(-TYPED_TAIL_LIMIT);
    // What has been typed, and what the field itself holds — a composing
    // keyboard can commit text that never showed up as a key at all.
    if (unlockIfCode(typedTail) || unlockIfCode(document.activeElement?.value)) {
      event.preventDefault(); // this keystroke was the code, not a formula
    }
  },
  true,
);

// The text, however it arrived: typing, composition, autofill, a paste.
for (const type of ['input', 'change', 'compositionend']) {
  document.addEventListener(
    type,
    (event) => {
      if (typeof event.target?.value === 'string') unlockIfCode(event.target.value);
    },
    true,
  );
}

document.addEventListener(
  'paste',
  (event) => {
    const text = event.clipboardData?.getData?.('text') ?? '';
    if (unlockIfCode(text)) event.preventDefault();
  },
  true,
);

/* Keyboard shortcuts */
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return; // already handled above
  // never steal keystrokes from an input the user is typing in
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
  if (inField || router.route.view !== 'calculator') return;

  if (typeIntoFormulaBox(event)) return;
  if (event.key === '+' || event.key === '=') {
    graph.zoomIn();
  } else if (event.key === '-' || event.key === '_') {
    graph.zoomOut();
  } else if (event.key === '0') {
    graph.resetView();
  }
});

updateTable();
