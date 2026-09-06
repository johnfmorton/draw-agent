/**
 * Snow Cursive Study 3
 *
 * Part three of a multi-part study: the postcard snowflake from study 2
 * stays centered, and the open paper around it fills with a field of
 * small line-drawn snowflakes. One arm is grown from the center — a
 * main stem that sprouts mirrored branch pairs, which sprout their own
 * pairs, and so on — and that one arm is then replicated around the
 * center point. In the lettering mode every line of the main flake's
 * skeleton is replaced by words from the WORDS list, set in Secondhand
 * Cursive. The field is laid out by a Voronoi tessellation of the free
 * area: seeded sites are scattered outside a clearance circle around
 * the main flake, relaxed toward their cell centroids (Lloyd's method)
 * so the cells even out, and one small flake is grown per cell, sized
 * to the circle that fits inside it. The main flake's keep-out zone —
 * its strokes swollen by the clearance, or a circle through its tips —
 * is pinned as a hole in the tessellation, so the field wraps around
 * the main flake instead of drifting into it, and the flakes bordering
 * the hole settle in until they sit right at the clearance. The
 * Background group sets the density (cell count), how regular the grid
 * is (relaxation passes), the clearance and its shape, and how much of
 * its cell each flake fills.
 */

/* Secondhand Cursive lettering: the API token lives in .env.local
   (VITE_SECONDHAND_CURSIVE_TOKEN). See docs/secondhand-cursive-api.md
   for the API and src/secondhand-cursive.ts for the helper. */
import type {
  ControlSchema,
  InferValues,
  CanvasConfig,
} from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import {
  vec2,
  lerp,
  clamp,
  createVoronoiDiagram,
} from '@johnfmorton/generative-utils';
import type { Vec2, VoronoiCell } from '@johnfmorton/generative-utils';
import { createRandom } from '../src/random';
import { createSegmentIndex } from '../src/segment-index';
import { createCanvas } from '../src/svg-utils';
import { drawCalibrationMarks } from '../src/calibration';
import { applyBorderMask } from '../src/border-mask';
import {
  cursiveGroup,
  fetchCursive,
  MM_TO_PX,
  xHeightCenterMm,
} from '../src/secondhand-cursive';
import type {
  CursiveOptions,
  CursiveResponse,
} from '../src/secondhand-cursive';

export const meta = {
  title: 'Snow Cursive Study 3',
  description:
    'A 6 × 4 in postcard snowflake written in cursive, in a Voronoi field of small snowflakes',
};

export const canvas: CanvasConfig = {
  width: 6,
  height: 4,
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
    description:
      'Drives the branch jitter and which lettering variant lands on each segment',
    default: 1083648302,
  },
  {
    type: 'slider',
    id: 'arms',
    label: 'Arms',
    group: 'Snowflake',
    description: 'How many copies of the arm are placed around the center',
    min: 3,
    max: 12,
    step: 1,
    default: 6,
  },
  {
    type: 'slider',
    id: 'armLength',
    label: 'Arm Length',
    group: 'Snowflake',
    description:
      'Length of the main stem as a fraction of half the shorter canvas side',
    min: 0.1,
    max: 1,
    step: 0.01,
    default: 0.8,
  },
  {
    type: 'slider',
    id: 'branchLevels',
    label: 'Branch Levels',
    group: 'Snowflake',
    description:
      'How many times the arm branches: 0 is a bare stem, 1 adds side branches, 2 gives those branches their own, and so on. Depth × count grows fast',
    min: 0,
    max: 3,
    step: 1,
    default: 2,
  },
  {
    type: 'slider',
    id: 'branchCount',
    label: 'Branches per Level',
    group: 'Snowflake',
    description:
      'Number of mirrored branch pairs that sprout from each stem or branch',
    min: 1,
    max: 6,
    step: 1,
    default: 3,
  },
  {
    type: 'slider',
    id: 'branchAngle',
    label: 'Branch Angle',
    group: 'Snowflake',
    description:
      'Angle between a branch and its parent, in degrees. 60° with 6 arms keeps every branch parallel to a neighboring arm, the classic hexagonal look',
    min: 15,
    max: 90,
    step: 1,
    default: 60,
  },
  {
    type: 'slider',
    id: 'branchScale',
    label: 'Branch Scale',
    group: 'Snowflake',
    description: 'Length of a branch as a fraction of the stem it grows from',
    min: 0.15,
    max: 0.8,
    step: 0.01,
    default: 0.45,
  },
  {
    type: 'slider',
    id: 'branchStart',
    label: 'Branch Start',
    group: 'Snowflake',
    description:
      'Where along the parent the first branch pair sits, as a fraction of its length. The last pair always sits near the tip',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    default: 0.3,
  },
  {
    type: 'slider',
    id: 'taper',
    label: 'Branch Taper',
    group: 'Snowflake',
    description:
      'How much shorter the outermost branch pair is than the innermost. 0 keeps them equal; 1 shrinks the last pair to nothing',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
  },
  {
    type: 'slider',
    id: 'jitter',
    label: 'Jitter',
    group: 'Snowflake',
    description:
      'Seeded variation in branch length, angle, and position. Both sides of a pair share the same jitter, so each arm stays a mirror of itself',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
  },
  {
    type: 'dropdown',
    id: 'renderMode',
    label: 'Render',
    group: 'Lettering',
    description:
      'Lines draws the plain skeleton; Words replaces every segment with cursive words from the WORDS list; Both overlays the two',
    options: [
      { value: 'lines', label: 'Lines' },
      { value: 'words', label: 'Words' },
      { value: 'both', label: 'Lines + words' },
    ],
    default: 'words',
  },
  {
    type: 'slider',
    id: 'wordLength',
    label: 'Word Length',
    group: 'Lettering',
    description:
      'Target word length as a fraction of the arm: the slot size with equal slots, or the average word length when sizing per word. Shorter means more words per branch; branches too short for a word stay bare',
    min: 0.04,
    max: 0.5,
    step: 0.01,
    default: 0.25,
  },
  {
    type: 'toggle',
    id: 'sizePerWord',
    label: 'Size Slots per Word',
    group: 'Lettering',
    description:
      'On: every word is set at one letter size and packed along the branch by its own width, so phrases run longer than single words. Off: each branch is cut into equal slots and every word is squeezed to fit its slot',
    default: true,
  },
  {
    type: 'toggle',
    id: 'insetBranches',
    label: 'Inset Branch Words',
    group: 'Lettering',
    description:
      "Start each branch's lettering far enough from its parent that the first word's x-height band clears the parent's, worked out from the letter size and the branch angle (ascenders and descenders can still touch). Off lets branch words run from the junction and overlap the parent",
    default: true,
  },
  {
    type: 'slider',
    id: 'wordVariants',
    label: 'Word Variants',
    group: 'Lettering',
    description:
      'How many distinct handwritten renders to scatter across the segments, cycling through the WORDS list so each word gets an even share. Each is one API call per Lettering Seed (60/min limit), reused everywhere it appears',
    min: 1,
    max: 40,
    step: 1,
    default: 24,
  },
  {
    type: 'seed',
    id: 'letteringSeed',
    label: 'Lettering Seed',
    group: 'Lettering',
    description:
      'Rolls a fresh set of handwritten variants. Only this seed triggers API calls, so the main Seed can re-roll the geometry and the word placement for free',
    default: 4126,
  },
  {
    type: 'slider',
    id: 'penWidth',
    label: 'Pen Width',
    group: 'Lettering',
    description:
      'Stroke width for lines and lettering, in mm on paper (0.3 is the standard plot pen)',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.3,
  },
  {
    type: 'seed',
    id: 'fieldSeed',
    label: 'Field Seed',
    group: 'Background',
    description:
      'Rolls the background field alone: where the cells land, which way each small flake turns, and its branch jitter. The main Seed leaves the field untouched',
    default: 7,
  },
  {
    type: 'slider',
    id: 'fieldCount',
    label: 'Cells',
    group: 'Background',
    description:
      'How many Voronoi cells, and so how many small flakes, fill the space around the main snowflake: the density of the field. 0 turns the background off',
    min: 0,
    max: 300,
    step: 1,
    default: 60,
  },
  {
    type: 'slider',
    id: 'fieldRelax',
    label: 'Relaxation',
    group: 'Background',
    description:
      "Lloyd relaxation passes. Each moves every cell's site to the centroid of its cell, so 0 is a raw scatter with wildly mixed cell sizes and higher values settle into an even, honeycomb-like grid",
    min: 0,
    max: 12,
    step: 1,
    default: 4,
  },
  {
    type: 'dropdown',
    id: 'fieldShape',
    label: 'Clearance Shape',
    group: 'Background',
    description:
      "What the field keeps clear of. Outline hugs the main snowflake's actual strokes, so small flakes settle into the valleys between its arms; Circle keeps a round halo out to its farthest tips",
    options: [
      { value: 'outline', label: 'Outline' },
      { value: 'circle', label: 'Circle' },
    ],
    default: 'outline',
  },
  {
    type: 'slider',
    id: 'fieldClearance',
    label: 'Clearance',
    group: 'Background',
    description:
      "Least distance, in px, between the field's ink and the main snowflake's strokes (Outline) or the circle through its tips (Circle). The flakes bordering the main flake settle in until they sit exactly this far away. In the Words render the lettering reaches a little past the strokes, so keep some room",
    min: 0,
    max: 96,
    step: 1,
    default: 16,
  },
  {
    type: 'slider',
    id: 'fieldFill',
    label: 'Flake Fill',
    group: 'Background',
    description:
      'Size of each small flake as a fraction of the largest circle that fits in its cell: 1 lets neighbors nearly touch, lower values leave more paper between them',
    min: 0.3,
    max: 1,
    step: 0.01,
    default: 0.8,
  },
  {
    type: 'slider',
    id: 'fieldLevels',
    label: 'Branch Levels',
    group: 'Background',
    description:
      "Branch levels for the small flakes, which are too small to carry the main flake's depth. They share the rest of the Snowflake settings (branches per level, angle, scale, start, taper, jitter), so the field reads as the main flake's family",
    min: 0,
    max: 2,
    step: 1,
    default: 1,
  },
  {
    type: 'toggle',
    id: 'fieldRotate',
    label: 'Random Rotation',
    group: 'Background',
    description:
      'Turn each small flake by a seeded random angle; off keeps every flake aligned with the main one',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showCells',
    label: 'Show Cells',
    group: 'Background',
    description:
      'Plot the Voronoi cell edges too, each shared edge once and the edges along the border left out. Handy for tuning the density, or as a frost-like pattern in its own right',
    default: false,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

/**
 * The words written along the branches. The variant pool cycles through
 * this list, so 24 variants over three words gives each word eight
 * different hands. With Size Slots per Word on, every entry is set at
 * one letter size and a phrase simply runs longer along its branch; off,
 * each is squeezed into an equal slot.
 */
const WORDS = [
  'happy',
  'new',
  'year',
  'peace',
  ' from john & andrew',
  '2027',
  'friends',
];
const DEG = Math.PI / 180;
/** x-height every hand is requested at, in mm; the layout scales from there. */
const X_HEIGHT_MM = 4;
/** Fraction of each word slot the ink spans; the rest is the gap to the next word. */
const WORD_FILL = 0.88;
/** Words narrower than this (4 mm on paper) are illegible with a plot pen. */
const MIN_WORD_PX = 4 * MM_TO_PX;
/** Stop branching once the next generation would be shorter than this. */
const MIN_SEGMENT_PX = 2;
/** Branch pairs sit between branchStart and this fraction of their parent. */
const BRANCH_END = 0.85;
/** Safety valve for extreme depth × count × arms settings. */
const MAX_WORDS = 3000;
/** Field flakes with a radius under this (2 mm on paper) are dropped. */
const MIN_FLAKE_PX = 2 * MM_TO_PX;
/** Pinned sites filling the clearance circle are never packed closer than this, in px. */
const MIN_PIN_SPACING = 8;
/** Grid cell range of the stroke index behind the Outline zone's distance queries, in px. */
const HOLE_INDEX_CELL_PX = { min: 4, max: 24 };
/** Attempts per site when scattering the field outside the clearance circle. */
const SCATTER_ATTEMPTS = 40;

/** One line of the skeleton: a stem or a branch, pointing outward. */
interface Segment {
  from: Vec2;
  to: Vec2;
  /** Direction in radians, screen coordinates (y down). */
  angle: number;
  length: number;
  /** Angle to the parent in radians; null for the stem. */
  spread: number | null;
}

/** One arm, grown along +x from the origin. */
interface Arm {
  segments: Segment[];
  /** Pen strokes: the stem, then each branch pair as a single V. */
  strokes: Vec2[][];
}

interface GrowthRules {
  seed: number;
  branchLevels: number;
  branchCount: number;
  /** Radians. */
  branchAngle: number;
  branchScale: number;
  branchStart: number;
  taper: number;
  jitter: number;
}

/**
 * Grow one arm. Jitter is keyed by each branch pair's position in the
 * tree (its index path from the stem) rather than drawn in sequence,
 * so the left and right members of a pair — and everything that grows
 * from them — get identical values and each branch mirrors its twin.
 */
function growArm(length: number, rules: GrowthRules): Arm {
  const arm: Arm = { segments: [], strokes: [] };

  const grow = (
    from: Vec2,
    angle: number,
    len: number,
    level: number,
    path: number,
    spread: number | null,
  ): Vec2 => {
    const to = vec2.add(from, vec2.fromAngle(angle, len));
    arm.segments.push({ from, to, angle, length: len, spread });
    if (level >= rules.branchLevels) return to;

    const count = rules.branchCount;
    const zone = BRANCH_END - rules.branchStart;
    const spacing = count === 1 ? zone : zone / (count - 1);
    for (let i = 0; i < count; i++) {
      // Base-8 index path: unique per pair, shared by both of its sides.
      const pairPath = path * 8 + i + 1;
      const rand = createRandom(rules.seed ^ Math.imul(pairPath, 0x9e3779b1));
      const lengthJitter = (rand() * 2 - 1) * rules.jitter;
      const angleJitter = (rand() * 2 - 1) * rules.jitter;
      const positionJitter = (rand() * 2 - 1) * rules.jitter;

      const u = count === 1 ? 0.5 : i / (count - 1);
      const t = clamp(
        lerp(rules.branchStart, BRANCH_END, u) + positionJitter * spacing * 0.4,
        0.02,
        0.98,
      );
      const childLength =
        len *
        rules.branchScale *
        (1 - rules.taper * u) *
        (1 + lengthJitter * 0.5);
      if (childLength < MIN_SEGMENT_PX) continue;

      const junction = vec2.add(from, vec2.fromAngle(angle, len * t));
      const spread = rules.branchAngle + angleJitter * 20 * DEG;
      const left = grow(
        junction,
        angle - spread,
        childLength,
        level + 1,
        pairPath,
        spread,
      );
      const right = grow(
        junction,
        angle + spread,
        childLength,
        level + 1,
        pairPath,
        spread,
      );
      arm.strokes.push([left, junction, right]);
    }
    return to;
  };

  const origin = { x: 0, y: 0 };
  const tip = grow(origin, 0, length, 0, 0, null);
  arm.strokes.unshift([origin, tip]);
  return arm;
}

/** Farthest any point of an arm reaches from its origin. */
function armExtent(arm: Arm): number {
  let extent = 0;
  for (const seg of arm.segments) {
    extent = Math.max(extent, vec2.magnitude(seg.to));
  }
  return extent;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Path data for a set of strokes, each point mapped through `place`. */
function strokesToPath(strokes: Vec2[][], place: (p: Vec2) => Vec2): string {
  return strokes
    .map((stroke) =>
      stroke
        .map((p, i) => {
          const q = place(p);
          return `${i === 0 ? 'M' : 'L'}${fmt(q.x)} ${fmt(q.y)}`;
        })
        .join(' '),
    )
    .join(' ');
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One free cell of the field, in canvas coordinates. */
interface FieldCell {
  polygon: Vec2[];
  /** The cell's site, where its flake is centered. */
  center: Vec2;
  /** Flake radius: clear of its neighbors, the bounds, and the hole. */
  radius: number;
}

/**
 * The keep-out zone around the main snowflake: a circle through its
 * tips, or its strokes swollen by the clearance.
 */
interface Hole {
  /** Distance from `p` to the zone's edge, negative inside it. */
  distance: (p: Vec2) => number;
  /**
   * Whether `p` is within `d` of the zone's edge (distance ≤ d),
   * answered without measuring the exact distance where that is cheaper.
   */
  within: (p: Vec2, d: number) => boolean;
  /**
   * Points about `step` apart along the curve `offset` outside the
   * zone's edge (inside it when negative, but never past the strokes).
   */
  edge: (step: number, offset: number) => Vec2[];
}

function circleHole(center: Vec2, radius: number): Hole {
  return {
    distance: (p) => vec2.distance(p, center) - radius,
    within: (p, d) => vec2.distance(p, center) - radius <= d,
    edge: (step, offset) => {
      const r = Math.max(0, radius + offset);
      const n = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
      return Array.from({ length: n }, (_, k) =>
        vec2.add(center, vec2.fromAngle((k * 2 * Math.PI) / n, r)),
      );
    },
  };
}

/**
 * Every stroke of the main flake, swollen by `clearance` on all sides.
 * Distance queries go through a grid index over the strokes, so a
 * bristly flake with thousands of them (deep branch levels, many arms)
 * costs about the same per query as a plain one; scanning every stroke
 * for every sample made the field quadratic in the stroke count.
 */
function outlineHole(segments: [Vec2, Vec2][], clearance: number): Hole {
  // Cell size follows the stroke density — about two strokes' worth of
  // area per cell — so dense bristles don't pile dozens of strokes into
  // one cell, while a plain flake keeps cells coarse and far queries cheap.
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
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  const cell = clamp(
    2 * Math.sqrt(area / Math.max(1, segments.length)),
    HOLE_INDEX_CELL_PX.min,
    HOLE_INDEX_CELL_PX.max,
  );
  const index = createSegmentIndex(segments, cell);
  return {
    distance: (p) => index.distance(p) - clearance,
    within: (p, d) => index.within(p, d + clearance),
    edge: (step, offset) => {
      const swell = Math.max(0, clearance + offset);
      const points: Vec2[] = [];
      for (const [a, b] of segments) {
        const len = vec2.distance(a, b);
        const u =
          len > 0 ? vec2.divide(vec2.subtract(b, a), len) : { x: 1, y: 0 };
        const n = vec2.multiply(vec2.perpendicular(u), swell);
        // Both long sides, then a semicircular cap around each end.
        const along = Math.max(1, Math.ceil(len / step));
        for (let i = 0; i <= along; i++) {
          const q = vec2.add(a, vec2.multiply(u, (len * i) / along));
          points.push(vec2.add(q, n));
          if (swell > 0) points.push(vec2.subtract(q, n));
        }
        if (swell > 0) {
          const arc = Math.max(2, Math.ceil((Math.PI * swell) / step));
          const heading = Math.atan2(u.y, u.x);
          for (let i = 1; i < arc; i++) {
            const t = (Math.PI * i) / arc;
            points.push(
              vec2.add(b, vec2.fromAngle(heading - Math.PI / 2 + t, swell)),
            );
            points.push(
              vec2.add(a, vec2.fromAngle(heading + Math.PI / 2 + t, swell)),
            );
          }
        }
      }
      return points;
    },
  };
}

/**
 * Voronoi tessellation of `bounds` with a hole for the main snowflake.
 * Up to `count` free sites are dart-thrown outside the hole, and
 * pinned sites filling the hole stand in for the main flake. Each
 * relaxation pass moves every free site to the centroid of its cell
 * (Lloyd's method) while the pinned sites stay put, so the cells even
 * out and wrap around the hole instead of drifting into it. Every free
 * site then gets the largest flake that clears its nearest neighbor,
 * the bounds, and the hole, and the sites whose cells border the hole
 * settle in until their flakes touch its edge. Returns the free cells.
 */
function tessellateField(
  bounds: Rect,
  hole: Hole,
  count: number,
  relax: number,
  fill: number,
  rand: () => number,
): FieldCell[] {
  // Every site has to sit strictly inside the bounds: a site on or past
  // the clip rectangle gets no cell, which would shift the cell indices.
  const pad = 1;
  if (bounds.width <= 2 * pad || bounds.height <= 2 * pad) return [];
  const inside = (p: Vec2): Vec2 => ({
    x: clamp(p.x, bounds.x + pad, bounds.x + bounds.width - pad),
    y: clamp(p.y, bounds.y + pad, bounds.y + bounds.height - pad),
  });
  const toBounds = (p: Vec2): number =>
    Math.min(
      p.x - bounds.x,
      bounds.x + bounds.width - p.x,
      p.y - bounds.y,
      bounds.y + bounds.height - p.y,
    );

  // Candidate sites, uniform over the bounds. The share of them with
  // room for even the smallest flake estimates the usable area, and so
  // the spacing the field will settle at for this count.
  const pool = Math.max(1000, count * SCATTER_ATTEMPTS);
  const candidates = Array.from({ length: pool }, () => ({
    x: bounds.x + pad + rand() * (bounds.width - 2 * pad),
    y: bounds.y + pad + rand() * (bounds.height - 2 * pad),
  }));
  const usable = candidates.filter((p) => !hole.within(p, MIN_FLAKE_PX));
  if (usable.length === 0) return [];
  const freeArea = (bounds.width * bounds.height * usable.length) / pool;
  const spacing = Math.sqrt(freeArea / count);

  // Dart-throw the sites from the usable candidates so no two start
  // closer than a share of that spacing. A plain scatter would trap a
  // random number of sites in each pocket between the main flake's
  // arms, and relaxation cannot move a site past the pinned sites to
  // even that out, so pockets ended up crowded with sites too close
  // together to hold a legible flake. If the count comes up short, the
  // bar drops until it is met or the field is full.
  const free: Vec2[] = [];
  for (
    let minDist = spacing * 0.7;
    free.length < count && minDist >= MIN_FLAKE_PX;
    minDist *= 0.7
  ) {
    for (const p of usable) {
      if (free.length >= count) break;
      if (free.every((q) => vec2.distance(p, q) >= minDist)) free.push(p);
    }
  }
  if (free.length === 0) return [];

  // The main flake's stand-in: pinned sites along the hole's edge and on
  // a grid filling its inside, spaced about half as far apart as the
  // free sites. A bare edge is not enough — a free site sitting in the
  // gap between two edge sites sees a sliver of the empty interior, its
  // centroid slips inside, and relaxation drags it to the middle — but
  // with the hole filled there is no interior to capture. The edge sites
  // sit half a pin spacing inside the zone (never past the strokes), so
  // the free cells' inner edge, the bisector, lands about at the zone's
  // own edge instead of half a cell outside it. They are clamped onto
  // the bounds where the hole runs off the paper so its edge stays
  // sealed; edge sites buried inside the hole (where swollen strokes
  // overlap) are dead weight and skipped.
  const pinSpacing = Math.max(MIN_PIN_SPACING, spacing / 2);
  const offset = -pinSpacing / 2;
  // Pins closer together than half the pin spacing add nothing, so
  // samples are deduplicated on a lattice that fine: a bristly flake's
  // strokes otherwise yield tens of thousands of near-coincident pins,
  // and every relaxation pass would tessellate them all.
  const lattice = pinSpacing / 2;
  const pinned: Vec2[] = [];
  const taken = new Set<string>();
  const pin = (p: Vec2) => {
    const key = `${Math.round(p.x / lattice)},${Math.round(p.y / lattice)}`;
    if (taken.has(key)) return;
    taken.add(key);
    pinned.push(p);
  };
  for (const p of hole.edge(pinSpacing / 2, offset)) {
    if (!hole.within(p, offset - pinSpacing / 4)) pin(inside(p));
  }
  const right = bounds.x + bounds.width - pad;
  const bottom = bounds.y + bounds.height - pad;
  for (let x = bounds.x + pinSpacing; x < right; x += pinSpacing) {
    for (let y = bounds.y + pinSpacing; y < bottom; y += pinSpacing) {
      if (hole.within({ x, y }, offset)) pin({ x, y });
    }
  }

  const toLocal = (p: Vec2): Vec2 => ({ x: p.x - bounds.x, y: p.y - bounds.y });
  const toCanvas = (p: Vec2): Vec2 => ({
    x: p.x + bounds.x,
    y: p.y + bounds.y,
  });
  const tessellate = (sites: Vec2[]): VoronoiCell[] | null => {
    const { cells } = createVoronoiDiagram({
      width: bounds.width,
      height: bounds.height,
      points: [...sites, ...pinned].map(toLocal),
      relaxIterations: 0,
    });
    if (cells.length === sites.length + pinned.length) return cells;
    console.warn(
      `${meta.title}: the Voronoi diagram dropped a cell; skipping the background field`,
    );
    return null;
  };

  let sites = free;
  for (let pass = 0; pass < relax; pass++) {
    const cells = tessellate(sites);
    if (!cells) return [];
    sites = cells
      .slice(0, sites.length)
      .map((cell) => inside(toCanvas(cell.centroid)));
  }

  // The largest flake at each site that clears its nearest free neighbor
  // and the bounds, scaled by `fill`, and the hole exactly.
  const radii = (): number[] =>
    sites.map((s, i) => {
      let r = toBounds(s);
      for (let j = 0; j < sites.length; j++) {
        if (j !== i) r = Math.min(r, vec2.distance(s, sites[j]) / 2);
      }
      return Math.min(r * fill, hole.distance(s));
    });

  // Settle the sites bordering the hole: each moves straight toward the
  // hole (down the distance gradient) until its flake touches the edge,
  // backing off when a straight move would cut into it around a corner.
  // The check is a hair lenient because the final radii below are cut
  // to the hole exactly, and a full move lands right on the boundary.
  const borderCells = tessellate(sites);
  if (!borderCells) return [];
  const pinnedCells = new Set(borderCells.slice(sites.length));
  const before = radii();
  sites = sites.map((s, i) => {
    const r = before[i];
    const slack = hole.distance(s) - r;
    if (r <= 0 || slack <= 0) return s;
    if (!borderCells[i].neighbors.some((n) => pinnedCells.has(n))) return s;
    const eps = 0.5;
    const gx =
      hole.distance({ x: s.x + eps, y: s.y }) -
      hole.distance({ x: s.x - eps, y: s.y });
    const gy =
      hole.distance({ x: s.x, y: s.y + eps }) -
      hole.distance({ x: s.x, y: s.y - eps });
    const g = Math.hypot(gx, gy);
    if (g === 0) return s;
    const toward = { x: -gx / g, y: -gy / g };
    for (let step = slack; step > 0.5; step /= 2) {
      const q = inside(vec2.add(s, vec2.multiply(toward, step)));
      if (hole.distance(q) >= r - 0.01) return q;
    }
    return s;
  });

  const finalCells = tessellate(sites);
  if (!finalCells) return [];
  const after = radii();
  return sites.map((s, i) => ({
    polygon: finalCells[i].points.map(([x, y]) => toCanvas({ x, y })),
    center: s,
    radius: after[i],
  }));
}

/**
 * Every edge of the field's cells once, in canvas coordinates: shared
 * edges are deduplicated, and edges lying along the bounds are left
 * out (the border, when drawn, already covers them).
 */
function cellEdges(cells: FieldCell[], bounds: Rect): [Vec2, Vec2][] {
  const eps = 0.01;
  const key = (p: Vec2) => `${Math.round(p.x / eps)},${Math.round(p.y / eps)}`;
  const sides = [
    (p: Vec2) => Math.abs(p.x - bounds.x) < eps,
    (p: Vec2) => Math.abs(p.x - (bounds.x + bounds.width)) < eps,
    (p: Vec2) => Math.abs(p.y - bounds.y) < eps,
    (p: Vec2) => Math.abs(p.y - (bounds.y + bounds.height)) < eps,
  ];
  const seen = new Set<string>();
  const edges: [Vec2, Vec2][] = [];
  for (const { polygon } of cells) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const ka = key(a);
      const kb = key(b);
      // Closed rings repeat their first point; that edge is empty.
      if (ka === kb || sides.some((on) => on(a) && on(b))) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([a, b]);
    }
  }
  return edges;
}

/**
 * Start each branch's lettering far enough along the branch that the
 * first word's x-height band clears its parent's. The band is bandH
 * tall and the branch leaves the parent at `spread`, so the band corner
 * nearest the parent sits d·sin(spread) − (bandH / 2)·|cos(spread)| from
 * the parent line; clearing bandH / 2 needs d ≥ (bandH / 2)(1 + |cos|)
 * / sin. Ascenders and descenders can still touch — this is meant as a
 * small inset. Branches shorter than their inset are left bare; the
 * stem has no parent and is untouched.
 */
function insetFromParent(segments: Segment[], bandH: number): Segment[] {
  return segments.flatMap((seg) => {
    if (seg.spread === null) return [seg];
    const a = clamp(Math.abs(seg.spread), 5 * DEG, 175 * DEG);
    const inset = ((bandH / 2) * (1 + Math.abs(Math.cos(a)))) / Math.sin(a);
    const length = seg.length - inset;
    if (length <= 0) return [];
    return [
      {
        ...seg,
        from: vec2.add(seg.from, vec2.fromAngle(seg.angle, inset)),
        length,
      },
    ];
  });
}

/** One word on the unrotated arm: ink box centered on the segment line. */
interface WordSlot {
  center: Vec2;
  widthPx: number;
  /** Radians, same convention as Segment.angle. */
  angle: number;
  /** Index into the pool of rendered hands. */
  hand: number;
}

/**
 * Equal slots: divide each segment into as many slots as fit the
 * target length, rounding so slots land between two-thirds and
 * one-and-a-third of the target, and squeeze whatever hand is picked
 * into its slot. Slots too narrow for a legible word are dropped.
 */
function layoutSlots(
  segments: Segment[],
  targetPx: number,
  hands: number,
  pick: () => number,
): WordSlot[] {
  const slots: WordSlot[] = [];
  for (const seg of segments) {
    const count = Math.max(1, Math.round(seg.length / targetPx));
    const slot = seg.length / count;
    const widthPx = slot * WORD_FILL;
    if (widthPx < MIN_WORD_PX) continue;
    for (let j = 0; j < count; j++) {
      slots.push({
        center: vec2.add(seg.from, vec2.fromAngle(seg.angle, (j + 0.5) * slot)),
        widthPx,
        angle: seg.angle,
        hand: Math.floor(pick() * hands),
      });
    }
  }
  return slots;
}

/**
 * Sized per word: pack hands along each segment at one letter size,
 * each taking its own rendered width. Hands are picked at random; when
 * the pick would overrun the tip, the next hand in the pool that still
 * fits is used instead. The run is centered on the segment, and a
 * segment too short for even the narrowest hand stays bare.
 */
function layoutPacked(
  segments: Segment[],
  widths: number[],
  gapPx: number,
  pick: () => number,
): WordSlot[] {
  const slots: WordSlot[] = [];
  const narrowest = Math.min(...widths);
  for (const seg of segments) {
    const run: number[] = [];
    let used = 0;
    for (;;) {
      const room = seg.length - used - (run.length > 0 ? gapPx : 0);
      if (room < narrowest) break;
      let hand = Math.floor(pick() * widths.length);
      for (let k = 0; k < widths.length && widths[hand] > room; k++) {
        hand = (hand + 1) % widths.length;
      }
      run.push(hand);
      used += (run.length > 1 ? gapPx : 0) + widths[hand];
    }
    let cursor = (seg.length - used) / 2;
    for (const hand of run) {
      const w = widths[hand];
      slots.push({
        center: vec2.add(seg.from, vec2.fromAngle(seg.angle, cursor + w / 2)),
        widthPx: w,
        angle: seg.angle,
        hand,
      });
      cursor += w + gapPx;
    }
  }
  return slots;
}

/**
 * Fetch every hand in the pool, then pass the ones that rendered to
 * `layout`: synchronously when all are cached, otherwise once the
 * fetches settle (skipped if the preview has moved on). A hand that
 * fails to render is left out rather than blocking the rest.
 */
function withHands(
  svg: SVGSVGElement,
  requests: CursiveOptions[],
  layout: (hands: CursiveResponse[]) => void,
): void {
  const results = requests.map((request) => fetchCursive(request));
  if (results.every((r) => !(r instanceof Promise))) {
    layout(results as CursiveResponse[]);
    return;
  }
  void Promise.allSettled(results).then((settled) => {
    if (!svg.isConnected) return;
    const hands = settled.flatMap((s) =>
      s.status === 'fulfilled' ? [s.value] : [],
    );
    if (hands.length < settled.length) {
      console.warn(
        `${meta.title}: ${settled.length - hands.length} of ${settled.length} hands failed to render; laying out with the rest`,
      );
    }
    layout(hands);
  });
}

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    showCalibration,
    borderMode,
    borderInset,
    seed,
    arms,
    armLength,
    branchLevels,
    branchCount,
    branchAngle,
    branchScale,
    branchStart,
    taper,
    jitter,
    renderMode,
    wordLength,
    sizePerWord,
    insetBranches,
    wordVariants,
    letteringSeed,
    penWidth,
    fieldSeed,
    fieldCount,
    fieldRelax,
    fieldShape,
    fieldClearance,
    fieldFill,
    fieldLevels,
    fieldRotate,
    showCells,
  } = values;

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw } = createCanvas(canvasConfig);

  // Corner crosshairs for aligning the plotter pen with the paper.
  if (showCalibration) {
    drawCalibrationMarks(svg, canvasConfig);
  } else {
    const center: Vec2 = { x: width / 2, y: height / 2 };
    const radius = (armLength * Math.min(width, height)) / 2;
    const penPx = penWidth * MM_TO_PX;
    const inked = () =>
      draw.group().fill('none').stroke({
        color: '#000',
        width: penPx,
        linecap: 'round',
        linejoin: 'round',
      });

    // Grow the one arm, along +x from the origin.
    const rules: GrowthRules = {
      seed,
      branchLevels,
      branchCount,
      branchAngle: branchAngle * DEG,
      branchScale,
      branchStart,
      taper,
      jitter,
    };
    const arm = growArm(radius, rules);

    // Replicate it: arm 0 points straight up, the rest follow clockwise.
    const armAngles = Array.from(
      { length: arms },
      (_, k) => -90 * DEG + (k * 2 * Math.PI) / arms,
    );
    const place = (p: Vec2, armAngle: number): Vec2 =>
      vec2.add(center, vec2.rotate(p, armAngle));

    // The field: Voronoi cells fill the paper around the main flake, one
    // line-drawn flake per cell, sized to clear its neighbors and the main
    // flake. Drawn first so the main flake sits on top.
    if (fieldCount > 0) {
      const bounds: Rect =
        borderMode === 'off'
          ? { x: 0, y: 0, width, height }
          : {
              x: borderInset,
              y: borderInset,
              width: width - 2 * borderInset,
              height: height - 2 * borderInset,
            };
      // The keep-out zone stands in for the main flake: its strokes on the
      // canvas swollen by the clearance, or a circle through its tips.
      const mainSegments = armAngles.flatMap((armAngle) =>
        arm.segments.map((s): [Vec2, Vec2] => [
          place(s.from, armAngle),
          place(s.to, armAngle),
        ]),
      );
      const hole =
        fieldShape === 'circle'
          ? circleHole(center, armExtent(arm) + fieldClearance)
          : outlineHole(mainSegments, fieldClearance);
      const cells = tessellateField(
        bounds,
        hole,
        fieldCount,
        fieldRelax,
        fieldFill,
        createRandom(fieldSeed),
      );

      if (showCells && cells.length > 0) {
        const d = cellEdges(cells, bounds)
          .map(([a, b]) => `M${fmt(a.x)} ${fmt(a.y)} L${fmt(b.x)} ${fmt(b.y)}`)
          .join(' ');
        inked().path(d);
      }

      const field = inked();
      cells.forEach((cell, i) => {
        const flakeRadius = cell.radius;
        if (flakeRadius < MIN_FLAKE_PX) return;
        // Each flake rolls its own jitter and turn from the field seed and
        // its cell index, so neighbors differ but the field stays put.
        const local = createRandom(fieldSeed ^ Math.imul(i + 1, 0x85ebca6b));
        const flake = growArm(flakeRadius, {
          ...rules,
          seed: Math.floor(local() * 2_147_483_647),
          branchLevels: fieldLevels,
        });
        // Branches reach past the stem tip, so scale the whole flake down
        // until its farthest tip sits on the cell's circle.
        const scale = flakeRadius / armExtent(flake);
        const turn = fieldRotate ? (local() * 2 * Math.PI) / arms : 0;
        const d = armAngles
          .map((armAngle) =>
            strokesToPath(flake.strokes, (p) =>
              vec2.add(
                cell.center,
                vec2.rotate(vec2.multiply(p, scale), armAngle + turn),
              ),
            ),
          )
          .join(' ');
        field.path(d);
      });
    }

    if (renderMode !== 'words') {
      const skeleton = inked();
      for (const armAngle of armAngles) {
        skeleton.path(strokesToPath(arm.strokes, (p) => place(p, armAngle)));
      }
    }

    if (renderMode !== 'lines') {
      // Distinct seeds per hand so each render is different handwriting.
      // They hang off the lettering seed alone, so rolling the main seed
      // re-uses the cached renders instead of re-hitting the API.
      const handSeed = (i: number) =>
        1 + ((letteringSeed + i * 1_000_003) % 2_147_483_646);
      const pool = Array.from({ length: wordVariants }, (_, i) => ({
        text: WORDS[i % WORDS.length],
        seed: handSeed(i),
        x_height_mm: X_HEIGHT_MM,
      }));
      const targetPx = wordLength * radius;

      withHands(svg, pool, (hands) => {
        if (hands.length === 0) return;

        // Layout is decided once for the arm, then replicated, so every
        // arm is an exact rotated copy.
        const pick = createRandom(seed);

        // Packed mode uses one scale for every hand: the average hand
        // lands at the target length, so phrases run longer and short
        // words shorter. The x-height at either mode's size is the band
        // the branch inset has to clear.
        const meanMm =
          hands.reduce((sum, h) => sum + h.width_mm, 0) / hands.length;
        const packedScale = targetPx / meanMm;
        const xHeightPx =
          X_HEIGHT_MM *
          (sizePerWord ? packedScale : (targetPx * WORD_FILL) / meanMm);
        const segments = insetBranches
          ? insetFromParent(arm.segments, xHeightPx)
          : arm.segments;

        const slots = sizePerWord
          ? layoutPacked(
              segments,
              hands.map((h) => h.width_mm * packedScale),
              targetPx * (1 - WORD_FILL),
              pick,
            )
          : layoutSlots(segments, targetPx, hands.length, pick);

        const total = slots.length * arms;
        if (total > MAX_WORDS) {
          console.warn(
            `${meta.title}: ${total} words requested, capping at ${MAX_WORDS}. ` +
              'Lower Branch Levels, Branches per Level, or Arms, or raise Word Length.',
          );
        }

        let placed = 0;
        for (const armAngle of armAngles) {
          for (const slot of slots) {
            if (placed++ >= MAX_WORDS) break;
            const rendered = hands[slot.hand];
            const scale = slot.widthPx / rendered.width_mm;
            const center = place(slot.center, armAngle);
            // Anchor each word on the center of its x-height band, not of
            // its ink box: the box grows with whatever ascenders and
            // descenders the word has, which put "happy" and "peace" at
            // different heights on the same arm.
            const g = cursiveGroup(rendered, {
              x: center.x - slot.widthPx / 2,
              y: center.y - xHeightCenterMm(rendered) * scale,
              scale,
              penWidthMm: penWidth,
              rotateDeg: (slot.angle + armAngle) / DEG,
              pivot: center,
            });
            if (g) svg.appendChild(g);
          }
        }
      });
    }

    // Clip everything drawn so far to the safe area, so the pen physically
    // stays on the page. Calibration marks are exempt (they align to paper
    // corners). Lettering that arrives after a cache miss is clipped at
    // export time instead.
    if (borderMode !== 'off') {
      applyBorderMask(svg, canvasConfig, {
        inset: borderInset,
        drawBorder: borderMode === 'border',
      });
    }
  }

  return svg;
}
