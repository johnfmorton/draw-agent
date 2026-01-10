/**
 * Type declarations for @johnfmorton/generative-utils v1.2.0
 *
 * This library provides utility functions for generative art.
 * These declarations enable TypeScript support.
 */
declare module '@johnfmorton/generative-utils' {
  // Common types
  export interface Vec2 {
    x: number;
    y: number;
  }

  // ==================== Random Number Generation ====================

  /**
   * Seed the pseudo-random number generator.
   * Must be called before using random() to ensure reproducibility.
   * @param seed - String or number seed value
   */
  export function seedPRNG(seed: string | number): void;

  /**
   * Generate a random number between min and max.
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (exclusive)
   * @param toInteger - If true, rounds to integer
   */
  export function random(min: number, max: number, toInteger?: boolean): number;

  /**
   * Pick a random element from an array.
   * @param array - Array to pick from
   */
  export function random<T>(array: readonly T[]): T;

  /**
   * Generate a biased random number weighted toward a bias point.
   * @param min - Minimum value
   * @param max - Maximum value
   * @param bias - Value to bias toward
   * @param influence - How strongly to bias (0-1, default 0.5)
   */
  export function randomBias(min: number, max: number, bias: number, influence?: number): number;

  /**
   * Generate a random number snapped to intervals.
   * @param min - Minimum value
   * @param max - Maximum value
   * @param snapInc - Interval to snap to
   */
  export function randomSnap(min: number, max: number, snapInc: number): number;

  // ==================== Value Mapping & Interpolation ====================

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
   * Linear interpolation between two numbers.
   * @param a - Start value (returned when t=0)
   * @param b - End value (returned when t=1)
   * @param t - Interpolation factor (0-1)
   */
  export function lerp(a: number, b: number, t: number): number;

  /**
   * Constrain a value within a range.
   * @param value - Value to clamp
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   */
  export function clamp(value: number, min: number, max: number): number;

  // ==================== Curves and Paths ====================

  /**
   * Create a smooth SVG path string from points using Catmull-Rom interpolation.
   * @param points - Array of {x, y} points
   * @param tension - Curve tension (0.5 is default)
   * @param close - Whether to close the path
   * @param cb - Optional callback for each path command
   * @param segmentCount - Smoothness (higher = smoother, default 20)
   */
  export function spline(
    points: Vec2[],
    tension?: number,
    close?: boolean,
    cb?: (command: 'MOVE' | 'LINE', coords: [number, number]) => void,
    segmentCount?: number
  ): string;

  /**
   * Extract evenly-spaced points along an SVG path element.
   * @param path - SVG path element
   * @param numPoints - Number of points to extract (default 10)
   */
  export function pointsInPath(path: SVGPathElement, numPoints?: number): Vec2[];

  /**
   * Convert an array of points to an SVG path string.
   * @param points - Array of {x, y} points
   * @param close - Whether to close the path (default true)
   */
  export function pointsToPath(points: Vec2[], close?: boolean): string;

  // ==================== Geometric Shapes ====================

  export interface PolygonOptions {
    /** Number of sides (3 = triangle, 4 = square, etc.) */
    sides: number;
    /** Distance from center to vertices */
    radius: number;
    /** Center x coordinate (default 0) */
    cx?: number;
    /** Center y coordinate (default 0) */
    cy?: number;
    /** Rotation angle in radians (default 0) */
    rotation?: number;
  }

  /**
   * Generate regular polygon vertices.
   */
  export function polygon(options: PolygonOptions): Vec2[];

  export interface StarOptions {
    /** Number of points on the star */
    points: number;
    /** Distance from center to outer points */
    outerRadius: number;
    /** Distance from center to inner points */
    innerRadius: number;
    /** Center x coordinate (default 0) */
    cx?: number;
    /** Center y coordinate (default 0) */
    cy?: number;
    /** Rotation angle in radians (default 0) */
    rotation?: number;
  }

  /**
   * Generate star polygon vertices.
   */
  export function star(options: StarOptions): Vec2[];

  // ==================== Spatial Sampling ====================

  export interface PoissonDiscOptions {
    /** Width of the sampling area */
    width: number;
    /** Height of the sampling area */
    height: number;
    /** Minimum distance between points */
    radius: number;
    /** Attempts to place each new point (default 30) */
    maxAttempts?: number;
  }

  /**
   * Generate evenly-distributed points using Poisson disc sampling.
   */
  export function poissonDisc(options: PoissonDiscOptions): Vec2[];

  // ==================== Distance Calculations ====================

  /**
   * Calculate distance from a point to a line segment.
   * @param p - The point as [x, y]
   * @param v - Start of segment as [x, y]
   * @param w - End of segment as [x, y]
   */
  export function distToSegment(
    p: [number, number],
    v: [number, number],
    w: [number, number]
  ): number;

  /**
   * Calculate squared distance from a point to a line segment (faster for comparisons).
   */
  export function distToSegmentSquared(
    p: [number, number],
    v: [number, number],
    w: [number, number]
  ): number;

  // ==================== Noise Grid ====================

  export interface NoiseCell {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Noise value from -1 to 1 */
    noiseValue: number;
  }

  export interface NoiseGridOptions {
    /** Grid width (default 200) */
    width?: number;
    /** Grid height (default 200) */
    height?: number;
    /** Cell resolution (default 8) */
    resolution?: number;
    /** Noise x increment (default 0.01) */
    xInc?: number;
    /** Noise y increment (default 0.01) */
    yInc?: number;
    /** Random seed */
    seed?: number;
  }

  export interface NoiseGridResult {
    cells: NoiseCell[];
    lookup: (pos: Vec2) => NoiseCell;
  }

  /**
   * Create a grid of simplex noise values for flow fields and textures.
   */
  export function createNoiseGrid(options?: NoiseGridOptions): NoiseGridResult;

  // ==================== Quadtree Grid ====================

  export interface QtGridArea {
    x: number;
    y: number;
    width: number;
    height: number;
    col: { start: number; end: number };
    row: { start: number; end: number };
  }

  export interface QtGridOptions {
    /** Grid width (default 1024) */
    width?: number;
    /** Grid height (default 1024) */
    height?: number;
    /** Points that drive subdivision */
    points?: Vec2[];
    /** Gap between cells (default 0) */
    gap?: number;
    /** Max points per cell before subdividing (default 10) */
    maxQtObjects?: number;
    /** Maximum subdivision depth (default 4) */
    maxQtLevels?: number;
  }

  export interface QtGridResult {
    width: number;
    height: number;
    cols: number;
    rows: number;
    areas: QtGridArea[];
  }

  /**
   * Create an adaptive grid using quadtree subdivision based on point density.
   */
  export function createQtGrid(options?: QtGridOptions): QtGridResult;

  // ==================== Voronoi Diagram ====================

  export interface VoronoiCell {
    /** Polygon vertices as [x, y] pairs */
    points: [number, number][];
    /** Radius of largest circle that fits inside the cell */
    innerCircleRadius: number;
    /** Center of the cell */
    centroid: Vec2;
    /** Adjacent cells */
    neighbors: VoronoiCell[];
  }

  export interface VoronoiOptions {
    /** Diagram width (default 1024) */
    width?: number;
    /** Diagram height (default 1024) */
    height?: number;
    /** Seed points for cells */
    points?: Vec2[];
    /** Lloyd relaxation iterations (default 8) */
    relaxIterations?: number;
    /** How far to move toward centroid each iteration (0-1, default 0.5) */
    relaxationFactor?: number;
  }

  export interface VoronoiResult {
    cells: VoronoiCell[];
    points: Vec2[];
  }

  /**
   * Create a Voronoi tessellation with Lloyd's relaxation for uniform cells.
   */
  export function createVoronoiDiagram(options?: VoronoiOptions): VoronoiResult;

  /** Alias for createVoronoiDiagram */
  export const createVoronoiTessellation: typeof createVoronoiDiagram;

  // ==================== Interactive Utilities ====================

  /**
   * Create a coordinate transformer for converting mouse coords to SVG space.
   * @param svg - SVG element
   * @returns Function that transforms MouseEvent to SVG coordinates
   */
  export function createCoordsTransformer(
    svg: SVGSVGElement
  ): (event: MouseEvent) => Vec2;

  // ==================== 2D Vector Operations ====================

  /** Create a new 2D vector */
  export function create(x?: number, y?: number): Vec2;

  /** Add two vectors */
  export function add(a: Vec2, b: Vec2): Vec2;

  /** Subtract vector b from vector a */
  export function subtract(a: Vec2, b: Vec2): Vec2;

  /** Multiply a vector by a scalar */
  export function multiply(v: Vec2, s: number): Vec2;

  /** Divide a vector by a scalar */
  export function divide(v: Vec2, s: number): Vec2;

  /** Calculate the magnitude (length) of a vector */
  export function magnitude(v: Vec2): number;

  /** Calculate the squared magnitude (avoids sqrt) */
  export function magnitudeSquared(v: Vec2): number;

  /** Normalize a vector to unit length */
  export function normalize(v: Vec2): Vec2;

  /** Calculate the distance between two points */
  export function distance(a: Vec2, b: Vec2): number;

  /** Calculate the squared distance (avoids sqrt) */
  export function distanceSquared(a: Vec2, b: Vec2): number;

  /** Calculate the dot product of two vectors */
  export function dot(a: Vec2, b: Vec2): number;

  /** Calculate the cross product z-component (2D) */
  export function cross(a: Vec2, b: Vec2): number;

  /** Rotate a vector by an angle (in radians) */
  export function rotate(v: Vec2, angle: number): Vec2;

  /** Rotate a vector around a pivot point */
  export function rotateAround(v: Vec2, pivot: Vec2, angle: number): Vec2;

  /** Linear interpolation between two vectors */
  export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2;

  /** Get the angle of a vector (in radians, from positive x-axis) */
  export function angle(v: Vec2): number;

  /** Calculate the angle between two vectors (0 to PI) */
  export function angleBetween(a: Vec2, b: Vec2): number;

  /** Create a vector from an angle and magnitude */
  export function fromAngle(angle: number, mag?: number): Vec2;

  /** Get the perpendicular vector (90° counter-clockwise) */
  export function perpendicular(v: Vec2): Vec2;

  /** Reflect a vector off a surface with given normal */
  export function reflect(v: Vec2, normal: Vec2): Vec2;

  /** Limit a vector's magnitude to a maximum value */
  export function limit(v: Vec2, max: number): Vec2;

  /** Set a vector's magnitude to a specific value */
  export function setMagnitude(v: Vec2, mag: number): Vec2;

  /** vec2 namespace containing all vector operations */
  export const vec2: {
    create: typeof create;
    add: typeof add;
    subtract: typeof subtract;
    multiply: typeof multiply;
    divide: typeof divide;
    magnitude: typeof magnitude;
    magnitudeSquared: typeof magnitudeSquared;
    normalize: typeof normalize;
    distance: typeof distance;
    distanceSquared: typeof distanceSquared;
    dot: typeof dot;
    cross: typeof cross;
    rotate: typeof rotate;
    rotateAround: typeof rotateAround;
    lerp: typeof vecLerp;
    angle: typeof angle;
    angleBetween: typeof angleBetween;
    fromAngle: typeof fromAngle;
    perpendicular: typeof perpendicular;
    reflect: typeof reflect;
    limit: typeof limit;
    setMagnitude: typeof setMagnitude;
  };
}
