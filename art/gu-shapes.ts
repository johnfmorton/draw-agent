/**
 * Geometric Shapes - Generative Utils Demo
 * Demonstrates geometric shape generation and distance functions:
 * - polygon: Generate vertices of a regular polygon
 * - star: Generate vertices of a star shape
 * - distToSegment: Calculate distance from point to line segment
 * - distToSegmentSquared: Squared distance (faster for comparisons)
 *
 * The artwork creates a grid of geometric shapes with nested
 * decorations based on distance calculations.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import {
  seedPRNG,
  random,
  polygon,
  star,
  distToSegment,
  pointsToPath,
} from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Geometric Shapes',
  description: 'Demonstrates polygon, star, and distance calculations',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'gridSize',
    label: 'Grid Size',
    min: 2,
    max: 5,
    step: 1,
    default: 3,
  },
  {
    type: 'dropdown',
    id: 'shapeType',
    label: 'Shape Type',
    options: [
      { value: 'polygon', label: 'Polygons' },
      { value: 'star', label: 'Stars' },
      { value: 'mixed', label: 'Mixed' },
    ],
    default: 'mixed',
  },
  {
    type: 'slider',
    id: 'sides',
    label: 'Polygon Sides',
    min: 3,
    max: 12,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'starPoints',
    label: 'Star Points',
    min: 3,
    max: 12,
    step: 1,
    default: 5,
  },
  {
    type: 'slider',
    id: 'innerRatio',
    label: 'Star Inner Ratio',
    min: 0.2,
    max: 0.8,
    step: 0.05,
    default: 0.4,
  },
  {
    type: 'slider',
    id: 'nestingLevels',
    label: 'Nesting Levels',
    min: 1,
    max: 6,
    step: 1,
    default: 4,
  },
  {
    type: 'slider',
    id: 'rotation',
    label: 'Base Rotation',
    min: 0,
    max: 360,
    step: 15,
    default: 0,
  },
  {
    type: 'toggle',
    id: 'showDistanceLines',
    label: 'Show Distance Lines',
    default: true,
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
    gridSize,
    shapeType,
    sides,
    starPoints,
    innerRatio,
    nestingLevels,
    rotation,
    showDistanceLines,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  const group = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  const thinGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.5 })
    .fill('none');

  const margin = 60;
  const usableWidth = width - margin * 2;
  const usableHeight = height - margin * 2;

  const cellWidth = usableWidth / gridSize;
  const cellHeight = usableHeight / gridSize;
  const baseRadius = Math.min(cellWidth, cellHeight) * 0.4;

  const rotationRad = (rotation * Math.PI) / 180;

  // Draw grid of shapes
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cx = margin + cellWidth * col + cellWidth / 2;
      const cy = margin + cellHeight * row + cellHeight / 2;

      // Determine shape type for this cell
      let usePolygon: boolean;
      if (shapeType === 'polygon') {
        usePolygon = true;
      } else if (shapeType === 'star') {
        usePolygon = false;
      } else {
        // Mixed: alternate or random
        usePolygon = (row + col) % 2 === 0;
      }

      // Add some rotation variation per cell
      const cellRotation = rotationRad + random(-0.2, 0.2);

      // Draw nested shapes
      for (let level = 0; level < nestingLevels; level++) {
        const scale = 1 - (level / nestingLevels) * 0.8;
        const radius = baseRadius * scale;
        const levelRotation = cellRotation + (level * Math.PI) / (nestingLevels * 2);

        let points: { x: number; y: number }[];

        if (usePolygon) {
          // polygon() generates regular polygon vertices
          points = polygon({
            sides: sides,
            radius: radius,
            cx: cx,
            cy: cy,
            rotation: levelRotation,
          });
        } else {
          // star() generates star vertices with inner/outer radii
          points = star({
            points: starPoints,
            outerRadius: radius,
            innerRadius: radius * innerRatio,
            cx: cx,
            cy: cy,
            rotation: levelRotation,
          });
        }

        // Convert points to SVG path and draw
        const pathString = pointsToPath(points, true);
        group.path(pathString);
      }

      // Demonstrate distToSegment: draw lines from center to nearest edge
      if (showDistanceLines && nestingLevels > 0) {
        // Get the outermost shape's points
        const outerPoints = usePolygon
          ? polygon({ sides, radius: baseRadius, cx, cy, rotation: cellRotation })
          : star({
              points: starPoints,
              outerRadius: baseRadius,
              innerRadius: baseRadius * innerRatio,
              cx,
              cy,
              rotation: cellRotation,
            });

        // Pick a few random points inside and show distance to nearest edge
        for (let i = 0; i < 3; i++) {
          // Random point near center
          const angle = random(0, Math.PI * 2);
          const dist = random(0, baseRadius * 0.3);
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * dist;

          // Find minimum distance to any edge segment
          let minDist = Infinity;
          let nearestPoint = { x: px, y: py };

          for (let j = 0; j < outerPoints.length; j++) {
            const p1 = outerPoints[j];
            const p2 = outerPoints[(j + 1) % outerPoints.length];

            // distToSegment calculates perpendicular distance to line segment
            const d = distToSegment(
              [px, py],
              [p1.x, p1.y],
              [p2.x, p2.y]
            );

            if (d < minDist) {
              minDist = d;
              // Calculate nearest point on segment for visualization
              nearestPoint = getNearestPointOnSegment(
                { x: px, y: py },
                p1,
                p2
              );
            }
          }

          // Draw line from point to nearest edge
          thinGroup.line(px, py, nearestPoint.x, nearestPoint.y)
            .stroke({ dasharray: '2,2' });

          // Small circle at the test point
          thinGroup.circle(4).cx(px).cy(py);
        }
      }
    }
  }

  // Add labels
  svgDraw.text(`polygon() - ${sides} sides`)
    .font({ size: 11, family: 'sans-serif' })
    .fill('black')
    .move(margin, height - margin + 20);

  svgDraw.text(`star() - ${starPoints} points, ${Math.round(innerRatio * 100)}% inner`)
    .font({ size: 11, family: 'sans-serif' })
    .fill('black')
    .move(width / 2, height - margin + 20);

  if (showDistanceLines) {
    svgDraw.text('dashed lines show distToSegment()')
      .font({ size: 10, family: 'sans-serif' })
      .fill('black')
      .move(margin, height - margin + 35);
  }

  return svg;
}

/**
 * Helper to find nearest point on a line segment
 * Used to visualize distToSegment results
 */
function getNearestPointOnSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): { x: number; y: number } {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return { x: v.x, y: v.y };

  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));

  return {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  };
}
