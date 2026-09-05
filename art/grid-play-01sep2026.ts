/**
 * Grid Play 01sep2026
 */

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

export const meta = {
  title: 'Grid Play 01sep2026',
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
    group: 'Basics',
    default: true,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    group: 'Basics',
    default: 814050568,
  },
  {
    type: 'dropdown',
    id: 'borderMode',
    label: 'Border Mask',
    description:
      'Clip strokes to an inset border so the pen never runs off the paper',
    group: 'Borders',
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
    group: 'Borders',
    min: 0,
    max: 96,
    step: 1,
    default: 24,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const { showCalibration, seed, borderMode, borderInset } = values;

  seedPRNG(seed.toString());
  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw } = createCanvas(canvasConfig);

  // Corner crosshairs for aligning the plotter pen with the paper.
  // Derived from the canvas size — any paper size, any unit.
  if (showCalibration) {
    drawCalibrationMarks(svg, canvasConfig);
  }

  // A starter shape — replace with your drawing code
  const radius = random(0.15, 0.3) * Math.min(width, height);
  draw
    .circle(radius * 2)
    .cx(width / 2)
    .cy(height / 2)
    .fill('none')
    .stroke({ color: '#000', width: 1 });

  // --- Grids (@johnfmorton/generative-utils) ---
  // import { createNoiseGrid } from '@johnfmorton/generative-utils';
  // const grid = createNoiseGrid({ width, height, resolution: 12 });
  // grid.cells.forEach((cell) => { /* cell.x, cell.y, cell.noiseValue */ });
  // // also: createVoronoiDiagram({ width, height, points }), createQtGrid(...)

  // --- Splines & paths (@johnfmorton/generative-utils) ---
  // import { spline } from '@johnfmorton/generative-utils';
  // const pts = [
  //   { x: width * 0.2, y: height * 0.5 },
  //   { x: width * 0.5, y: height * 0.3 },
  //   { x: width * 0.8, y: height * 0.5 },
  // ];
  // const d = spline(pts, 1, false); // smooth curve through points
  // draw.path(d).fill('none').stroke('#000');

  // --- Randomness (@johnfmorton/generative-utils) ---
  // import { randomBias, randomSnap } from '@johnfmorton/generative-utils';
  // const clustered = randomBias(0, width, width / 2); // values cluster near the bias point
  // const stepped = randomSnap(0, 360, 15); // random angle snapped to 15° increments

  // Clip everything drawn so far to the safe area, so the pen physically
  // stays on the page. Calibration marks are exempt (they align to paper
  // corners), so this can come before or after them.
  if (borderMode !== 'off') {
    applyBorderMask(svg, canvasConfig, {
      inset: borderInset,
      drawBorder: borderMode === 'border',
    });
  }

  return svg;
}
