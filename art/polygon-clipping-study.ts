/**
 * Polygon Clipping - Occlusion Demo
 * Demonstrates the polygon-clipping package for hidden-line removal:
 * the classic plotter problem of clipping off the portion of a shape
 * that sits behind another shape.
 *
 * The recipe:
 * 1. Represent every shape as a polygon: an array of [x, y] points
 *    (a Ring). Curved shapes are just many-sided polygons.
 * 2. Decide a stacking order (here: index 0 is frontmost).
 * 3. For each shape, its VISIBLE region is
 *      difference(shape, union(all shapes in front of it))
 * 4. Draw the rings of that result instead of the original outline.
 *
 * Everything else here (hatching, the show-hidden view) builds on the
 * MultiPolygon that step 3 returns. Toggle "Show Hidden (dashed)" to
 * see exactly what difference() removed — turn it off for plotting.
 *
 * Plotting note: a clipped ring includes a seam along the occluding
 * shape's edge, which coincides with a line the front shape draws
 * anyway — so the pen traces that edge twice. Usually invisible in the
 * result; avoid it by drawing back shapes hatch-only (no outline).
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { seedPRNG, random } from '@johnfmorton/generative-utils';
// polygon-clipping ships as CommonJS: use the default import (the
// named bindings in its .d.ts don't exist at runtime under Vite).
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon, Ring, Pair } from 'polygon-clipping';

export const meta = {
  title: 'Polygon Clipping',
  description: 'Hidden-line removal with union / difference / intersection',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 8.5,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'shapes',
    label: 'Shapes',
    min: 2,
    max: 12,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'minSize',
    label: 'Min Size %',
    description: 'Smallest radius as a percentage of the canvas',
    min: 5,
    max: 25,
    step: 1,
    default: 10,
  },
  {
    type: 'slider',
    id: 'maxSize',
    label: 'Max Size %',
    description: 'Largest radius as a percentage of the canvas',
    min: 10,
    max: 40,
    step: 1,
    default: 22,
  },
  {
    type: 'toggle',
    id: 'hatch',
    label: 'Hatch Shapes',
    description: 'Fill each visible region with clipped parallel lines',
    default: true,
  },
  {
    type: 'slider',
    id: 'hatchSpacing',
    label: 'Hatch Spacing',
    min: 4,
    max: 30,
    step: 1,
    default: 10,
  },
  {
    type: 'toggle',
    id: 'showHidden',
    label: 'Show Hidden (dashed)',
    description: 'Draw the clipped-away portions in dashed gray (screen only)',
    default: true,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.3,
    max: 2,
    step: 0.1,
    default: 0.8,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 1972,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

/**
 * Approximate a circle as a Ring (polygon points). polygon-clipping
 * only speaks polygons, so curves become many short segments — 72 is
 * plenty smooth at plotter scale.
 */
function circleRing(cx: number, cy: number, r: number, segments = 72): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return ring;
}

/**
 * Convert a MultiPolygon result back into SVG path data. Each ring
 * (outer boundaries AND holes) becomes its own closed subpath — for
 * stroked plotter output that is exactly what we want to draw.
 */
function multiPolygonPath(mp: MultiPolygon): string {
  const parts: string[] = [];
  for (const polygon of mp) {
    for (const ring of polygon) {
      const [first, ...rest] = ring;
      parts.push(
        `M ${first[0]} ${first[1]} ` +
          rest.map(([x, y]) => `L ${x} ${y}`).join(' ') +
          ' Z',
      );
    }
  }
  return parts.join(' ');
}

/** Even-odd point-in-multipolygon test (holes handled automatically). */
function pointInMultiPolygon([px, py]: Pair, mp: MultiPolygon): boolean {
  let inside = false;
  for (const polygon of mp) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (
          yi > py !== yj > py &&
          px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
        ) {
          inside = !inside;
        }
      }
    }
  }
  return inside;
}

/**
 * Clip a line segment to the inside of a MultiPolygon. Finds every
 * crossing with the region's edges, then keeps the pieces whose
 * midpoints are inside. This is how open strokes (hatching, textures)
 * get confined to a clipped region — polygon-clipping itself only
 * operates on closed polygons.
 */
function clipSegment(a: Pair, b: Pair, mp: MultiPolygon): [Pair, Pair][] {
  const ts: number[] = [0, 1];
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;

  for (const polygon of mp) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const ex = xj - xi;
        const ey = yj - yi;
        const denom = dx * ey - dy * ex;
        if (denom === 0) continue; // parallel
        const t = ((xi - ax) * ey - (yi - ay) * ex) / denom;
        const u = ((xi - ax) * dy - (yi - ay) * dx) / denom;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
    }
  }

  ts.sort((p, q) => p - q);
  const pieces: [Pair, Pair][] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (pointInMultiPolygon([ax + dx * tm, ay + dy * tm], mp)) {
      pieces.push([
        [ax + dx * t0, ay + dy * t0],
        [ax + dx * t1, ay + dy * t1],
      ]);
    }
  }
  return pieces;
}

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    shapes,
    minSize,
    maxSize,
    hatch,
    hatchSpacing,
    showHidden,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());
  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  const outlineGroup = svgDraw
    .group()
    .stroke({ color: 'black', width: lineWidth, linejoin: 'round' })
    .fill('none');
  const hatchGroup = svgDraw
    .group()
    .stroke({ color: 'black', width: lineWidth * 0.6, linecap: 'round' })
    .fill('none');
  const hiddenGroup = svgDraw
    .group()
    .stroke({ color: '#bbb', width: lineWidth * 0.75, dasharray: '4,4' })
    .fill('none');

  // --- 1. Build the shapes as polygons, index 0 = frontmost ---
  const rMin = (Math.min(minSize, maxSize) / 100) * Math.min(width, height);
  const rMax = (Math.max(minSize, maxSize) / 100) * Math.min(width, height);
  const stack: Polygon[] = [];
  for (let i = 0; i < shapes; i++) {
    const r = random(rMin, rMax);
    const cx = random(r, width - r);
    const cy = random(r, height - r);
    stack.push([circleRing(cx, cy, r)]); // Polygon = array of rings
  }

  // --- 2. Clip each shape by everything in front of it ---
  for (let i = 0; i < stack.length; i++) {
    const shape = stack[i];
    const inFront = stack.slice(0, i);

    // union() merges the front shapes into one region; difference()
    // subtracts that region from this shape. The frontmost shape has
    // nothing in front, so it stays whole.
    const blockers: MultiPolygon | null =
      inFront.length > 0
        ? polygonClipping.union(inFront[0], ...inFront.slice(1))
        : null;
    const visible: MultiPolygon = blockers
      ? polygonClipping.difference(shape, blockers)
      : [shape];

    // Fully occluded shapes come back as an empty MultiPolygon.
    if (visible.length === 0 && !showHidden) continue;

    if (visible.length > 0) {
      outlineGroup.path(multiPolygonPath(visible));
    }

    // intersection() gives the opposite piece: what IS covered. Handy
    // here to visualize the removal; in a real plot you'd skip this.
    if (showHidden && blockers) {
      const hidden = polygonClipping.intersection(shape, blockers);
      if (hidden.length > 0) {
        hiddenGroup.path(multiPolygonPath(hidden));
      }
    }

    // --- 3. Hatch the visible region with clipped open strokes ---
    if (hatch && visible.length > 0) {
      const angle = random(0, Math.PI);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      // Perpendicular offsets sweep parallel lines across the canvas;
      // clipSegment() keeps only the parts inside the visible region.
      const diag = Math.hypot(width, height);
      for (let offset = -diag / 2; offset <= diag / 2; offset += hatchSpacing) {
        const mx = width / 2 - dirY * offset;
        const my = height / 2 + dirX * offset;
        const a: Pair = [mx - dirX * diag, my - dirY * diag];
        const b: Pair = [mx + dirX * diag, my + dirY * diag];
        for (const [p, q] of clipSegment(a, b, visible)) {
          hatchGroup.line(p[0], p[1], q[0], q[1]);
        }
      }
    }
  }

  return svg;
}
