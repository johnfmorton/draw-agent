import { describe, expect, it } from 'vitest';
import {
  arcToCubics,
  clipChain,
  clipRingsToRect,
  clipSegmentLB,
  clipSubPathsToRect,
  ellipseToSubPath,
  matApply,
  matInvert,
  matIsIdentity,
  parsePathData,
  parseTransformAttribute,
  reverseSubPaths,
  segEnd,
  segPoints,
  segStart,
  serializePathData,
  transformSubPaths,
} from '../src/path-geometry';
import type { Bounds, Pt, Seg } from '../src/path-geometry';

/** De Casteljau — independent of the code under test. */
function sampleSeg(seg: Seg, t: number): Pt {
  let arr = segPoints(seg).map((p) => ({ x: p.x, y: p.y }));
  while (arr.length > 1) {
    const next: Pt[] = [];
    for (let i = 0; i + 1 < arr.length; i++) {
      next.push({
        x: arr[i].x + (arr[i + 1].x - arr[i].x) * t,
        y: arr[i].y + (arr[i + 1].y - arr[i].y) * t,
      });
    }
    arr = next;
  }
  return arr[0];
}

const B: Bounds = { minX: 10, minY: 10, maxX: 90, maxY: 90 };

function expectInkWithin(
  subpaths: ReturnType<typeof clipSubPathsToRect>,
  b: Bounds,
  slack = 1e-3,
): void {
  for (const sp of subpaths) {
    for (const seg of sp.segs) {
      for (let k = 0; k <= 20; k++) {
        const p = sampleSeg(seg, k / 20);
        expect(p.x).toBeGreaterThanOrEqual(b.minX - slack);
        expect(p.x).toBeLessThanOrEqual(b.maxX + slack);
        expect(p.y).toBeGreaterThanOrEqual(b.minY - slack);
        expect(p.y).toBeLessThanOrEqual(b.maxY + slack);
      }
    }
  }
}

describe('parsePathData', () => {
  it('parses absolute M/L', () => {
    const sp = parsePathData('M 10 20 L 30 40')!;
    expect(sp).toEqual([
      {
        segs: [{ kind: 'L', p0: { x: 10, y: 20 }, p1: { x: 30, y: 40 } }],
        closed: false,
      },
    ]);
  });

  it('parses relative commands and H/V', () => {
    const sp = parsePathData('m 10 20 l 5 5 h 5 v -10')!;
    expect(sp[0].segs).toEqual([
      { kind: 'L', p0: { x: 10, y: 20 }, p1: { x: 15, y: 25 } },
      { kind: 'L', p0: { x: 15, y: 25 }, p1: { x: 20, y: 25 } },
      { kind: 'L', p0: { x: 20, y: 25 }, p1: { x: 20, y: 15 } },
    ]);
  });

  it('treats extra M coordinate pairs as implicit linetos', () => {
    const sp = parsePathData('M 0 0 10 0 20 5')!;
    expect(sp[0].segs).toHaveLength(2);
    expect(sp[0].segs[1]).toEqual({
      kind: 'L',
      p0: { x: 10, y: 0 },
      p1: { x: 20, y: 5 },
    });
  });

  it('resolves S reflection against the previous cubic', () => {
    const sp = parsePathData('M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0')!;
    const s = sp[0].segs[1];
    expect(s.kind).toBe('C');
    if (s.kind === 'C') {
      expect(s.p1).toEqual({ x: 10, y: -10 });
      expect(s.p2).toEqual({ x: 20, y: -10 });
      expect(s.p3).toEqual({ x: 20, y: 0 });
    }
  });

  it('S without a preceding cubic uses the current point as control', () => {
    const sp = parsePathData('M 0 0 S 10 10 20 0')!;
    const s = sp[0].segs[0];
    if (s.kind === 'C') expect(s.p1).toEqual({ x: 0, y: 0 });
    else expect.fail('expected cubic');
  });

  it('resolves T reflection against the previous quadratic', () => {
    const sp = parsePathData('M 0 0 Q 5 10 10 0 T 20 0')!;
    const t = sp[0].segs[1];
    if (t.kind === 'Q') expect(t.p1).toEqual({ x: 15, y: -10 });
    else expect.fail('expected quadratic');
  });

  it('parses packed arc flags identically to spaced ones', () => {
    const packed = parsePathData('M 0 0 A 10 10 0 0120 0')!;
    const spaced = parsePathData('M 0 0 A 10 10 0 0 1 20 0')!;
    expect(serializePathData(packed)).toBe(serializePathData(spaced));
  });

  it('parses packed negatives, decimals, and exponents', () => {
    expect(serializePathData(parsePathData('M 10 10 L 20-5')!)).toBe(
      'M 10 10 L 20 -5',
    );
    expect(serializePathData(parsePathData('M 1.5.5 L 2 2')!)).toBe(
      'M 1.5 0.5 L 2 2',
    );
    expect(serializePathData(parsePathData('M 1e1 2E-1 L 0 0')!)).toBe(
      'M 10 0.2 L 0 0',
    );
  });

  it('materializes the closing edge on Z and round-trips it', () => {
    const sp = parsePathData('M 0 0 L 10 0 L 10 10 Z')!;
    expect(sp[0].closed).toBe(true);
    expect(sp[0].segs).toHaveLength(3);
    expect(sp[0].segs[2]).toEqual({
      kind: 'L',
      p0: { x: 10, y: 10 },
      p1: { x: 0, y: 0 },
    });
    expect(serializePathData(sp)).toBe('M 0 0 L 10 0 L 10 10 Z');
  });

  it('handles multiple subpaths', () => {
    const sp = parsePathData('M 0 0 L 5 5 M 10 10 L 15 15')!;
    expect(sp).toHaveLength(2);
  });

  it('degrades zero-radius arcs to lines', () => {
    const sp = parsePathData('M 0 0 A 0 5 0 0 1 10 10')!;
    expect(sp[0].segs).toEqual([
      { kind: 'L', p0: { x: 0, y: 0 }, p1: { x: 10, y: 10 } },
    ]);
  });

  it('returns null on malformed input', () => {
    expect(parsePathData('M 10 20 X 5')).toBeNull();
    expect(parsePathData('10 20')).toBeNull();
    expect(parsePathData('M 10')).toBeNull();
  });
});

describe('arcToCubics', () => {
  it('approximates a semicircle within tolerance', () => {
    const segs = arcToCubics({ x: -10, y: 0 }, 10, 10, 0, false, true, {
      x: 10,
      y: 0,
    });
    expect(segs).toHaveLength(2);
    for (const seg of segs) {
      for (let k = 0; k <= 10; k++) {
        const p = sampleSeg(seg, k / 10);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 2);
      }
    }
    expect(segEnd(segs[segs.length - 1])).toEqual({ x: 10, y: 0 });
  });

  it('respects large-arc and sweep flags', () => {
    for (const largeArc of [false, true]) {
      for (const sweep of [false, true]) {
        const segs = arcToCubics({ x: 10, y: 0 }, 10, 10, 0, largeArc, sweep, {
          x: 0,
          y: 10,
        });
        expect(segs).toHaveLength(largeArc ? 3 : 1);
        const end = segEnd(segs[segs.length - 1]);
        expect(end.x).toBeCloseTo(0, 6);
        expect(end.y).toBeCloseTo(10, 6);
        const centers = [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ];
        const probe = sampleSeg(segs[0], 0.5);
        const center = centers.find(
          (c) => Math.abs(Math.hypot(probe.x - c.x, probe.y - c.y) - 10) < 0.01,
        );
        expect(center).toBeTruthy();
        for (const seg of segs) {
          for (let k = 0; k <= 10; k++) {
            const p = sampleSeg(seg, k / 10);
            expect(Math.hypot(p.x - center!.x, p.y - center!.y)).toBeCloseTo(
              10,
              2,
            );
          }
        }
      }
    }
  });

  it('scales out-of-range radii up', () => {
    // r=1 cannot span endpoints 10 apart; the spec scales radii to fit.
    const segs = arcToCubics({ x: 0, y: 0 }, 1, 1, 0, false, true, {
      x: 10,
      y: 0,
    });
    expect(segEnd(segs[segs.length - 1])).toEqual({ x: 10, y: 0 });
    const mid = sampleSeg(
      segs[Math.floor(segs.length / 2)],
      segs.length % 2 === 0 ? 0 : 0.5,
    );
    expect(Math.abs(mid.y)).toBeGreaterThan(1); // actually bulges
  });
});

describe('transforms', () => {
  it('parses and composes transform functions', () => {
    const m = parseTransformAttribute('translate(10,20) scale(2)')!;
    expect(matApply(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 22 });
  });

  it('rotate about a center keeps the center fixed', () => {
    const m = parseTransformAttribute('rotate(90 5 5)')!;
    const c = matApply(m, { x: 5, y: 5 });
    expect(c.x).toBeCloseTo(5, 9);
    expect(c.y).toBeCloseTo(5, 9);
    const p = matApply(m, { x: 6, y: 5 });
    expect(p.x).toBeCloseTo(5, 9);
    expect(p.y).toBeCloseTo(6, 9);
  });

  it('returns identity for empty and null for garbage', () => {
    expect(matIsIdentity(parseTransformAttribute('')!)).toBe(true);
    expect(matIsIdentity(parseTransformAttribute(null)!)).toBe(true);
    expect(parseTransformAttribute('rotate(abc)')).toBeNull();
    expect(parseTransformAttribute('frobnicate(1)')).toBeNull();
    expect(parseTransformAttribute('rotate(45) garbage')).toBeNull();
    expect(parseTransformAttribute('rotate(')).toBeNull();
  });

  it('inverts round-trip', () => {
    const m = parseTransformAttribute(
      'translate(3 -7) rotate(30) scale(2 0.5)',
    )!;
    const inv = matInvert(m)!;
    const p = matApply(inv, matApply(m, { x: 13, y: -4 }));
    expect(p.x).toBeCloseTo(13, 9);
    expect(p.y).toBeCloseTo(-4, 9);
    expect(matInvert({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 2 })).toBeNull();
  });

  it('maps bezier control points exactly', () => {
    const model = parsePathData('M 0 0 C 10 0 20 10 30 10')!;
    const m = parseTransformAttribute('rotate(45) scale(2)')!;
    const world = transformSubPaths(model, m);
    const seg = world[0].segs[0];
    const orig = model[0].segs[0];
    for (const [a, b] of segPoints(seg).map(
      (p, i) => [p, matApply(m, segPoints(orig)[i])] as const,
    )) {
      expect(a.x).toBeCloseTo(b.x, 12);
      expect(a.y).toBeCloseTo(b.y, 12);
    }
  });
});

describe('line clipping', () => {
  it('clips a crossing segment', () => {
    expect(clipSegmentLB(50, 50, 150, 50, B)).toEqual([50, 50, 90, 50]);
  });

  it('keeps collinear-on-edge segments', () => {
    expect(clipSegmentLB(20, 90, 80, 90, B)).toEqual([20, 90, 80, 90]);
  });

  it('rejects fully outside segments', () => {
    expect(clipSegmentLB(95, 20, 95, 80, B)).toBeNull();
  });

  it('splits an exit/re-enter chain into runs and drops corner grazes', () => {
    const runs = clipChain(
      [
        { x: 20, y: 50 },
        { x: 120, y: 50 },
        { x: 120, y: 80 },
        { x: 20, y: 80 },
      ],
      B,
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([
      { x: 20, y: 50 },
      { x: 90, y: 50 },
    ]);
    expect(runs[1]).toEqual([
      { x: 90, y: 80 },
      { x: 20, y: 80 },
    ]);

    // Diagonal through the exact corner: zero-length sliver is dropped.
    expect(
      clipChain(
        [
          { x: 5, y: 15 },
          { x: 15, y: 5 },
        ],
        B,
      ),
    ).toEqual([]);
  });
});

describe('clipSubPathsToRect', () => {
  it('clips a crossing line subpath', () => {
    const model = parsePathData('M 50 50 L 150 50')!;
    expect(clipSubPathsToRect(model, B)).toEqual([
      {
        segs: [{ kind: 'L', p0: { x: 50, y: 50 }, p1: { x: 90, y: 50 } }],
        closed: false,
      },
    ]);
  });

  it('splits a crossing cubic exactly at the border', () => {
    const model = parsePathData('M 50 50 C 80 50 120 50 150 50')!;
    const clipped = clipSubPathsToRect(model, B);
    expect(clipped).toHaveLength(1);
    const last = clipped[0].segs[clipped[0].segs.length - 1];
    const end = segEnd(last);
    expect(end.x).toBeCloseTo(90, 4);
    expect(end.y).toBeCloseTo(50, 4);
    expect(segStart(clipped[0].segs[0])).toEqual({ x: 50, y: 50 });
    expectInkWithin(clipped, B);
  });

  it('keeps a curve with outside control points but inside bbox verbatim', () => {
    const model = parsePathData('M 20 50 C 40 100 60 100 80 50')!;
    // max y = 50 + 0.75 * 50 = 87.5 < 90, control points at y=100
    const clipped = clipSubPathsToRect(model, B);
    expect(clipped).toHaveLength(1);
    expect(clipped[0]).toBe(model[0]); // reference identity: untouched
  });

  it('keeps a curve tangent to the border from inside', () => {
    const model = parsePathData('M 20 50 Q 50 130 80 50')!; // apex exactly y=90
    const clipped = clipSubPathsToRect(model, B);
    expect(clipped[0]).toBe(model[0]);
  });

  it('drops fully outside geometry', () => {
    expect(
      clipSubPathsToRect(
        parsePathData('M 100 100 C 120 120 140 140 160 100')!,
        B,
      ),
    ).toEqual([]);
    expect(clipSubPathsToRect(parsePathData('M 20 95 L 80 95')!, B)).toEqual(
      [],
    );
  });

  it('clips through a corner', () => {
    const clipped = clipSubPathsToRect(parsePathData('M 50 50 L 150 150')!, B);
    expect(clipped).toEqual([
      {
        segs: [{ kind: 'L', p0: { x: 50, y: 50 }, p1: { x: 90, y: 90 } }],
        closed: false,
      },
    ]);
  });

  it('merges the seam of a clipped closed subpath (no needless pen lift)', () => {
    const model = parsePathData('M 20 20 L 120 20 L 120 80 L 20 80 Z')!;
    const clipped = clipSubPathsToRect(model, B);
    expect(clipped).toHaveLength(1);
    const segs = clipped[0].segs;
    expect(segStart(segs[0])).toEqual({ x: 90, y: 80 });
    expect(segEnd(segs[segs.length - 1])).toEqual({ x: 90, y: 20 });
    expect(clipped[0].closed).toBe(false);
  });

  it('handles a curve dipping out and back (two runs)', () => {
    // Cubic from inside, out past maxX, back inside.
    const model = parsePathData('M 60 30 C 130 30 130 70 60 70')!;
    const clipped = clipSubPathsToRect(model, B);
    expect(clipped.length).toBeGreaterThanOrEqual(2);
    expectInkWithin(clipped, B);
  });

  it('is idempotent on every fixture', () => {
    const fixtures = [
      'M 50 50 L 150 50',
      'M 50 50 C 80 50 120 50 150 50',
      'M 20 20 L 120 20 L 120 80 L 20 80 Z',
      'M 60 30 C 130 30 130 70 60 70',
      'M 20 50 C 40 100 60 100 80 50',
      'M 5 5 L 50 50 L 95 5 M 50 50 L 50 150',
      'M 0 0 A 60 60 0 0 1 60 60',
    ];
    for (const d of fixtures) {
      const once = clipSubPathsToRect(parsePathData(d)!, B);
      const twice = clipSubPathsToRect(once, B);
      expect(twice.length).toBe(once.length);
      for (let i = 0; i < once.length; i++) {
        expect(twice[i]).toBe(once[i]); // untouched by the second pass
      }
      expectInkWithin(once, B);
    }
  });
});

describe('filled clipping', () => {
  it('intersects a straddling square into a border-hugging quad', () => {
    const polys = clipRingsToRect(
      [
        [
          { x: 50, y: 50 },
          { x: 150, y: 50 },
          { x: 150, y: 150 },
          { x: 50, y: 150 },
        ],
      ],
      B,
    )!;
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(1);
    const ring = polys[0][0].slice();
    if (
      ring.length > 1 &&
      ring[0].x === ring[ring.length - 1].x &&
      ring[0].y === ring[ring.length - 1].y
    ) {
      ring.pop();
    }
    const sorted = ring.map((p) => `${p.x},${p.y}`).sort();
    expect(sorted).toEqual(['50,50', '50,90', '90,50', '90,90']);
  });

  it('drops a ring fully outside', () => {
    expect(
      clipRingsToRect(
        [
          [
            { x: 100, y: 100 },
            { x: 120, y: 100 },
            { x: 120, y: 120 },
          ],
        ],
        B,
      ),
    ).toEqual([]);
  });
});

describe('serialization and reversal', () => {
  it('reverses subpaths and segments', () => {
    const model = parsePathData('M 0 0 C 1 1 2 2 3 3 L 5 3')!;
    expect(serializePathData(reverseSubPaths(model))).toBe(
      'M 5 3 L 3 3 C 2 2 1 1 0 0',
    );
  });

  it('rounds to the requested precision', () => {
    const out = serializePathData([
      {
        segs: [
          { kind: 'L', p0: { x: 1.23456, y: 0 }, p1: { x: 2, y: 3.999999 } },
        ],
        closed: false,
      },
    ]);
    expect(out).toBe('M 1.235 0 L 2 4');
  });

  it('keeps ellipse subpaths closed through a round trip', () => {
    const sub = ellipseToSubPath(50, 50, 20, 10);
    const out = serializePathData([sub]);
    expect(out.endsWith('Z')).toBe(true);
    const back = parsePathData(out)!;
    expect(back[0].closed).toBe(true);
  });
});
