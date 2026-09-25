/**
 * Thank You Card
 * 4.875 x 3.375
 */

import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { seedPRNG, random } from '@johnfmorton/generative-utils';
import { createCanvas } from '../src/svg-utils';
import { drawCalibrationMarks } from '../src/calibration';
import { applyBorderMask } from '..//src/border-mask';
import {
  MM_TO_PX,
  withCursive,
  type CursiveResponse,
} from '../src/secondhand-cursive';
import {
  clipChain,
  flattenSubPathToRing,
  parsePathData,
  samePoint,
  segEnd,
  segStart,
  type Bounds,
  type Pt,
} from '../src/path-geometry';

export const meta = {
  title: 'Thank You Card',
  description: '4.875 x 3.375',
};

export const canvas: CanvasConfig = {
  width: 4.875,
  height: 3.375,
  unit: 'in',
};

export const controls = [
  {
    type: 'toggle',
    id: 'showCalibration',
    label: 'Show calibration marks',
    description: 'Corner crosshairs for pen plotter calibration',
    default: true,
  },
  {
    type: 'dropdown',
    id: 'borderMode',
    label: 'Border Mask',
    description:
      'Clip strokes to an inset border so the pen never runs off the paper',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'mask', label: 'Mask only' },
      { value: 'border', label: 'Mask + border' },
    ],
    default: 'border',
  },
  {
    type: 'slider',
    id: 'borderInset',
    label: 'Border Inset',
    description: 'How far the mask sits inside the canvas edge, in px',
    min: 0,
    max: 96,
    step: 1,
    default: 24,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 1258878846,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Pen Width',
    description:
      "The plot pen's line on paper, in mm, so the preview shows real weight",
    min: 0.3,
    max: 5,
    step: 0.1,
    default: 0.3,
  },
  {
    type: 'toggle',
    id: 'redInk',
    label: 'Show red ink',
    group: 'Red Ink',
    default: true,
  },
  {
    type: 'text',
    id: 'redText',
    label: 'What does the red text say?',
    group: 'Red Ink',
    placeholder: 'thanks',
    default: '',
  },
  {
    type: 'slider',
    id: 'redRotation',
    label: 'Rotation',
    description:
      'Turn the red ruled lines, and the words on them, this many degrees clockwise about the center of the paper',
    group: 'Red Ink',
    min: -90,
    max: 90,
    step: 1,
    default: 0,
  },
  {
    type: 'slider',
    id: 'redLineOffset',
    label: 'Line Offset',
    description:
      'Slide the red lines sideways across their direction, as a share of the space between lines, to move where they cross or overlap the other ink. The pattern repeats every whole line, so ±0.5 reaches every position',
    group: 'Red Ink',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0,
  },
  {
    type: 'slider',
    id: 'redWordOffset',
    label: 'Word Offset',
    description:
      'Slide the red words along their lines, as a share of one word. In Run On the pattern repeats every whole word, so ±0.5 reaches every position; in Whole Words it moves them from the start of the line (-0.5) through centered (0) to its end (0.5)',
    group: 'Red Ink',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0,
  },
  {
    type: 'dropdown',
    id: 'redLayout',
    label: 'Word Layout',
    description:
      'Run On keeps writing the word off both ends of every line, clipped at the border, each line starting at a different point in the word. Whole Words writes only the words that fit, centered',
    group: 'Red Ink',
    options: [
      { value: 'fill', label: 'Run on' },
      { value: 'fit', label: 'Whole words' },
    ],
    default: 'fill',
  },
  {
    type: 'toggle',
    id: 'redRules',
    label: 'Draw ruled lines',
    description:
      'Draw the wavy notebook rules the red words sit on; off leaves the words following invisible lines',
    group: 'Red Ink',
    default: true,
  },
  {
    type: 'slider',
    id: 'redLineCount',
    label: 'Lines',
    description:
      "Sets the base spacing and letter scale: at Line Spacing 1, this many ruled lines fill the paper's height inside the border. Letter Size is a share of this spacing, so more lines means smaller letters",
    group: 'Red Ink',
    min: 2,
    max: 14,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'redLineSpacing',
    label: 'Line Spacing',
    description:
      'Space between the red lines as a multiple of the spacing Lines gives. The letters keep their size, and lines are added or dropped to cover the paper',
    group: 'Red Ink',
    min: 0.5,
    max: 2,
    step: 0.05,
    default: 1,
  },
  {
    type: 'slider',
    id: 'redWaveHeight',
    label: 'Wave Height',
    description:
      'How far each line swells above and below straight, in px. Small values give a gently wavy ruled page',
    group: 'Red Ink',
    min: 0,
    max: 16,
    step: 0.5,
    default: 3,
  },
  {
    type: 'slider',
    id: 'redWaves',
    label: 'Waves Across',
    description:
      'Roughly how many swells each line makes across the card. The lines share a main swell, so they stay near parallel, plus a smaller one of their own',
    group: 'Red Ink',
    min: 0.5,
    max: 5,
    step: 0.25,
    default: 1.5,
  },
  {
    type: 'slider',
    id: 'redLetterSize',
    label: 'Letter Size',
    description:
      'The x-height of the red words as a share of the space between lines',
    group: 'Red Ink',
    min: 0.15,
    max: 0.7,
    step: 0.05,
    default: 0.35,
  },
  {
    type: 'seed',
    id: 'redHandSeed',
    label: 'Handwriting Seed',
    description:
      "Rolls a fresh hand for the red words, one API call per line. The main Seed shapes the waves and leaves the lettering's API calls alone",
    group: 'Red Ink',
    default: 1,
  },
  {
    type: 'toggle',
    id: 'showBlueInk',
    label: 'Show Blue Ink',
    group: 'Blue Ink',
    default: false,
  },
  {
    type: 'text',
    id: 'blueInk',
    label: 'What does the blue ink say?',
    group: 'Blue Ink',
    placeholder: 'grateful',
    default: '',
  },
  {
    type: 'slider',
    id: 'blueRotation',
    label: 'Rotation',
    description:
      'Turn the blue ruled lines, and the words on them, this many degrees clockwise about the center of the paper. Against the red lines this makes a crosshatch of writing',
    group: 'Blue Ink',
    min: -90,
    max: 90,
    step: 1,
    default: 15,
  },
  {
    type: 'slider',
    id: 'blueLineOffset',
    label: 'Line Offset',
    description:
      'Slide the blue lines sideways across their direction, as a share of the space between lines, to move where they cross or overlap the other ink. The pattern repeats every whole line, so ±0.5 reaches every position',
    group: 'Blue Ink',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0,
  },
  {
    type: 'slider',
    id: 'blueWordOffset',
    label: 'Word Offset',
    description:
      'Slide the blue words along their lines, as a share of one word. In Run On the pattern repeats every whole word, so ±0.5 reaches every position; in Whole Words it moves them from the start of the line (-0.5) through centered (0) to its end (0.5)',
    group: 'Blue Ink',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0,
  },
  {
    type: 'dropdown',
    id: 'blueLayout',
    label: 'Word Layout',
    description:
      'Run On keeps writing the word off both ends of every line, clipped at the border, each line starting at a different point in the word. Whole Words writes only the words that fit, centered',
    group: 'Blue Ink',
    options: [
      { value: 'fill', label: 'Run on' },
      { value: 'fit', label: 'Whole words' },
    ],
    default: 'fill',
  },
  {
    type: 'toggle',
    id: 'blueRules',
    label: 'Draw ruled lines',
    description:
      'Draw the wavy notebook rules the blue words sit on; off leaves the words following invisible lines',
    group: 'Blue Ink',
    default: true,
  },
  {
    type: 'slider',
    id: 'blueLineCount',
    label: 'Lines',
    description:
      "Sets the base spacing and letter scale: at Line Spacing 1, this many ruled lines fit the paper's height inside the border. Letter Size is a share of this spacing, so more lines means smaller letters. Turned lines keep the same spacing, adding lines to cover the corners",
    group: 'Blue Ink',
    min: 2,
    max: 14,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'blueLineSpacing',
    label: 'Line Spacing',
    description:
      'Space between the blue lines as a multiple of the spacing Lines gives. The letters keep their size, and lines are added or dropped to cover the paper',
    group: 'Blue Ink',
    min: 0.5,
    max: 2,
    step: 0.05,
    default: 1,
  },
  {
    type: 'slider',
    id: 'blueWaveHeight',
    label: 'Wave Height',
    description:
      'How far each line swells above and below straight, in px. Small values give a gently wavy ruled page',
    group: 'Blue Ink',
    min: 0,
    max: 16,
    step: 0.5,
    default: 3,
  },
  {
    type: 'slider',
    id: 'blueWaves',
    label: 'Waves Across',
    description:
      'Roughly how many swells each line makes across the card. The lines share a main swell, so they stay near parallel, plus a smaller one of their own',
    group: 'Blue Ink',
    min: 0.5,
    max: 5,
    step: 0.25,
    default: 1.5,
  },
  {
    type: 'slider',
    id: 'blueLetterSize',
    label: 'Letter Size',
    description:
      'The x-height of the blue words as a share of the space between lines',
    group: 'Blue Ink',
    min: 0.15,
    max: 0.7,
    step: 0.05,
    default: 0.35,
  },
  {
    type: 'seed',
    id: 'blueHandSeed',
    label: 'Handwriting Seed',
    description:
      "Rolls a fresh hand for the blue words, one API call per line. The main Seed shapes the waves and leaves the lettering's API calls alone",
    group: 'Blue Ink',
    default: 101,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

const SVG_NS = 'http://www.w3.org/2000/svg';
const RED_INK = '#c8102e';
const BLUE_INK = '#1d4ea0';
/** The API's text limit; each layer's word repeats up to it. */
const MAX_TEXT_CHARS = 200;

/** A gently wavy ruled line: its height and slope at x, in canvas px. */
interface Rule {
  y: (x: number) => number;
  slope: (x: number) => number;
}

/**
 * A rule at `baseY` swelling `amplitude` px either side: mostly a swell
 * shared by every line (so the rules stay near parallel, like a page
 * that has warped) plus a quarter of one of its own. Coordinates are in
 * an ink layer's rotated frame (see Frame); `xOffset` shifts the waves
 * so an unrotated layer's match the paper's x.
 */
function makeRule(
  baseY: number,
  amplitude: number,
  sharedK: number,
  sharedPhase: number,
  ownK: number,
  ownPhase: number,
  xOffset: number,
): Rule {
  return {
    y: (x) =>
      baseY +
      amplitude *
        (0.75 * Math.sin(sharedK * (x + xOffset) + sharedPhase) +
          0.25 * Math.sin(ownK * (x + xOffset) + ownPhase)),
    slope: (x) =>
      amplitude *
      (0.75 * sharedK * Math.cos(sharedK * (x + xOffset) + sharedPhase) +
        0.25 * ownK * Math.cos(ownK * (x + xOffset) + ownPhase)),
  };
}

/** Arc length along a rule from x0, sampled every px, for x-at-length lookups. */
interface ArcTable {
  xs: number[];
  lengths: number[];
}

function arcTable(rule: Rule, x0: number, x1: number): ArcTable {
  const steps = Math.max(1, Math.ceil(x1 - x0));
  const xs = [x0];
  const lengths = [0];
  let prevY = rule.y(x0);
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = rule.y(x);
    xs.push(x);
    lengths.push(lengths[i - 1] + Math.hypot(x - xs[i - 1], y - prevY));
    prevY = y;
  }
  return { xs, lengths };
}

/** The x a distance `s` along the rule, extrapolating flat past either end. */
function xAtLength({ xs, lengths }: ArcTable, s: number): number {
  const last = lengths.length - 1;
  if (s <= 0) return xs[0] + s;
  if (s >= lengths[last]) return xs[last] + (s - lengths[last]);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - lengths[lo]) / (lengths[hi] - lengths[lo]);
  return xs[lo] + (xs[hi] - xs[lo]) * t;
}

/**
 * One word of a rendered line: its strokes as polylines in mm, x from
 * the ink box's left edge and y from the first line's baseline, so the
 * word sits on a rule at y = 0.
 */
interface Word {
  left: number;
  right: number;
  strokes: Pt[][];
}

/** Parsed per response — the flattening is the costly part of a render. */
const wordsCache = new WeakMap<CursiveResponse, Word[]>();

/**
 * Split a rendered line of `wordCount` repetitions of a phrase of
 * `phraseWords` words into its repetitions. The strokes are merged into
 * runs wherever they overlap across x (an i's dot or a t's cross joins
 * its letter's run); the spaces are then the widest gaps between runs —
 * wider than any pen lift inside a word — and every `phraseWords` words
 * between them make one repetition.
 */
function lineWords(
  rendered: CursiveResponse,
  wordCount: number,
  phraseWords: number,
): Word[] {
  const cached = wordsCache.get(rendered);
  if (cached) return cached;

  const doc = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml');
  const viewBox = doc.documentElement.getAttribute('viewBox');
  if (!viewBox) return [];
  const [minX, minY] = viewBox.split(/[\s,]+/).map(Number);
  const baseline = rendered.baselines_mm?.[0] ?? rendered.height_mm * 0.7;

  const strokes: { pts: Pt[]; left: number; right: number }[] = [];
  for (const path of doc.querySelectorAll('path')) {
    for (const sp of parsePathData(path.getAttribute('d') ?? '') ?? []) {
      const pts = flattenSubPathToRing(sp).map((p) => ({
        x: p.x - minX,
        y: p.y - minY - baseline,
      }));
      if (pts.length === 0) continue;
      // The ring flattener drops a closing point; a stroke that ends
      // where it began needs it back to draw its last segment.
      const end = segEnd(sp.segs[sp.segs.length - 1]);
      if (sp.closed || samePoint(segStart(sp.segs[0]), end)) {
        pts.push(pts[0]);
      }
      const xs = pts.map((p) => p.x);
      strokes.push({ pts, left: Math.min(...xs), right: Math.max(...xs) });
    }
  }
  strokes.sort((a, b) => a.left - b.left);

  const runs: Word[] = [];
  for (const stroke of strokes) {
    const run = runs[runs.length - 1];
    if (run && stroke.left <= run.right) {
      run.right = Math.max(run.right, stroke.right);
      run.strokes.push(stroke.pts);
    } else {
      runs.push({
        left: stroke.left,
        right: stroke.right,
        strokes: [stroke.pts],
      });
    }
  }

  const breaks = new Set(
    runs
      .slice(1)
      .map((run, i) => ({ i: i + 1, gap: run.left - runs[i].right }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, wordCount * phraseWords - 1)
      .map(({ i }) => i),
  );
  const words: Word[] = [];
  let spaces = 0;
  runs.forEach((run, i) => {
    const word = words[words.length - 1];
    const phraseEnds = breaks.has(i) && ++spaces % phraseWords === 0;
    if (word && !phraseEnds) {
      word.right = run.right;
      word.strokes.push(...run.strokes);
    } else {
      words.push({ ...run, strokes: [...run.strokes] });
    }
  });

  wordsCache.set(rendered, words);
  return words;
}

/**
 * Path data for the words written along the rule between x0 and x1,
 * every stroke bent to follow it: a point `u` along the line and `v`
 * below its baseline lands `u` along the rule's arc and `v` out along
 * its normal there. Long straight strokes are subdivided so they bend
 * too.
 *
 * 'fit' writes as many whole words as fit, placed in the room left over
 * by `wordOffset` (-0.5 to 0.5, flush start to flush end). 'fill'
 * starts the run `shift - wordOffset` of a word before x0 and keeps
 * writing past x1, so the row reads as running on across the card. Either way the ink is
 * taken from the layer's frame to the canvas by `toCanvas` and clipped
 * to `clip`, the paper inside the border.
 */
function wordsAlongRule(
  words: Word[],
  rule: Rule,
  x0: number,
  x1: number,
  scale: number,
  layout: 'fit' | 'fill',
  shift: number,
  wordOffset: number,
  clip: Bounds,
  toCanvas: (p: Pt) => Pt,
): string {
  const table = arcTable(rule, x0, x1);
  const available = table.lengths[table.lengths.length - 1];
  const first = words[0];
  const reach = (count: number) =>
    (words[count - 1].right - first.left) * scale;

  let count = 0;
  let start: number;
  if (layout === 'fit') {
    while (count < words.length && reach(count + 1) <= available) count++;
    if (count === 0) return '';
    // -0.5 flush with the line's start, 0 centered, 0.5 flush with its end.
    start =
      (available - reach(count)) * (0.5 + wordOffset) - first.left * scale;
  } else {
    const period =
      words.length > 1 ? (words[1].left - first.left) * scale : reach(1);
    // The second word takes the line's starting point, so the first is
    // always a word back to fill in when the offset slides the run
    // forward, and sliding never swaps which repetition sits where.
    const anchor = words[Math.min(1, words.length - 1)];
    start = (wordOffset - shift) * period - anchor.left * scale;
    while (
      count < words.length &&
      start + words[count].left * scale < available
    ) {
      count++;
    }
  }

  const place = (p: Pt): Pt => {
    const x = xAtLength(table, start + p.x * scale);
    const slope = rule.slope(x);
    const norm = Math.hypot(1, slope);
    const v = p.y * scale;
    return toCanvas({ x: x - (slope * v) / norm, y: rule.y(x) + v / norm });
  };
  const fmt = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

  const parts: string[] = [];
  for (const word of words.slice(0, count)) {
    for (const stroke of word.strokes) {
      const bent = [place(stroke[0])];
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1];
        const b = stroke[i];
        const pieces = Math.ceil(
          (Math.hypot(b.x - a.x, b.y - a.y) * scale) / 1.5,
        );
        for (let k = 1; k <= pieces; k++) {
          const t = k / pieces;
          bent.push(
            place({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
          );
        }
      }
      for (const run of clipChain(bent, clip)) {
        parts.push(`M${run.map(fmt).join('L')}`);
      }
    }
  }
  return parts.join('');
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * An ink layer's frame: centered on the paper inside the border and
 * turned `rotationDeg` clockwise, with the rules running along its x
 * axis. The layer works in frame coordinates and maps to the canvas at
 * the end, so rotated rules and the words on them are laid out exactly
 * as unrotated ones.
 */
interface Frame {
  toCanvas: (p: Pt) => Pt;
  /** The paper's corners, in frame coordinates. */
  corners: Pt[];
  /** The x the frame's origin sits at on the canvas. */
  originX: number;
  /** Height of the paper's bounding box in the frame. */
  height: number;
}

function makeFrame(inner: Rect, rotationDeg: number): Frame {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    { x: inner.x, y: inner.y },
    { x: inner.x + inner.width, y: inner.y },
    { x: inner.x + inner.width, y: inner.y + inner.height },
    { x: inner.x, y: inner.y + inner.height },
  ].map(({ x, y }) => ({
    x: cos * (x - cx) + sin * (y - cy),
    y: -sin * (x - cx) + cos * (y - cy),
  }));
  const ys = corners.map((c) => c.y);
  return {
    toCanvas: (p) => ({
      x: cx + cos * p.x - sin * p.y,
      y: cy + sin * p.x + cos * p.y,
    }),
    corners,
    originX: cx,
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Where the frame's horizontal at `y` crosses the paper, or null. */
function chordAt(corners: Pt[], y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length];
    if (p.y === q.y) {
      if (p.y === y) {
        lo = Math.min(lo, p.x, q.x);
        hi = Math.max(hi, p.x, q.x);
      }
      return;
    }
    if ((p.y - y) * (q.y - y) > 0) return;
    const x = p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  });
  return lo <= hi ? [lo, hi] : null;
}

/**
 * The frame x-range a band of heights spans on the paper: 'union' is
 * everywhere any height in the band touches it (the reach a run of
 * words needs so the clipped ink fills to the border), 'intersection'
 * where every height does (where whole words sit wholly on the paper).
 * The paper is convex, so the band's ends and the corners inside it
 * are the only heights to check.
 */
function chordSpan(
  corners: Pt[],
  yTop: number,
  yBottom: number,
  mode: 'union' | 'intersection',
): [number, number] | null {
  const ys = [
    yTop,
    yBottom,
    ...corners.map((c) => c.y).filter((y) => y > yTop && y < yBottom),
  ];
  let lo = mode === 'union' ? Infinity : -Infinity;
  let hi = mode === 'union' ? -Infinity : Infinity;
  for (const y of ys) {
    const chord = chordAt(corners, y);
    if (!chord) {
      if (mode === 'intersection') return null;
      continue;
    }
    lo = mode === 'union' ? Math.min(lo, chord[0]) : Math.max(lo, chord[0]);
    hi = mode === 'union' ? Math.max(hi, chord[1]) : Math.min(hi, chord[1]);
  }
  return lo < hi ? [lo, hi] : null;
}

/** One ink group's settings, from its controls. */
interface InkSettings {
  id: string;
  color: string;
  text: string;
  layout: 'fit' | 'fill';
  showRules: boolean;
  lineCount: number;
  /** Gap between lines as a multiple of the spacing lineCount gives. */
  lineSpacing: number;
  /** Slide the lines across by this share of the line spacing. */
  lineOffset: number;
  /** Slide the words along their lines (see wordsAlongRule). */
  wordOffset: number;
  waveHeight: number;
  waves: number;
  letterSize: number;
  handSeed: number;
  rotationDeg: number;
}

/** A layer's rules and each Run On line's starting point in the word. */
interface RolledInk {
  frame: Frame;
  /** The spacing Lines gives, which the letters are sized from. */
  baseSpacing: number;
  /** The gap between rules: baseSpacing times Line Spacing. */
  lineSpacing: number;
  rules: Rule[];
  baseYs: number[];
  shifts: number[];
}

/** Share of a line's band above its rule: ascenders need more room. */
const RULE_DROP = 0.72;

/**
 * Roll a layer's waves. The spacing comes from Lines over the paper's
 * height, so a turned layer keeps the same ruling and adds lines to
 * cover the paper's rotated extent. Call this whether or not the layer
 * is shown, so toggling it never reshuffles the randomness that later
 * layers draw from.
 */
function rollInk(inner: Rect, settings: InkSettings): RolledInk {
  const frame = makeFrame(inner, settings.rotationDeg);
  const baseSpacing = inner.height / settings.lineCount;
  const lineSpacing = baseSpacing * settings.lineSpacing;
  const count = Math.max(1, Math.ceil(frame.height / lineSpacing - 1e-6));
  const top = -(count * lineSpacing) / 2;
  const offset = settings.lineOffset;
  const sharedK = (2 * Math.PI * settings.waves) / inner.width;
  const sharedPhase = random(0, Math.PI * 2);
  const roll = (baseY: number) =>
    makeRule(
      baseY,
      settings.waveHeight,
      sharedK,
      sharedPhase,
      sharedK * random(1.6, 2.6),
      random(0, Math.PI * 2),
      frame.originX,
    );
  const baseYs = Array.from(
    { length: count },
    (_, i) => top + lineSpacing * (i + RULE_DROP + offset),
  );
  const rules = baseYs.map(roll);
  const shifts = rules.map(() => random(0, 1));
  // An offset slides the ruling off one edge of the paper; one more
  // line fills the band it uncovers at the other. It rolls after the
  // rest, so the offset never reshuffles the other lines' waves.
  if (offset !== 0) {
    const baseY =
      offset > 0 ? baseYs[0] - lineSpacing : baseYs[count - 1] + lineSpacing;
    baseYs.push(baseY);
    rules.push(roll(baseY));
    shifts.push(random(0, 1));
  }
  return { frame, baseSpacing, lineSpacing, rules, baseYs, shifts };
}

/**
 * Draw a layer: its wavy rules and its word written over and over
 * along each, all clipped to the paper inside the border.
 *
 * Each line is one API call: the word repeated up to the API's limit,
 * so every repetition is written a little differently, and the request
 * doesn't change as the sliders move — only the words that fit are
 * drawn. The hand seed steps per line; a line that misses the paper
 * makes no call.
 */
function drawInk(
  svg: SVGSVGElement,
  inner: Rect,
  settings: InkSettings,
  rolled: RolledInk,
  penWidthPx: number,
): void {
  const { frame, baseSpacing, rules, baseYs, shifts } = rolled;
  const clip: Bounds = {
    minX: inner.x,
    minY: inner.y,
    maxX: inner.x + inner.width,
    maxY: inner.y + inner.height,
  };

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', settings.id);
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', settings.color);
  group.setAttribute('stroke-width', String(penWidthPx));
  group.setAttribute('stroke-linecap', 'round');
  group.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(group);
  const addPath = (d: string) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    group.appendChild(path);
  };

  if (settings.showRules) {
    const xs = frame.corners.map((c) => c.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const steps = Math.ceil((x1 - x0) / 2);
    for (const rule of rules) {
      const points = Array.from({ length: steps + 1 }, (_, k) => {
        const x = x0 + ((x1 - x0) * k) / steps;
        return frame.toCanvas({ x, y: rule.y(x) });
      });
      const fmt = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      const d = clipChain(points, clip)
        .map((run) => `M${run.map(fmt).join('L')}`)
        .join('');
      if (d) addPath(d);
    }
  }

  const word = settings.text
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TEXT_CHARS);
  if (!word) return;
  const wordCount = Math.max(
    1,
    Math.floor((MAX_TEXT_CHARS + 1) / (word.length + 1)),
  );
  const text = Array(wordCount).fill(word).join(' ');
  const xHeightPx = baseSpacing * settings.letterSize;
  const amplitude = settings.waveHeight;

  rules.forEach((rule, i) => {
    const baseY = baseYs[i];
    // Whole words keep a little way in from where the x-height band
    // meets the border; a run on line reaches as far as any of its
    // ink could touch the paper, so the clipped words fill to the edge.
    let span =
      settings.layout === 'fit'
        ? chordSpan(frame.corners, baseY - xHeightPx, baseY, 'intersection')
        : chordSpan(
            frame.corners,
            baseY - baseSpacing * RULE_DROP - amplitude,
            baseY + baseSpacing * (1 - RULE_DROP) + amplitude,
            'union',
          );
    if (span && settings.layout === 'fit') {
      span = [span[0] + xHeightPx, span[1] - xHeightPx];
    }
    if (!span || span[0] >= span[1]) return;
    const [x0, x1] = span;

    withCursive(svg, { text, seed: settings.handSeed + i }, (rendered) => {
      const words = lineWords(rendered, wordCount, word.split(' ').length);
      if (words.length === 0) return;
      const scale =
        xHeightPx / (rendered.x_height_mm ?? rendered.height_mm * 0.4);
      const d = wordsAlongRule(
        words,
        rule,
        x0,
        x1,
        scale,
        settings.layout,
        shifts[i],
        settings.wordOffset,
        clip,
        frame.toCanvas,
      );
      if (d) addPath(d);
    });
  });
}

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    showCalibration,
    borderMode,
    borderInset,
    seed,
    lineWidth,
    redInk,
    redText,
    redRotation,
    redLineOffset,
    redWordOffset,
    redLayout,
    redRules,
    redLineCount,
    redLineSpacing,
    redWaveHeight,
    redWaves,
    redLetterSize,
    redHandSeed,
    showBlueInk,
    blueInk,
    blueRotation,
    blueLineOffset,
    blueWordOffset,
    blueLayout,
    blueRules,
    blueLineCount,
    blueLineSpacing,
    blueWaveHeight,
    blueWaves,
    blueLetterSize,
    blueHandSeed,
  } = values;

  seedPRNG(seed.toString());
  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw } = createCanvas(canvasConfig);

  // Corner crosshairs for aligning the plotter pen with the paper.
  // Derived from the canvas size — any paper size, any unit.
  if (showCalibration) {
    drawCalibrationMarks(svg, canvasConfig);
  }

  // The paper inside the border, where the ruled lines run.
  const inset = borderMode === 'off' ? 0 : borderInset;
  const inner: Rect = {
    x: inset,
    y: inset,
    width: width - 2 * inset,
    height: height - 2 * inset,
  };
  // Pen Width is the plot pen's line on paper in mm, so the preview
  // shows real weight.
  const penWidthPx = lineWidth * MM_TO_PX;

  // --- Ink layers: wavy notebook rules, a word written along each ---
  const red: InkSettings = {
    id: 'red-ink',
    color: RED_INK,
    text: redText,
    layout: redLayout,
    showRules: redRules,
    lineCount: redLineCount,
    lineSpacing: redLineSpacing,
    lineOffset: redLineOffset,
    wordOffset: redWordOffset,
    waveHeight: redWaveHeight,
    waves: redWaves,
    letterSize: redLetterSize,
    handSeed: redHandSeed,
    rotationDeg: redRotation,
  };
  const blue: InkSettings = {
    id: 'blue-ink',
    color: BLUE_INK,
    text: blueInk,
    layout: blueLayout,
    showRules: blueRules,
    lineCount: blueLineCount,
    lineSpacing: blueLineSpacing,
    lineOffset: blueLineOffset,
    wordOffset: blueWordOffset,
    waveHeight: blueWaveHeight,
    waves: blueWaves,
    letterSize: blueLetterSize,
    handSeed: blueHandSeed,
    rotationDeg: blueRotation,
  };
  // Rolled whether shown or not. A layer's line count follows its
  // rotation, so each rolls from its own stream: turning red never
  // reshuffles blue's waves. Red keeps the main Seed's stream.
  const redRolled = rollInk(inner, red);
  seedPRNG(`${seed}-blue`);
  const blueRolled = rollInk(inner, blue);
  if (redInk) drawInk(svg, inner, red, redRolled, penWidthPx);
  if (showBlueInk) drawInk(svg, inner, blue, blueRolled, penWidthPx);

  // --- Randomness (@johnfmorton/generative-utils) ---
  // import { randomBias, randomSnap } from '@johnfmorton/generative-utils';
  // const clustered = randomBias(0, width, width / 2); // values cluster near the bias point
  // const stepped = randomSnap(0, 360, 15); // random angle snapped to 15° increments

  // --- Value mapping (@johnfmorton/generative-utils) ---
  // import { map, lerp, clamp } from '@johnfmorton/generative-utils';
  // const y = map(3, 0, 10, 0, height); // remap 0-10 → canvas height
  // const mid = lerp(0, width, 0.5); // interpolate between two values
  // const safe = clamp(y, 0, height); // keep a value in range

  // --- Splines & paths (@johnfmorton/generative-utils) ---
  // import { spline } from '@johnfmorton/generative-utils';
  // const pts = [
  //   { x: width * 0.2, y: height * 0.5 },
  //   { x: width * 0.5, y: height * 0.3 },
  //   { x: width * 0.8, y: height * 0.5 },
  // ];
  // const d = spline(pts, 1, false); // smooth curve through points
  // draw.path(d).fill('none').stroke('#000');

  // --- Shapes (@johnfmorton/generative-utils) ---
  // import { polygon, pointsToPath } from '@johnfmorton/generative-utils';
  // const hex = polygon({ sides: 6, radius: width * 0.2, cx: width / 2, cy: height / 2 });
  // const d = pointsToPath(hex); // also: star({ points, outerRadius, innerRadius })
  // draw.path(d).fill('none').stroke('#000');

  // --- Spatial sampling (@johnfmorton/generative-utils) ---
  // import { poissonDisc } from '@johnfmorton/generative-utils';
  // const points = poissonDisc({ width, height, radius: 40 }); // evenly-spread points
  // points.forEach((p) => draw.circle(4).cx(p.x).cy(p.y).fill('none').stroke('#000'));

  // --- Grids (@johnfmorton/generative-utils) ---
  // import { createNoiseGrid } from '@johnfmorton/generative-utils';
  // const grid = createNoiseGrid({ width, height, resolution: 12 });
  // grid.cells.forEach((cell) => { /* cell.x, cell.y, cell.noiseValue */ });
  // // also: createVoronoiDiagram({ width, height, points }), createQtGrid(...)

  // --- Vector math (@johnfmorton/generative-utils) ---
  // import { vec2 } from '@johnfmorton/generative-utils';
  // const v = vec2.fromAngle(Math.PI / 4, 100); // direction + magnitude
  // const w = vec2.add(v, vec2.create(10, 0)); // add, rotate, normalize, lerp, ...

  // --- Flow-field noise (simplex-noise) ---
  // import { createNoise2D } from 'simplex-noise';
  // import { createRandom } from '../src/random';
  // const noise2D = createNoise2D(createRandom(seed)); // seeded
  // const n = noise2D(width * 0.005, height * 0.005); // -1..1, sample per coordinate

  // --- Polygon clipping (polygon-clipping) ---
  // import polygonClipping from 'polygon-clipping';
  // const a: [number, number][][] = [[[0, 0], [width, 0], [width, height], [0, height]]];
  // const b: [number, number][][] = [[[50, 50], [width - 50, 50], [width / 2, height - 50]]];
  // const clipped = polygonClipping.intersection(a, b); // also union, difference, xor
  // // Great for occlusion culling and clipping hatch lines to shapes.

  // --- Curve math (bezier-js) ---
  // import { Bezier } from 'bezier-js';
  // const curve = new Bezier(0, height / 2, width / 2, 0, width, height / 2);
  // const points = curve.getLUT(50); // points along the curve
  // const offset = curve.offset(10); // parallel curve(s) for multi-pass strokes

  // Clip everything drawn so far to the safe area, so the pen physically
  // stays on the page. Calibration marks are exempt (they align to paper
  // corners), so this can come before or after them.
  if (borderMode !== 'off') {
    applyBorderMask(svg, canvasConfig, {
      inset: borderInset,
      drawBorder: borderMode === 'border',
    });
  }

  return svg;
}
