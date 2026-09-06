/**
 * A uniform-grid index over line segments for nearest-segment queries.
 *
 * Building costs one entry per grid cell a segment's bounding box
 * touches. A query walks rings of cells outward from the point and
 * stops as soon as the next ring's lower bound can't beat the best
 * distance found (or, for `within`, the radius asked about), so it
 * touches a handful of cells on average instead of every segment.
 * Distances are exact: the index only decides which segments to test.
 */

export interface Point {
  x: number;
  y: number;
}

export type Segment = readonly [Point, Point];

export interface SegmentIndex {
  /** How many segments were indexed. */
  readonly size: number;
  /** Exact distance from `p` to the nearest segment; Infinity with none. */
  distance(p: Point): number;
  /**
   * Whether some segment lies within `radius` of `p` (distance ≤
   * radius). Cheaper than `distance` when the answer is yes: the search
   * stops at the first segment that qualifies.
   */
  within(p: Point, radius: number): boolean;
}

/** Distance from a point to a line segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function createSegmentIndex(
  segments: readonly Segment[],
  cellSize: number,
): SegmentIndex {
  const n = segments.length;
  if (n === 0) {
    return { size: 0, distance: () => Infinity, within: () => false };
  }
  const cell = Math.max(cellSize, 1e-6);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [a, b] of segments) {
    minX = Math.min(minX, a.x, b.x);
    minY = Math.min(minY, a.y, b.y);
    maxX = Math.max(maxX, a.x, b.x);
    maxY = Math.max(maxY, a.y, b.y);
  }
  const cols = Math.floor((maxX - minX) / cell) + 1;
  const rows = Math.floor((maxY - minY) / cell) + 1;
  const col = (x: number) => Math.floor((x - minX) / cell);
  const row = (y: number) => Math.floor((y - minY) / cell);

  // Segment indices per cell, for every cell a segment's bounding box
  // touches. Sparse: most cells in a bristly shape's box are empty.
  const cells: (number[] | undefined)[] = new Array(cols * rows);
  for (let i = 0; i < n; i++) {
    const [a, b] = segments[i];
    const x0 = col(Math.min(a.x, b.x));
    const x1 = col(Math.max(a.x, b.x));
    const y0 = row(Math.min(a.y, b.y));
    const y1 = row(Math.max(a.y, b.y));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * cols + x;
        (cells[k] ??= []).push(i);
      }
    }
  }

  // Query state, kept at index level so a query allocates nothing. A
  // segment spanning several cells is measured once per query: each
  // query stamps the segments it has seen.
  const stamp = new Int32Array(n);
  let query = 0;
  let qp: Point = { x: 0, y: 0 };
  let best = Infinity;
  let enough = -1;

  /** Measure the segments in one cell; true once `best` is good enough. */
  function scan(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const list = cells[y * cols + x];
    if (!list) return false;
    for (const i of list) {
      if (stamp[i] === query) continue;
      stamp[i] = query;
      const [a, b] = segments[i];
      const d = distanceToSegment(qp, a, b);
      if (d < best) {
        best = d;
        if (best <= enough) return true;
      }
    }
    return false;
  }

  /**
   * Nearest distance from p, walking rings of cells outward. Stops
   * early once a distance at or under `stopAt` is found, or when the
   * next ring's lower bound can beat neither `best` nor `limit`.
   */
  function search(p: Point, stopAt: number, limit: number): number {
    query++;
    qp = p;
    best = Infinity;
    enough = stopAt;
    const cx = col(p.x);
    const cy = row(p.y);
    const maxRing = Math.max(cx, cols - 1 - cx, cy, rows - 1 - cy);

    ring: for (let r = 0; r <= maxRing; r++) {
      // Everything in ring r is more than (r - 1) cells away from p.
      if (r > 0 && (r - 1) * cell >= Math.min(best, limit)) break;
      if (r === 0) {
        if (scan(cx, cy)) break;
        continue;
      }
      for (let x = cx - r; x <= cx + r; x++) {
        if (scan(x, cy - r) || scan(x, cy + r)) break ring;
      }
      for (let y = cy - r + 1; y <= cy + r - 1; y++) {
        if (scan(cx - r, y) || scan(cx + r, y)) break ring;
      }
    }
    return best;
  }

  return {
    size: n,
    distance: (p) => search(p, -1, Infinity),
    // Nothing lies within a negative distance, and a swollen-stroke
    // caller asks exactly that for every sample when its swell is 0.
    within: (p, radius) => radius >= 0 && search(p, radius, radius) <= radius,
  };
}
