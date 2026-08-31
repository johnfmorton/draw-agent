/**
 * Pen plotter calibration marks.
 *
 * Draws a crosshair at each corner of the canvas, derived from the
 * canvas's physical size — so any paper size in any unit gets correct
 * marks with no hardcoded coordinates. Plot the marks first to align
 * the pen with the paper corners, then turn them off (via the artwork's
 * toggle) for the final pass.
 */

import type { CanvasConfig } from './controls/schema';
import { canvasToPixels } from './controls/schema';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface CalibrationOptions {
  /** Crosshair arm length in px (default 5). */
  arm?: number;
  /** Stroke width in px — preview visibility only; the pen sets the real width (default 3). */
  strokeWidth?: number;
  /** Stroke color (default red). */
  color?: string;
}

/**
 * Append calibration crosshairs at the four canvas corners.
 * Raw DOM so it works with both SVG.js and raw-canvas artworks.
 * Returns the group element for further adjustment.
 */
export function drawCalibrationMarks(
  svg: SVGElement,
  canvasConfig: CanvasConfig,
  options: CalibrationOptions = {}
): SVGGElement {
  const { arm = 3, strokeWidth = 1, color = '#F00' } = options;
  const { width, height } = canvasToPixels(canvasConfig);

  const inset = 8;

  const corners = [
    { x: 0 + inset, y: 0 + inset },
    { x: width - inset, y: 0 + inset },
    { x: width - inset, y: height - inset },
    { x: 0 + inset , y: height - inset },
  ];

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('stroke', color);
  group.setAttribute('stroke-width', String(strokeWidth));
  group.setAttribute('fill', 'none');
  group.setAttribute('data-calibration', 'true');

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', String(x1));
    el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2));
    el.setAttribute('y2', String(y2));
    // Keep the stroke at screen width when a large canvas is scaled down
    // to fit the preview; plotters follow the geometry, not the stroke.
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(el);
  };

  for (const p of corners) {
    line(p.x - arm, p.y, p.x + arm, p.y);
    line(p.x, p.y - arm, p.x, p.y + arm);
  }

  svg.appendChild(group);
  return group;
}
