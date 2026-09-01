// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyBorderMask, reapplyBorderMask } from '../src/border-mask';
import { buildExportSvg } from '../src/export/svg-export';
import { canvasToPixels } from '../src/controls/schema';
import type { CanvasConfig } from '../src/controls/schema';
import {
  matApply,
  parsePathData,
  parseTransformAttribute,
  segPoints,
} from '../src/path-geometry';
import type { Bounds, Mat, Pt, Seg } from '../src/path-geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

const canvas: CanvasConfig = { width: 3, height: 3, unit: 'in' };
const px = canvasToPixels(canvas); // 288 × 288 at 96 dpi
const INSET = 24;
const B: Bounds = {
  minX: INSET,
  minY: INSET,
  maxX: px.width - INSET,
  maxY: px.height - INSET,
};

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${px.width} ${px.height}`);
  document.body.appendChild(svg);
  return svg;
}

function shape(
  tag: string,
  attrs: Record<string, string>,
  parent: Element,
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.appendChild(el);
  return el;
}

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

/** Assert every sampled ink point of a d attribute is inside bounds (after `m`). */
function expectDWithin(d: string, b: Bounds, m?: Mat, slack = 1e-3): void {
  const model = parsePathData(d);
  expect(model).not.toBeNull();
  for (const sp of model!) {
    for (const seg of sp.segs) {
      for (let k = 0; k <= 20; k++) {
        let p = sampleSeg(seg, k / 20);
        if (m) p = matApply(m, p);
        expect(p.x).toBeGreaterThanOrEqual(b.minX - slack);
        expect(p.x).toBeLessThanOrEqual(b.maxX + slack);
        expect(p.y).toBeGreaterThanOrEqual(b.minY - slack);
        expect(p.y).toBeLessThanOrEqual(b.maxY + slack);
      }
    }
  }
}

function expectSvgInkWithin(svg: SVGElement, b: Bounds): void {
  for (const path of Array.from(svg.querySelectorAll('path'))) {
    if (path.closest('[data-calibration], [data-border], defs')) continue;
    const g = path.closest('[transform]');
    const m = g
      ? parseTransformAttribute(g.getAttribute('transform'))!
      : undefined;
    expectDWithin(path.getAttribute('d') ?? '', b, m ?? undefined);
  }
  for (const poly of Array.from(svg.querySelectorAll('polyline, polygon'))) {
    if (poly.closest('[data-calibration], [data-border], defs')) continue;
    const nums = (poly.getAttribute('points') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(b.minX - 1e-3);
      expect(nums[i]).toBeLessThanOrEqual(b.maxX + 1e-3);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(b.minY - 1e-3);
      expect(nums[i + 1]).toBeLessThanOrEqual(b.maxY + 1e-3);
    }
  }
}

describe('applyBorderMask', () => {
  it('still clips plain polylines exactly (regression)', () => {
    const svg = makeSvg();
    shape(
      'polyline',
      { points: '100,100 400,100', fill: 'none', stroke: '#000' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    const polys = svg.querySelectorAll('polyline');
    expect(polys).toHaveLength(1);
    expect(polys[0].getAttribute('points')).toBe(`100,100 ${B.maxX},100`);
    expect(svg.getAttribute('data-border-mask')).toBe(
      `${B.minX} ${B.minY} ${B.maxX} ${B.maxY}`,
    );
  });

  it('clips an M/L path geometrically (was visual-clip before)', () => {
    const svg = makeSvg();
    shape('path', { d: 'M 100 100 L 400 100', fill: 'none' }, svg);
    applyBorderMask(svg, canvas, { inset: INSET });
    expect(svg.querySelector('[clip-path]')).toBeNull();
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('d')).toBe(`M 100 100 L ${B.maxX} 100`);
  });

  it('clips a crossing cubic and leaves no clip-path behind', () => {
    const svg = makeSvg();
    shape(
      'path',
      { d: 'M 100 100 C 200 100 300 200 400 200', fill: 'none' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    expect(svg.querySelector('[clip-path]')).toBeNull();
    expect(svg.querySelector('clipPath')).toBeNull();
    expectSvgInkWithin(svg, B);
    expect(svg.querySelector('path')!.getAttribute('d')).toContain('C');
  });

  it('leaves fully-inside paths untouched', () => {
    const svg = makeSvg();
    const d = 'M 100 100 C 120 120 140 140 160 100';
    shape('path', { d, fill: 'none', 'data-test': 'keep' }, svg);
    applyBorderMask(svg, canvas, { inset: INSET });
    expect(svg.querySelector('[data-test="keep"]')!.getAttribute('d')).toBe(d);
  });

  it('clips inside transformed groups and keeps local units', () => {
    const svg = makeSvg();
    const g = shape('g', { transform: 'translate(24 24) scale(2)' }, svg);
    shape(
      'path',
      { d: 'M 0 0 C 50 0 100 0 150 0', fill: 'none', 'stroke-width': '0.35' },
      g,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    const path = g.querySelector('path')!;
    expect(path.getAttribute('stroke-width')).toBe('0.35'); // local mm units survive
    expect(g.getAttribute('transform')).toBe('translate(24 24) scale(2)');
    expectSvgInkWithin(svg, B);
    // world end must sit on the border: local (240-24)/2 = 120
    const model = parsePathData(path.getAttribute('d')!)!;
    const lastSp = model[model.length - 1];
    const lastSeg = lastSp.segs[lastSp.segs.length - 1];
    const end = sampleSeg(lastSeg, 1);
    expect(24 + 2 * end.x).toBeCloseTo(B.maxX, 3);
  });

  it('converts a crossing circle to clipped cubics', () => {
    const svg = makeSvg();
    shape(
      'circle',
      { cx: String(B.maxX), cy: '144', r: '40', fill: 'none' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    expect(svg.querySelector('circle')).toBeNull();
    expectSvgInkWithin(svg, B);
  });

  it('boolean-clips filled shapes so the outline hugs the border', () => {
    const svg = makeSvg();
    shape(
      'rect',
      { x: '200', y: '200', width: '200', height: '200', fill: 'red' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('fill')).toBe('red');
    const d = path.getAttribute('d')!;
    expect(d.trim().endsWith('Z')).toBe(true);
    expectDWithin(d, B);
    // hugs the border corner at (264, 264)
    expect(d).toContain(`${B.maxX}`);
  });

  it('marks unclippable elements and visually clips them in preview', () => {
    const svg = makeSvg();
    shape(
      'path',
      { d: 'M 0 0 L 400 400', transform: 'rotate(', fill: 'none' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    expect(svg.querySelector('[data-border-mask-unclippable]')).not.toBeNull();
    expect(svg.querySelector('clipPath')).not.toBeNull();
  });

  it('exempts calibration marks and the border rect', () => {
    const svg = makeSvg();
    const cal = shape('g', { 'data-calibration': 'true' }, svg);
    shape('line', { x1: '2', y1: '2', x2: '10', y2: '2' }, cal);
    const rect = applyBorderMask(svg, canvas, {
      inset: INSET,
      drawBorder: true,
    });
    expect(rect).not.toBeNull();
    expect(cal.querySelector('line')!.getAttribute('x1')).toBe('2');
    const clone = svg.cloneNode(true) as SVGElement;
    reapplyBorderMask(clone);
    expect(
      clone.querySelector('[data-calibration] line')!.getAttribute('x1'),
    ).toBe('2');
    expect(clone.querySelector('[data-border]')).not.toBeNull();
  });
});

describe('reapplyBorderMask', () => {
  it('clips geometry that arrived after draw() returned', () => {
    const svg = makeSvg();
    applyBorderMask(svg, canvas, { inset: INSET });
    // Simulate async cursive lettering: transformed group appended late.
    const g = shape('g', { transform: 'translate(24 24) scale(2)' }, svg);
    shape('path', { d: 'M 0 0 C 50 0 100 0 150 0', fill: 'none' }, g);

    // Clone before the MutationObserver microtask runs: still unclipped.
    const clone = svg.cloneNode(true) as SVGElement;
    reapplyBorderMask(clone);
    expectSvgInkWithin(clone, B);
  });

  it('removes still-unclippable elements so they are never plotted', () => {
    const svg = makeSvg();
    shape(
      'path',
      { d: 'M 0 0 L 400 400', transform: 'rotate(', fill: 'none' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    const clone = svg.cloneNode(true) as SVGElement;
    reapplyBorderMask(clone);
    expect(clone.querySelector('[data-border-mask-unclippable]')).toBeNull();
    expect(clone.querySelector('path')).toBeNull();
    expect(clone.querySelector('clipPath')).toBeNull();
  });

  it('is idempotent', () => {
    const svg = makeSvg();
    shape(
      'path',
      { d: 'M 100 100 C 200 100 300 200 400 200', fill: 'none' },
      svg,
    );
    shape('polyline', { points: '100,100 400,100', fill: 'none' }, svg);
    applyBorderMask(svg, canvas, { inset: INSET });
    const clone = svg.cloneNode(true) as SVGElement;
    reapplyBorderMask(clone);
    const first = clone.outerHTML;
    reapplyBorderMask(clone);
    expect(clone.outerHTML).toBe(first);
  });

  it('is a no-op without a stamp (border mode off)', () => {
    const svg = makeSvg();
    shape('path', { d: 'M 0 0 L 400 400', fill: 'none' }, svg);
    const clone = svg.cloneNode(true) as SVGElement;
    reapplyBorderMask(clone);
    expect(clone.querySelector('path')!.getAttribute('d')).toBe(
      'M 0 0 L 400 400',
    );
  });
});

describe('MutationObserver preview clipping', () => {
  it('clips late-arriving geometry in the live preview', async () => {
    const svg = makeSvg();
    applyBorderMask(svg, canvas, { inset: INSET });
    const g = shape('g', { transform: 'translate(24 24) scale(2)' }, svg);
    shape('path', { d: 'M 0 0 C 50 0 100 0 150 0', fill: 'none' }, g);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expectSvgInkWithin(svg, B);
  });

  it('does not clip the border rect the mask itself draws', async () => {
    const svg = makeSvg();
    applyBorderMask(svg, canvas, { inset: INSET, drawBorder: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rect = svg.querySelector('[data-border]')!;
    expect(rect.getAttribute('x')).toBe(String(B.minX));
    expect(rect.getAttribute('width')).toBe(String(B.maxX - B.minX));
  });
});

describe('buildExportSvg', () => {
  it('optimized export contains only truly clipped ink and a px viewBox', () => {
    const svg = makeSvg();
    shape(
      'path',
      {
        d: 'M 100 100 C 200 100 300 200 400 200',
        fill: 'none',
        stroke: '#000',
      },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    // Late lettering, unclipped at export-click time:
    const g = shape('g', { transform: 'translate(24 24) scale(2)' }, svg);
    shape(
      'path',
      { d: 'M 0 0 C 50 0 100 0 150 0', fill: 'none', stroke: '#000' },
      g,
    );
    // A stale visual clipPath that must not be plotted:
    const defs = shape('defs', {}, svg);
    const clip = shape('clipPath', { id: 'border-mask-clip-99' }, defs);
    shape('rect', { x: '33.5', y: '33.5', width: '100', height: '100' }, clip);

    const out = buildExportSvg(svg, canvas, {
      optimize: true,
      reverseStrokes: true,
    });
    expect(out).toContain(`viewBox="0 0 ${px.width} ${px.height}"`);
    expect(out).not.toContain('clipPath');

    const ds = [...out.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(ds.length).toBeGreaterThanOrEqual(2);
    for (const d of ds) expectDWithin(d, B);
    // The clipPath rect must not appear as plotted ink:
    expect(ds.every((d) => !d.startsWith('M 33.5'))).toBe(true);
  });

  it('unoptimized export strips preview clip machinery and clips late ink', () => {
    const svg = makeSvg();
    // Unclippable element gets a visual clip at draw time…
    shape(
      'path',
      { d: 'M 0 0 L 400 400', transform: 'rotate(', fill: 'none' },
      svg,
    );
    applyBorderMask(svg, canvas, { inset: INSET });
    const g = shape('g', { transform: 'translate(24 24) scale(2)' }, svg);
    shape('path', { d: 'M 0 0 C 50 0 100 0 150 0', fill: 'none' }, g);

    const out = buildExportSvg(svg, canvas, {
      optimize: false,
      reverseStrokes: false,
    });
    expect(out).not.toContain('clip-path');
    expect(out).not.toContain('clipPath');
    expect(out).not.toContain('data-border-mask-unclippable');
    const ds = [...out.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(ds).toHaveLength(1); // broken path removed, lettering clipped
    const m = parseTransformAttribute('translate(24 24) scale(2)')!;
    expectDWithin(ds[0], B, m);
  });

  it('leaves everything alone when no mask was applied', () => {
    const svg = makeSvg();
    shape('path', { d: 'M 0 0 L 400 400', fill: 'none' }, svg);
    const out = buildExportSvg(svg, canvas, {
      optimize: false,
      reverseStrokes: false,
    });
    expect(out).toContain('M 0 0 L 400 400');
  });
});
