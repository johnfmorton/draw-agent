/**
 * Grid Pattern
 * A grid-based pattern with various cell variations.
 * Demonstrates: slider, toggle, dropdown, seed controls.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { canvasToPixels } from '../src/controls/schema';

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
  const { cols, rows, padding, lineWidth, fillChance, showGrid, pattern, seed } = values;

  const random = createRandom(seed);
  const { width, height } = canvasToPixels(canvasConfig);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', `${canvasConfig.width}${canvasConfig.unit}`);
  svg.setAttribute('height', `${canvasConfig.height}${canvasConfig.unit}`);

  const cellWidth = (width - padding * 2) / cols;
  const cellHeight = (height - padding * 2) / rows;

  // Draw grid lines if enabled
  if (showGrid) {
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('stroke', '#ccc');
    gridGroup.setAttribute('stroke-width', '0.5');

    for (let i = 0; i <= cols; i++) {
      const x = padding + i * cellWidth;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(padding));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(height - padding));
      gridGroup.appendChild(line);
    }

    for (let i = 0; i <= rows; i++) {
      const y = padding + i * cellHeight;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(padding));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(width - padding));
      line.setAttribute('y2', String(y));
      gridGroup.appendChild(line);
    }

    svg.appendChild(gridGroup);
  }

  // Draw patterns in cells
  const patternGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  patternGroup.setAttribute('stroke', 'black');
  patternGroup.setAttribute('stroke-width', String(lineWidth));
  patternGroup.setAttribute('fill', 'none');

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (random() > fillChance) continue;

      const x = padding + col * cellWidth;
      const y = padding + row * cellHeight;
      const cx = x + cellWidth / 2;
      const cy = y + cellHeight / 2;
      const r = Math.min(cellWidth, cellHeight) * 0.4;

      switch (pattern) {
        case 'circles': {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', String(cx));
          circle.setAttribute('cy', String(cy));
          circle.setAttribute('r', String(r));
          patternGroup.appendChild(circle);
          break;
        }

        case 'diagonal': {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          if (random() > 0.5) {
            line.setAttribute('x1', String(x));
            line.setAttribute('y1', String(y));
            line.setAttribute('x2', String(x + cellWidth));
            line.setAttribute('y2', String(y + cellHeight));
          } else {
            line.setAttribute('x1', String(x + cellWidth));
            line.setAttribute('y1', String(y));
            line.setAttribute('x2', String(x));
            line.setAttribute('y2', String(y + cellHeight));
          }
          patternGroup.appendChild(line);
          break;
        }

        case 'quarter': {
          const corner = Math.floor(random() * 4);
          const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
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

          arc.setAttribute('d', d);
          patternGroup.appendChild(arc);
          break;
        }

        case 'cross': {
          const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line1.setAttribute('x1', String(cx - r));
          line1.setAttribute('y1', String(cy));
          line1.setAttribute('x2', String(cx + r));
          line1.setAttribute('y2', String(cy));

          const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line2.setAttribute('x1', String(cx));
          line2.setAttribute('y1', String(cy - r));
          line2.setAttribute('x2', String(cx));
          line2.setAttribute('y2', String(cy + r));

          patternGroup.appendChild(line1);
          patternGroup.appendChild(line2);
          break;
        }
      }
    }
  }

  svg.appendChild(patternGroup);
  return svg;
}
