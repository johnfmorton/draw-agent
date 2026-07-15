/**
 * Curve Math - bezier-js Demo
 * A cubic Bézier "lab": drag the four point controls and watch every
 * bezier-js capability update around one curve.
 * - new Bezier(x1,y1, cx1,cy1, cx2,cy2, x2,y2): build a cubic curve
 * - toSVG(): SVG path data for the curve
 * - offset(d): parallel curves at distance d — multi-pass strokes for
 *   a wider plotted line without a wider pen
 * - normal(t) + get(t): perpendicular ticks along the curve (combs,
 *   hatching, feathering)
 * - split(t1, t2): extract a sub-segment of the curve
 * - bbox(): bounding box
 * - length(): arc length (shown as a text label)
 *
 * No seed control: nothing here is random — the drawing is a pure
 * function of the point/slider values.
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { Bezier } from 'bezier-js';

export const meta = {
  title: 'Curve Math',
  description: 'bezier-js: offsets, normals, splitting, and measurement',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'point2d',
    id: 'start',
    label: 'Start Point',
    default: { x: 110, y: 860 },
  },
  {
    type: 'point2d',
    id: 'handle1',
    label: 'Handle 1',
    default: { x: 240, y: 160 },
  },
  {
    type: 'point2d',
    id: 'handle2',
    label: 'Handle 2',
    default: { x: 600, y: 940 },
  },
  {
    type: 'point2d',
    id: 'end',
    label: 'End Point',
    default: { x: 710, y: 260 },
  },
  {
    type: 'slider',
    id: 'offsetPasses',
    label: 'Offset Passes',
    description: 'Parallel curves per side; 0 turns offsets off',
    min: 0,
    max: 8,
    step: 1,
    default: 3,
  },
  {
    type: 'slider',
    id: 'offsetGap',
    label: 'Offset Gap',
    min: 2,
    max: 16,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'normalTicks',
    label: 'Normal Ticks',
    description: 'Perpendicular ticks along the curve; 0 turns them off',
    min: 0,
    max: 80,
    step: 1,
    default: 30,
  },
  {
    type: 'slider',
    id: 'tickLength',
    label: 'Tick Length',
    min: 4,
    max: 40,
    step: 1,
    default: 14,
  },
  {
    type: 'slider',
    id: 'splitFrom',
    label: 'Split From (t)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
  },
  {
    type: 'slider',
    id: 'splitTo',
    label: 'Split To (t)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
  },
  {
    type: 'toggle',
    id: 'showSplit',
    label: 'Highlight Split Segment',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showHandles',
    label: 'Show Handles',
    description: 'Dashed control polygon and handle points',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showBBox',
    label: 'Show Bounding Box',
    default: false,
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
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    start,
    handle1,
    handle2,
    end,
    offsetPasses,
    offsetGap,
    normalTicks,
    tickLength,
    splitFrom,
    splitTo,
    showSplit,
    showHandles,
    showBBox,
    lineWidth,
  } = values;

  const { svg, draw: svgDraw } = createCanvas(canvasConfig);
  const { width } = canvasToPixels(canvasConfig);

  // One cubic curve drives the whole study. Bezier also accepts six
  // coordinates for a quadratic curve, or an array of {x, y} points.
  const curve = new Bezier(
    start.x,
    start.y,
    handle1.x,
    handle1.y,
    handle2.x,
    handle2.y,
    end.x,
    end.y,
  );

  const guideGroup = svgDraw
    .group()
    .stroke({ color: '#bbb', width: lineWidth * 0.6, dasharray: '3,3' })
    .fill('none');
  const lightGroup = svgDraw
    .group()
    .stroke({ color: 'black', width: lineWidth * 0.5, linecap: 'round' })
    .fill('none');
  const mainGroup = svgDraw
    .group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round' })
    .fill('none');

  // --- Handles: the control polygon that shapes the curve ---
  if (showHandles) {
    guideGroup.line(start.x, start.y, handle1.x, handle1.y);
    guideGroup.line(end.x, end.y, handle2.x, handle2.y);
    guideGroup.circle(8).cx(handle1.x).cy(handle1.y);
    guideGroup.circle(8).cx(handle2.x).cy(handle2.y);
  }

  // --- bbox(): the curve's true extents (not the control points') ---
  if (showBBox) {
    const box = curve.bbox();
    guideGroup
      .rect(box.x.max - box.x.min, box.y.max - box.y.min)
      .move(box.x.min, box.y.min);
  }

  // --- The curve itself: toSVG() returns ready-to-use path data ---
  mainGroup.path(curve.toSVG());

  // --- offset(d): parallel curves on each side ---
  // A single offset may come back as several Bezier segments (the
  // parallel of a cubic is not itself a cubic), so join their path
  // data. Stacked passes plot as one thick stroke.
  for (let pass = 1; pass <= offsetPasses; pass++) {
    for (const side of [1, -1]) {
      const segments = curve.offset(side * pass * offsetGap);
      lightGroup.path(segments.map((s) => s.toSVG()).join(' '));
    }
  }

  // --- normal(t): unit perpendicular, here drawn as a comb ---
  for (let i = 0; i < normalTicks; i++) {
    const t = normalTicks === 1 ? 0.5 : i / (normalTicks - 1);
    const p = curve.get(t); // point on the curve at t
    const n = curve.normal(t); // unit normal at t
    lightGroup.line(p.x, p.y, p.x + n.x * tickLength, p.y + n.y * tickLength);
  }

  // --- split(t1, t2): extract a sub-curve, highlighted here ---
  const t1 = Math.min(splitFrom, splitTo);
  const t2 = Math.max(splitFrom, splitTo);
  if (showSplit && t2 - t1 > 0.001) {
    const segment = curve.split(t1, t2);
    mainGroup.path(segment.toSVG()).stroke({ width: lineWidth * 3 });
    for (const t of [t1, t2]) {
      const p = curve.get(t);
      mainGroup
        .circle(lineWidth * 6)
        .cx(p.x)
        .cy(p.y);
    }
  }

  // --- length(): arc length, useful for pen-time estimates ---
  svgDraw
    .text(`length(): ${Math.round(curve.length())} px`)
    .font({ size: 11, family: 'sans-serif' })
    .fill('black')
    .move(width - 160, 30);

  return svg;
}
