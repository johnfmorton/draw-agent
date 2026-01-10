/**
 * Procedural Grids - Generative Utils Demo
 * Demonstrates advanced grid and tessellation functions:
 * - createNoiseGrid: Generate a grid of Simplex noise values for flow fields
 * - createQtGrid: Adaptive quadtree subdivision based on point density
 * - createVoronoiDiagram: Voronoi tessellation with Lloyd relaxation
 *
 * Use the dropdown to switch between different grid visualizations.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import {
  seedPRNG,
  random,
  map,
  createNoiseGrid,
  createQtGrid,
  createVoronoiDiagram,
  pointsToPath,
} from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Procedural Grids',
  description: 'Demonstrates noise grids, quadtree subdivision, and Voronoi diagrams',
};

export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

export const controls = [
  {
    type: 'dropdown',
    id: 'gridType',
    label: 'Grid Type',
    options: [
      { value: 'noise', label: 'Noise Grid' },
      { value: 'quadtree', label: 'Quadtree' },
      { value: 'voronoi', label: 'Voronoi' },
    ],
    default: 'voronoi',
  },
  {
    type: 'slider',
    id: 'resolution',
    label: 'Resolution',
    min: 8,
    max: 40,
    step: 2,
    default: 20,
  },
  {
    type: 'slider',
    id: 'pointCount',
    label: 'Point Count',
    min: 10,
    max: 80,
    step: 5,
    default: 30,
  },
  {
    type: 'slider',
    id: 'relaxIterations',
    label: 'Voronoi Relaxation',
    min: 0,
    max: 15,
    step: 1,
    default: 5,
  },
  {
    type: 'slider',
    id: 'noiseScale',
    label: 'Noise Scale',
    min: 0.005,
    max: 0.05,
    step: 0.005,
    default: 0.015,
  },
  {
    type: 'slider',
    id: 'qtLevels',
    label: 'Quadtree Levels',
    min: 2,
    max: 6,
    step: 1,
    default: 4,
  },
  {
    type: 'toggle',
    id: 'showCenters',
    label: 'Show Cell Centers',
    default: false,
  },
  {
    type: 'toggle',
    id: 'showInnerCircles',
    label: 'Show Inner Circles',
    default: true,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.3,
    max: 2,
    step: 0.1,
    default: 0.6,
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
    gridType,
    resolution,
    pointCount,
    relaxIterations,
    noiseScale,
    qtLevels,
    showCenters,
    showInnerCircles,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  const margin = 50;
  const gridWidth = width - margin * 2;
  const gridHeight = height - margin * 2;

  // Groups for organization
  const cellGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  const decorGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.5 })
    .fill('none');

  const pointGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.4 })
    .fill('none');

  if (gridType === 'noise') {
    // createNoiseGrid generates a grid of Simplex noise values
    // Each cell has: x, y, width, height, noiseValue (-1 to 1)
    const noiseGrid = createNoiseGrid({
      width: gridWidth,
      height: gridHeight,
      resolution: resolution,
      xInc: noiseScale,
      yInc: noiseScale,
      seed: seed,
    });

    // Filter out undefined cells (can occur due to floating-point precision in the library)
    const validCells = noiseGrid.cells.filter(cell => cell !== undefined);

    // Draw flow-field-like marks based on noise values
    for (const cell of validCells) {
      const cx = margin + cell.x + cell.width / 2;
      const cy = margin + cell.y + cell.height / 2;

      // Map noise value (-1 to 1) to angle
      const angle = map(cell.noiseValue, -1, 1, 0, Math.PI * 2);

      // Draw oriented line
      const lineLength = Math.min(cell.width, cell.height) * 0.4;
      const dx = Math.cos(angle) * lineLength;
      const dy = Math.sin(angle) * lineLength;

      cellGroup.line(cx - dx, cy - dy, cx + dx, cy + dy);

      // Optional: show cell center
      if (showCenters) {
        pointGroup.circle(2).cx(cx).cy(cy);
      }
    }

    // Label
    svgDraw.text(`createNoiseGrid() - ${validCells.length} cells`)
      .font({ size: 11, family: 'sans-serif' })
      .fill('black')
      .move(margin, height - margin + 15);

  } else if (gridType === 'quadtree') {
    // Generate random points for quadtree to respond to
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        x: random(0, gridWidth),
        y: random(0, gridHeight),
      });
    }

    // createQtGrid creates adaptive subdivision based on point density
    // Areas with more points subdivide further
    const qtGrid = createQtGrid({
      width: gridWidth,
      height: gridHeight,
      points: points,
      gap: 2,
      maxQtObjects: 3,
      maxQtLevels: qtLevels,
    });

    // Draw quadtree cells
    for (const area of qtGrid.areas) {
      const x = margin + area.x;
      const y = margin + area.y;

      cellGroup.rect(area.width, area.height).move(x, y);

      // Optional: draw inner circle
      if (showInnerCircles) {
        const innerRadius = Math.min(area.width, area.height) * 0.3;
        decorGroup.circle(innerRadius * 2)
          .cx(x + area.width / 2)
          .cy(y + area.height / 2);
      }
    }

    // Draw the points that influenced subdivision
    if (showCenters) {
      for (const pt of points) {
        pointGroup.circle(4).cx(margin + pt.x).cy(margin + pt.y);
      }
    }

    // Label
    svgDraw.text(`createQtGrid() - ${qtGrid.areas.length} areas from ${pointCount} points`)
      .font({ size: 11, family: 'sans-serif' })
      .fill('black')
      .move(margin, height - margin + 15);

  } else {
    // createVoronoiDiagram generates Voronoi tessellation
    // Lloyd relaxation makes cells more uniform

    // Generate random seed points
    const seedPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < pointCount; i++) {
      seedPoints.push({
        x: random(0, gridWidth),
        y: random(0, gridHeight),
      });
    }

    const voronoi = createVoronoiDiagram({
      width: gridWidth,
      height: gridHeight,
      points: seedPoints,
      relaxIterations: relaxIterations,
      relaxationFactor: 0.5,
    });

    // Draw Voronoi cells
    for (const cell of voronoi.cells) {
      if (cell.points && cell.points.length > 2) {
        // Convert [x, y] arrays to {x, y} objects
        const cellPoints = cell.points.map(p => ({ x: margin + p[0], y: margin + p[1] }));

        // Draw cell boundary
        const pathString = pointsToPath(cellPoints, true);
        cellGroup.path(pathString);

        // Draw inner circle (largest circle that fits in cell)
        if (showInnerCircles && cell.innerCircleRadius > 0) {
          decorGroup.circle(cell.innerCircleRadius * 2)
            .cx(margin + cell.centroid.x)
            .cy(margin + cell.centroid.y);
        }

        // Draw cell centroid
        if (showCenters) {
          pointGroup.circle(4)
            .cx(margin + cell.centroid.x)
            .cy(margin + cell.centroid.y);
        }
      }
    }

    // Draw relaxed seed points (different from original points)
    if (showCenters) {
      for (const pt of voronoi.points) {
        pointGroup.circle(6).cx(margin + pt.x).cy(margin + pt.y)
          .stroke({ dasharray: '2,2' });
      }
    }

    // Label
    svgDraw.text(`createVoronoiDiagram() - ${voronoi.cells.length} cells, ${relaxIterations} relaxation iterations`)
      .font({ size: 11, family: 'sans-serif' })
      .fill('black')
      .move(margin, height - margin + 15);
  }

  // Title showing current mode
  const titles: Record<string, string> = {
    noise: 'Simplex Noise Grid (Flow Field)',
    quadtree: 'Quadtree Adaptive Subdivision',
    voronoi: 'Voronoi Diagram with Lloyd Relaxation',
  };

  svgDraw.text(titles[gridType])
    .font({ size: 14, family: 'sans-serif', weight: 'bold' })
    .fill('black')
    .move(margin, 30);

  return svg;
}
