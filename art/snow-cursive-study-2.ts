/**
 * Snow Cursive Study 2
 *
 * Part two of a multi-part study: the snowflake from study 1 sized for
 * a 6 × 4 in postcard. One arm is grown from the center — a main stem
 * that sprouts mirrored branch pairs, which sprout their own pairs, and
 * so on — and that one arm is then replicated around the center point.
 * In the lettering mode every line of the skeleton is replaced by words
 * from the WORDS list, set in Secondhand Cursive, one or more copies
 * per segment depending on the word size. The defaults are tuned for
 * the smaller canvas: a shorter arm so the outer branches clear the
 * border, and longer words so the lettering stays plottable.
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
import { vec2, lerp, clamp } from '@johnfmorton/generative-utils';
import type { Vec2 } from '@johnfmorton/generative-utils';
import { createRandom } from '../src/random';
import { createCanvas } from '../src/svg-utils';
import { drawCalibrationMarks } from '../src/calibration';
import { applyBorderMask } from '../src/border-mask';
import {
  cursiveGroup,
  fetchCursive,
  MM_TO_PX,
} from '../src/secondhand-cursive';
import type {
  CursiveOptions,
  CursiveResponse,
} from '../src/secondhand-cursive';

export const meta = {
  title: 'Snow Cursive Study 2',
  description: 'A 6 × 4 in postcard snowflake written in cursive',
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
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

/**
 * The words written along the branches. The variant pool cycles through
 * this list, so 24 variants over three words gives each word eight
 * different hands. With Size Slots per Word on, every entry is set at
 * one letter size and a phrase simply runs longer along its branch; off,
 * each is squeezed into an equal slot.
 */
const WORDS = ['happy', 'new', 'year', 'good tidings', 'john and andrew'];
const DEG = Math.PI / 180;
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

/** One line of the skeleton: a stem or a branch, pointing outward. */
interface Segment {
  from: Vec2;
  to: Vec2;
  /** Direction in radians, screen coordinates (y down). */
  angle: number;
  length: number;
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
  ): Vec2 => {
    const to = vec2.add(from, vec2.fromAngle(angle, len));
    arm.segments.push({ from, to, angle, length: len });
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
      );
      const right = grow(
        junction,
        angle + spread,
        childLength,
        level + 1,
        pairPath,
      );
      arm.strokes.push([left, junction, right]);
    }
    return to;
  };

  const origin = { x: 0, y: 0 };
  const tip = grow(origin, 0, length, 0, 0);
  arm.strokes.unshift([origin, tip]);
  return arm;
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
  arm: Arm,
  targetPx: number,
  hands: number,
  pick: () => number,
): WordSlot[] {
  const slots: WordSlot[] = [];
  for (const seg of arm.segments) {
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
  arm: Arm,
  widths: number[],
  gapPx: number,
  pick: () => number,
): WordSlot[] {
  const slots: WordSlot[] = [];
  const narrowest = Math.min(...widths);
  for (const seg of arm.segments) {
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

const fmt = (n: number) => String(Math.round(n * 100) / 100);

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
    wordVariants,
    letteringSeed,
    penWidth,
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

    // Grow the one arm, along +x from the origin.
    const arm = growArm(radius, {
      seed,
      branchLevels,
      branchCount,
      branchAngle: branchAngle * DEG,
      branchScale,
      branchStart,
      taper,
      jitter,
    });

    // Replicate it: arm 0 points straight up, the rest follow clockwise.
    const armAngles = Array.from(
      { length: arms },
      (_, k) => -90 * DEG + (k * 2 * Math.PI) / arms,
    );
    const place = (p: Vec2, armAngle: number): Vec2 =>
      vec2.add(center, vec2.rotate(p, armAngle));

    if (renderMode !== 'words') {
      const skeleton = draw.group().fill('none').stroke({
        color: '#000',
        width: penPx,
        linecap: 'round',
        linejoin: 'round',
      });
      for (const armAngle of armAngles) {
        const d = arm.strokes
          .map((stroke) =>
            stroke
              .map((p, i) => {
                const q = place(p, armAngle);
                return `${i === 0 ? 'M' : 'L'}${fmt(q.x)} ${fmt(q.y)}`;
              })
              .join(' '),
          )
          .join(' ');
        skeleton.path(d);
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
      }));
      const targetPx = wordLength * radius;

      withHands(svg, pool, (hands) => {
        if (hands.length === 0) return;

        // Layout is decided once for the arm, then replicated, so every
        // arm is an exact rotated copy.
        const pick = createRandom(seed);
        let slots: WordSlot[];
        if (sizePerWord) {
          // One scale for every hand: the average hand lands at the
          // target length, so phrases run longer and short words shorter.
          const meanMm =
            hands.reduce((sum, h) => sum + h.width_mm, 0) / hands.length;
          const scale = targetPx / meanMm;
          slots = layoutPacked(
            arm,
            hands.map((h) => h.width_mm * scale),
            targetPx * (1 - WORD_FILL),
            pick,
          );
        } else {
          slots = layoutSlots(arm, targetPx, hands.length, pick);
        }

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
            const h = rendered.height_mm * scale;
            const center = place(slot.center, armAngle);
            const g = cursiveGroup(rendered, {
              x: center.x - slot.widthPx / 2,
              y: center.y - h / 2,
              scale,
              penWidthMm: penWidth,
              rotateDeg: (slot.angle + armAngle) / DEG,
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
