/**
 * Type declarations for @johnfmorton/generative-utils
 *
 * This library provides utility functions for generative art.
 * These declarations enable TypeScript support.
 */
declare module '@johnfmorton/generative-utils' {
  /**
   * Seed the pseudo-random number generator.
   * Must be called before using random() to ensure reproducibility.
   * @param seed - String or number seed value
   */
  export function seedPRNG(seed: string | number): void;

  /**
   * Generate a random number between min and max, or pick a random element from an array.
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (exclusive unless clamp is true)
   * @param clamp - If true, rounds to integer
   */
  export function random(min: number, max: number, clamp?: boolean): number;

  /**
   * Pick a random element from an array.
   * @param array - Array to pick from
   */
  export function random<T>(array: T[]): T;

  /**
   * Generate a biased random number.
   * @param min - Minimum value
   * @param max - Maximum value
   * @param bias - Value to bias toward (0-1 range within min-max)
   * @param influence - How strongly to bias (0-1)
   */
  export function randomBias(min: number, max: number, bias: number, influence: number): number;

  /**
   * Generate a random number snapped to intervals.
   * @param min - Minimum value
   * @param max - Maximum value
   * @param snap - Interval to snap to
   */
  export function randomSnap(min: number, max: number, snap: number): number;

  /**
   * Create a smooth SVG path string from an array of points using Catmull-Rom interpolation.
   * @param points - Array of {x, y} points
   * @param tension - Curve tension (0.5 is default, higher = tighter curves)
   * @param close - Whether to close the path
   * @param callback - Optional callback for each path command
   */
  export function spline(
    points: Array<{ x: number; y: number }>,
    tension?: number,
    close?: boolean,
    callback?: (command: 'MOVE' | 'LINE', coords: [number, number]) => void
  ): string;

  /**
   * Map a value from one range to another (like Processing's map function).
   * @param n - Value to map
   * @param start1 - Start of input range
   * @param end1 - End of input range
   * @param start2 - Start of output range
   * @param end2 - End of output range
   */
  export function map(n: number, start1: number, end1: number, start2: number, end2: number): number;

  /**
   * Extract evenly-spaced points along an SVG path element.
   * @param path - SVG path element
   * @param numPoints - Number of points to extract
   */
  export function pointsInPath(
    path: SVGPathElement,
    numPoints: number
  ): Array<{ x: number; y: number }>;

  /**
   * Create a coordinate transformer for converting mouse coords to SVG space.
   * @param svg - SVG element
   */
  export function createCoordsTransformer(
    svg: SVGSVGElement
  ): (clientX: number, clientY: number) => { x: number; y: number };

  interface QtGridCell {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  /**
   * Create a quadtree-based adaptive grid.
   * @param options - Grid options
   */
  export function createQtGrid(options: {
    width: number;
    height: number;
    points: Array<{ x: number; y: number }>;
    maxDepth?: number;
  }): { cells: QtGridCell[] };

  /**
   * Calculate distance from a point to a line segment.
   * @param point - The point
   * @param v - Start of segment
   * @param w - End of segment
   */
  export function distToSegment(
    point: { x: number; y: number },
    v: { x: number; y: number },
    w: { x: number; y: number }
  ): number;

  interface VoronoiCell {
    centroid: { x: number; y: number };
    innerCircleRadius: number;
    polygon: Array<[number, number]>;
    neighbors: number[];
  }

  /**
   * Create a Voronoi diagram with optional Lloyd relaxation.
   * @param options - Diagram options
   */
  export function createVoronoiDiagram(options: {
    width: number;
    height: number;
    points: Array<{ x: number; y: number }>;
    relaxIterations?: number;
  }): { cells: VoronoiCell[] };

  /**
   * Alias for createVoronoiDiagram.
   */
  export const createVoronoiTessellation: typeof createVoronoiDiagram;

  interface NoiseGridCell {
    x: number;
    y: number;
    width: number;
    height: number;
    noiseValue: number;
  }

  /**
   * Create a grid of simplex noise values with a lookup function.
   * @param options - Grid options
   */
  export function createNoiseGrid(options?: {
    width?: number;
    height?: number;
    resolution?: number;
    xInc?: number;
    yInc?: number;
    seed?: number;
  }): {
    cells: NoiseGridCell[];
    lookup: (pos: { x: number; y: number }) => NoiseGridCell;
  };
}
