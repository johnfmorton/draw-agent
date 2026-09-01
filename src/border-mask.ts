/**
 * Border mask for pen plotter safety.
 *
 * Clips artwork geometry to a rectangle inset from the canvas edge so
 * the pen never travels off the paper (a physical pen catching the
 * paper edge can tear the sheet). An SVG clip-path alone is not enough:
 * plotter drivers (the AxiDraw Inkscape extension, saxi, etc.) ignore
 * clip-path and plot the raw geometry, so this module rewrites the
 * coordinates themselves — for every shape kind:
 *
 * - <line>/<polyline>/<polygon>/plain <rect> strokes: Liang–Barsky
 *   segment clipping (a clipped closed shape becomes open polylines).
 * - <path> (curves included), <circle>, <ellipse>, rounded rects, and
 *   anything under a transform: normalized to an L/Q/C model
 *   (src/path-geometry.ts), mapped to root user space, clipped exactly
 *   (curves are split at the border, not flattened), mapped back, and
 *   replaced in place so inherited styles and local-unit stroke widths
 *   survive.
 * - Filled shapes: boolean-intersected with the mask rect, so the
 *   clipped outline hugs the border and the fill stays correct. "Filled"
 *   means an explicit fill attribute (here or on an ancestor) that isn't
 *   none — SVG's implicit default-black fill is deliberately ignored,
 *   matching how artwork in this repo is authored.
 *
 * The mask bounds are stamped on the svg root (data-border-mask), and a
 * MutationObserver clips geometry that arrives after draw() returns
 * (e.g. Secondhand Cursive lettering on a cache miss). At export time,
 * reapplyBorderMask() re-runs the clip on the export clone — idempotent
 * for already-clipped ink — and removes the rare element that cannot be
 * rewritten (unparseable path data, degenerate transform), so nothing
 * unclipped ever reaches the plotter.
 *
 * Call after drawing the artwork. Calibration marks (data-calibration)
 * and the border itself are never clipped, so order relative to
 * drawCalibrationMarks() doesn't matter.
 */

import type { CanvasConfig } from './controls/schema';
import { canvasToPixels } from './controls/schema';
import type { Bounds, Pt, SubPath, Seg, Mat } from './path-geometry';
import {
  clipChain,
  clipRingsToRect,
  clipSegmentLB,
  clipSubPathsToRect,
  ellipseToSubPath,
  flattenSubPathToRing,
  boundsContained,
  matIdentity,
  matInvert,
  matIsIdentity,
  matMultiply,
  parsePathData,
  parseTransformAttribute,
  ringToSubPath,
  roundedRectToSubPath,
  serializePathData,
  subPathsBounds,
  transformSubPaths,
} from './path-geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SHAPE_SELECTOR = 'line, polyline, polygon, rect, path, circle, ellipse';

/** Attributes that carry geometry (dropped when rebuilding as <path>). */
const GEOMETRY_ATTRS = new Set([
  'd',
  'points',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'id',
]);

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

type ClipOutcome = 'clipped' | 'untouched' | 'removed' | 'unclippable';

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

  // Stamp the mask so exports can re-apply it to late-arriving geometry.
  svg.setAttribute(
    'data-border-mask',
    `${bounds.minX} ${bounds.minY} ${bounds.maxX} ${bounds.maxY}`,
  );

  clipSvgToBounds(svg, bounds, 'preview');
  observeLateArrivals(svg, bounds);

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
 * Re-apply the stamped border mask on an (export) clone: strip the
 * preview-only clip machinery, geometrically clip whatever is present
 * now (idempotent for already-clipped ink — this is what catches
 * lettering that arrived after draw() returned), and remove anything
 * that still can't be rewritten so it is never plotted. No-op when the
 * artwork never applied a mask.
 */
export function reapplyBorderMask(svg: SVGElement): void {
  const stamp = svg.getAttribute('data-border-mask');
  if (!stamp) return;
  const nums = stamp.trim().split(/\s+/).map(Number);
  if (nums.length !== 4 || nums.some(Number.isNaN)) return;
  const bounds: Bounds = {
    minX: nums[0],
    minY: nums[1],
    maxX: nums[2],
    maxY: nums[3],
  };

  // Safety first: anything flagged unclippable at draw time is removed.
  const doomed = Array.from(
    svg.querySelectorAll<SVGElement>('[data-border-mask-unclippable]'),
  );
  if (doomed.length > 0) {
    console.warn(
      `reapplyBorderMask: removing ${doomed.length} element(s) that could not be ` +
        'geometrically clipped, so they are not sent to the plotter.',
    );
    for (const el of doomed) el.remove();
  }

  stripPreviewClips(svg);
  clipSvgToBounds(svg, bounds, 'export');
}

/** Remove the visual clipPaths + wrappers applyVisualClip() created. */
function stripPreviewClips(svg: SVGElement): void {
  for (const clip of Array.from(svg.getElementsByTagName('clipPath'))) {
    if ((clip.getAttribute('id') ?? '').startsWith('border-mask-clip-')) {
      const defs = clip.parentElement;
      clip.remove();
      if (defs && defs.tagName === 'defs' && defs.childNodes.length === 0)
        defs.remove();
    }
  }
  for (const el of Array.from(svg.querySelectorAll('[clip-path]'))) {
    const ref = el.getAttribute('clip-path') ?? '';
    if (!ref.includes('border-mask-clip-')) continue;
    el.removeAttribute('clip-path');
    if (el.tagName === 'g' && el.attributes.length === 0) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
    }
  }
}

/**
 * Walk every shape in the svg and clip it. In 'preview' mode shapes
 * that can't be rewritten get a visual clip + warning; in 'export' mode
 * they are removed.
 */
function clipSvgToBounds(
  svg: SVGElement,
  bounds: Bounds,
  mode: 'preview' | 'export',
): void {
  const shapes = Array.from(svg.querySelectorAll<SVGElement>(SHAPE_SELECTOR));
  const unclippable: SVGElement[] = [];

  for (const el of shapes) {
    if (el.closest('[data-calibration], [data-border]')) continue;
    if (el.getAttribute('data-border-mask-unclippable')) continue;
    if (isInDefs(el, svg)) continue;
    if (clipShapeElement(el, bounds, svg) === 'unclippable')
      unclippable.push(el);
  }

  if (unclippable.length === 0) return;
  if (mode === 'export') {
    console.warn(
      `reapplyBorderMask: removing ${unclippable.length} element(s) that could not be ` +
        'geometrically clipped, so they are not sent to the plotter.',
    );
    for (const el of unclippable) el.remove();
  } else {
    markUnclippable(svg, unclippable, bounds);
  }
}

function markUnclippable(
  svg: SVGElement,
  elements: SVGElement[],
  bounds: Bounds,
): void {
  for (const el of elements)
    el.setAttribute('data-border-mask-unclippable', 'true');
  applyVisualClip(svg, elements, bounds);
  const tags = [...new Set(elements.map((el) => `<${el.tagName}>`))].join(', ');
  console.warn(
    `applyBorderMask: ${elements.length} element(s) (${tags}) could not be geometrically ` +
      'clipped (unparseable geometry or degenerate transform); they are visually clipped ' +
      'in the preview and will be removed from exports.',
  );
}

/**
 * Clip geometry that is appended after draw() returns (async lettering,
 * anything an artwork adds late) so the preview always shows what will
 * be plotted. The observer disconnects around its own rewrites.
 */
function observeLateArrivals(svg: SVGElement, bounds: Bounds): void {
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    try {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (!svg.contains(node)) continue; // removed again before we ran
          clipAddedSubtree(node, bounds, svg);
        }
      }
    } finally {
      observer.takeRecords();
      observer.observe(svg, { childList: true, subtree: true });
    }
  });
  observer.observe(svg, { childList: true, subtree: true });
}

function clipAddedSubtree(el: Element, bounds: Bounds, svg: SVGElement): void {
  if (el.closest('[data-calibration], [data-border]')) return;
  if (isInDefs(el, svg)) return;
  const targets: SVGElement[] = [];
  if (el.matches(SHAPE_SELECTOR)) targets.push(el as SVGElement);
  targets.push(...Array.from(el.querySelectorAll<SVGElement>(SHAPE_SELECTOR)));

  const unclippable: SVGElement[] = [];
  for (const t of targets) {
    if (t.closest('[data-calibration], [data-border]')) continue;
    if (t.getAttribute('data-border-mask-unclippable')) continue;
    if (isInDefs(t, svg)) continue;
    if (clipShapeElement(t, bounds, svg) === 'unclippable') unclippable.push(t);
  }
  if (unclippable.length > 0) markUnclippable(svg, unclippable, bounds);
}

function isInDefs(el: Element, root: Element): boolean {
  for (
    let node: Element | null = el;
    node && node !== root;
    node = node.parentElement
  ) {
    const tag = node.tagName;
    if (
      tag === 'defs' ||
      tag === 'clipPath' ||
      tag === 'mask' ||
      tag === 'symbol'
    )
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Per-element clipping

/**
 * Clip one shape element in place. Untransformed simple strokes go
 * through the original exact polyline path (byte-identical behavior);
 * everything else is normalized, mapped to root user space, clipped,
 * mapped back, and replaced in place.
 */
function clipShapeElement(
  el: SVGElement,
  bounds: Bounds,
  root: SVGElement,
): ClipOutcome {
  const m = getComposedMatrix(el, root);
  if (!m) return 'unclippable';
  const identity = matIsIdentity(m);

  if (identity) {
    switch (el.tagName) {
      case 'line':
        return clipLineElement(el, bounds);
      case 'polyline':
        return clipPolyElement(el, bounds, false);
      case 'polygon':
        if (!explicitFilled(el)) return clipPolyElement(el, bounds, true);
        break;
      case 'rect':
        if (
          !explicitFilled(el) &&
          !el.getAttribute('rx') &&
          !el.getAttribute('ry')
        ) {
          return clipRectElement(el, bounds);
        }
        break;
    }
  }

  const model = modelForElement(el);
  if (model === null) return 'unclippable';
  if (model.length === 0) return 'untouched';

  const inv = identity ? matIdentity() : matInvert(m);
  if (!inv) return 'unclippable';

  const world = identity ? model : transformSubPaths(model, m);
  const bb = subPathsBounds(world);
  if (!bb) return 'untouched';
  if (boundsContained(bb, bounds)) return 'untouched';

  let pieces: SubPath[][];
  if (isEffectivelyFilled(el, root)) {
    const rings = world.map(flattenSubPathToRing).filter((r) => r.length >= 3);
    if (rings.length === 0) return 'untouched';
    const polys = clipRingsToRect(rings, bounds);
    if (polys === null) return 'unclippable';
    if (polys.length === 0) {
      el.remove();
      return 'removed';
    }
    // One element per polygon; its holes ride along as extra subpaths
    // (polygon-clipping winds holes opposite, so nonzero fill works).
    pieces = polys.map((poly) => poly.map(ringToSubPath));
  } else {
    const clipped = clipSubPathsToRect(world, bounds);
    if (
      clipped.length === world.length &&
      clipped.every((s, k) => s === world[k])
    ) {
      return 'untouched';
    }
    if (clipped.length === 0) {
      el.remove();
      return 'removed';
    }
    pieces = clipped.map((s) => [s]);
  }

  const localPieces = identity
    ? pieces
    : pieces.map((sps) => transformSubPaths(sps, inv));
  replaceWithPaths(el, localPieces);
  return 'clipped';
}

/** Normalized geometry model for an element, null when unparseable. */
function modelForElement(el: SVGElement): SubPath[] | null {
  const num = (name: string): number => {
    const v = parseFloat(el.getAttribute(name) ?? '0');
    return Number.isNaN(v) ? 0 : v;
  };
  switch (el.tagName) {
    case 'path': {
      const d = el.getAttribute('d');
      if (!d) return [];
      return parsePathData(d);
    }
    case 'circle': {
      const r = num('r');
      if (!(r > 0)) return [];
      return [ellipseToSubPath(num('cx'), num('cy'), r, r)];
    }
    case 'ellipse': {
      const rx = num('rx');
      const ry = num('ry');
      if (!(rx > 0 && ry > 0)) return [];
      return [ellipseToSubPath(num('cx'), num('cy'), rx, ry)];
    }
    case 'rect': {
      const w = num('width');
      const h = num('height');
      if (!(w > 0 && h > 0)) return [];
      const rxAttr = el.getAttribute('rx');
      const ryAttr = el.getAttribute('ry');
      let rx = rxAttr !== null ? parseFloat(rxAttr) : NaN;
      let ry = ryAttr !== null ? parseFloat(ryAttr) : NaN;
      if (Number.isNaN(rx) && Number.isNaN(ry)) {
        rx = 0;
        ry = 0;
      } else if (Number.isNaN(rx)) {
        rx = ry;
      } else if (Number.isNaN(ry)) {
        ry = rx;
      }
      return [roundedRectToSubPath(num('x'), num('y'), w, h, rx, ry)];
    }
    case 'line': {
      const seg: Seg = {
        kind: 'L',
        p0: { x: num('x1'), y: num('y1') },
        p1: { x: num('x2'), y: num('y2') },
      };
      return [{ segs: [seg], closed: false }];
    }
    case 'polyline':
    case 'polygon': {
      const pts = parsePoints(el);
      if (pts.length < 2) return [];
      const closed = el.tagName === 'polygon';
      const segs: Seg[] = [];
      for (let k = 0; k + 1 < pts.length; k++) {
        segs.push({ kind: 'L', p0: pts[k], p1: pts[k + 1] });
      }
      if (closed && !samePt(pts[pts.length - 1], pts[0])) {
        segs.push({ kind: 'L', p0: pts[pts.length - 1], p1: pts[0] });
      }
      return [{ segs, closed }];
    }
    default:
      return null;
  }
}

function samePt(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/** Composed transform from root user space down to the element. */
function getComposedMatrix(el: SVGElement, root: SVGElement): Mat | null {
  const chain: Mat[] = [];
  for (
    let node: Element | null = el;
    node && node !== root;
    node = node.parentElement
  ) {
    const attr = node.getAttribute('transform');
    if (attr) {
      const m = parseTransformAttribute(attr);
      if (!m) return null;
      chain.push(m);
    }
  }
  let m = matIdentity();
  for (let k = chain.length - 1; k >= 0; k--) m = matMultiply(m, chain[k]);
  return m;
}

/** The original narrow rule: an explicit fill on the element itself. */
function explicitFilled(el: SVGElement): boolean {
  const fill = el.getAttribute('fill');
  return fill !== null && fill !== 'none' && fill !== 'transparent';
}

/**
 * Nearest explicit fill attribute (element first, then ancestors up to
 * the svg root). No attribute anywhere means "stroke artwork" here —
 * see the module header for why SVG's default-black fill is ignored.
 */
function isEffectivelyFilled(el: SVGElement, root: SVGElement): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const fill = node.getAttribute('fill');
    if (fill !== null) return fill !== 'none' && fill !== 'transparent';
    if (node === root) break;
  }
  return false;
}

/**
 * Swap an element for <path> elements (one per piece), keeping all
 * non-geometry attributes — its own transform included, since piece
 * coordinates are expressed in the element's local space — and the
 * position in the tree, so inherited styles still apply.
 */
function replaceWithPaths(el: SVGElement, pieces: SubPath[][]): void {
  const parent = el.parentNode;
  if (!parent) return;

  for (const subpaths of pieces) {
    const path = document.createElementNS(SVG_NS, 'path');
    for (const attr of Array.from(el.attributes)) {
      if (!GEOMETRY_ATTRS.has(attr.name)) {
        path.setAttribute(attr.name, attr.value);
      }
    }
    path.setAttribute('d', serializePathData(subpaths));
    parent.insertBefore(path, el);
  }
  el.remove();
}

// ---------------------------------------------------------------------------
// Original exact polyline clipping (untransformed simple strokes)

function isInside(p: Pt, b: Bounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function parsePoints(el: SVGElement): Pt[] {
  const raw = (el.getAttribute('points') ?? '').trim();
  if (!raw) return [];
  const nums = raw.split(/[\s,]+/).map(Number);
  const points: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push({ x: nums[i], y: nums[i + 1] });
  }
  return points;
}

function formatPoints(points: Pt[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clipLineElement(el: SVGElement, b: Bounds): ClipOutcome {
  const x1 = Number(el.getAttribute('x1'));
  const y1 = Number(el.getAttribute('y1'));
  const x2 = Number(el.getAttribute('x2'));
  const y2 = Number(el.getAttribute('y2'));

  if (isInside({ x: x1, y: y1 }, b) && isInside({ x: x2, y: y2 }, b))
    return 'untouched';

  const clipped = clipSegmentLB(x1, y1, x2, y2, b);
  if (!clipped) {
    el.remove();
    return 'removed';
  }
  el.setAttribute('x1', String(round(clipped[0])));
  el.setAttribute('y1', String(round(clipped[1])));
  el.setAttribute('x2', String(round(clipped[2])));
  el.setAttribute('y2', String(round(clipped[3])));
  return 'clipped';
}

/** Clip a polyline or polygon; the closed shape's outline is treated as a chain. */
function clipPolyElement(
  el: SVGElement,
  b: Bounds,
  closed: boolean,
): ClipOutcome {
  const points = parsePoints(el);
  if (points.length < 2) return 'untouched';
  if (points.every((p) => isInside(p, b))) return 'untouched';

  const chain = closed ? [...points, points[0]] : points;
  const runs = clipChain(chain, b);
  replaceWithRuns(el, runs, ['points']);
  return runs.length > 0 ? 'clipped' : 'removed';
}

function clipRectElement(el: SVGElement, b: Bounds): ClipOutcome {
  const x = Number(el.getAttribute('x') ?? 0);
  const y = Number(el.getAttribute('y') ?? 0);
  const w = Number(el.getAttribute('width'));
  const h = Number(el.getAttribute('height'));

  const corners: Pt[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  if (corners.every((p) => isInside(p, b))) return 'untouched';

  const runs = clipChain([...corners, corners[0]], b);
  replaceWithRuns(el, runs, ['x', 'y', 'width', 'height']);
  return runs.length > 0 ? 'clipped' : 'removed';
}

/**
 * Swap an element for the polylines its clipped runs form, keeping all
 * other attributes (and the position in the tree, so styles inherited
 * from a parent group still apply). Removed entirely when nothing is left.
 */
function replaceWithRuns(
  el: SVGElement,
  runs: Pt[][],
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
 * Visual-only fallback for shapes whose geometry can't be rewritten
 * (unparseable path data or a degenerate transform). Preview-only:
 * reapplyBorderMask() removes these elements from exports.
 *
 * The clip rectangle is expressed in canvas coordinates, so it must be
 * referenced from canvas space: clip-path userSpaceOnUse units follow
 * the *referencing* element's user space, so hanging the clip on an
 * element inside a transformed group would re-interpret the rectangle
 * in that group's local coordinates and clip a completely different
 * region of the drawing. The clip therefore goes on each affected
 * top-level node — via an untransformed wrapper <g> when the node
 * itself carries a transform — so descendants' transforms stay inside
 * the clip's frame.
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
