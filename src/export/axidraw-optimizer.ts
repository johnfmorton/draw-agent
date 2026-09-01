/**
 * AxiDraw path optimization for efficient pen plotter output.
 * Extracts paths from SVG, reorders to minimize pen-up travel distance.
 */

import type { CanvasConfig } from '../controls/schema';
import { canvasToPixels } from '../controls/schema';
import {
  ellipseToSubPath,
  matApply,
  matDet,
  matIdentity,
  matIsIdentity,
  matMultiply,
  parsePathData,
  parseTransformAttribute,
  reverseSubPaths,
  serializePathData,
  transformSubPaths,
  type Mat,
} from '../path-geometry';

interface Point {
  x: number;
  y: number;
}

interface PathSegment {
  pathData: string;
  startPoint: Point;
  endPoint: Point;
  stroke: string;
  strokeWidth: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
}

interface OptimizationOptions {
  reverseStrokes: boolean;
  startPosition?: Point;
}

/**
 * Extract all drawable paths from an SVG element.
 */
export function extractPaths(svg: SVGSVGElement): PathSegment[] {
  const paths: PathSegment[] = [];

  function processElement(
    element: Element,
    parentTransform: Mat,
    inheritedStyles: InheritedStyles,
  ) {
    // Non-drawable containers must never be plotted (a <clipPath>'s
    // rect is mask machinery, not ink).
    if (NON_DRAWABLE_TAGS.has(element.tagName)) return;

    // Merge inherited styles with element's own styles
    const styles = getElementStyles(element, inheritedStyles);

    // Get this element's transform and combine with parent
    const localTransform = getElementTransform(element);
    const transform = matMultiply(parentTransform, localTransform);

    let segment: PathSegment | null = null;
    switch (element.tagName) {
      case 'path': {
        const d = element.getAttribute('d');
        if (d) segment = createPathSegment(d, transform, styles);
        break;
      }
      case 'line':
        segment = lineToPathSegment(element, transform, styles);
        break;
      case 'polyline':
        segment = polylineToPathSegment(element, transform, styles, false);
        break;
      case 'polygon':
        segment = polylineToPathSegment(element, transform, styles, true);
        break;
      case 'circle':
        segment = circleToPathSegment(element, transform, styles);
        break;
      case 'ellipse':
        segment = ellipseToPathSegment(element, transform, styles);
        break;
      case 'rect':
        segment = rectToPathSegment(element, transform, styles);
        break;
    }

    if (segment) {
      // Flattening a transform into coordinates must also flatten it
      // into the stroke width, or a scaled group exports the wrong
      // pen-width hint (cosmetic for AxiDraw, which follows geometry).
      const scale = Math.sqrt(Math.abs(matDet(transform)));
      if (Math.abs(scale - 1) > 1e-9) {
        segment = { ...segment, strokeWidth: segment.strokeWidth * scale };
      }
      paths.push(segment);
    }

    // Recurse into children
    for (const child of element.children) {
      processElement(child, transform, styles);
    }
  }

  const initialStyles: InheritedStyles = {
    stroke: 'black',
    strokeWidth: 1,
  };

  for (const child of svg.children) {
    processElement(child, matIdentity(), initialStyles);
  }

  return paths;
}

const NON_DRAWABLE_TAGS = new Set([
  'defs',
  'clipPath',
  'mask',
  'symbol',
  'metadata',
  'title',
  'desc',
  'style',
  'script',
]);

interface InheritedStyles {
  stroke: string;
  strokeWidth: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
}

function getElementStyles(
  element: Element,
  inherited: InheritedStyles,
): InheritedStyles {
  const stroke = element.getAttribute('stroke') ?? inherited.stroke;
  const strokeWidthAttr = element.getAttribute('stroke-width');
  const strokeWidth = strokeWidthAttr
    ? parseFloat(strokeWidthAttr)
    : inherited.strokeWidth;
  const strokeLinecap =
    element.getAttribute('stroke-linecap') ?? inherited.strokeLinecap;
  const strokeLinejoin =
    element.getAttribute('stroke-linejoin') ?? inherited.strokeLinejoin;

  const result: InheritedStyles = { stroke, strokeWidth };
  if (strokeLinecap) result.strokeLinecap = strokeLinecap;
  if (strokeLinejoin) result.strokeLinejoin = strokeLinejoin;
  return result;
}

function getElementTransform(element: Element): Mat {
  const attr = element.getAttribute('transform');
  if (!attr) return matIdentity();
  const m = parseTransformAttribute(attr);
  if (!m) {
    console.warn(
      `extractPaths: unparseable transform "${attr}" treated as identity`,
    );
    return matIdentity();
  }
  return m;
}

function applyTransform(point: Point, transform: Mat): Point {
  return matApply(transform, point);
}
/**
 * Build a PathSegment with proper optional property handling.
 */
function buildPathSegment(
  pathData: string,
  startPoint: Point,
  endPoint: Point,
  styles: InheritedStyles,
): PathSegment {
  const segment: PathSegment = {
    pathData,
    startPoint,
    endPoint,
    stroke: styles.stroke,
    strokeWidth: styles.strokeWidth,
  };
  if (styles.strokeLinecap) segment.strokeLinecap = styles.strokeLinecap;
  if (styles.strokeLinejoin) segment.strokeLinejoin = styles.strokeLinejoin;
  return segment;
}

/**
 * Create a path segment from a path 'd' attribute.
 */
function createPathSegment(
  d: string,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment | null {
  const points = parsePathEndpoints(d);
  if (!points) return null;

  const startPoint = applyTransform(points.start, transform);
  const endPoint = applyTransform(points.end, transform);

  // Transform the path data
  const transformedD = transformPathData(d, transform);

  return buildPathSegment(transformedD, startPoint, endPoint, styles);
}

/**
 * Convert SVG line to path segment.
 */
function lineToPathSegment(
  line: Element,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment | null {
  const x1 = parseFloat(line.getAttribute('x1') ?? '0');
  const y1 = parseFloat(line.getAttribute('y1') ?? '0');
  const x2 = parseFloat(line.getAttribute('x2') ?? '0');
  const y2 = parseFloat(line.getAttribute('y2') ?? '0');

  const start = applyTransform({ x: x1, y: y1 }, transform);
  const end = applyTransform({ x: x2, y: y2 }, transform);

  return buildPathSegment(
    `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    start,
    end,
    styles,
  );
}

/**
 * Convert SVG polyline/polygon to path segment.
 */
function polylineToPathSegment(
  element: Element,
  transform: Mat,
  styles: InheritedStyles,
  closed: boolean,
): PathSegment | null {
  const pointsAttr = element.getAttribute('points');
  if (!pointsAttr) return null;

  const points = parsePointsAttribute(pointsAttr);
  if (points.length < 2) return null;

  const transformedPoints = points.map((p) => applyTransform(p, transform));

  let d = `M ${transformedPoints[0].x} ${transformedPoints[0].y}`;
  for (let i = 1; i < transformedPoints.length; i++) {
    d += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
  }
  if (closed) d += ' Z';

  const startPoint = transformedPoints[0];
  const endPoint = closed
    ? transformedPoints[0]
    : transformedPoints[transformedPoints.length - 1];

  return buildPathSegment(d, startPoint, endPoint, styles);
}

/**
 * Convert SVG circle to path segment.
 */
function circleToPathSegment(
  circle: Element,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment | null {
  const cx = parseFloat(circle.getAttribute('cx') ?? '0');
  const cy = parseFloat(circle.getAttribute('cy') ?? '0');
  const r = parseFloat(circle.getAttribute('r') ?? '0');
  if (r <= 0) return null;
  return ellipseSegment(cx, cy, r, r, transform, styles);
}

/**
 * Convert SVG ellipse to path segment.
 */
function ellipseToPathSegment(
  ellipse: Element,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment | null {
  const cx = parseFloat(ellipse.getAttribute('cx') ?? '0');
  const cy = parseFloat(ellipse.getAttribute('cy') ?? '0');
  const rx = parseFloat(ellipse.getAttribute('rx') ?? '0');
  const ry = parseFloat(ellipse.getAttribute('ry') ?? '0');
  if (rx <= 0 || ry <= 0) return null;
  return ellipseSegment(cx, cy, rx, ry, transform, styles);
}

/** Exact under any affine map: transform the cubic control points, not the radii. */
function ellipseSegment(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment {
  const world = transformSubPaths(
    [ellipseToSubPath(cx, cy, rx, ry)],
    transform,
  );
  const d = serializePathData(world);
  const start = matApply(transform, { x: cx + rx, y: cy });
  return buildPathSegment(d, start, start, styles);
}
/**
 * Convert SVG rect to path segment.
 */
function rectToPathSegment(
  rect: Element,
  transform: Mat,
  styles: InheritedStyles,
): PathSegment | null {
  const x = parseFloat(rect.getAttribute('x') ?? '0');
  const y = parseFloat(rect.getAttribute('y') ?? '0');
  const width = parseFloat(rect.getAttribute('width') ?? '0');
  const height = parseFloat(rect.getAttribute('height') ?? '0');

  if (width <= 0 || height <= 0) return null;

  const p1 = applyTransform({ x, y }, transform);
  const p2 = applyTransform({ x: x + width, y }, transform);
  const p3 = applyTransform({ x: x + width, y: y + height }, transform);
  const p4 = applyTransform({ x, y: y + height }, transform);

  const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;

  return buildPathSegment(d, p1, p1, styles);
}

/**
 * Parse points attribute from polyline/polygon.
 */
function parsePointsAttribute(pointsStr: string): Point[] {
  const points: Point[] = [];
  const numbers = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(parseFloat);

  for (let i = 0; i < numbers.length - 1; i += 2) {
    if (!isNaN(numbers[i]) && !isNaN(numbers[i + 1])) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
  }

  return points;
}

/**
 * Parse path 'd' attribute to extract start and end points.
 */
function parsePathEndpoints(d: string): { start: Point; end: Point } | null {
  const commands = parsePathCommands(d);
  if (commands.length === 0) return null;

  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let firstPoint: Point | null = null;

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M':
        currentX = args[0];
        currentY = args[1];
        startX = currentX;
        startY = currentY;
        if (!firstPoint) firstPoint = { x: currentX, y: currentY };
        // Handle implicit lineto after moveto
        for (let i = 2; i < args.length; i += 2) {
          currentX = args[i];
          currentY = args[i + 1];
        }
        break;
      case 'm':
        currentX += args[0];
        currentY += args[1];
        startX = currentX;
        startY = currentY;
        if (!firstPoint) firstPoint = { x: currentX, y: currentY };
        for (let i = 2; i < args.length; i += 2) {
          currentX += args[i];
          currentY += args[i + 1];
        }
        break;
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i];
          currentY = args[i + 1];
        }
        break;
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i];
          currentY += args[i + 1];
        }
        break;
      case 'H':
        currentX = args[args.length - 1];
        break;
      case 'h':
        for (const arg of args) currentX += arg;
        break;
      case 'V':
        currentY = args[args.length - 1];
        break;
      case 'v':
        for (const arg of args) currentY += arg;
        break;
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          currentX = args[i + 4];
          currentY = args[i + 5];
        }
        break;
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          currentX += args[i + 4];
          currentY += args[i + 5];
        }
        break;
      case 'S':
        for (let i = 0; i < args.length; i += 4) {
          currentX = args[i + 2];
          currentY = args[i + 3];
        }
        break;
      case 's':
        for (let i = 0; i < args.length; i += 4) {
          currentX += args[i + 2];
          currentY += args[i + 3];
        }
        break;
      case 'Q':
        for (let i = 0; i < args.length; i += 4) {
          currentX = args[i + 2];
          currentY = args[i + 3];
        }
        break;
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          currentX += args[i + 2];
          currentY += args[i + 3];
        }
        break;
      case 'T':
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i];
          currentY = args[i + 1];
        }
        break;
      case 't':
        for (let i = 0; i < args.length; i += 2) {
          currentX += args[i];
          currentY += args[i + 1];
        }
        break;
      case 'A':
        for (let i = 0; i < args.length; i += 7) {
          currentX = args[i + 5];
          currentY = args[i + 6];
        }
        break;
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          currentX += args[i + 5];
          currentY += args[i + 6];
        }
        break;
      case 'Z':
      case 'z':
        currentX = startX;
        currentY = startY;
        break;
    }
  }

  if (!firstPoint) return null;

  return {
    start: firstPoint,
    end: { x: currentX, y: currentY },
  };
}

interface PathCommand {
  type: string;
  args: number[];
}

/**
 * Parse path 'd' attribute into commands.
 */
function parsePathCommands(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

  let match;
  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();
    const args = argsStr
      ? argsStr
          .split(/[\s,]+/)
          .map(parseFloat)
          .filter((n) => !isNaN(n))
      : [];
    commands.push({ type, args });
  }

  return commands;
}

/**
 * Transform path data exactly: every command (curves included) is
 * normalized to absolute L/Q/C and its points are mapped through the
 * matrix. Arcs become cubic approximations in the process.
 */
function transformPathData(d: string, transform: Mat): string {
  if (matIsIdentity(transform)) return d;
  const model = parsePathData(d);
  if (!model) {
    console.warn('transformPathData: unparseable path data left untransformed');
    return d;
  }
  return serializePathData(transformSubPaths(model, transform));
}

/**
 * Calculate Euclidean distance between two points.
 */
function distance(a: Point, b: Point): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * Reverse a path segment (swap start/end, reverse path data). When
 * the data can't be reversed the segment is returned unchanged so
 * the optimizer's pen-position tracking stays truthful.
 */
function reversePath(segment: PathSegment): PathSegment {
  const reversed = reversePathData(segment.pathData);
  if (reversed === null) return segment;
  return {
    ...segment,
    pathData: reversed,
    startPoint: segment.endPoint,
    endPoint: segment.startPoint,
  };
}

/** Reverse path data; null when it can't be parsed. */
function reversePathData(d: string): string | null {
  const model = parsePathData(d);
  if (!model || model.length === 0) return null;
  return serializePathData(reverseSubPaths(model));
}

/**
 * Optimize path order using greedy nearest-neighbor algorithm.
 */
export function optimizePaths(
  paths: PathSegment[],
  options: OptimizationOptions,
): PathSegment[] {
  if (paths.length === 0) return [];

  const result: PathSegment[] = [];
  const remaining = new Set(paths);
  let currentPosition = options.startPosition ?? { x: 0, y: 0 };

  while (remaining.size > 0) {
    let bestPath: PathSegment | null = null;
    let bestDistance = Infinity;
    let shouldReverse = false;

    for (const path of remaining) {
      // Distance to path start
      const distToStart = distance(currentPosition, path.startPoint);
      if (distToStart < bestDistance) {
        bestDistance = distToStart;
        bestPath = path;
        shouldReverse = false;
      }

      // If reversal allowed, also check distance to path end
      if (options.reverseStrokes) {
        const distToEnd = distance(currentPosition, path.endPoint);
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd;
          bestPath = path;
          shouldReverse = true;
        }
      }
    }

    if (bestPath) {
      remaining.delete(bestPath);

      const finalPath = shouldReverse ? reversePath(bestPath) : bestPath;
      result.push(finalPath);
      currentPosition = finalPath.endPoint;
    }
  }

  return result;
}

/**
 * Generate clean SVG string from optimized paths.
 */
export function generateCleanSVG(
  paths: PathSegment[],
  canvas: CanvasConfig,
): string {
  const { width, height, unit } = canvas;
  const pixels = canvasToPixels(canvas);

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}${unit}"
     height="${height}${unit}"
     viewBox="0 0 ${pixels.width} ${pixels.height}">
`;

  for (const path of paths) {
    const attrs: string[] = [
      `d="${path.pathData}"`,
      'fill="none"',
      `stroke="${path.stroke}"`,
      `stroke-width="${path.strokeWidth}"`,
    ];

    if (path.strokeLinecap) {
      attrs.push(`stroke-linecap="${path.strokeLinecap}"`);
    }
    if (path.strokeLinejoin) {
      attrs.push(`stroke-linejoin="${path.strokeLinejoin}"`);
    }

    svg += `  <path ${attrs.join(' ')} />\n`;
  }

  svg += '</svg>';
  return svg;
}
