/**
 * Random Study - Generative Utils Demo
 * Demonstrates random number generation functions from @johnfmorton/generative-utils:
 * - seedPRNG: Seed the PRNG for reproducibility
 * - random: Generate random values (numbers or pick from array)
 * - randomBias: Generate values biased toward a target
 * - randomSnap: Generate values snapped to intervals
 *
 * The artwork shows three rows of circles, each using a different
 * random distribution method to visually compare their behavior.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { seedPRNG, random, randomBias, randomSnap } from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Random Study',
  description: 'Compares uniform, biased, and snapped random distributions',
};

export const canvas: CanvasConfig = {
  width: 11,
  height: 8.5,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'count',
    label: 'Elements per Row',
    min: 20,
    max: 100,
    step: 5,
    default: 50,
  },
  {
    type: 'slider',
    id: 'bias',
    label: 'Bias Position',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  {
    type: 'slider',
    id: 'influence',
    label: 'Bias Influence',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.7,
  },
  {
    type: 'slider',
    id: 'snapIncrement',
    label: 'Snap Increment',
    min: 10,
    max: 80,
    step: 5,
    default: 40,
  },
  {
    type: 'slider',
    id: 'minRadius',
    label: 'Min Radius',
    min: 2,
    max: 15,
    step: 1,
    default: 4,
  },
  {
    type: 'slider',
    id: 'maxRadius',
    label: 'Max Radius',
    min: 10,
    max: 40,
    step: 2,
    default: 20,
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
    default: 42,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    count,
    bias,
    influence,
    snapIncrement,
    minRadius,
    maxRadius,
    lineWidth,
    seed,
  } = values;

  // Seed the PRNG for reproducibility
  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  // Create group with stroke styling for pen plotter
  const group = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  // Margins and row layout
  const margin = 60;
  const usableWidth = width - margin * 2;
  const usableHeight = height - margin * 2;
  const rowHeight = usableHeight / 3;

  // Labels for each row (using small text)
  const labels = ['Uniform Random', 'Biased Random', 'Snapped Random'];

  // Draw three rows, each demonstrating a different random method
  for (let row = 0; row < 3; row++) {
    const rowY = margin + rowHeight * row + rowHeight / 2;

    // Add row label
    svgDraw.text(labels[row])
      .font({ size: 14, family: 'sans-serif' })
      .fill('black')
      .move(margin, margin + rowHeight * row + 10);

    // Draw circles for this row
    for (let i = 0; i < count; i++) {
      let x: number;
      let radius: number;

      if (row === 0) {
        // Row 1: Uniform random distribution
        // random(min, max) returns a uniform random value in range
        x = margin + random(0, usableWidth);
        radius = random(minRadius, maxRadius);
      } else if (row === 1) {
        // Row 2: Biased random distribution
        // randomBias(min, max, bias, influence) clusters values toward bias point
        const biasX = margin + usableWidth * bias;
        x = randomBias(margin, margin + usableWidth, biasX, influence);
        // Also bias radius toward smaller values
        radius = randomBias(minRadius, maxRadius, minRadius, influence * 0.5);
      } else {
        // Row 3: Snapped random distribution
        // randomSnap(min, max, snapInc) snaps to nearest interval
        x = margin + randomSnap(0, usableWidth, snapIncrement);
        // Snap radius to specific sizes
        const radiusSnap = (maxRadius - minRadius) / 3;
        radius = randomSnap(minRadius, maxRadius, radiusSnap);
      }

      // Add some vertical variation within each row
      const yVariation = random(-rowHeight * 0.3, rowHeight * 0.3);
      const y = rowY + yVariation;

      // Draw the circle
      group.circle(radius * 2).cx(x).cy(y);
    }
  }

  // Draw separator lines between rows
  for (let i = 1; i < 3; i++) {
    const y = margin + rowHeight * i;
    group.line(margin, y, width - margin, y)
      .stroke({ color: 'black', width: 0.3, dasharray: '5,5' });
  }

  // Add a demonstration of random(array) - picking from predefined options
  const shapes = ['circle', 'square', 'diamond'] as const;
  const demoX = width - margin - 80;
  const demoY = margin + 30;

  svgDraw.text('random(array):')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(demoX - 20, demoY - 20);

  // Draw 5 random shapes picked from the array
  for (let i = 0; i < 5; i++) {
    const shape = random(shapes);
    const shapeX = demoX + i * 18;
    const shapeY = demoY + 5;
    const size = 10;

    if (shape === 'circle') {
      group.circle(size).cx(shapeX).cy(shapeY);
    } else if (shape === 'square') {
      group.rect(size, size).cx(shapeX).cy(shapeY);
    } else {
      // Diamond (rotated square)
      const half = size / 2;
      group.polygon([
        [shapeX, shapeY - half],
        [shapeX + half, shapeY],
        [shapeX, shapeY + half],
        [shapeX - half, shapeY],
      ]);
    }
  }

  return svg;
}
