/**
 * Value Mapping Study - Generative Utils Demo
 * Demonstrates value mapping and interpolation functions:
 * - map: Remap a value from one range to another
 * - lerp: Linear interpolation between two values
 * - clamp: Constrain a value within a range
 *
 * The artwork shows lines that smoothly transition their properties
 * (angle, length, spacing) across the canvas using these utilities.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import { seedPRNG, random, map, lerp, clamp } from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Value Mapping Study',
  description: 'Demonstrates map, lerp, and clamp for smooth transitions',
};

export const canvas: CanvasConfig = {
  width: 11,
  height: 8.5,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'lineCount',
    label: 'Line Count',
    min: 20,
    max: 120,
    step: 5,
    default: 60,
  },
  {
    type: 'slider',
    id: 'startAngle',
    label: 'Start Angle',
    min: -90,
    max: 90,
    step: 5,
    default: -30,
  },
  {
    type: 'slider',
    id: 'endAngle',
    label: 'End Angle',
    min: -90,
    max: 90,
    step: 5,
    default: 45,
  },
  {
    type: 'slider',
    id: 'startLength',
    label: 'Start Length',
    min: 20,
    max: 300,
    step: 10,
    default: 40,
  },
  {
    type: 'slider',
    id: 'endLength',
    label: 'End Length',
    min: 20,
    max: 300,
    step: 10,
    default: 200,
  },
  {
    type: 'slider',
    id: 'variation',
    label: 'Random Variation',
    min: 0,
    max: 50,
    step: 5,
    default: 15,
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
    lineCount,
    startAngle,
    endAngle,
    startLength,
    endLength,
    variation,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  const group = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round' })
    .fill('none');

  const margin = 80;

  // Convert angles to radians
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  // Main section: Lines with interpolated properties
  for (let i = 0; i < lineCount; i++) {
    // t goes from 0 to 1 as we move across the lines
    const t = i / (lineCount - 1);

    // Use map() to position lines across the canvas width
    const baseX = map(i, 0, lineCount - 1, margin, width - margin);

    // Use lerp() to smoothly interpolate angle and length
    const angle = lerp(startRad, endRad, t);
    const baseLength = lerp(startLength, endLength, t);

    // Add random variation, but use clamp() to keep within bounds
    const lengthVariation = random(-variation, variation);
    const length = clamp(baseLength + lengthVariation, 20, 400);

    const angleVariation = random(-0.1, 0.1);
    const finalAngle = angle + angleVariation;

    // Calculate line endpoints
    const centerY = height / 2;
    const halfLength = length / 2;

    const x1 = baseX - Math.cos(finalAngle) * halfLength;
    const y1 = centerY - Math.sin(finalAngle) * halfLength;
    const x2 = baseX + Math.cos(finalAngle) * halfLength;
    const y2 = centerY + Math.sin(finalAngle) * halfLength;

    group.line(x1, y1, x2, y2);
  }

  // Bottom demonstration: Explicit lerp visualization
  const demoY = height - margin + 30;
  const demoStartX = margin;
  const demoEndX = width - margin;

  // Draw 11 circles showing lerp from 0 to 1 in 0.1 steps
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // lerp between start and end X positions
    const x = lerp(demoStartX, demoEndX, t);
    // lerp circle size from small to large
    const radius = lerp(5, 20, t);

    group.circle(radius * 2).cx(x).cy(demoY);
  }

  // Label for lerp demo
  svgDraw.text('lerp(a, b, t) where t = 0.0 to 1.0')
    .font({ size: 12, family: 'sans-serif' })
    .fill('black')
    .move(margin, demoY + 25);

  // Top demonstration: map() range conversion
  const mapDemoY = margin - 30;

  // Show how map converts values from one range to another
  // Input range: 0-100, Output range: margin to width-margin
  const inputValues = [0, 25, 50, 75, 100];

  for (const inputVal of inputValues) {
    // map() converts from input range to output range
    const x = map(inputVal, 0, 100, demoStartX, demoEndX);

    // Draw a tick mark
    group.line(x, mapDemoY - 10, x, mapDemoY + 10);

    // Label with input value
    svgDraw.text(inputVal.toString())
      .font({ size: 10, family: 'sans-serif' })
      .fill('black')
      .cx(x)
      .cy(mapDemoY + 20);
  }

  svgDraw.text('map(n, 0, 100, start, end)')
    .font({ size: 12, family: 'sans-serif' })
    .fill('black')
    .move(margin, mapDemoY - 25);

  // Side demonstration: clamp() keeping values in bounds
  const clampDemoX = width - margin + 20;
  const clampValues = [-20, 0, 25, 50, 75, 100, 120]; // Some out of range
  const clampMin = 0;
  const clampMax = 100;

  svgDraw.text('clamp()')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(clampDemoX - 15, margin);

  for (let i = 0; i < clampValues.length; i++) {
    const inputVal = clampValues[i];
    const clampedVal = clamp(inputVal, clampMin, clampMax);

    // Map the clamped value to Y position
    const y = map(i, 0, clampValues.length - 1, margin + 40, height / 2);

    // Draw circle sized by clamped value
    const radius = map(clampedVal, 0, 100, 3, 15);
    group.circle(radius * 2).cx(clampDemoX + 20).cy(y);

    // Show original vs clamped if different
    const label = inputVal !== clampedVal
      ? `${inputVal}→${clampedVal}`
      : `${inputVal}`;

    svgDraw.text(label)
      .font({ size: 8, family: 'sans-serif' })
      .fill('black')
      .move(clampDemoX + 40, y - 4);
  }

  return svg;
}
