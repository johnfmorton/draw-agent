/**
 * Spatial Sampling - Generative Utils Demo
 * Demonstrates spatial distribution functions:
 * - poissonDisc: Generate evenly-distributed points using Poisson disc sampling
 *
 * Poisson disc sampling creates natural-looking distributions where no two
 * points are closer than a minimum distance. This is ideal for pen plotters
 * as it prevents clustering and ensures even coverage.
 *
 * The artwork shows the sampled points as dots with optional connecting
 * lines between nearby neighbors to create an organic mesh.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { seedPRNG, poissonDisc, random } from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Spatial Sampling',
  description: 'Demonstrates Poisson disc sampling for even point distribution',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'radius',
    label: 'Min Distance',
    min: 15,
    max: 80,
    step: 5,
    default: 30,
  },
  {
    type: 'slider',
    id: 'connectionDistance',
    label: 'Connection Distance',
    min: 0,
    max: 150,
    step: 10,
    default: 50,
  },
  {
    type: 'slider',
    id: 'dotSize',
    label: 'Dot Size',
    min: 1,
    max: 12,
    step: 1,
    default: 4,
  },
  {
    type: 'toggle',
    id: 'showDots',
    label: 'Show Dots',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showConnections',
    label: 'Show Connections',
    default: true,
  },
  {
    type: 'toggle',
    id: 'varyDotSize',
    label: 'Vary Dot Size',
    default: false,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.2,
    max: 1.5,
    step: 0.1,
    default: 0.5,
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
    radius,
    connectionDistance,
    dotSize,
    showDots,
    showConnections,
    varyDotSize,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  const margin = 40;

  // Generate points using Poisson disc sampling
  // The algorithm ensures minimum distance between all points
  const points = poissonDisc({
    width: width - margin * 2,
    height: height - margin * 2,
    radius: radius,
    maxAttempts: 30,
  });

  // Offset points by margin
  const offsetPoints = points.map(p => ({
    x: p.x + margin,
    y: p.y + margin,
  }));

  // Create groups for different elements
  const connectionGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  const dotGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  // Draw connections between nearby points
  if (showConnections && connectionDistance > 0) {
    // Track drawn connections to avoid duplicates
    const drawnConnections = new Set<string>();

    for (let i = 0; i < offsetPoints.length; i++) {
      const p1 = offsetPoints[i];

      for (let j = i + 1; j < offsetPoints.length; j++) {
        const p2 = offsetPoints[j];

        // Calculate distance between points
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Connect if within connection distance
        if (dist <= connectionDistance) {
          const key = `${i}-${j}`;
          if (!drawnConnections.has(key)) {
            drawnConnections.add(key);
            connectionGroup.line(p1.x, p1.y, p2.x, p2.y);
          }
        }
      }
    }
  }

  // Draw dots at each point
  if (showDots) {
    for (const point of offsetPoints) {
      let size = dotSize;
      if (varyDotSize) {
        // Vary size randomly
        size = dotSize * random(0.5, 1.5);
      }
      dotGroup.circle(size * 2).cx(point.x).cy(point.y);
    }
  }

  // Add info text
  svgDraw.text(`poissonDisc() - ${offsetPoints.length} points`)
    .font({ size: 12, family: 'sans-serif' })
    .fill('black')
    .move(margin, height - margin + 15);

  svgDraw.text(`min distance: ${radius}px`)
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(margin, height - margin + 30);

  // Visualization of the minimum distance constraint
  // Draw a reference circle showing the exclusion zone
  if (offsetPoints.length > 0) {
    const refPoint = offsetPoints[Math.floor(offsetPoints.length / 2)];

    // Dashed circle showing the minimum distance
    svgDraw.circle(radius * 2)
      .cx(refPoint.x)
      .cy(refPoint.y)
      .stroke({ color: 'black', width: 0.5, dasharray: '4,4' })
      .fill('none');

    // Label
    svgDraw.text(`← radius = ${radius}`)
      .font({ size: 9, family: 'sans-serif' })
      .fill('black')
      .move(refPoint.x + radius + 5, refPoint.y - 5);
  }

  return svg;
}
