/**
 * Generative Utils Example
 * Demonstrates the @johnfmorton/generative-utils library.
 *
 * This artwork showcases key utilities from generative-utils:
 * - seedPRNG: Seed the random number generator for reproducibility
 * - random: Generate random values (numbers or array elements)
 * - spline: Create smooth Catmull-Rom spline paths from points
 * - map: Remap values between ranges
 *
 * The library is included by default in this project. Artists can import
 * any of its utilities but are not required to use them.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { seedPRNG, random, spline, map } from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Generative Utils Example',
  description: 'Demonstrates spline, random, and map utilities',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'stems',
    label: 'Stems',
    min: 3,
    max: 20,
    step: 1,
    default: 8,
  },
  {
    type: 'slider',
    id: 'petalsPerStem',
    label: 'Petals per Stem',
    min: 2,
    max: 8,
    step: 1,
    default: 4,
  },
  {
    type: 'slider',
    id: 'petalSize',
    label: 'Petal Size',
    min: 20,
    max: 100,
    step: 5,
    default: 50,
  },
  {
    type: 'slider',
    id: 'curveTension',
    label: 'Curve Tension',
    min: 0.1,
    max: 1.5,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'slider',
    id: 'stemWiggle',
    label: 'Stem Wiggle',
    min: 0,
    max: 50,
    step: 5,
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
    type: 'toggle',
    id: 'closedPetals',
    label: 'Closed Petals',
    default: true,
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
    stems,
    petalsPerStem,
    petalSize,
    curveTension,
    stemWiggle,
    lineWidth,
    closedPetals,
    seed,
  } = values;

  // Seed the PRNG from generative-utils for reproducibility
  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  // Create group for all paths
  const group = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round', linejoin: 'round' })
    .fill('none');

  // Ground line at bottom
  const groundY = height * 0.85;

  // Generate stems with flowers
  for (let i = 0; i < stems; i++) {
    // Use map() to distribute stems evenly across width with margins
    const baseX = map(i, 0, stems - 1, width * 0.1, width * 0.9);

    // Randomize stem height using random(min, max)
    const stemHeight = random(height * 0.3, height * 0.6);
    const topY = groundY - stemHeight;

    // Generate stem points with wiggle
    const stemPoints: { x: number; y: number }[] = [];
    const stemSegments = 8;

    for (let j = 0; j <= stemSegments; j++) {
      const t = j / stemSegments;
      const y = map(t, 0, 1, groundY, topY);
      // Wiggle increases toward the top
      const wiggleAmount = stemWiggle * t * t;
      const x = baseX + random(-wiggleAmount, wiggleAmount);
      stemPoints.push({ x, y });
    }

    // Draw stem using spline() - creates smooth SVG path string
    const stemPath = spline(stemPoints, curveTension, false);
    group.path(stemPath);

    // Generate flower petals at the top
    const flowerCenter = stemPoints[stemPoints.length - 1];

    for (let p = 0; p < petalsPerStem; p++) {
      // Distribute petals around the center
      const baseAngle = map(p, 0, petalsPerStem, 0, Math.PI * 2);
      const angleVariation = random(-0.2, 0.2);
      const angle = baseAngle + angleVariation;

      // Each petal is a curved shape made of points
      const petalPoints: { x: number; y: number }[] = [];
      const petalLength = random(petalSize * 0.7, petalSize * 1.3);
      const petalWidth = random(petalSize * 0.2, petalSize * 0.4);

      // Create petal shape with 5 points
      const numPoints = 5;
      for (let k = 0; k < numPoints; k++) {
        const t = k / (numPoints - 1);
        // Distance from center along petal length
        const dist = map(t, 0, 1, 0, petalLength);
        // Width varies along petal (bulges in middle)
        const widthAtPoint = Math.sin(t * Math.PI) * petalWidth;
        // Alternate sides for closed shape
        const side = k % 2 === 0 ? 1 : -1;

        const px = flowerCenter.x + Math.cos(angle) * dist + Math.cos(angle + Math.PI / 2) * widthAtPoint * side;
        const py = flowerCenter.y + Math.sin(angle) * dist + Math.sin(angle + Math.PI / 2) * widthAtPoint * side;

        petalPoints.push({ x: px, y: py });
      }

      // Draw petal using spline() with optional closure
      const petalPath = spline(petalPoints, curveTension * 0.8, closedPetals);
      group.path(petalPath);
    }

    // Add a small circle at flower center
    const centerSize = random(3, 8);
    group.circle(centerSize * 2).cx(flowerCenter.x).cy(flowerCenter.y);
  }

  return svg;
}
