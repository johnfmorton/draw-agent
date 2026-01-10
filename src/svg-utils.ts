import { SVG, Svg } from '@svgdotjs/svg.js';
import type { CanvasConfig } from './controls/schema';
import { canvasToPixels } from './controls/schema';

/**
 * Result from createCanvas - provides both raw SVG element and SVG.js instance.
 */
export interface CanvasResult {
  /** The raw SVG element to return from draw() */
  svg: SVGSVGElement;
  /** SVG.js drawing instance for easy shape creation */
  draw: Svg;
}

/**
 * Create an SVG canvas with both raw element and SVG.js instance.
 * The viewBox uses pixel coordinates (96 DPI) while width/height use physical units.
 *
 * @example
 * ```typescript
 * import { createCanvas } from '../src/svg-utils';
 * import { canvasToPixels } from '../src/controls/schema';
 *
 * export function draw(values: Values, canvas: CanvasConfig): SVGElement {
 *   const { svg, draw } = createCanvas(canvas);
 *   const { width, height } = canvasToPixels(canvas);
 *
 *   // Use SVG.js chainable API with pixel coordinates
 *   draw.circle(50)
 *     .cx(width / 2)
 *     .cy(height / 2)
 *     .fill('none')
 *     .stroke({ color: '#000', width: 0.5 });
 *
 *   return svg;
 * }
 * ```
 */
export function createCanvas(canvas: CanvasConfig): CanvasResult {
  const { width, height, unit } = canvas;
  const pixels = canvasToPixels(canvas);

  // Create SVG.js instance (creates its own SVG element)
  const draw = SVG() as Svg;

  // Configure the SVG element
  // Physical size via width/height attributes, pixel coordinates via viewBox
  draw
    .size(`${width}${unit}`, `${height}${unit}`)
    .viewbox(0, 0, pixels.width, pixels.height)
    .attr('xmlns', 'http://www.w3.org/2000/svg');

  // Get the raw SVG element
  const svg = draw.node as SVGSVGElement;

  return { svg, draw };
}

/**
 * Create a raw SVG element without SVG.js (for artists who prefer vanilla DOM).
 * The viewBox uses pixel coordinates (96 DPI) while width/height use physical units.
 *
 * @example
 * ```typescript
 * import { createRawCanvas } from '../src/svg-utils';
 * import { canvasToPixels } from '../src/controls/schema';
 *
 * export function draw(values: Values, canvas: CanvasConfig): SVGElement {
 *   const svg = createRawCanvas(canvas);
 *   const { width, height } = canvasToPixels(canvas);
 *
 *   const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
 *   circle.setAttribute('cx', String(width / 2));
 *   circle.setAttribute('cy', String(height / 2));
 *   circle.setAttribute('r', '50');
 *   svg.appendChild(circle);
 *
 *   return svg;
 * }
 * ```
 */
export function createRawCanvas(canvas: CanvasConfig): SVGSVGElement {
  const { width, height, unit } = canvas;
  const pixels = canvasToPixels(canvas);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${width}${unit}`);
  svg.setAttribute('height', `${height}${unit}`);
  // Physical size via width/height attributes, pixel coordinates via viewBox
  svg.setAttribute('viewBox', `0 0 ${pixels.width} ${pixels.height}`);

  return svg;
}

// Re-export SVG.js types for convenience
export { SVG, Svg } from '@svgdotjs/svg.js';
export type { Circle, Rect, Line, Path, G, Element as SvgElement } from '@svgdotjs/svg.js';
