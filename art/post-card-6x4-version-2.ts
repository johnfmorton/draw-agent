/**
 * Post Card 6x4 Version 2
 */

/* Secondhand Cursive lettering: the API token lives in .env.local
   (VITE_SECONDHAND_CURSIVE_TOKEN). See docs/secondhand-cursive-api.md
   for the API and src/secondhand-cursive.ts for the helper. */
import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { seedPRNG, random } from '@johnfmorton/generative-utils';
import { createCanvas } from '../src/svg-utils';
import { drawCalibrationMarks } from '../src/calibration';
import { applyBorderMask } from '../src/border-mask';
import { cursiveInCircle } from '../src/secondhand-cursive';

export const meta = {
  title: 'Post Card 6x4 Version 2',
};

export const canvas: CanvasConfig = {
  width: 6,
  height: 4,
  unit: 'in',
};

export const controls = [
  {
    type: 'toggle',
    id: 'showCalibration',
    label: 'Show calibration marks',
    description: 'Corner crosshairs for pen plotter calibration',
    default: true,
  },
  {
    type: 'dropdown',
    id: 'borderMode',
    label: 'Border Mask',
    description:
      'Clip strokes to an inset border so the pen never runs off the paper',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'mask', label: 'Mask only' },
      { value: 'border', label: 'Mask + border' },
    ],
    default: 'border',
  },
  {
    type: 'slider',
    id: 'borderInset',
    label: 'Border Inset',
    description: 'How far the mask sits inside the canvas edge, in px',
    min: 0,
    max: 96,
    step: 1,
    default: 24,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 1548277227,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const { seed, showCalibration, borderMode, borderInset } = values;

  seedPRNG(seed.toString());
  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw } = createCanvas(canvasConfig);

  const cx = width / 2;
  const cy = height / 2;
  const radius = random(0.15, 0.3) * Math.min(width, height);

  // Corner crosshairs derived from the canvas size — resize the canvas
  // (any unit) and the marks follow.
  if (showCalibration) {
    drawCalibrationMarks(svg, canvasConfig);
  } else {
    draw
      .circle(radius * 2)
      .cx(cx)
      .cy(cy)
      .fill('none')
      .stroke({ color: '#000', width: 1 });

    // Typeset "test" and fit it inside the circle with a small margin.
    // penWidthMm previews the strokes at the real pen's line width; the
    // path geometry is identical regardless of the API's lineweight.
    cursiveInCircle(
      svg,
      { text: 'test', seed },
      { cx, cy, radius, margin: 0.85, penWidthMm: 0.3 },
    );
  }

  // Clip everything drawn so far to the safe area, so the pen physically
  // stays on the page. Calibration marks are exempt (they align to paper
  // corners), so this can come before or after them.
  if (borderMode !== 'off') {
    applyBorderMask(svg, canvasConfig, {
      inset: borderInset,
      drawBorder: borderMode === 'border',
    });
  }

  // --- Randomness (@johnfmorton/generative-utils) ---
  // import { randomBias, randomSnap } from '@johnfmorton/generative-utils';
  // const clustered = randomBias(0, width, width / 2); // values cluster near the bias point
  // const stepped = randomSnap(0, 360, 15); // random angle snapped to 15° increments

  // --- Value mapping (@johnfmorton/generative-utils) ---
  // import { map, lerp, clamp } from '@johnfmorton/generative-utils';
  // const y = map(3, 0, 10, 0, height); // remap 0-10 → canvas height
  // const mid = lerp(0, width, 0.5); // interpolate between two values
  // const safe = clamp(y, 0, height); // keep a value in range

  // --- Splines & paths (@johnfmorton/generative-utils) ---
  // import { spline } from '@johnfmorton/generative-utils';
  // const pts = [
  //   { x: width * 0.2, y: height * 0.5 },
  //   { x: width * 0.5, y: height * 0.3 },
  //   { x: width * 0.8, y: height * 0.5 },
  // ];
  // const d = spline(pts, 1, false); // smooth curve through points
  // draw.path(d).fill('none').stroke('#000');

  // --- Shapes (@johnfmorton/generative-utils) ---
  // import { polygon, pointsToPath } from '@johnfmorton/generative-utils';
  // const hex = polygon({ sides: 6, radius: width * 0.2, cx: width / 2, cy: height / 2 });
  // const d = pointsToPath(hex); // also: star({ points, outerRadius, innerRadius })
  // draw.path(d).fill('none').stroke('#000');

  // --- Spatial sampling (@johnfmorton/generative-utils) ---
  // import { poissonDisc } from '@johnfmorton/generative-utils';
  // const points = poissonDisc({ width, height, radius: 40 }); // evenly-spread points
  // points.forEach((p) => draw.circle(4).cx(p.x).cy(p.y).fill('none').stroke('#000'));

  // --- Vector math (@johnfmorton/generative-utils) ---
  // import { vec2 } from '@johnfmorton/generative-utils';
  // const v = vec2.fromAngle(Math.PI / 4, 100); // direction + magnitude
  // const w = vec2.add(v, vec2.create(10, 0)); // add, rotate, normalize, lerp, ...

  // --- Grids (@johnfmorton/generative-utils) ---
  // import { createNoiseGrid } from '@johnfmorton/generative-utils';
  // const grid = createNoiseGrid({ width, height, resolution: 12 });
  // grid.cells.forEach((cell) => { /* cell.x, cell.y, cell.noiseValue */ });
  // // also: createVoronoiDiagram({ width, height, points }), createQtGrid(...)

  // --- Flow-field noise (simplex-noise) ---
  // import { createNoise2D } from 'simplex-noise';
  // import { createRandom } from '../src/random';
  // const noise2D = createNoise2D(createRandom(seed)); // seeded
  // const n = noise2D(width * 0.005, height * 0.005); // -1..1, sample per coordinate

  // --- Curve math (bezier-js) ---
  // import { Bezier } from 'bezier-js';
  // const curve = new Bezier(0, height / 2, width / 2, 0, width, height / 2);
  // const points = curve.getLUT(50); // points along the curve
  // const offset = curve.offset(10); // parallel curve(s) for multi-pass strokes

  return svg;
}
