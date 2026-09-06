import { describe, expect, it } from 'vitest';
import {
  phraseToSeed,
  randomPhrase,
  randomizerTargets,
  rollControl,
  rollGroup,
} from '../src/controls/randomize';
import { createRandom } from '../src/random';
import type {
  ControlDefinition,
  Point2D,
  RandomizerControl,
  Rectangle,
} from '../src/controls/schema';

const gridRoll: RandomizerControl = {
  type: 'randomizer',
  id: 'gridRoll',
  label: 'Randomize Grid',
  group: 'Grid',
  default: 'first-frost-01',
};
const topRoll: RandomizerControl = {
  type: 'randomizer',
  id: 'topRoll',
  label: 'Randomize',
  default: 'top',
};

const controls: ControlDefinition[] = [
  { type: 'seed', id: 'seed', label: 'Seed', default: 42 },
  topRoll,
  gridRoll,
  {
    type: 'slider',
    id: 'rows',
    label: 'Rows',
    group: 'Grid',
    min: 1,
    max: 40,
    step: 1,
    default: 12,
  },
  {
    type: 'slider',
    id: 'gap',
    label: 'Gap',
    group: 'Grid',
    min: 0.04,
    max: 0.5,
    step: 0.01,
    default: 0.25,
  },
  {
    type: 'slider',
    id: 'ease',
    label: 'Ease',
    group: 'Grid',
    min: -1,
    max: 1,
    default: 0,
  },
  { type: 'toggle', id: 'show', label: 'Show', group: 'Grid', default: true },
  {
    type: 'dropdown',
    id: 'mode',
    label: 'Mode',
    group: 'Grid',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
    default: 'a',
  },
  {
    type: 'seed',
    id: 'gridSeed',
    label: 'Grid Seed',
    group: 'Grid',
    default: 7,
  },
  {
    type: 'numeric',
    id: 'count',
    label: 'Count',
    group: 'Grid',
    min: 2,
    default: 5,
  },
  {
    type: 'point2d',
    id: 'origin',
    label: 'Origin',
    group: 'Grid',
    default: { x: 0, y: 0 },
    bounds: { minX: -50, maxX: 50, minY: 10, maxY: 20 },
  },
  {
    type: 'vector',
    id: 'dir',
    label: 'Direction',
    group: 'Grid',
    default: { x: 3, y: 4 },
    magnitude: { min: 2, max: 6 },
  },
  {
    type: 'rectangle',
    id: 'frame',
    label: 'Frame',
    group: 'Grid',
    default: { x: 0, y: 0, width: 10, height: 10 },
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
  },
  {
    type: 'randomizer',
    id: 'otherRoll',
    label: 'Other',
    group: 'Grid',
    default: 'y',
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Width',
    min: 0.1,
    max: 5,
    default: 1,
  },
];

const phrases = Array.from({ length: 200 }, (_, i) => `phrase-${i}`);

describe('randomizerTargets', () => {
  it('rolls the group mates of a grouped randomizer, never other randomizers', () => {
    expect(randomizerTargets(controls, gridRoll).map((c) => c.id)).toEqual([
      'rows',
      'gap',
      'ease',
      'show',
      'mode',
      'gridSeed',
      'count',
      'origin',
      'dir',
      'frame',
    ]);
  });

  it('rolls the ungrouped controls for an ungrouped randomizer', () => {
    expect(randomizerTargets(controls, topRoll).map((c) => c.id)).toEqual([
      'seed',
      'lineWidth',
    ]);
  });
});

describe('phraseToSeed', () => {
  it('uses an integer phrase as the seed itself', () => {
    expect(phraseToSeed('123')).toBe(123);
    expect(phraseToSeed('  123 ')).toBe(123);
    expect(phraseToSeed('0')).toBe(0);
  });

  it('hashes everything else to a stable unsigned 32-bit integer', () => {
    const a = phraseToSeed('quiet-heron-27');
    expect(a).toBe(phraseToSeed('quiet-heron-27'));
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
    expect(phraseToSeed('quiet-heron-28')).not.toBe(a);
    // Out of seed range, or too long: hashed rather than parsed
    expect(phraseToSeed('2147483648')).not.toBe(2147483648);
    expect(phraseToSeed('99999999999')).toBeLessThan(2 ** 32);
  });
});

describe('rollGroup', () => {
  it('is deterministic for a phrase and differs between phrases', () => {
    const a = rollGroup(controls, gridRoll, 'quiet-heron-27');
    expect(rollGroup(controls, gridRoll, 'quiet-heron-27')).toEqual(a);
    expect(Object.keys(a).sort()).toEqual(
      randomizerTargets(controls, gridRoll)
        .map((c) => c.id)
        .sort(),
    );
    const b = rollGroup(controls, gridRoll, 'quiet-heron-28');
    expect(b).not.toEqual(a);
  });

  it('never touches controls outside the group or other randomizers', () => {
    const rolled = rollGroup(controls, gridRoll, 'x');
    for (const id of [
      'seed',
      'lineWidth',
      'topRoll',
      'otherRoll',
      'gridRoll',
    ]) {
      expect(rolled).not.toHaveProperty(id);
    }
  });

  it("respects every control's limits", () => {
    for (const phrase of phrases) {
      const v = rollGroup(controls, gridRoll, phrase);

      const rows = v.rows as number;
      expect(Number.isInteger(rows)).toBe(true);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(rows).toBeLessThanOrEqual(40);

      const gap = v.gap as number;
      expect(gap).toBeGreaterThanOrEqual(0.04);
      expect(gap).toBeLessThanOrEqual(0.5);
      expect(Math.abs(gap * 100 - Math.round(gap * 100))).toBeLessThan(1e-9);

      const ease = v.ease as number;
      expect(ease).toBeGreaterThanOrEqual(-1);
      expect(ease).toBeLessThanOrEqual(1);

      expect(typeof v.show).toBe('boolean');
      expect(['a', 'b', 'c']).toContain(v.mode);

      const seed = v.gridSeed as number;
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(2147483647);

      const count = v.count as number;
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(10);

      const origin = v.origin as Point2D;
      expect(Number.isInteger(origin.x) && Number.isInteger(origin.y)).toBe(
        true,
      );
      expect(origin.x).toBeGreaterThanOrEqual(-50);
      expect(origin.x).toBeLessThanOrEqual(50);
      expect(origin.y).toBeGreaterThanOrEqual(10);
      expect(origin.y).toBeLessThanOrEqual(20);

      const dir = v.dir as Point2D;
      const mag = Math.hypot(dir.x, dir.y);
      expect(mag).toBeGreaterThanOrEqual(2 - 0.02);
      expect(mag).toBeLessThanOrEqual(6 + 0.02);

      const frame = v.frame as Rectangle;
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.width).toBeGreaterThanOrEqual(0);
      expect(frame.height).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(100);
      expect(frame.y + frame.height).toBeLessThanOrEqual(50);
    }
  });

  it('actually varies each control across phrases', () => {
    const seen = new Map<string, Set<string>>();
    for (const phrase of phrases) {
      for (const [id, value] of Object.entries(
        rollGroup(controls, gridRoll, phrase),
      )) {
        if (!seen.has(id)) seen.set(id, new Set());
        seen.get(id)!.add(JSON.stringify(value));
      }
    }
    for (const [id, values] of seen) {
      expect(values.size, id).toBeGreaterThan(1);
    }
  });
});

describe('rollControl fallbacks', () => {
  const random = createRandom(1);

  it('keeps an unbounded numeric within a band around its default', () => {
    for (let i = 0; i < 200; i++) {
      const zero = rollControl(
        { type: 'numeric', id: 'n', label: 'N', default: 0 },
        random,
      ) as number;
      expect(zero).toBeGreaterThanOrEqual(-10);
      expect(zero).toBeLessThanOrEqual(10);

      const five = rollControl(
        { type: 'numeric', id: 'n', label: 'N', default: 5 },
        random,
      ) as number;
      expect(five).toBeGreaterThanOrEqual(0);
      expect(five).toBeLessThanOrEqual(10);

      const capped = rollControl(
        { type: 'numeric', id: 'n', label: 'N', max: 3, default: 5 },
        random,
      ) as number;
      expect(capped).toBeLessThanOrEqual(3);
      expect(capped).toBeGreaterThanOrEqual(-2);
    }
  });

  it('turns a vector without magnitude limits at its default length', () => {
    for (let i = 0; i < 50; i++) {
      const v = rollControl(
        { type: 'vector', id: 'v', label: 'V', default: { x: 3, y: 4 } },
        random,
      ) as Point2D;
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(5, 1);
    }
  });

  it('leaves a randomizer at its own default', () => {
    expect(rollControl(gridRoll, random)).toBe('first-frost-01');
  });
});

describe('randomPhrase', () => {
  it('produces word-word-number phrases', () => {
    for (let i = 0; i < 20; i++) {
      expect(randomPhrase()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    }
  });
});
