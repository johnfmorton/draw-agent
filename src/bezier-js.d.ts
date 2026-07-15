/**
 * Minimal type declarations for bezier-js v6 (ships no types; the
 * @types/bezier-js package targets the old v4 API). Covers the surface
 * used in generated artwork examples — extend as needed.
 */
declare module 'bezier-js' {
  export interface BezierPoint {
    x: number;
    y: number;
    z?: number;
    t?: number;
  }

  export class Bezier {
    constructor(points: BezierPoint[] | number[]);
    constructor(...coords: number[]);

    points: BezierPoint[];

    /** Point on the curve at t (0..1). */
    get(t: number): BezierPoint;
    /** Evenly-stepped lookup table of points along the curve. */
    getLUT(steps?: number): BezierPoint[];
    /** Approximate arc length. */
    length(): number;
    /** Split at t, or extract the segment t1..t2. */
    split(t: number): { left: Bezier; right: Bezier };
    split(t1: number, t2: number): Bezier;
    /** Parallel curve(s) at distance d (may subdivide). */
    offset(d: number): Bezier[];
    /** Offset point at t. */
    offset(t: number, d: number): BezierPoint;
    /** Derivative (tangent) at t. */
    derivative(t: number): BezierPoint;
    /** Unit normal at t. */
    normal(t: number): BezierPoint;
    /** Bounding box. */
    bbox(): {
      x: { min: number; max: number };
      y: { min: number; max: number };
    };
    /** Project a point onto the curve. */
    project(point: BezierPoint): BezierPoint;
    /** Reduce to simple segments. */
    reduce(): Bezier[];
    /** SVG path data for this curve. */
    toSVG(): string;
  }
}
