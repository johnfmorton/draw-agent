import { describe, expect, it } from 'vitest';
import { generateControlsBlock } from '../src/artwork-template';
import type { ControlDefinition } from '../src/controls/schema';

describe('generateControlsBlock', () => {
  it('serializes the group field when present', () => {
    const controls: ControlDefinition[] = [
      {
        type: 'slider',
        id: 'gridRows',
        label: 'Rows',
        group: 'Grid Controls',
        min: 1,
        max: 40,
        step: 1,
        default: 12,
      },
      { type: 'seed', id: 'seed', label: 'Seed', default: 42 },
    ];

    const code = generateControlsBlock(controls);
    expect(code).toContain("group: 'Grid Controls',");
    // The ungrouped control must not gain a group line
    const seedBlock = code.slice(code.indexOf("id: 'seed'"));
    expect(seedBlock).not.toContain('group:');
  });

  it('escapes quotes in group names', () => {
    const controls: ControlDefinition[] = [
      {
        type: 'toggle',
        id: 'showGrid',
        label: 'Show Grid',
        group: "Artist's Grid",
        default: true,
      },
    ];

    expect(generateControlsBlock(controls)).toContain(
      "group: 'Artist\\'s Grid',"
    );
  });
});
