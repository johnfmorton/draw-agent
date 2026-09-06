import { describe, expect, it } from 'vitest';
import {
  createSegmentIndex,
  distanceToSegment,
  type Point,
  type Segment,
} from '../src/segment-index';
import { createRandom } from '../src/random';

/** Random segments in a 500 × 400 box: mostly tiny, a few long. */
function randomSegments(seed: number, count: number): Segment[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const a = { x: random() * 500, y: random() * 400 };
    const len = i % 10 === 0 ? 50 + random() * 200 : random() * 12;
    const angle = random() * Math.PI * 2;
    const b = {
      x: a.x + Math.cos(angle) * len,
      y: a.y + Math.sin(angle) * len,
    };
    return [a, b] as const;
  });
}

function bruteDistance(p: Point, segments: readonly Segment[]): number {
  let d = Infinity;
  for (const [a, b] of segments) d = Math.min(d, distanceToSegment(p, a, b));
  return d;
}

describe('createSegmentIndex', () => {
  const segments = randomSegments(1, 400);
  const random = createRandom(2);
  // Query points inside the box and well outside it
  const points: Point[] = Array.from({ length: 600 }, () => ({
    x: -200 + random() * 900,
    y: -200 + random() * 800,
  }));

  it('measures exactly what a scan of every segment measures', () => {
    for (const cellSize of [8, 24, 100]) {
      const index = createSegmentIndex(segments, cellSize);
      expect(index.size).toBe(400);
      for (const p of points) {
        expect(index.distance(p)).toBeCloseTo(bruteDistance(p, segments), 9);
      }
    }
  });

  it('answers within() consistently with distance()', () => {
    const index = createSegmentIndex(segments, 24);
    for (const p of points) {
      const d = bruteDistance(p, segments);
      for (const radius of [0.5, 5, 30, 150, 400]) {
        expect(index.within(p, radius)).toBe(d <= radius);
      }
    }
  });

  it('handles an empty index and zero-length segments', () => {
    const empty = createSegmentIndex([], 10);
    expect(empty.size).toBe(0);
    expect(empty.distance({ x: 1, y: 1 })).toBe(Infinity);
    expect(empty.within({ x: 1, y: 1 }, 1e9)).toBe(false);

    const dot: Segment = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    const index = createSegmentIndex([dot], 10);
    expect(index.distance({ x: 13, y: 14 })).toBeCloseTo(5, 9);
    expect(index.within({ x: 13, y: 14 }, 5)).toBe(true);
    expect(index.within({ x: 13, y: 14 }, 4.99)).toBe(false);
    expect(index.within({ x: 10, y: 10 }, 0)).toBe(true);
    expect(index.within({ x: 10, y: 10 }, -1)).toBe(false);
  });
});
