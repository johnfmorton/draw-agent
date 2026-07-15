/**
 * Fall Leaves
 * A leaf generator
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { seedPRNG, random } from '@johnfmorton/generative-utils';
import { createCanvas } from '../src/svg-utils';

export const meta = {
  title: 'Fall Leaves',
  description: 'A leaf generator',
};

export const canvas: CanvasConfig = {
  width: 6,
  height: 6,
  unit: 'in',
};

export const controls = [
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 1360930455,
  },
  {
    type: 'slider',
    id: 'topLeftStart',
    label: 'Top Left Start',
    min: 0,
    max: 100,
    step: 1,
    default: 10,
  },
  {
    type: 'slider',
    id: 'topRightStart',
    label: 'Top Right Start',
    min: 0,
    max: 100,
    step: 1,
    default: 90,
  },
  {
    type: 'slider',
    id: 'x_pos',
    label: 'X Position',
    min: 0,
    max: 100,
    step: 1,
    default: 50,
  },
  {
    type: 'slider',
    id: 'y_pos',
    label: 'Y Position',
    min: 0,
    max: 100,
    step: 1,
    default: 50,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const { seed, topLeftStart, topRightStart, x_pos, y_pos } = values;

  seedPRNG(seed.toString());
  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw } = createCanvas(canvasConfig);

  // Sliders are 0-100: treat them as percentages of the canvas width
  // for where each side of the leaf leaves the top edge.
  const topLeftX = (topLeftStart / 100) * width;
  const topRightX = (topRightStart / 100) * width;

  // Leaf tip near the bottom, with a seeded outward bulge per side.
  const tip = { x: width / 2, y: height * 0.9 };
  const leftBulge = random(0.05, 0.25) * width;
  const rightBulge = random(0.05, 0.25) * width;

  // Left and right edges of the leaf: top edge down to the tip.
  draw
    .path(
      `M ${topLeftX} 0 Q ${topLeftX - leftBulge} ${height / 2} ${tip.x} ${tip.y}`,
    )
    .fill('none')
    .stroke({ color: '#000', width: 1 });
  draw
    .path(
      `M ${topRightX} 0 Q ${topRightX + rightBulge} ${height / 2} ${tip.x} ${tip.y}`,
    )
    .fill('none')
    .stroke({ color: '#000', width: 1 });

  // Center vein from the top midpoint to the tip.
  draw
    .line((topLeftX + topRightX) / 2, 0, tip.x, tip.y)
    .stroke({ color: '#000', width: 1 });

  draw
    .line(0, 0, (x_pos / 100) * width, (y_pos / 100) * height)
    .stroke({ color: '#f00', width: 3 });

  // --- Randomness (@johnfmorton/generative-utils) ---
  // import { randomBias, randomSnap } from '@johnfmorton/generative-utils';
  // const clustered = randomBias(0, width, width / 2); // values cluster near the bias point
  // const stepped = randomSnap(0, 360, 15); // random angle snapped to 15° increments

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

  // --- Grids (@johnfmorton/generative-utils) ---
  // import { createNoiseGrid } from '@johnfmorton/generative-utils';
  // const grid = createNoiseGrid({ width, height, resolution: 12 });
  // grid.cells.forEach((cell) => { /* cell.x, cell.y, cell.noiseValue */ });
  // // also: createVoronoiDiagram({ width, height, points }), createQtGrid(...)

  // --- Vector math (@johnfmorton/generative-utils) ---
  // import { vec2 } from '@johnfmorton/generative-utils';
  // const v = vec2.fromAngle(Math.PI / 4, 100); // direction + magnitude
  // const w = vec2.add(v, vec2.create(10, 0)); // add, rotate, normalize, lerp, ...

  // --- Value mapping (@johnfmorton/generative-utils) ---
  // import { map, lerp, clamp } from '@johnfmorton/generative-utils';
  // const y = map(3, 0, 10, 0, height); // remap 0-10 → canvas height
  // const mid = lerp(0, width, 0.5); // interpolate between two values
  // const safe = clamp(y, 0, height); // keep a value in range

  // --- Polygon clipping (polygon-clipping) ---
  // import polygonClipping from 'polygon-clipping';
  // const a: [number, number][][] = [[[0, 0], [width, 0], [width, height], [0, height]]];
  // const b: [number, number][][] = [[[50, 50], [width - 50, 50], [width / 2, height - 50]]];
  // const clipped = polygonClipping.intersection(a, b); // also union, difference, xor
  // // Great for occlusion culling and clipping hatch lines to shapes.

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
