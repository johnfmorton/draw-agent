/**
 * Grid Pattern
 * A grid-based pattern with various cell variations.
 * Demonstrates: slider, toggle, dropdown, seed controls.
 *
 * This artwork uses SVG.js for cleaner element creation.
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { createRandom } from '../src/random';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';

export const meta = {
  title: 'Grid Pattern',
  description: 'A grid with randomized cell patterns',
};

export const canvas: CanvasConfig = {
  width: 8,
  height: 8,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'cols',
    label: 'Columns',
    min: 3,
    max: 20,
    step: 1,
    default: 8,
  },
  {
    type: 'slider',
    id: 'rows',
    label: 'Rows',
    min: 3,
    max: 20,
    step: 1,
    default: 8,
  },
  {
    type: 'slider',
    id: 'padding',
    label: 'Padding',
    min: 0,
    max: 50,
    step: 1,
    default: 20,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.3,
    max: 3,
    step: 0.1,
    default: 0.8,
  },
  {
    type: 'slider',
    id: 'fillChance',
    label: 'Fill Chance',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.3,
  },
  {
    type: 'toggle',
    id: 'showGrid',
    label: 'Show Grid',
    default: false,
  },
  {
    type: 'dropdown',
    id: 'pattern',
    label: 'Pattern',
    options: [
      { value: 'circles', label: 'Circles' },
      { value: 'diagonal', label: 'Diagonal Lines' },
      { value: 'quarter', label: 'Quarter Circles' },
      { value: 'cross', label: 'Crosses' },
    ],
    default: 'circles',
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
    cols,
    rows,
    padding,
    lineWidth,
    fillChance,
    showGrid,
    pattern,
    seed,
  } = values;

  const random = createRandom(seed);
  const { width, height } = canvasToPixels(canvasConfig);

  // Create canvas with SVG.js
  const { svg, draw } = createCanvas(canvasConfig);

  const cellWidth = (width - padding * 2) / cols;
  const cellHeight = (height - padding * 2) / rows;

  // Draw grid lines if enabled
  if (showGrid) {
    const gridGroup = draw.group().stroke({ color: '#ccc', width: 0.5 });

    for (let i = 0; i <= cols; i++) {
      const x = padding + i * cellWidth;
      gridGroup.line(x, padding, x, height - padding);
    }

    for (let i = 0; i <= rows; i++) {
      const y = padding + i * cellHeight;
      gridGroup.line(padding, y, width - padding, y);
    }
  }

  // Draw patterns in cells
  const patternGroup = draw
    .group()
    .stroke({ color: 'black', width: lineWidth })
    .fill('none');

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (random() > fillChance) continue;

      const x = padding + col * cellWidth;
      const y = padding + row * cellHeight;
      const cx = x + cellWidth / 2;
      const cy = y + cellHeight / 2;
      const r = Math.min(cellWidth, cellHeight) * 0.4;

      switch (pattern) {
        case 'circles':
          patternGroup
            .circle(r * 2)
            .cx(cx)
            .cy(cy);
          break;

        case 'diagonal':
          if (random() > 0.5) {
            patternGroup.line(x, y, x + cellWidth, y + cellHeight);
          } else {
            patternGroup.line(x + cellWidth, y, x, y + cellHeight);
          }
          break;

        case 'quarter': {
          const corner = Math.floor(random() * 4);
          const arcR = Math.min(cellWidth, cellHeight) * 0.9;
          let d = '';

          switch (corner) {
            case 0: // top-left
              d = `M ${x} ${y + arcR} A ${arcR} ${arcR} 0 0 1 ${x + arcR} ${y}`;
              break;
            case 1: // top-right
              d = `M ${x + cellWidth - arcR} ${y} A ${arcR} ${arcR} 0 0 1 ${x + cellWidth} ${y + arcR}`;
              break;
            case 2: // bottom-right
              d = `M ${x + cellWidth} ${y + cellHeight - arcR} A ${arcR} ${arcR} 0 0 1 ${x + cellWidth - arcR} ${y + cellHeight}`;
              break;
            case 3: // bottom-left
              d = `M ${x + arcR} ${y + cellHeight} A ${arcR} ${arcR} 0 0 1 ${x} ${y + cellHeight - arcR}`;
              break;
          }

          patternGroup.path(d);
          break;
        }

        case 'cross':
          patternGroup.line(cx - r, cy, cx + r, cy);
          patternGroup.line(cx, cy - r, cx, cy + r);
          break;
      }
    }
  }

  return svg;
}
