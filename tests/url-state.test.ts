import { describe, expect, it } from 'vitest';
import { encodeUrlState, parseUrlState } from '../src/sync/url-state';
import type { ControlDefinition } from '../src/controls/schema';

const schema: ControlDefinition[] = [
  { type: 'randomizer', id: 'roll', label: 'Roll', default: 'first-frost-01' },
  {
    type: 'slider',
    id: 'rows',
    label: 'Rows',
    min: 1,
    max: 40,
    step: 1,
    default: 12,
  },
];

describe('url state', () => {
  it('round-trips a randomizer phrase with spaces and symbols', () => {
    const hash = encodeUrlState(
      'piece',
      { roll: "it's cold & snowy #7", rows: 3 },
      { width: 6, height: 4, unit: 'in' },
      schema,
    );
    const state = parseUrlState(hash, schema);
    expect(state.artwork).toBe('piece');
    expect(state.values).toEqual({ roll: "it's cold & snowy #7", rows: 3 });
    expect(state.canvas).toEqual({ width: 6, height: 4, unit: 'in' });
  });
});
