/**
 * Border mask for pen plotter safety.
 *
 * Clips artwork geometry to a rectangle inset from the canvas edge so the
 * pen never travels off the paper (a physical pen catching the paper edge
 * can tear the sheet). An SVG clip-path alone is not enough: plotter
 * drivers (the AxiDraw Inkscape extension, saxi, etc.) ignore clip-path
 * and plot the raw geometry, so this module rewrites the coordinates
 * themselves using Liang–Barsky segment clipping.
 *
 * Geometrically clipped: <line>, <polyline>, <polygon>, <rect> (stroke
 * geometry; a clipped closed shape becomes open polylines). Shapes that
 * can't be rewritten — <path>, <circle>, <ellipse>, rounded rects, filled
 * shapes, anything under a transform — get a visual clip-path plus a
 * console warning, since their plotted output may still cross the border.
 *
 * Call after drawing the artwork. Calibration marks (data-calibration)
 * and the border itself are never clipped, so order relative to
 * drawCalibrationMarks() doesn't matter.
 */

import type { CanvasConfig } from './controls/schema';
import { canvasToPixels } from './controls/schema';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface BorderMaskOptions {
  /** Distance from the canvas edge to the mask edge, in px (default 20). */
  inset?: number;
  /** Also draw the border rectangle so the pen plots a frame (default false). */
  drawBorder?: boolean;
  /** Border stroke width in px — preview only; the pen sets the real width (default 1). */
  strokeWidth?: number;
  /** Border stroke color (default black). */
  color?: string;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Point = { x: number; y: number };

/** Tolerance for "same point" when merging clipped segments into runs. */
const EPSILON = 1e-6;

let clipIdCounter = 0;

/**
 * Clip everything already drawn into `svg` to an inset rectangle, and
 * optionally draw the rectangle itself. Returns the border rect element
 * when drawn, otherwise null.
 */
export function applyBorderMask(
  svg: SVGElement,
  canvasConfig: CanvasConfig,
  options: BorderMaskOptions = {},
): SVGRectElement | null {
  const {
    inset = 20,
    drawBorder = false,
    strokeWidth = 1,
    color = '#000',
  } = options;
  const { width, height } = canvasToPixels(canvasConfig);

  const bounds: Bounds = {
    minX: inset,
    minY: inset,
    maxX: width - inset,
    maxY: height - inset,
  };

  const shapes = Array.from(
    svg.querySelectorAll<SVGElement>(
      'line, polyline, polygon, rect, path, circle, ellipse',
    ),
  );

  const unclippable: SVGElement[] = [];

  for (const el of shapes) {
    if (el.closest('[data-calibration], [data-border]')) continue;

    if (!canClipGeometrically(el, svg)) {
      unclippable.push(el);
      continue;
    }

    switch (el.tagName) {
      case 'line':
        clipLineElement(el as SVGLineElement, bounds);
        break;
      case 'polyline':
        clipPolyElement(el, bounds, false);
        break;
      case 'polygon':
        clipPolyElement(el, bounds, true);
        break;
      case 'rect':
        clipRectElement(el as SVGRectElement, bounds);
        break;
    }
  }

  if (unclippable.length > 0) {
    applyVisualClip(svg, unclippable, bounds);
    const tags = [...new Set(unclippable.map((el) => `<${el.tagName}>`))].join(
      ', ',
    );
    console.warn(
      `applyBorderMask: ${unclippable.length} element(s) (${tags}) can't be geometrically clipped; ` +
        'applied a visual clip-path instead. The preview is correct, but a plotter may still ' +
        'draw them past the border unless your plotting toolchain applies clips (e.g. vpype crop).',
    );
  }

  if (drawBorder) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(bounds.minX));
    rect.setAttribute('y', String(bounds.minY));
    rect.setAttribute('width', String(bounds.maxX - bounds.minX));
    rect.setAttribute('height', String(bounds.maxY - bounds.minY));
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', String(strokeWidth));
    rect.setAttribute('fill', 'none');
    // Keep the stroke at screen width when a large canvas is scaled down
    // to fit the preview; plotters follow the geometry, not the stroke.
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    rect.setAttribute('data-border', 'true');
    svg.appendChild(rect);
    return rect;
  }

  return null;
}

/**
 * Geometric clipping only works on plain stroke geometry in canvas
 * coordinates: no transforms anywhere above the shape, no fill (a filled
 * shape rebuilt as polylines would lose its fill), no rounded corners.
 */
function canClipGeometrically(el: SVGElement, svg: SVGElement): boolean {
  const tag = el.tagName;
  if (tag === 'path' || tag === 'circle' || tag === 'ellipse') return false;

  for (
    let node: Element | null = el;
    node && node !== svg;
    node = node.parentElement
  ) {
    if (node.getAttribute('transform')) return false;
  }

  if (tag === 'polygon' || tag === 'rect') {
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none') return false;
  }
  if (tag === 'rect' && (el.getAttribute('rx') || el.getAttribute('ry')))
    return false;

  return true;
}

/** Liang–Barsky: clip one segment to bounds. Null when fully outside. */
function clipSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  b: Bounds,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - b.minX, b.maxX - x1, y1 - b.minY, b.maxY - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }

  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/**
 * Clip a point chain, splitting it into the runs that remain inside.
 * A chain that leaves and re-enters the bounds becomes multiple runs.
 */
function clipChain(points: Point[], b: Bounds): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegment(
      points[i].x,
      points[i].y,
      points[i + 1].x,
      points[i + 1].y,
      b,
    );
    if (!clipped) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }

    const [cx1, cy1, cx2, cy2] = clipped;
    const last = run[run.length - 1];
    if (
      last &&
      Math.abs(last.x - cx1) < EPSILON &&
      Math.abs(last.y - cy1) < EPSILON
    ) {
      run.push({ x: cx2, y: cy2 });
    } else {
      if (run.length > 1) runs.push(run);
      run = [
        { x: cx1, y: cy1 },
        { x: cx2, y: cy2 },
      ];
    }
  }

  if (run.length > 1) runs.push(run);
  return runs;
}

function isInside(p: Point, b: Bounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function parsePoints(el: SVGElement): Point[] {
  const raw = (el.getAttribute('points') ?? '').trim();
  if (!raw) return [];
  const nums = raw.split(/[\s,]+/).map(Number);
  const points: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push({ x: nums[i], y: nums[i + 1] });
  }
  return points;
}

function formatPoints(points: Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clipLineElement(el: SVGLineElement, b: Bounds): void {
  const x1 = Number(el.getAttribute('x1'));
  const y1 = Number(el.getAttribute('y1'));
  const x2 = Number(el.getAttribute('x2'));
  const y2 = Number(el.getAttribute('y2'));

  if (isInside({ x: x1, y: y1 }, b) && isInside({ x: x2, y: y2 }, b)) return;

  const clipped = clipSegment(x1, y1, x2, y2, b);
  if (!clipped) {
    el.remove();
    return;
  }
  el.setAttribute('x1', String(round(clipped[0])));
  el.setAttribute('y1', String(round(clipped[1])));
  el.setAttribute('x2', String(round(clipped[2])));
  el.setAttribute('y2', String(round(clipped[3])));
}

/** Clip a polyline or polygon; the closed shape's outline is treated as a chain. */
function clipPolyElement(el: SVGElement, b: Bounds, closed: boolean): void {
  const points = parsePoints(el);
  if (points.length < 2) return;
  if (points.every((p) => isInside(p, b))) return;

  const chain = closed ? [...points, points[0]] : points;
  const runs = clipChain(chain, b);
  replaceWithRuns(el, runs, ['points']);
}

function clipRectElement(el: SVGRectElement, b: Bounds): void {
  const x = Number(el.getAttribute('x') ?? 0);
  const y = Number(el.getAttribute('y') ?? 0);
  const w = Number(el.getAttribute('width'));
  const h = Number(el.getAttribute('height'));

  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  if (corners.every((p) => isInside(p, b))) return;

  const runs = clipChain([...corners, corners[0]], b);
  replaceWithRuns(el, runs, ['x', 'y', 'width', 'height']);
}

/**
 * Swap an element for the polylines its clipped runs form, keeping all
 * other attributes (and the position in the tree, so styles inherited
 * from a parent group still apply). Removed entirely when nothing is left.
 */
function replaceWithRuns(
  el: SVGElement,
  runs: Point[][],
  dropAttrs: string[],
): void {
  const parent = el.parentNode;
  if (!parent) return;

  for (const run of runs) {
    const poly = document.createElementNS(SVG_NS, 'polyline');
    for (const attr of Array.from(el.attributes)) {
      if (!dropAttrs.includes(attr.name)) {
        poly.setAttribute(attr.name, attr.value);
      }
    }
    poly.setAttribute('points', formatPoints(run));
    parent.insertBefore(poly, el);
  }
  el.remove();
}

/**
 * Visual-only fallback for shapes whose geometry can't be rewritten.
 *
 * The clip rectangle is expressed in canvas coordinates, so it must be
 * referenced from canvas space: clip-path userSpaceOnUse units follow
 * the *referencing* element's user space, so hanging the clip on an
 * element inside a transformed group (e.g. Secondhand Cursive
 * lettering, which lives under a translate+scale) would re-interpret
 * the rectangle in that group's local coordinates and clip a
 * completely different region of the drawing. The clip therefore goes
 * on each affected top-level node — via an untransformed wrapper <g>
 * when the node itself carries a transform — so descendants' transforms
 * stay inside the clip's frame.
 */
function applyVisualClip(
  svg: SVGElement,
  elements: SVGElement[],
  b: Bounds,
): void {
  const id = `border-mask-clip-${clipIdCounter++}`;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  clipPath.setAttribute('id', id);
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', String(b.minX));
  rect.setAttribute('y', String(b.minY));
  rect.setAttribute('width', String(b.maxX - b.minX));
  rect.setAttribute('height', String(b.maxY - b.minY));
  clipPath.appendChild(rect);
  defs.appendChild(clipPath);

  // Clip each element's top-level ancestor (direct child of the svg),
  // deduplicated — clipping the whole node also covers its already
  // geometrically-clipped siblings, which the mask leaves inside the
  // bounds anyway.
  const topLevel = new Set<SVGElement>();
  for (const el of elements) {
    let node = el;
    while (node.parentNode instanceof SVGElement && node.parentNode !== svg) {
      node = node.parentNode;
    }
    topLevel.add(node);
  }

  for (const node of topLevel) {
    if (node.getAttribute('transform')) {
      // A transform on the clipped node itself would drag the clip
      // rectangle along; hang the clip on an untransformed wrapper.
      const wrapper = document.createElementNS(SVG_NS, 'g');
      wrapper.setAttribute('clip-path', `url(#${id})`);
      svg.insertBefore(wrapper, node);
      wrapper.appendChild(node);
    } else {
      node.setAttribute('clip-path', `url(#${id})`);
    }
  }
}
