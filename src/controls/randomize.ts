import type { ControlDefinition, RandomizerControl } from './schema';
import { createRandom } from '../random';

/**
 * Group randomizer. A `randomizer` control holds a phrase; changing it
 * re-rolls every other control in its group within that control's own
 * limits. The roll is a pure function of the schema and the phrase, so
 * typing a phrase back in reproduces its values, and a plain integer
 * phrase behaves like a seed control's number.
 */

const MAX_SEED = 2147483647;

/** xmur3 string hash to a 32-bit unsigned integer. */
function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The PRNG seed for a phrase: a plain integer in seed range is used
 * as-is, anything else is hashed.
 */
export function phraseToSeed(phrase: string): number {
  const trimmed = phrase.trim();
  if (/^\d{1,10}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n <= MAX_SEED) return n;
  }
  return hashString(trimmed);
}

/**
 * The controls a randomizer rolls: those sharing its group, or the
 * ungrouped controls when it has no group. Other randomizers are never
 * rolled, so two in one group stay independent.
 */
export function randomizerTargets(
  controls: readonly ControlDefinition[],
  randomizer: RandomizerControl,
): ControlDefinition[] {
  return controls.filter(
    (c) =>
      c.id !== randomizer.id &&
      c.type !== 'randomizer' &&
      (c.group ?? null) === (randomizer.group ?? null),
  );
}

/**
 * Fresh values for a randomizer's targets, rolled from a phrase. Same
 * schema and phrase, same values.
 */
export function rollGroup(
  controls: readonly ControlDefinition[],
  randomizer: RandomizerControl,
  phrase: string,
): Record<string, unknown> {
  const random = createRandom(phraseToSeed(phrase));
  const values: Record<string, unknown> = {};
  for (const control of randomizerTargets(controls, randomizer)) {
    values[control.id] = rollControl(control, random);
  }
  return values;
}

/** Decimal places a number is written with (0.25 → 2), capped. */
function decimalsOf(n: number): number {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const e = s.indexOf('e-');
  if (e >= 0) return Math.min(10, Number(s.slice(e + 2)));
  const dot = s.indexOf('.');
  return dot >= 0 ? Math.min(10, s.length - dot - 1) : 0;
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * A number in [lo, hi]: on the step grid counted from lo when the
 * control has a step, otherwise rounded to `decimals` places.
 */
function rollNumber(
  random: () => number,
  lo: number,
  hi: number,
  step: number | undefined,
  decimals: number,
): number {
  if (lo > hi) [lo, hi] = [hi, lo];
  if (step !== undefined && step > 0) {
    const steps = Math.floor((hi - lo) / step + 1e-9);
    const v = lo + Math.floor(random() * (steps + 1)) * step;
    return roundTo(Math.min(v, hi), Math.max(decimalsOf(lo), decimalsOf(step)));
  }
  return roundTo(lo + random() * (hi - lo), decimals);
}

/**
 * The range a number rolls in when a limit is missing: the limits that
 * exist, padded on the open side by a band as wide as the default
 * itself (10 for a default of 0), so an unbounded input still lands
 * near the scale its default implies.
 */
function fallbackRange(
  min: number | undefined,
  max: number | undefined,
  fallback: number,
): [number, number] {
  if (min !== undefined && max !== undefined) return [min, max];
  const span = Math.abs(fallback) || 10;
  if (min !== undefined) return [min, Math.max(fallback, min) + span];
  if (max !== undefined) return [Math.min(fallback, max) - span, max];
  return [fallback - span, fallback + span];
}

/** A number around a default with no limits at all. */
function rollAround(random: () => number, fallback: number): number {
  const [lo, hi] = fallbackRange(undefined, undefined, fallback);
  return rollNumber(
    random,
    lo,
    hi,
    undefined,
    Number.isInteger(fallback) ? 0 : 2,
  );
}

/** A value for one control within its limits. */
export function rollControl(
  control: ControlDefinition,
  random: () => number,
): unknown {
  switch (control.type) {
    case 'slider':
      return rollNumber(random, control.min, control.max, control.step, 2);

    case 'numeric': {
      const [lo, hi] = fallbackRange(control.min, control.max, control.default);
      const whole = [lo, hi, control.default].every((n) => Number.isInteger(n));
      return rollNumber(random, lo, hi, control.step, whole ? 0 : 2);
    }

    case 'toggle':
      return random() < 0.5;

    case 'dropdown':
      return control.options[Math.floor(random() * control.options.length)]
        .value;

    case 'seed':
      return Math.floor(random() * (MAX_SEED + 1));

    case 'point2d': {
      if (control.bounds) {
        // The XY pad places whole numbers; match it.
        const { minX, maxX, minY, maxY } = control.bounds;
        return {
          x: rollNumber(random, minX, maxX, undefined, 0),
          y: rollNumber(random, minY, maxY, undefined, 0),
        };
      }
      return {
        x: rollAround(random, control.default.x),
        y: rollAround(random, control.default.y),
      };
    }

    case 'vector': {
      // A random heading; the length stays within the magnitude limits,
      // or keeps the default's length when there are none.
      const mag = control.magnitude
        ? rollNumber(
            random,
            control.magnitude.min,
            control.magnitude.max,
            undefined,
            2,
          )
        : Math.hypot(control.default.x, control.default.y) || 1;
      const angle = random() * 2 * Math.PI;
      return {
        x: roundTo(Math.cos(angle) * mag, 2),
        y: roundTo(Math.sin(angle) * mag, 2),
      };
    }

    case 'rectangle': {
      if (control.bounds) {
        const { minX, maxX, minY, maxY } = control.bounds;
        const xs = [
          rollNumber(random, minX, maxX, undefined, 0),
          rollNumber(random, minX, maxX, undefined, 0),
        ].sort((a, b) => a - b);
        const ys = [
          rollNumber(random, minY, maxY, undefined, 0),
          rollNumber(random, minY, maxY, undefined, 0),
        ].sort((a, b) => a - b);
        return {
          x: xs[0],
          y: ys[0],
          width: xs[1] - xs[0],
          height: ys[1] - ys[0],
        };
      }
      const d = control.default;
      return {
        x: rollAround(random, d.x),
        y: rollAround(random, d.y),
        width: Math.max(0, rollAround(random, d.width)),
        height: Math.max(0, rollAround(random, d.height)),
      };
    }

    case 'randomizer':
      return control.default;
  }
}

const ADJECTIVES = [
  'amber',
  'brisk',
  'calm',
  'dusky',
  'early',
  'frosty',
  'gentle',
  'hazy',
  'icy',
  'jolly',
  'keen',
  'lucid',
  'misty',
  'nimble',
  'oaken',
  'pale',
  'quiet',
  'rosy',
  'silver',
  'tidy',
  'umber',
  'vivid',
  'wispy',
  'young',
];
const NOUNS = [
  'aspen',
  'brook',
  'cedar',
  'drift',
  'ember',
  'fjord',
  'glade',
  'heron',
  'inlet',
  'juniper',
  'kestrel',
  'lantern',
  'meadow',
  'north',
  'otter',
  'pine',
  'quill',
  'ridge',
  'sleet',
  'thaw',
  'vale',
  'willow',
  'yarrow',
];

/** A fresh phrase for the 🎲 button, like "quiet-heron-27". */
export function randomPhrase(): string {
  const pick = (list: readonly string[]) =>
    list[Math.floor(Math.random() * list.length)];
  const n = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}
