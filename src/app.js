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
playPage.onNotice = (message) => showToast(message);

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

// Put the caret in the formula box so "type and it graphs" needs zero clicks.
// Skipped on touch devices, where focusing would pop the keyboard open — and
// skipped when the URL points straight at a build.
if (router.route.view === 'calculator' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
  focusLastInput();
}

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
      if (isUnlockCode(input.value)) return triggerUnlock(expression);
      syncExpressions();
      persist();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (isUnlockCode(input.value)) return triggerUnlock(expression);
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

function triggerUnlock(expression) {
  // Drop the code so the calculator looks untouched afterwards.
  expression.source = '';
  const input = rowsHost.querySelector(`.expr-row[data-id="${expression.id}"] .expr-row__input`);
  if (input) input.value = '';
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

/* Keyboard shortcuts */
document.addEventListener('keydown', (event) => {
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
