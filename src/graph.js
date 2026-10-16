/**
 * graph.js
 * ---------
 * The graphing surface: pan/zoom viewport, grid + axis ticks, curve plotting
 * with automatic discontinuity detection, trace mode and point plotting.
 */
import { parse, compile, collectVariables, formatTick, formatNumber } from './math-engine.js';

const MAX_X_SAMPLES = 2600; // fallback when the viewport is enormous (rarely hit)

export class Graph {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onCursor = callbacks.onCursor ?? (() => {});
    this.onViewport = callbacks.onViewport ?? (() => {});
    this.onVisibility = callbacks.onVisibility ?? (() => {});

    // viewport: world coordinates shown on screen
    this.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
    this.radians = true;

    this.expressions = []; // { id, color, visible, source, ast, fn, error, params:Set }
    this.points = []; // { x, y, color, label }
    this.tableX = 0;

    this.hover = null; // world point under the cursor
    this.pointer = null; // { x, y } css pixels
    this.dragging = false;
    this.dragMoved = false;
    this.traceExpression = null;

    this.dpr = 1;
    this._frame = 0;
    this._bindEvents();
    this.resize();
  }

  /* ---------------------------------------------------------------- *
   * Viewport helpers
   * ---------------------------------------------------------------- */

  get width() {
    return this.canvas.clientWidth || 1;
  }

  get height() {
    return this.canvas.clientHeight || 1;
  }

  get xSpan() {
    return this.view.xMax - this.view.xMin;
  }

  get ySpan() {
    return this.view.yMax - this.view.yMin;
  }

  toScreen(x, y) {
    return {
      x: ((x - this.view.xMin) / this.xSpan) * this.width,
      y: this.height - ((y - this.view.yMin) / this.ySpan) * this.height,
    };
  }

  toWorld(sx, sy) {
    return {
      x: this.view.xMin + (sx / this.width) * this.xSpan,
      y: this.view.yMin + ((this.height - sy) / this.height) * this.ySpan,
    };
  }

  /** Nice 1-2-5 style grid step for a given span. */
  niceStep(span, targetDivisions = 10) {
    const raw = span / targetDivisions;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / magnitude;
    let step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * magnitude;
  }

  setView(xMin, xMax, yMin, yMax) {
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return;
    if (xMax - xMin <= 0 || yMax - yMin <= 0) return;
    this.view = { xMin, xMax, yMin, yMax };
    this.requestRender();
    this.onViewport(this.view);
  }

  zoomBy(factor, anchor) {
    const world = anchor ?? { x: (this.view.xMin + this.view.xMax) / 2, y: (this.view.yMin + this.view.yMax) / 2 };
    this.view = {
      xMin: world.x + (this.view.xMin - world.x) * factor,
      xMax: world.x + (this.view.xMax - world.x) * factor,
      yMin: world.y + (this.view.yMin - world.y) * factor,
      yMax: world.y + (this.view.yMax - world.y) * factor,
    };
    this.requestRender();
    this.onViewport(this.view);
  }

  zoomIn() {
    this.zoomBy(1 / 1.6);
  }

  zoomOut() {
    this.zoomBy(1.6);
  }

  resetView() {
    this.setView(-10, 10, -6.5, 6.5);
  }

  centerOrigin() {
    const cx = (this.view.xMin + this.view.xMax) / 2;
    const cy = (this.view.yMin + this.view.yMax) / 2;
    this.setView(this.view.xMin - cx, this.view.xMax - cx, this.view.yMin - cy, this.view.yMax - cy);
  }

  /** Square zoom: same scale on both axes (true geometry). */
  squareZoom() {
    const scale = Math.max(this.xSpan / this.width, this.ySpan / this.height);
    const cx = (this.view.xMin + this.view.xMax) / 2;
    const cy = (this.view.yMin + this.view.yMax) / 2;
    const halfW = (scale * this.width) / 2;
    const halfH = (scale * this.height) / 2;
    this.setView(cx - halfW, cx + halfW, cy - halfH, cy + halfH);
  }

  /* ---------------------------------------------------------------- *
   * Expressions
   * ---------------------------------------------------------------- */

  /**
   * Replace the expression list. Each entry: { id, color, visible, source }.
   * Returns the updated entries with { ast, fn, error, params } filled in.
   */
  setExpressions(list) {
    this.expressions = list.map((entry) => {
      const out = { ...entry, source: (entry.source ?? '').trim(), error: null, ast: null, fn: null, params: new Set(), hidden: null };
      if (!out.source) return out;
      try {
        out.ast = parse(out.source);
        out.params = collectVariables(out.ast);
        out.fn = compile(out.ast, { deg: !this.radians });
      } catch (err) {
        out.error = err.message;
      }
      return out;
    });
    this.onVisibility(this.expressions);
    this.requestRender();
    return this.expressions;
  }

  setAngleMode(radians) {
    this.radians = radians;
    for (const expr of this.expressions) {
      if (expr.ast) {
        try {
          expr.fn = compile(expr.ast, { deg: !radians });
          expr.error = null;
        } catch (err) {
          expr.error = err.message;
        }
      }
    }
    this.requestRender();
  }

  setPoints(points) {
    this.points = points;
    this.requestRender();
  }

  requestRender() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.render();
    });
  }

  /* ---------------------------------------------------------------- *
   * Layout / DPI
   * ---------------------------------------------------------------- */

  resize() {
    const w = this.width;
    const h = this.height;
    // While the calculator is hidden (display:none) the element measures 0 —
    // keep the last framebuffer instead of collapsing to 1×1.
    if (w <= 1 || h <= 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.requestRender();
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(document.documentElement);
    const theme = {
      grid: styles.getPropertyValue('--grid-line').trim() || 'rgba(255,255,255,0.06)',
      gridStrong: styles.getPropertyValue('--grid-line-strong').trim() || 'rgba(255,255,255,0.12)',
      axis: styles.getPropertyValue('--axis-line').trim() || 'rgba(255,255,255,0.45)',
      label: styles.getPropertyValue('--axis-label').trim() || '#8b93a7',
      accent: styles.getPropertyValue('--accent').trim() || '#5b8cff',
    };

    const xStep = this.niceStep(this.xSpan, Math.max(4, Math.round(w / 90)));
    const yStep = this.niceStep(this.ySpan, Math.max(3, Math.round(h / 70)));

    ctx.lineWidth = 1;
    this.drawGrid(ctx, w, h, xStep, yStep, theme);
    this.drawAxes(ctx, w, h, xStep, yStep, theme);
    this._lastSteps = { xStep, yStep };

    for (const expr of this.expressions) {
      if (expr.visible && expr.fn) this.drawCurve(ctx, w, h, expr);
    }

    this.drawPoints(ctx, theme);
    this.drawTrace(ctx, theme);
  }

  drawGrid(ctx, w, h, xStep, yStep, theme) {
    ctx.save();
    const x0 = Math.floor(this.view.xMin / xStep) * xStep;
    const y0 = Math.floor(this.view.yMin / yStep) * yStep;

    for (let x = x0; x <= this.view.xMax + xStep * 0.001; x += xStep) {
      const sx = Math.round(this.toScreen(x, 0).x) + 0.5;
      const onAxis = Math.abs(x) < xStep * 1e-6;
      ctx.strokeStyle = onAxis ? theme.axis : Math.abs(x / xStep) % 5 === 0 ? theme.gridStrong : theme.grid;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = y0; y <= this.view.yMax + yStep * 0.001; y += yStep) {
      const sy = Math.round(this.toScreen(0, y).y) + 0.5;
      const onAxis = Math.abs(y) < yStep * 1e-6;
      ctx.strokeStyle = onAxis ? theme.axis : Math.abs(y / yStep) % 5 === 0 ? theme.gridStrong : theme.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAxes(ctx, w, h, xStep, yStep, theme) {
    ctx.save();
    const origin = this.toScreen(0, 0);
    const axisY = Math.min(Math.max(origin.y, 0), h);
    const axisX = Math.min(Math.max(origin.x, 0), w);

    ctx.fillStyle = theme.label;
    ctx.font = '500 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelY = Math.min(Math.max(axisY + 6, 4), h - 15);
    const x0 = Math.floor(this.view.xMin / xStep) * xStep;
    for (let x = x0; x <= this.view.xMax + xStep * 0.001; x += xStep) {
      if (Math.abs(x) < xStep * 1e-6) continue;
      const sx = this.toScreen(x, 0).x;
      if (sx < 8 || sx > w - 8) continue; // keep labels off the very edge
      ctx.fillText(formatTick(x, xStep), Math.min(Math.max(sx, 16), w - 16), labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const y0 = Math.floor(this.view.yMin / yStep) * yStep;
    for (let y = y0; y <= this.view.yMax + yStep * 0.001; y += yStep) {
      if (Math.abs(y) < yStep * 1e-6) continue;
      const sy = this.toScreen(0, y).y;
      if (sy < 10 || sy > h - 10) continue;
      // sit just left of the y-axis, but never off the canvas
      ctx.fillText(formatTick(y, yStep), Math.min(Math.max(axisX - 7, 30), w - 6), sy);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    if (axisX > 18 && axisY < h - 16) ctx.fillText('0', axisX - 6, axisY + 5);
    ctx.restore();
  }

  /** Sample an expression across the viewport, splitting at discontinuities. */
  sampleSegments(expr, width) {
    const segments = [];
    const samples = Math.min(MAX_X_SAMPLES, Math.max(width, 600));
    const dx = this.xSpan / samples;
    const yLimit = this.ySpan * 12; // clamp runaway values (asymptotes)

    let current = null;
    let prev = null;
    const scope = Object.create(null);

    for (let i = 0; i <= samples; i++) {
      const x = this.view.xMin + dx * i;
      let y;
      try {
        y = expr.fn({ x, ...(expr.params.has('t') ? {} : {}) , ...scope });
      } catch {
        y = NaN;
      }

      const inRange = Number.isFinite(y) && Math.abs(y) <= yLimit;
      if (!inRange) {
        // A hole in the domain (1/x at 0, sqrt of a negative, ...) ends the
        // current stroke — but the part already traced must still be drawn.
        if (current && current.length > 1) segments.push(current);
        current = null;
        prev = null;
        continue;
      }

      if (prev !== null) {
        const jump = Math.abs(y - prev);
        const slopeJump = jump / Math.abs(dx);
        // vertical asymptote / removable discontinuity heuristics
        if (jump > this.ySpan * 1.5 && slopeJump > 50) {
          if (current && current.length > 1) segments.push(current);
          current = null;
        }
      }

      if (!current) current = [];
      current.push({ x, y });
      prev = y;
    }
    if (current && current.length > 1) segments.push(current);
    return segments;
  }

  drawCurve(ctx, w, h, expr) {
    const segments = this.sampleSegments(expr, Math.max(400, Math.round(w)));
    ctx.save();
    ctx.strokeStyle = expr.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Two cheap passes (wide translucent + narrow solid) instead of a real
    // shadow blur, which is much slower on long paths.
    const pass = (segment, lineWidth, alpha) => {
      ctx.beginPath();
      let started = false;
      for (const point of segment) {
        const s = this.toScreen(point.x, point.y);
        if (started) {
          ctx.lineTo(s.x, s.y);
        } else {
          ctx.moveTo(s.x, s.y);
          started = true;
        }
      }
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    };

    for (const segment of segments) {
      pass(segment, 7, 0.16);
      pass(segment, 2.4, 0.95);
    }
    ctx.restore();
  }

  drawPoints(ctx, theme) {
    ctx.save();
    for (const point of this.points) {
      const s = this.toScreen(point.x, point.y);
      ctx.fillStyle = point.color ?? theme.accent;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (point.label) {
        ctx.fillStyle = theme.label;
        ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(point.label, s.x + 7, s.y - 6);
      }
    }
    ctx.restore();
  }

  drawTrace(ctx, theme) {
    const hover = this.hover;
    if (!hover) return;
    const s = this.toScreen(hover.x, hover.y);
    ctx.save();
    // crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, this.height);
    ctx.moveTo(0, s.y);
    ctx.lineTo(this.width, s.y);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- *
   * Interaction
   * ---------------------------------------------------------------- */

  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.dragMoved = false;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    });

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      if (this.dragging && this.lastPointer) {
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) this.dragMoved = true;
        const worldDx = (dx / this.width) * this.xSpan;
        const worldDy = (dy / this.height) * this.ySpan;
        this.view = {
          xMin: this.view.xMin - worldDx,
          xMax: this.view.xMax - worldDx,
          yMin: this.view.yMin + worldDy,
          yMax: this.view.yMax + worldDy,
        };
        this.lastPointer = { x: event.clientX, y: event.clientY };
        this.onViewport(this.view);
      }

      const world = this.toWorld(sx, sy);
      const snap = this.snapToCurve(world);
      const shown = snap ?? world;
      this.pointer = { x: sx, y: sy };

      const changed =
        !this.hover || Math.abs(this.hover.x - shown.x) > 1e-9 || Math.abs(this.hover.y - shown.y) > 1e-9;
      this.hover = shown;
      this.onCursor({
        world,
        snap,
        expression: snap ? this.traceExpression : null,
        pixels: this.pointer,
      });
      if (changed || this.dragging) this.requestRender();
    });

    const endDrag = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.lastPointer = null;
      canvas.classList.remove('is-dragging');
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      this.requestRender();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const world = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
        const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
        this.zoomBy(factor, world);
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', () => {
      this.resetView();
    });

    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.pointer = null;
      this.onCursor({ world: null, snap: null, expression: null, pixels: null });
      this.requestRender();
    });

    canvas.addEventListener('click', (event) => {
      if (this.dragMoved) return;
      const rect = canvas.getBoundingClientRect();
      const world = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      // clicked on a curve -> start tracing it; otherwise log the point
      if (!this.snapToCurve(world)) {
        this.onCursor({ pin: world });
      }
    });
  }

  /** Nearest point on any visible curve within ~14px of the cursor. */
  snapToCurve(world) {
    const toleranceWorldY = (14 / this.height) * this.ySpan;
    const toleranceWorldX = (14 / this.width) * this.xSpan;
    let best = null;
    for (const expr of this.expressions) {
      if (!expr.visible || !expr.fn) continue;
      for (const dx of [0, -toleranceWorldX / 2, toleranceWorldX / 2]) {
        const x = world.x + dx;
        const y = this.evaluate(expr, x);
        if (!Number.isFinite(y)) continue;
        const distance = Math.abs(y - world.y);
        if (distance <= toleranceWorldY && (!best || distance < best.distance)) {
          best = { x, y, distance, expression: expr };
        }
      }
    }
    if (best) {
      this.traceExpression = best.expression;
      return { x: best.x, y: best.y };
    }
    this.traceExpression = null;
    return null;
  }

  /** Value of a single expression at x (used by the table view). */
  evaluate(expr, x) {
    if (!expr.fn) return NaN;
    try {
      const scope = this._evalScope ?? (this._evalScope = { x: 0 });
      scope.x = x;
      return expr.fn(scope);
    } catch {
      return NaN;
    }
  }

  describePoint(world) {
    return `(${formatNumber(world.x, 4)}, ${formatNumber(world.y, 4)})`;
  }
}
