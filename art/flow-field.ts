/**
 * Flow Field
 * Particles following a noise-based vector field.
 * Demonstrates: slider, toggle, numeric, seed, vector controls.
 *
 * This artwork uses SVG.js for cleaner element creation.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';

export const meta = {
  title: 'Flow Field',
  description: 'Particles following a Perlin-like noise field',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'particles',
    label: 'Particles',
    min: 10,
    max: 500,
    step: 10,
    default: 150,
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
    type: 'slider',
    id: 'steps',
    label: 'Steps',
    min: 10,
    max: 200,
    step: 5,
    default: 80,
  },
  {
    type: 'slider',
    id: 'noiseScale',
    label: 'Noise Scale',
    min: 0.001,
    max: 0.02,
    step: 0.001,
    default: 0.005,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'slider',
    id: 'opacity',
    label: 'Opacity',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.4,
  },
  {
    type: 'toggle',
    id: 'wrap',
    label: 'Wrap Edges',
    default: false,
  },
  {
    type: 'numeric',
    id: 'angleOffset',
    label: 'Angle Offset',
    min: 0,
    max: 360,
    step: 15,
    default: 0,
  },
  {
    type: 'vector',
    id: 'flowBias',
    label: 'Flow Bias',
    default: { x: 0, y: 0 },
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 9999,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

// Simple noise function (value noise with smoothing)
function createNoise(seed: number) {
  const random = createRandom(seed);
  const permutation: number[] = [];
  for (let i = 0; i < 256; i++) permutation[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  const perm = [...permutation, ...permutation];

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  function grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise2d(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  };
}

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    particles,
    stepLength,
    steps,
    noiseScale,
    lineWidth,
    opacity,
    wrap,
    angleOffset,
    flowBias,
    seed,
  } = values;

  const random = createRandom(seed);
  const noise = createNoise(seed);
  const { width, height } = canvasToPixels(canvasConfig);
  const angleOffsetRad = (angleOffset * Math.PI) / 180;

  // Create canvas with SVG.js
  const { svg, draw } = createCanvas(canvasConfig);
  draw.viewbox(0, 0, width, height);

  // Create group for all particle paths
  const group = draw.group()
    .stroke({ color: 'black', width: lineWidth, opacity, linecap: 'round' })
    .fill('none');

  // Generate particle paths
  for (let i = 0; i < particles; i++) {
    let x = random() * width;
    let y = random() * height;
    const points: [number, number][] = [[x, y]];

    for (let s = 0; s < steps; s++) {
      const angle =
        noise(x * noiseScale, y * noiseScale) * Math.PI * 2 + angleOffsetRad;

      x += Math.cos(angle) * stepLength + flowBias.x * 0.1;
      y += Math.sin(angle) * stepLength + flowBias.y * 0.1;

      // Handle edges
      if (wrap) {
        if (x < 0) x += width;
        if (x > width) x -= width;
        if (y < 0) y += height;
        if (y > height) y -= height;
      } else {
        if (x < 0 || x > width || y < 0 || y > height) break;
      }

      points.push([x, y]);
    }

    if (points.length > 1) {
      // Build path using SVG.js polyline
      group.polyline(points);
    }
  }

  return svg;
}
