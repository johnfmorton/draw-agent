/**
 * Spiral Study
 * A classic Archimedean spiral with configurable parameters.
 * Demonstrates: slider, toggle, dropdown, seed, point2d controls.
 *
 * This artwork uses raw DOM APIs (no SVG.js) to demonstrate the vanilla approach.
 * See grid-pattern.ts and flow-field.ts for SVG.js examples.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { canvasToPixels } from '../src/controls/schema';
import { createRawCanvas } from '../src/svg-utils';

export const meta = {
  title: 'Spiral Study',
  description: 'An Archimedean spiral with noise variation',
};

export const canvas: CanvasConfig = {
  width: 6,
  height: 6,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'turns',
    label: 'Turns',
    min: 1,
    max: 30,
    step: 1,
    default: 10,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.2,
    max: 3,
    step: 0.1,
    default: 0.8,
  },
  {
    type: 'slider',
    id: 'noise',
    label: 'Noise',
    min: 0,
    max: 10,
    step: 0.5,
    default: 0,
  },
  {
    type: 'toggle',
    id: 'clockwise',
    label: 'Clockwise',
    default: true,
  },
  {
    type: 'dropdown',
    id: 'lineCap',
    label: 'Line Cap',
    options: [
      { value: 'round', label: 'Round' },
      { value: 'square', label: 'Square' },
      { value: 'butt', label: 'Butt' },
    ],
    default: 'round',
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 12345,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const { turns, lineWidth, noise, clockwise, lineCap, seed } = values;

  const random = createRandom(seed);
  const { width, height } = canvasToPixels(canvasConfig);
  const centerX = width / 2;
  const centerY = height / 2;

  // Create SVG using raw DOM helper (alternative to SVG.js)
  const svg = createRawCanvas(canvasConfig);

  // Build spiral path
  const points: { x: number; y: number }[] = [];
  const totalAngle = turns * Math.PI * 2;
  const direction = clockwise ? 1 : -1;
  const steps = Math.ceil(totalAngle / 0.1);
  const maxRadius = Math.min(width, height) * 0.45;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * totalAngle * direction;
    const radius = t * maxRadius;

    // Add noise
    const noiseX = noise > 0 ? (random() - 0.5) * noise : 0;
    const noiseY = noise > 0 ? (random() - 0.5) * noise : 0;

    const x = centerX + Math.cos(angle) * radius + noiseX;
    const y = centerY + Math.sin(angle) * radius + noiseY;
    points.push({ x, y });
  }

  // Create path
  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'black');
  path.setAttribute('stroke-width', String(lineWidth));
  path.setAttribute('stroke-linecap', lineCap);

  svg.appendChild(path);
  return svg;
}
