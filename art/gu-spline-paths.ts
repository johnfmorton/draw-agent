/**
 * Spline Paths - Generative Utils Demo
 * Demonstrates curve and path utilities:
 * - spline: Create smooth Catmull-Rom spline SVG paths from control points
 * - pointsInPath: Extract evenly-spaced points along an SVG path
 * - pointsToPath: Convert an array of points to an SVG path string
 *
 * The artwork creates organic branching curves from a central point,
 * with secondary decorations placed along the curves using pointsInPath.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import {
  seedPRNG,
  random,
  spline,
  pointsInPath,
  pointsToPath,
  map,
} from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Spline Paths',
  description: 'Demonstrates spline curves and path point extraction',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'branches',
    label: 'Branches',
    min: 3,
    max: 12,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'tension',
    label: 'Spline Tension',
    min: 0.1,
    max: 1.5,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'slider',
    id: 'pointsPerBranch',
    label: 'Points per Branch',
    min: 4,
    max: 10,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'branchLength',
    label: 'Branch Length',
    min: 100,
    max: 400,
    step: 20,
    default: 250,
  },
  {
    type: 'slider',
    id: 'markerCount',
    label: 'Path Markers',
    min: 5,
    max: 30,
    step: 1,
    default: 12,
  },
  {
    type: 'slider',
    id: 'markerSize',
    label: 'Marker Size',
    min: 2,
    max: 15,
    step: 1,
    default: 6,
  },
  {
    type: 'toggle',
    id: 'closePaths',
    label: 'Close Spline Paths',
    default: false,
  },
  {
    type: 'toggle',
    id: 'showMarkers',
    label: 'Show Path Markers',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showControlPoints',
    label: 'Show Control Points',
    default: false,
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
    branches,
    tension,
    pointsPerBranch,
    branchLength,
    markerCount,
    markerSize,
    closePaths,
    showMarkers,
    showControlPoints,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  // Create groups for organization
  const pathGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round', linejoin: 'round' })
    .fill('none');

  const markerGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.5 })
    .fill('none');

  const controlPointGroup = svgDraw.group()
    .stroke({ color: 'black', width: 0.5, dasharray: '2,2' })
    .fill('none');

  // Center of the composition
  const centerX = width / 2;
  const centerY = height / 2;

  // Generate branches radiating from center
  for (let b = 0; b < branches; b++) {
    // Base angle for this branch
    const baseAngle = map(b, 0, branches, 0, Math.PI * 2);

    // Generate control points for the spline
    const controlPoints: { x: number; y: number }[] = [];

    // Start at center
    controlPoints.push({ x: centerX, y: centerY });

    // Add intermediate points with random variation
    for (let i = 1; i <= pointsPerBranch; i++) {
      const t = i / pointsPerBranch;
      const dist = branchLength * t;

      // Angle varies along the branch
      const angleVariation = random(-0.5, 0.5) * t;
      const angle = baseAngle + angleVariation;

      // Add perpendicular variation for organic feel
      const perpVariation = random(-40, 40) * t;
      const perpAngle = angle + Math.PI / 2;

      const x = centerX +
        Math.cos(angle) * dist +
        Math.cos(perpAngle) * perpVariation;
      const y = centerY +
        Math.sin(angle) * dist +
        Math.sin(perpAngle) * perpVariation;

      controlPoints.push({ x, y });
    }

    // Draw control points if enabled
    if (showControlPoints) {
      for (let i = 0; i < controlPoints.length; i++) {
        const p = controlPoints[i];
        controlPointGroup.circle(6).cx(p.x).cy(p.y);

        // Connect control points with dashed lines
        if (i > 0) {
          const prev = controlPoints[i - 1];
          controlPointGroup.line(prev.x, prev.y, p.x, p.y);
        }
      }
    }

    // Create smooth spline path from control points
    // spline() returns an SVG path string (M, L commands)
    const pathString = spline(controlPoints, tension, closePaths);
    const pathElement = pathGroup.path(pathString);

    // Use pointsInPath to extract evenly-spaced points along the curve
    // This requires the actual SVG path element
    if (showMarkers) {
      const svgPath = pathElement.node as unknown as SVGPathElement;

      // pointsInPath returns array of {x, y} points along the path
      const pathPoints = pointsInPath(svgPath, markerCount);

      // Draw markers at each extracted point
      for (let i = 0; i < pathPoints.length; i++) {
        const p = pathPoints[i];

        // Vary marker size along the path
        const sizeScale = map(i, 0, pathPoints.length - 1, 0.5, 1.5);
        const size = markerSize * sizeScale;

        // Draw small circle at each point
        markerGroup.circle(size * 2).cx(p.x).cy(p.y);
      }
    }
  }

  // Demonstration of pointsToPath: create a closed shape from points
  const demoY = height - 100;
  const demoPoints: { x: number; y: number }[] = [];

  // Generate some demo points
  for (let i = 0; i < 5; i++) {
    const angle = map(i, 0, 5, 0, Math.PI * 2);
    const radius = 30 + random(-10, 10);
    demoPoints.push({
      x: 100 + Math.cos(angle) * radius,
      y: demoY + Math.sin(angle) * radius,
    });
  }

  // pointsToPath converts points array to SVG path string
  // Second parameter controls whether path is closed
  const closedPath = pointsToPath(demoPoints, true);
  pathGroup.path(closedPath);

  // Show the points used
  for (const p of demoPoints) {
    markerGroup.circle(4).cx(p.x).cy(p.y);
  }

  // Labels
  svgDraw.text('spline() - smooth curves from control points')
    .font({ size: 11, family: 'sans-serif' })
    .fill('black')
    .move(50, 30);

  svgDraw.text(`tension: ${tension}`)
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(50, 45);

  if (showMarkers) {
    svgDraw.text('○ = pointsInPath() extracted points')
      .font({ size: 10, family: 'sans-serif' })
      .fill('black')
      .move(50, 60);
  }

  svgDraw.text('pointsToPath()')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(60, demoY - 45);

  return svg;
}
