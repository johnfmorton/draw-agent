/**
 * AxiDraw path optimization for efficient pen plotter output.
 * Extracts paths from SVG, reorders to minimize pen-up travel distance.
 */

import type { CanvasConfig } from '../controls/schema';

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

  function processElement(element: Element, parentTransform: DOMMatrix, inheritedStyles: InheritedStyles) {
    // Merge inherited styles with element's own styles
    const styles = getElementStyles(element, inheritedStyles);

    // Get this element's transform and combine with parent
    const localTransform = getElementTransform(element);
    const transform = parentTransform.multiply(localTransform);

    if (element instanceof SVGPathElement) {
      const d = element.getAttribute('d');
      if (d) {
        const segment = createPathSegment(d, transform, styles);
        if (segment) paths.push(segment);
      }
    } else if (element instanceof SVGLineElement) {
      const segment = lineToPathSegment(element, transform, styles);
      if (segment) paths.push(segment);
    } else if (element instanceof SVGPolylineElement) {
      const segment = polylineToPathSegment(element, transform, styles, false);
      if (segment) paths.push(segment);
    } else if (element instanceof SVGPolygonElement) {
      const segment = polylineToPathSegment(element, transform, styles, true);
      if (segment) paths.push(segment);
    } else if (element instanceof SVGCircleElement) {
      const segment = circleToPathSegment(element, transform, styles);
      if (segment) paths.push(segment);
    } else if (element instanceof SVGEllipseElement) {
      const segment = ellipseToPathSegment(element, transform, styles);
      if (segment) paths.push(segment);
    } else if (element instanceof SVGRectElement) {
      const segment = rectToPathSegment(element, transform, styles);
      if (segment) paths.push(segment);
    }

    // Recurse into children
    for (const child of element.children) {
      processElement(child, transform, styles);
    }
  }

  const initialTransform = new DOMMatrix();
  const initialStyles: InheritedStyles = {
    stroke: 'black',
    strokeWidth: 1,
  };

  for (const child of svg.children) {
    processElement(child, initialTransform, initialStyles);
  }

  return paths;
}

interface InheritedStyles {
  stroke: string;
  strokeWidth: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
}

function getElementStyles(element: Element, inherited: InheritedStyles): InheritedStyles {
  const stroke = element.getAttribute('stroke') ?? inherited.stroke;
  const strokeWidthAttr = element.getAttribute('stroke-width');
  const strokeWidth = strokeWidthAttr ? parseFloat(strokeWidthAttr) : inherited.strokeWidth;
  const strokeLinecap = element.getAttribute('stroke-linecap') ?? inherited.strokeLinecap;
  const strokeLinejoin = element.getAttribute('stroke-linejoin') ?? inherited.strokeLinejoin;

  const result: InheritedStyles = { stroke, strokeWidth };
  if (strokeLinecap) result.strokeLinecap = strokeLinecap;
  if (strokeLinejoin) result.strokeLinejoin = strokeLinejoin;
  return result;
}

function getElementTransform(element: Element): DOMMatrix {
  if (element instanceof SVGGraphicsElement) {
    const transform = element.transform.baseVal.consolidate();
    if (transform) {
      return transform.matrix;
    }
  }
  return new DOMMatrix();
}

function applyTransform(point: Point, transform: DOMMatrix): Point {
  const pt = new DOMPoint(point.x, point.y);
  const transformed = pt.matrixTransform(transform);
  return { x: transformed.x, y: transformed.y };
}

/**
 * Build a PathSegment with proper optional property handling.
 */
function buildPathSegment(
  pathData: string,
  startPoint: Point,
  endPoint: Point,
  styles: InheritedStyles
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
function createPathSegment(d: string, transform: DOMMatrix, styles: InheritedStyles): PathSegment | null {
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
function lineToPathSegment(line: SVGLineElement, transform: DOMMatrix, styles: InheritedStyles): PathSegment | null {
  const x1 = parseFloat(line.getAttribute('x1') ?? '0');
  const y1 = parseFloat(line.getAttribute('y1') ?? '0');
  const x2 = parseFloat(line.getAttribute('x2') ?? '0');
  const y2 = parseFloat(line.getAttribute('y2') ?? '0');

  const start = applyTransform({ x: x1, y: y1 }, transform);
  const end = applyTransform({ x: x2, y: y2 }, transform);

  return buildPathSegment(`M ${start.x} ${start.y} L ${end.x} ${end.y}`, start, end, styles);
}

/**
 * Convert SVG polyline/polygon to path segment.
 */
function polylineToPathSegment(
  element: SVGPolylineElement | SVGPolygonElement,
  transform: DOMMatrix,
  styles: InheritedStyles,
  closed: boolean
): PathSegment | null {
  const pointsAttr = element.getAttribute('points');
  if (!pointsAttr) return null;

  const points = parsePointsAttribute(pointsAttr);
  if (points.length < 2) return null;

  const transformedPoints = points.map(p => applyTransform(p, transform));

  let d = `M ${transformedPoints[0].x} ${transformedPoints[0].y}`;
  for (let i = 1; i < transformedPoints.length; i++) {
    d += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
  }
  if (closed) d += ' Z';

  const startPoint = transformedPoints[0];
  const endPoint = closed ? transformedPoints[0] : transformedPoints[transformedPoints.length - 1];

  return buildPathSegment(d, startPoint, endPoint, styles);
}

/**
 * Convert SVG circle to path segment.
 */
function circleToPathSegment(circle: SVGCircleElement, transform: DOMMatrix, styles: InheritedStyles): PathSegment | null {
  const cx = parseFloat(circle.getAttribute('cx') ?? '0');
  const cy = parseFloat(circle.getAttribute('cy') ?? '0');
  const r = parseFloat(circle.getAttribute('r') ?? '0');

  if (r <= 0) return null;

  // Convert circle to two arcs
  const center = applyTransform({ x: cx, y: cy }, transform);
  const right = applyTransform({ x: cx + r, y: cy }, transform);
  const left = applyTransform({ x: cx - r, y: cy }, transform);

  // Calculate transformed radius (approximate for non-uniform scaling)
  const rx = Math.sqrt(Math.pow(right.x - center.x, 2) + Math.pow(right.y - center.y, 2));

  const d = `M ${right.x} ${right.y} A ${rx} ${rx} 0 1 1 ${left.x} ${left.y} A ${rx} ${rx} 0 1 1 ${right.x} ${right.y}`;

  return buildPathSegment(d, right, right, styles);
}

/**
 * Convert SVG ellipse to path segment.
 */
function ellipseToPathSegment(ellipse: SVGEllipseElement, transform: DOMMatrix, styles: InheritedStyles): PathSegment | null {
  const cx = parseFloat(ellipse.getAttribute('cx') ?? '0');
  const cy = parseFloat(ellipse.getAttribute('cy') ?? '0');
  const rx = parseFloat(ellipse.getAttribute('rx') ?? '0');
  const ry = parseFloat(ellipse.getAttribute('ry') ?? '0');

  if (rx <= 0 || ry <= 0) return null;

  const right = applyTransform({ x: cx + rx, y: cy }, transform);
  const left = applyTransform({ x: cx - rx, y: cy }, transform);
  const center = applyTransform({ x: cx, y: cy }, transform);

  // Calculate transformed radii
  const trx = Math.sqrt(Math.pow(right.x - center.x, 2) + Math.pow(right.y - center.y, 2));
  const top = applyTransform({ x: cx, y: cy - ry }, transform);
  const tr_y = Math.sqrt(Math.pow(top.x - center.x, 2) + Math.pow(top.y - center.y, 2));

  const d = `M ${right.x} ${right.y} A ${trx} ${tr_y} 0 1 1 ${left.x} ${left.y} A ${trx} ${tr_y} 0 1 1 ${right.x} ${right.y}`;

  return buildPathSegment(d, right, right, styles);
}

/**
 * Convert SVG rect to path segment.
 */
function rectToPathSegment(rect: SVGRectElement, transform: DOMMatrix, styles: InheritedStyles): PathSegment | null {
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
  const numbers = pointsStr.trim().split(/[\s,]+/).map(parseFloat);

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
      ? argsStr.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n))
      : [];
    commands.push({ type, args });
  }

  return commands;
}

/**
 * Transform path data using a transform matrix.
 * For simplicity, we only transform M, L commands fully.
 * Other commands are kept as-is (works well for simple paths).
 */
function transformPathData(d: string, transform: DOMMatrix): string {
  if (transform.isIdentity) return d;

  const commands = parsePathCommands(d);
  const result: string[] = [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M': {
        const points: string[] = [];
        for (let i = 0; i < args.length; i += 2) {
          const p = applyTransform({ x: args[i], y: args[i + 1] }, transform);
          points.push(`${p.x} ${p.y}`);
          currentX = args[i];
          currentY = args[i + 1];
        }
        result.push(`M ${points.join(' ')}`);
        break;
      }
      case 'L': {
        const points: string[] = [];
        for (let i = 0; i < args.length; i += 2) {
          const p = applyTransform({ x: args[i], y: args[i + 1] }, transform);
          points.push(`${p.x} ${p.y}`);
          currentX = args[i];
          currentY = args[i + 1];
        }
        result.push(`L ${points.join(' ')}`);
        break;
      }
      case 'H': {
        const points: string[] = [];
        for (const x of args) {
          const p = applyTransform({ x, y: currentY }, transform);
          points.push(`${p.x} ${p.y}`);
          currentX = x;
        }
        result.push(`L ${points.join(' ')}`);
        break;
      }
      case 'V': {
        const points: string[] = [];
        for (const y of args) {
          const p = applyTransform({ x: currentX, y }, transform);
          points.push(`${p.x} ${p.y}`);
          currentY = y;
        }
        result.push(`L ${points.join(' ')}`);
        break;
      }
      case 'Z':
      case 'z':
        result.push('Z');
        break;
      default:
        // For complex commands (curves), keep as-is
        // This is a simplification - full implementation would transform control points
        result.push(`${type} ${args.join(' ')}`);
    }
  }

  return result.join(' ');
}

/**
 * Calculate Euclidean distance between two points.
 */
function distance(a: Point, b: Point): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * Reverse a path segment (swap start/end, reverse path data).
 */
function reversePath(segment: PathSegment): PathSegment {
  return {
    ...segment,
    pathData: reversePathData(segment.pathData),
    startPoint: segment.endPoint,
    endPoint: segment.startPoint,
  };
}

/**
 * Reverse path data (reverse order of points in simple paths).
 */
function reversePathData(d: string): string {
  const commands = parsePathCommands(d);

  // Extract all points from the path
  const points: Point[] = [];
  let currentX = 0;
  let currentY = 0;
  let isClosed = false;

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M':
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          points.push({ x: args[i], y: args[i + 1] });
          currentX = args[i];
          currentY = args[i + 1];
        }
        break;
      case 'H':
        for (const x of args) {
          points.push({ x, y: currentY });
          currentX = x;
        }
        break;
      case 'V':
        for (const y of args) {
          points.push({ x: currentX, y });
          currentY = y;
        }
        break;
      case 'Z':
      case 'z':
        isClosed = true;
        break;
      default:
        // For complex paths, just return the original (can't easily reverse beziers)
        return d;
    }
  }

  if (points.length < 2) return d;

  // Reverse the points
  const reversed = points.reverse();

  // Rebuild path
  let result = `M ${reversed[0].x} ${reversed[0].y}`;
  for (let i = 1; i < reversed.length; i++) {
    result += ` L ${reversed[i].x} ${reversed[i].y}`;
  }
  if (isClosed) result += ' Z';

  return result;
}

/**
 * Optimize path order using greedy nearest-neighbor algorithm.
 */
export function optimizePaths(paths: PathSegment[], options: OptimizationOptions): PathSegment[] {
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
export function generateCleanSVG(paths: PathSegment[], canvas: CanvasConfig): string {
  const { width, height, unit } = canvas;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}${unit}"
     height="${height}${unit}"
     viewBox="0 0 ${width} ${height}">
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
