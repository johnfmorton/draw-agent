/**
 * Pure path geometry for border-mask clipping and export transforms.
 *
 * No DOM APIs — everything here parses strings and crunches numbers, so
 * it runs on detached SVG clones and under plain node (vitest). The SVG
 * path model is normalized hard: every command becomes absolute L/Q/C
 * (H/V → L, S/T resolved by control-point reflection, arcs → cubics),
 * so downstream consumers (clipping, affine transforms, serialization)
 * only ever deal with three segment kinds.
 *
 * Conventions:
 * - On the mask border counts as inside (inclusive, EPSILON tolerance).
 * - Affine transforms map bezier control points exactly; flattening is
 *   only used for filled-shape boolean clipping, never for strokes.
 * - Clipping is exact: lines via Liang–Barsky, curves by splitting at
 *   the intersection t-values with the mask edges (closed-form roots
 *   for orders ≤ 3 via bezier-js), keeping spans whose midpoint is
 *   inside. Segments that survive whole are kept verbatim.
 */

import { Bezier } from 'bezier-js';
// polygon-clipping ships as CommonJS: use the default import (the
// named bindings in its .d.ts don't exist at runtime under Vite).
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon, Pair } from 'polygon-clipping';

export type Pt = { x: number; y: number };

/** SVG-style 2D affine matrix: x' = ax + cy + e, y' = bx + dy + f. */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type Seg =
  | { kind: 'L'; p0: Pt; p1: Pt }
  | { kind: 'Q'; p0: Pt; p1: Pt; p2: Pt }
  | { kind: 'C'; p0: Pt; p1: Pt; p2: Pt; p3: Pt };

export interface SubPath {
  segs: Seg[];
  /**
   * True when the subpath is a closed loop (Z, or an intrinsically
   * closed shape). The closing edge is always materialized as a real
   * segment; `closed` only controls whether serialization emits Z.
   */
  closed: boolean;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** "Same point" tolerance (px) for run merging and inside tests. */
export const EPSILON = 1e-6;

/** Parameter-space tolerance for bezier split spans. */
const T_EPSILON = 1e-9;

const KAPPA = 0.5522847498307936;

// ---------------------------------------------------------------------------
// Small helpers

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function samePoint(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

export function segStart(seg: Seg): Pt {
  return seg.p0;
}

export function segEnd(seg: Seg): Pt {
  switch (seg.kind) {
    case 'L':
      return seg.p1;
    case 'Q':
      return seg.p2;
    case 'C':
      return seg.p3;
  }
}

export function segPoints(seg: Seg): Pt[] {
  switch (seg.kind) {
    case 'L':
      return [seg.p0, seg.p1];
    case 'Q':
      return [seg.p0, seg.p1, seg.p2];
    case 'C':
      return [seg.p0, seg.p1, seg.p2, seg.p3];
  }
}

function withStart(seg: Seg, p0: Pt): Seg {
  switch (seg.kind) {
    case 'L':
      return { kind: 'L', p0, p1: seg.p1 };
    case 'Q':
      return { kind: 'Q', p0, p1: seg.p1, p2: seg.p2 };
    case 'C':
      return { kind: 'C', p0, p1: seg.p1, p2: seg.p2, p3: seg.p3 };
  }
}

export function isInsideBounds(p: Pt, b: Bounds): boolean {
  return (
    p.x >= b.minX - EPSILON &&
    p.x <= b.maxX + EPSILON &&
    p.y >= b.minY - EPSILON &&
    p.y <= b.maxY + EPSILON
  );
}

/** Inner bounds fully inside outer bounds (inclusive). */
export function boundsContained(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
}

/** Control-point bounds (conservative: contains the curves). Null when empty. */
export function subPathsBounds(subpaths: SubPath[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const sp of subpaths) {
    for (const seg of sp.segs) {
      for (const p of segPoints(seg)) {
        any = true;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

// ---------------------------------------------------------------------------
// Matrices

export function matIdentity(): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** m1 × m2 (m2 is applied to the point first, then m1). */
export function matMultiply(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function matDet(m: Mat): number {
  return m.a * m.d - m.b * m.c;
}

/** Null when the matrix is not invertible (collapses to a line/point). */
export function matInvert(m: Mat): Mat | null {
  const det = matDet(m);
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function matApply(m: Mat, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function matIsIdentity(m: Mat): boolean {
  return (
    m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0
  );
}

/**
 * Parse an SVG transform attribute (matrix | translate | scale |
 * rotate[,cx,cy] | skewX | skewY, in any combination). Returns identity
 * for a missing/empty attribute, null for anything unparseable — the
 * caller must treat null as "cannot safely rewrite this geometry".
 */
export function parseTransformAttribute(
  str: string | null | undefined,
): Mat | null {
  if (str === null || str === undefined || str.trim() === '')
    return matIdentity();

  const fnRe = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  const leftover = str.replace(fnRe, ' ');
  if (/[^\s,]/.test(leftover)) return null;

  let m = matIdentity();
  let match: RegExpExecArray | null;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  while ((match = re.exec(str)) !== null) {
    const name = match[1];
    const raw = match[2].trim();
    const args = raw === '' ? [] : raw.split(/[\s,]+/).map(Number);
    if (args.some((v) => Number.isNaN(v))) return null;

    let fn: Mat;
    switch (name) {
      case 'matrix':
        if (args.length !== 6) return null;
        fn = {
          a: args[0],
          b: args[1],
          c: args[2],
          d: args[3],
          e: args[4],
          f: args[5],
        };
        break;
      case 'translate':
        if (args.length < 1 || args.length > 2) return null;
        fn = { a: 1, b: 0, c: 0, d: 1, e: args[0], f: args[1] ?? 0 };
        break;
      case 'scale':
        if (args.length < 1 || args.length > 2) return null;
        fn = { a: args[0], b: 0, c: 0, d: args[1] ?? args[0], e: 0, f: 0 };
        break;
      case 'rotate': {
        if (args.length !== 1 && args.length !== 3) return null;
        const rad = (args[0] * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        fn = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        if (args.length === 3) {
          const toC: Mat = { a: 1, b: 0, c: 0, d: 1, e: args[1], f: args[2] };
          const fromC: Mat = {
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: -args[1],
            f: -args[2],
          };
          fn = matMultiply(matMultiply(toC, fn), fromC);
        }
        break;
      }
      case 'skewX':
        if (args.length !== 1) return null;
        fn = {
          a: 1,
          b: 0,
          c: Math.tan((args[0] * Math.PI) / 180),
          d: 1,
          e: 0,
          f: 0,
        };
        break;
      case 'skewY':
        if (args.length !== 1) return null;
        fn = {
          a: 1,
          b: Math.tan((args[0] * Math.PI) / 180),
          c: 0,
          d: 1,
          e: 0,
          f: 0,
        };
        break;
      default:
        return null;
    }
    m = matMultiply(m, fn);
  }
  return m;
}

/** Exact: affine maps of every anchor and control point. */
export function transformSubPaths(subpaths: SubPath[], m: Mat): SubPath[] {
  return subpaths.map((sp) => ({
    closed: sp.closed,
    segs: sp.segs.map((seg): Seg => {
      switch (seg.kind) {
        case 'L':
          return {
            kind: 'L',
            p0: matApply(m, seg.p0),
            p1: matApply(m, seg.p1),
          };
        case 'Q':
          return {
            kind: 'Q',
            p0: matApply(m, seg.p0),
            p1: matApply(m, seg.p1),
            p2: matApply(m, seg.p2),
          };
        case 'C':
          return {
            kind: 'C',
            p0: matApply(m, seg.p0),
            p1: matApply(m, seg.p1),
            p2: matApply(m, seg.p2),
            p3: matApply(m, seg.p3),
          };
      }
    }),
  }));
}

/** Reverse draw direction: subpaths in reverse order, each seg flipped. */
export function reverseSubPaths(subpaths: SubPath[]): SubPath[] {
  return [...subpaths].reverse().map((sp) => ({
    closed: sp.closed,
    segs: [...sp.segs].reverse().map((seg): Seg => {
      switch (seg.kind) {
        case 'L':
          return { kind: 'L', p0: seg.p1, p1: seg.p0 };
        case 'Q':
          return { kind: 'Q', p0: seg.p2, p1: seg.p1, p2: seg.p0 };
        case 'C':
          return { kind: 'C', p0: seg.p3, p1: seg.p2, p2: seg.p1, p3: seg.p0 };
      }
    }),
  }));
}

// ---------------------------------------------------------------------------
// Path data parsing / serialization

/**
 * Parse an SVG path `d` attribute into the normalized model. Handles
 * relative commands, H/V, implicit linetos, S/T reflection, packed arc
 * flags, packed negative numbers, and exponents. Returns null on
 * unparseable input (callers fall back to treating the element as
 * unclippable).
 */
export function parsePathData(d: string): SubPath[] | null {
  const n = d.length;
  let i = 0;
  const subpaths: SubPath[] = [];
  let segs: Seg[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let cmd = '';
  let prevCmd = '';
  let prevCubicCtrl: Pt | null = null;
  let prevQuadCtrl: Pt | null = null;

  const isSep = (c: string): boolean =>
    c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',';
  const skipSep = (): void => {
    while (i < n && isSep(d[i])) i++;
  };

  const readNumber = (): number | null => {
    skipSep();
    const from = i;
    if (i < n && (d[i] === '+' || d[i] === '-')) i++;
    let digits = false;
    while (i < n && d[i] >= '0' && d[i] <= '9') {
      i++;
      digits = true;
    }
    if (i < n && d[i] === '.') {
      i++;
      while (i < n && d[i] >= '0' && d[i] <= '9') {
        i++;
        digits = true;
      }
    }
    if (!digits) {
      i = from;
      return null;
    }
    if (i < n && (d[i] === 'e' || d[i] === 'E')) {
      const expFrom = i;
      i++;
      if (i < n && (d[i] === '+' || d[i] === '-')) i++;
      let expDigits = false;
      while (i < n && d[i] >= '0' && d[i] <= '9') {
        i++;
        expDigits = true;
      }
      if (!expDigits) i = expFrom;
    }
    return parseFloat(d.slice(from, i));
  };

  const readNumbers = (count: number): number[] | null => {
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const v = readNumber();
      if (v === null) return null;
      out.push(v);
    }
    return out;
  };

  /** Arc flags are single characters and may be packed ("011 10 10"). */
  const readFlag = (): boolean | null => {
    skipSep();
    if (i < n && (d[i] === '0' || d[i] === '1')) {
      const v = d[i] === '1';
      i++;
      return v;
    }
    return null;
  };

  const finish = (closed: boolean): void => {
    if (segs.length > 0) subpaths.push({ segs, closed });
    segs = [];
  };

  while (true) {
    skipSep();
    if (i >= n) break;
    const c = d[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      cmd = c;
      i++;
    } else if (cmd === '') {
      return null;
    }

    const rel = cmd >= 'a';
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nums = readNumbers(2);
        if (!nums) return null;
        finish(false);
        cur = rel
          ? { x: cur.x + nums[0], y: cur.y + nums[1] }
          : { x: nums[0], y: nums[1] };
        start = cur;
        prevCmd = 'M';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        cmd = rel ? 'l' : 'L'; // subsequent pairs are implicit linetos
        break;
      }
      case 'L': {
        const nums = readNumbers(2);
        if (!nums) return null;
        const p = rel
          ? { x: cur.x + nums[0], y: cur.y + nums[1] }
          : { x: nums[0], y: nums[1] };
        segs.push({ kind: 'L', p0: cur, p1: p });
        cur = p;
        prevCmd = 'L';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'H': {
        const v = readNumber();
        if (v === null) return null;
        const p = { x: rel ? cur.x + v : v, y: cur.y };
        segs.push({ kind: 'L', p0: cur, p1: p });
        cur = p;
        prevCmd = 'L';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'V': {
        const v = readNumber();
        if (v === null) return null;
        const p = { x: cur.x, y: rel ? cur.y + v : v };
        segs.push({ kind: 'L', p0: cur, p1: p });
        cur = p;
        prevCmd = 'L';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'C': {
        const nums = readNumbers(6);
        if (!nums) return null;
        const bx = rel ? cur.x : 0;
        const by = rel ? cur.y : 0;
        const p1 = { x: bx + nums[0], y: by + nums[1] };
        const p2 = { x: bx + nums[2], y: by + nums[3] };
        const p = { x: bx + nums[4], y: by + nums[5] };
        segs.push({ kind: 'C', p0: cur, p1, p2, p3: p });
        cur = p;
        prevCmd = 'C';
        prevCubicCtrl = p2;
        prevQuadCtrl = null;
        break;
      }
      case 'S': {
        const nums = readNumbers(4);
        if (!nums) return null;
        const bx = rel ? cur.x : 0;
        const by = rel ? cur.y : 0;
        const p1: Pt =
          prevCmd === 'C' && prevCubicCtrl
            ? { x: 2 * cur.x - prevCubicCtrl.x, y: 2 * cur.y - prevCubicCtrl.y }
            : { x: cur.x, y: cur.y };
        const p2 = { x: bx + nums[0], y: by + nums[1] };
        const p = { x: bx + nums[2], y: by + nums[3] };
        segs.push({ kind: 'C', p0: cur, p1, p2, p3: p });
        cur = p;
        prevCmd = 'C';
        prevCubicCtrl = p2;
        prevQuadCtrl = null;
        break;
      }
      case 'Q': {
        const nums = readNumbers(4);
        if (!nums) return null;
        const bx = rel ? cur.x : 0;
        const by = rel ? cur.y : 0;
        const p1 = { x: bx + nums[0], y: by + nums[1] };
        const p = { x: bx + nums[2], y: by + nums[3] };
        segs.push({ kind: 'Q', p0: cur, p1, p2: p });
        cur = p;
        prevCmd = 'Q';
        prevQuadCtrl = p1;
        prevCubicCtrl = null;
        break;
      }
      case 'T': {
        const nums = readNumbers(2);
        if (!nums) return null;
        const bx = rel ? cur.x : 0;
        const by = rel ? cur.y : 0;
        const p1: Pt =
          prevCmd === 'Q' && prevQuadCtrl
            ? { x: 2 * cur.x - prevQuadCtrl.x, y: 2 * cur.y - prevQuadCtrl.y }
            : { x: cur.x, y: cur.y };
        const p = { x: bx + nums[0], y: by + nums[1] };
        segs.push({ kind: 'Q', p0: cur, p1, p2: p });
        cur = p;
        prevCmd = 'Q';
        prevQuadCtrl = p1;
        prevCubicCtrl = null;
        break;
      }
      case 'A': {
        const radii = readNumbers(3);
        if (!radii) return null;
        const largeArc = readFlag();
        const sweep = readFlag();
        if (largeArc === null || sweep === null) return null;
        const end = readNumbers(2);
        if (!end) return null;
        const p = rel
          ? { x: cur.x + end[0], y: cur.y + end[1] }
          : { x: end[0], y: end[1] };
        segs.push(
          ...arcToCubics(cur, radii[0], radii[1], radii[2], largeArc, sweep, p),
        );
        cur = p;
        prevCmd = 'A';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'Z': {
        if (segs.length > 0) {
          if (dist(cur, start) > EPSILON) {
            segs.push({ kind: 'L', p0: cur, p1: start });
          }
          finish(true);
        }
        cur = start;
        prevCmd = 'Z';
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        cmd = ''; // Z takes no arguments; a number next is malformed
        break;
      }
      default:
        return null;
    }
  }
  finish(false);
  return subpaths;
}

/** Serialize to absolute M/L/Q/C(/Z); Q stays Q. */
export function serializePathData(subpaths: SubPath[], precision = 3): string {
  const fmt = (v: number): string => {
    const r = Number(v.toFixed(precision));
    return String(Object.is(r, -0) ? 0 : r);
  };
  const parts: string[] = [];
  for (const sp of subpaths) {
    if (sp.segs.length === 0) continue;
    let segs = sp.segs;
    if (sp.closed && segs.length > 1) {
      const last = segs[segs.length - 1];
      // The materialized closing edge is re-expressed as Z.
      if (last.kind === 'L' && samePoint(last.p1, segStart(segs[0]))) {
        segs = segs.slice(0, -1);
      }
    }
    const s = segStart(segs[0]);
    parts.push(`M ${fmt(s.x)} ${fmt(s.y)}`);
    for (const seg of segs) {
      switch (seg.kind) {
        case 'L':
          parts.push(`L ${fmt(seg.p1.x)} ${fmt(seg.p1.y)}`);
          break;
        case 'Q':
          parts.push(
            `Q ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)}`,
          );
          break;
        case 'C':
          parts.push(
            `C ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)} ${fmt(seg.p3.x)} ${fmt(seg.p3.y)}`,
          );
          break;
      }
    }
    if (sp.closed) parts.push('Z');
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Shape → model conversions

/**
 * SVG arc (endpoint parameterization, spec F.6.5/F.6.6) to cubics, one
 * per ≤ 90° sweep. Zero radii degrade to a straight line per spec;
 * coincident endpoints produce nothing.
 */
export function arcToCubics(
  from: Pt,
  rxIn: number,
  ryIn: number,
  xRotDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Pt,
): Seg[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-12 || ry < 1e-12) {
    return [{ kind: 'L', p0: from, p1: to }];
  }
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return [];

  const phi = (xRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Scale out-of-range radii up until the arc is representable.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  let num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  if (num < 0) num = 0;
  let coef = Math.sqrt(num / (rx2 * y1p2 + ry2 * x1p2));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (-coef * (ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angleBetween = (
    ux: number,
    uy: number,
    vx: number,
    vy: number,
  ): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const nSegs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / nSegs;
  const alpha = (4 / 3) * Math.tan(delta / 4);

  const point = (t: number): Pt => ({
    x: cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi,
    y: cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi,
  });
  const deriv = (t: number): Pt => ({
    x: -rx * Math.sin(t) * cosPhi - ry * Math.cos(t) * sinPhi,
    y: -rx * Math.sin(t) * sinPhi + ry * Math.cos(t) * cosPhi,
  });

  const out: Seg[] = [];
  let t1 = theta1;
  let p0 = from;
  for (let k = 0; k < nSegs; k++) {
    const t2 = t1 + delta;
    const p3 = k === nSegs - 1 ? to : point(t2);
    const d1 = deriv(t1);
    const d2 = deriv(t2);
    out.push({
      kind: 'C',
      p0,
      p1: { x: p0.x + alpha * d1.x, y: p0.y + alpha * d1.y },
      p2: { x: p3.x - alpha * d2.x, y: p3.y - alpha * d2.y },
      p3,
    });
    p0 = p3;
    t1 = t2;
  }
  return out;
}

/** Ellipse (or circle when rx === ry) as four cubics, closed. */
export function ellipseToSubPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): SubPath {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const p = (x: number, y: number): Pt => ({ x, y });
  const segs: Seg[] = [
    {
      kind: 'C',
      p0: p(cx + rx, cy),
      p1: p(cx + rx, cy + ky),
      p2: p(cx + kx, cy + ry),
      p3: p(cx, cy + ry),
    },
    {
      kind: 'C',
      p0: p(cx, cy + ry),
      p1: p(cx - kx, cy + ry),
      p2: p(cx - rx, cy + ky),
      p3: p(cx - rx, cy),
    },
    {
      kind: 'C',
      p0: p(cx - rx, cy),
      p1: p(cx - rx, cy - ky),
      p2: p(cx - kx, cy - ry),
      p3: p(cx, cy - ry),
    },
    {
      kind: 'C',
      p0: p(cx, cy - ry),
      p1: p(cx + kx, cy - ry),
      p2: p(cx + rx, cy - ky),
      p3: p(cx + rx, cy),
    },
  ];
  return { segs, closed: true };
}

/**
 * Rect outline (rounded when rx/ry > 0), closed, starting after the
 * top-left corner. Radii are clamped to half the side per spec.
 */
export function roundedRectToSubPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rxIn: number,
  ryIn: number,
): SubPath {
  const rx = Math.min(Math.abs(rxIn), w / 2);
  const ry = Math.min(Math.abs(ryIn), h / 2);
  const p = (px: number, py: number): Pt => ({ x: px, y: py });
  const segs: Seg[] = [];
  const line = (a: Pt, b: Pt): void => {
    if (dist(a, b) > EPSILON) segs.push({ kind: 'L', p0: a, p1: b });
  };
  if (rx < EPSILON || ry < EPSILON) {
    line(p(x, y), p(x + w, y));
    line(p(x + w, y), p(x + w, y + h));
    line(p(x + w, y + h), p(x, y + h));
    line(p(x, y + h), p(x, y));
    return { segs, closed: true };
  }
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const corner = (p0: Pt, c1: Pt, c2: Pt, p3: Pt): void => {
    segs.push({ kind: 'C', p0, p1: c1, p2: c2, p3 });
  };
  line(p(x + rx, y), p(x + w - rx, y));
  corner(
    p(x + w - rx, y),
    p(x + w - rx + kx, y),
    p(x + w, y + ry - ky),
    p(x + w, y + ry),
  );
  line(p(x + w, y + ry), p(x + w, y + h - ry));
  corner(
    p(x + w, y + h - ry),
    p(x + w, y + h - ry + ky),
    p(x + w - rx + kx, y + h),
    p(x + w - rx, y + h),
  );
  line(p(x + w - rx, y + h), p(x + rx, y + h));
  corner(
    p(x + rx, y + h),
    p(x + rx - kx, y + h),
    p(x, y + h - ry + ky),
    p(x, y + h - ry),
  );
  line(p(x, y + h - ry), p(x, y + ry));
  corner(p(x, y + ry), p(x, y + ry - ky), p(x + rx - kx, y), p(x + rx, y));
  return { segs, closed: true };
}

// ---------------------------------------------------------------------------
// Clipping

/** Liang–Barsky: clip one segment to bounds. Null when fully outside. */
export function clipSegmentLB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  b: Bounds,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - b.minX, b.maxX - x1, y1 - b.minY, b.maxY - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }

  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function chainLength(points: Pt[]): number {
  let len = 0;
  for (let i = 0; i + 1 < points.length; i++)
    len += dist(points[i], points[i + 1]);
  return len;
}

/**
 * Clip a point chain, splitting it into the runs that remain inside.
 * A chain that leaves and re-enters the bounds becomes multiple runs.
 * Zero-length runs left by a corner graze are dropped.
 */
export function clipChain(points: Pt[], b: Bounds): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];

  const keepRun = (r: Pt[]): void => {
    if (
      r.length > 1 &&
      (chainLength(r) > EPSILON || chainLength(points) <= EPSILON)
    ) {
      runs.push(r);
    }
  };

  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegmentLB(
      points[i].x,
      points[i].y,
      points[i + 1].x,
      points[i + 1].y,
      b,
    );
    if (!clipped) {
      keepRun(run);
      run = [];
      continue;
    }

    const [cx1, cy1, cx2, cy2] = clipped;
    const last = run[run.length - 1];
    if (
      last &&
      Math.abs(last.x - cx1) < EPSILON &&
      Math.abs(last.y - cy1) < EPSILON
    ) {
      run.push({ x: cx2, y: cy2 });
    } else {
      keepRun(run);
      run = [
        { x: cx1, y: cy1 },
        { x: cx2, y: cy2 },
      ];
    }
  }

  keepRun(run);
  return runs;
}

function segToBezier(seg: Seg): Bezier {
  return new Bezier(segPoints(seg).map((p) => ({ x: p.x, y: p.y })));
}

function bezierToSeg(bz: Bezier): Seg {
  const p = bz.points;
  if (p.length === 3) {
    return {
      kind: 'Q',
      p0: { x: p[0].x, y: p[0].y },
      p1: { x: p[1].x, y: p[1].y },
      p2: { x: p[2].x, y: p[2].y },
    };
  }
  return {
    kind: 'C',
    p0: { x: p[0].x, y: p[0].y },
    p1: { x: p[1].x, y: p[1].y },
    p2: { x: p[2].x, y: p[2].y },
    p3: { x: p[3].x, y: p[3].y },
  };
}

function rectEdges(b: Bounds): Array<{ p1: Pt; p2: Pt }> {
  return [
    { p1: { x: b.minX, y: b.minY }, p2: { x: b.maxX, y: b.minY } },
    { p1: { x: b.maxX, y: b.minY }, p2: { x: b.maxX, y: b.maxY } },
    { p1: { x: b.maxX, y: b.maxY }, p2: { x: b.minX, y: b.maxY } },
    { p1: { x: b.minX, y: b.maxY }, p2: { x: b.minX, y: b.minY } },
  ];
}

/**
 * Clip one subpath to the rect. Returns [the same object] when nothing
 * changed (callers use reference identity to detect "untouched"), else
 * the surviving runs as open subpaths.
 */
function clipSubPath(sp: SubPath, b: Bounds): SubPath[] {
  let untouched = true;
  const runs: Seg[][] = [];
  let run: Seg[] | null = null;

  const emit = (piece: Seg): void => {
    if (run !== null && run.length > 0) {
      const end = segEnd(run[run.length - 1]);
      if (samePoint(end, segStart(piece))) {
        run.push(withStart(piece, end));
        return;
      }
      runs.push(run);
    }
    run = [piece];
  };
  const breakRun = (): void => {
    if (run !== null && run.length > 0) runs.push(run);
    run = null;
  };

  for (const seg of sp.segs) {
    if (seg.kind === 'L') {
      if (isInsideBounds(seg.p0, b) && isInsideBounds(seg.p1, b)) {
        emit(seg);
        continue;
      }
      untouched = false;
      const r = clipSegmentLB(seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, b);
      if (!r) {
        breakRun();
        continue;
      }
      const piece: Seg = {
        kind: 'L',
        p0: { x: r[0], y: r[1] },
        p1: { x: r[2], y: r[3] },
      };
      if (
        dist(piece.p0, piece.p1) < EPSILON &&
        dist(seg.p0, seg.p1) > EPSILON
      ) {
        // Corner graze: the clip kept a zero-length sliver of a real edge.
        breakRun();
        continue;
      }
      emit(piece);
      continue;
    }

    // Q / C
    const pts = segPoints(seg);
    if (pts.every((p) => isInsideBounds(p, b))) {
      emit(seg); // convex hull inside ⇒ curve inside; kept verbatim
      continue;
    }
    const curve = segToBezier(seg);
    const bb = curve.bbox();
    if (
      bb.x.min > b.maxX + EPSILON ||
      bb.x.max < b.minX - EPSILON ||
      bb.y.min > b.maxY + EPSILON ||
      bb.y.max < b.minY - EPSILON
    ) {
      untouched = false;
      breakRun();
      continue;
    }
    if (
      bb.x.min >= b.minX - EPSILON &&
      bb.x.max <= b.maxX + EPSILON &&
      bb.y.min >= b.minY - EPSILON &&
      bb.y.max <= b.maxY + EPSILON
    ) {
      emit(seg); // curve inside though control points poke out; verbatim
      continue;
    }

    const ts: number[] = [0, 1];
    for (const edge of rectEdges(b)) {
      for (const t of curve.intersects(edge)) {
        if (t > T_EPSILON && t < 1 - T_EPSILON) ts.push(t);
      }
    }
    ts.sort((a, z) => a - z);

    // Classify spans by midpoint; merge adjacent inside spans (a curve
    // that only touches the border tangentially stays whole).
    const spans: Array<[number, number]> = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const ta = ts[k];
      const tb = ts[k + 1];
      if (tb - ta < T_EPSILON) continue;
      const mid = curve.get((ta + tb) / 2);
      if (!isInsideBounds({ x: mid.x, y: mid.y }, b)) continue;
      const prev = spans[spans.length - 1];
      if (prev && Math.abs(prev[1] - ta) < T_EPSILON) prev[1] = tb;
      else spans.push([ta, tb]);
    }

    if (
      spans.length === 1 &&
      spans[0][0] <= T_EPSILON &&
      spans[0][1] >= 1 - T_EPSILON
    ) {
      emit(seg); // survived whole
      continue;
    }
    untouched = false;
    if (spans.length === 0) {
      breakRun();
      continue;
    }
    for (const [ta, tb] of spans) {
      emit(bezierToSeg(curve.split(ta, tb)));
    }
  }
  breakRun();

  if (untouched) return [sp];

  // Closed chain whose seam survived: merge last run into first so the
  // pen doesn't lift at the (arbitrary) start point.
  if (sp.closed && runs.length >= 2) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (samePoint(segEnd(last[last.length - 1]), segStart(first[0]))) {
      runs.pop();
      runs[0] = [...last, ...first];
    }
  }

  return runs.map((r) => ({ segs: r, closed: false }));
}

/**
 * Clip subpaths (stroke semantics: open runs, no border-hugging edges).
 * Untouched subpaths keep their identity (===) in the result.
 */
export function clipSubPathsToRect(subpaths: SubPath[], b: Bounds): SubPath[] {
  const out: SubPath[] = [];
  for (const sp of subpaths) {
    out.push(...clipSubPath(sp, b));
  }
  return out;
}

/** A closed polygon-clipping ring as a closed all-line subpath. */
export function ringToSubPath(ring: Pt[]): SubPath {
  const pts =
    ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])
      ? ring.slice(0, -1)
      : ring.slice();
  const segs: Seg[] = [];
  for (let k = 0; k < pts.length; k++) {
    segs.push({ kind: 'L', p0: pts[k], p1: pts[(k + 1) % pts.length] });
  }
  return { segs, closed: true };
}

/**
 * Boolean-intersect closed rings with the mask rect (fill semantics:
 * the result hugs the border). Each input ring is its own polygon.
 * Returns polygons (outer ring + holes each); null when the boolean op
 * fails on degenerate input — the caller must fall back.
 */
export function clipRingsToRect(rings: Pt[][], b: Bounds): Pt[][][] | null {
  if (rings.length === 0) return [];
  const mp: MultiPolygon = rings.map((r) => [r.map((p): Pair => [p.x, p.y])]);
  const rect: Polygon = [
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
      [b.minX, b.minY],
    ],
  ];
  let clipped: MultiPolygon;
  try {
    clipped = polygonClipping.intersection(mp, rect);
  } catch {
    return null;
  }
  return clipped.map((poly) =>
    poly.map((ring) => ring.map(([x, y]): Pt => ({ x, y }))),
  );
}

/**
 * Flatten a subpath to a polyline ring for boolean clipping. Curves are
 * sampled at ~2 px chords (invisible at plotter scale).
 */
export function flattenSubPathToRing(sp: SubPath): Pt[] {
  const pts: Pt[] = [];
  if (sp.segs.length === 0) return pts;
  pts.push(segStart(sp.segs[0]));
  for (const seg of sp.segs) {
    if (seg.kind === 'L') {
      pts.push(seg.p1);
      continue;
    }
    const curve = segToBezier(seg);
    const steps = Math.min(256, Math.max(8, Math.round(curve.length() / 2)));
    const lut = curve.getLUT(steps);
    for (let k = 1; k < lut.length; k++) pts.push({ x: lut[k].x, y: lut[k].y });
  }
  if (pts.length > 1 && samePoint(pts[0], pts[pts.length - 1])) pts.pop();
  return pts;
}
