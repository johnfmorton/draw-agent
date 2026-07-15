/**
 * Noise Field - simplex-noise Demo
 * Demonstrates the simplex-noise package for flow fields:
 * - createNoise2D(prng): a seeded 2D noise function returning -1..1
 * - Sampling noise at scaled coordinates to build a smooth angle field
 * - Field ticks: visualize the direction the field points at each cell
 * - Streamlines: particles traced step-by-step through the field
 *
 * The one critical rule: always pass a seeded PRNG to createNoise2D().
 * Called with no arguments it uses Math.random(), which would break the
 * same-URL-same-drawing guarantee.
 *
 * (Compare with flow-field.ts, which hand-rolls its own value noise —
 * this file gets a better-quality field from one import.)
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { createCanvas } from '../src/svg-utils';
import { createNoise2D } from 'simplex-noise';

export const meta = {
  title: 'Noise Field',
  description: 'Flow field built on the simplex-noise package',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'noiseScale',
    label: 'Noise Scale',
    description:
      'Multiplier on coordinates before sampling; smaller = smoother field',
    min: 0.001,
    max: 0.02,
    step: 0.001,
    default: 0.004,
  },
  {
    type: 'slider',
    id: 'swirl',
    label: 'Swirl',
    description: 'How many full turns the angle sweeps across the noise range',
    min: 0.5,
    max: 3,
    step: 0.25,
    default: 1.5,
  },
  {
    type: 'slider',
    id: 'streamlines',
    label: 'Streamlines',
    min: 0,
    max: 400,
    step: 10,
    default: 120,
  },
  {
    type: 'slider',
    id: 'steps',
    label: 'Steps per Line',
    min: 10,
    max: 300,
    step: 10,
    default: 120,
  },
  {
    type: 'slider',
    id: 'stepLength',
    label: 'Step Length',
    min: 1,
    max: 10,
    step: 0.5,
    default: 3,
  },
  {
    type: 'toggle',
    id: 'showField',
    label: 'Show Field Ticks',
    description: 'Draw the direction grid the streamlines follow',
    default: true,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 0.6,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 7042,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    noiseScale,
    swirl,
    streamlines,
    steps,
    stepLength,
    showField,
    lineWidth,
    seed,
  } = values;

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  // createNoise2D takes a PRNG so the field is reproducible from the
  // seed. It returns a function: noise2D(x, y) → -1..1, smooth in both
  // directions.
  const noise2D = createNoise2D(createRandom(seed));

  // A second PRNG (same seed, independent stream) for particle placement.
  const rand = createRandom(seed);

  // The whole study derives from this one function: sample the noise at
  // scaled-down coordinates and map -1..1 onto an angle.
  function fieldAngle(x: number, y: number): number {
    return noise2D(x * noiseScale, y * noiseScale) * Math.PI * swirl;
  }

  // --- Field ticks: short lines showing the direction at each cell ---
  if (showField) {
    const tickGroup = svgDraw
      .group()
      .stroke({ color: '#999', width: lineWidth * 0.6, linecap: 'round' })
      .fill('none');

    const spacing = 24;
    const tickLength = spacing * 0.55;
    for (let y = spacing / 2; y < height; y += spacing) {
      for (let x = spacing / 2; x < width; x += spacing) {
        const angle = fieldAngle(x, y);
        const dx = (Math.cos(angle) * tickLength) / 2;
        const dy = (Math.sin(angle) * tickLength) / 2;
        tickGroup.line(x - dx, y - dy, x + dx, y + dy);
      }
    }
  }

  // --- Streamlines: follow the field one small step at a time ---
  const lineGroup = svgDraw
    .group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round' })
    .fill('none');

  for (let i = 0; i < streamlines; i++) {
    let x = rand() * width;
    let y = rand() * height;
    const points: [number, number][] = [[x, y]];

    for (let s = 0; s < steps; s++) {
      const angle = fieldAngle(x, y);
      x += Math.cos(angle) * stepLength;
      y += Math.sin(angle) * stepLength;
      if (x < 0 || x > width || y < 0 || y > height) break;
      points.push([x, y]);
    }

    if (points.length > 1) {
      lineGroup.polyline(points);
    }
  }

  return svg;
}
