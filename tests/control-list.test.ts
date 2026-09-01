// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderControlList } from '../src/controls/control-list';
import type { ControlDefinition } from '../src/controls/schema';

/** Dispatch a dragstart with the DataTransfer stub jsdom lacks. */
function fakeDragStart(el: HTMLElement) {
  const ev = new Event('dragstart', { bubbles: true }) as DragEvent;
  Object.defineProperty(ev, 'dataTransfer', {
    value: { setData() {}, effectAllowed: '' },
  });
  el.dispatchEvent(ev);
}

/** Dispatch a drop; jsdom rects are all zero, so clientY 10 = "after". */
function fakeDrop(el: HTMLElement, clientY = 10) {
  el.dispatchEvent(
    new MouseEvent('drop', { bubbles: true, cancelable: true, clientY })
  );
}

const controls: ControlDefinition[] = [
  { type: 'seed', id: 'seed', label: 'Seed', default: 42 },
  {
    type: 'slider',
    id: 'gridRows',
    label: 'Rows',
    group: 'Grid',
    min: 1,
    max: 40,
    default: 12,
  },
  {
    type: 'toggle',
    id: 'showGrid',
    label: 'Show Grid',
    group: 'Grid',
    default: true,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.1,
    max: 5,
    default: 1,
  },
];

const values = { seed: 42, gridRows: 12, showGrid: true, lineWidth: 1 };
const defaults = { ...values };
const noop = () => {};

function render(
  currentValues: Record<string, unknown> = values,
  collapsed: ReadonlySet<string> = new Set(),
  onGroupToggle?: (group: string, collapsed: boolean) => void
) {
  const options: Parameters<typeof renderControlList>[5] = {
    collapsedGroups: collapsed,
  };
  if (onGroupToggle) options.onGroupToggle = onGroupToggle;
  return renderControlList(
    controls,
    currentValues,
    defaults,
    noop,
    noop,
    options
  );
}

describe('renderControlList grouping', () => {
  it('renders grouped controls inside one section, in schema position', () => {
    const list = render();

    const children = [...list.children];
    expect(children.map((el) => el.className.trim().split(' ')[0])).toEqual([
      'control-row', // seed
      'control-group', // Grid (at first member's position)
      'control-row', // lineWidth
    ]);

    const section = list.querySelector('.control-group')!;
    expect(section.querySelector('.control-group-title')!.textContent).toBe(
      'Grid'
    );
    expect(section.querySelector('.control-group-count')!.textContent).toBe('2');
    const memberIds = [...section.querySelectorAll<HTMLElement>('.control-row')]
      .map((row) => row.dataset.controlId);
    expect(memberIds).toEqual(['gridRows', 'showGrid']);
  });

  it('honors persisted collapse state', () => {
    const open = render().querySelector<HTMLDetailsElement>('.control-group')!;
    expect(open.open).toBe(true);

    const closed = render(values, new Set(['Grid'])).querySelector<HTMLDetailsElement>(
      '.control-group'
    )!;
    expect(closed.open).toBe(false);
  });

  it('reports user toggles but not the initial open state', () => {
    const onToggle = vi.fn();
    const list = render(values, new Set(), onToggle);
    const section = list.querySelector<HTMLDetailsElement>('.control-group')!;

    // The toggle queued by setting `open` during render must be ignored
    section.dispatchEvent(new Event('toggle'));
    expect(onToggle).not.toHaveBeenCalled();

    section.open = false;
    section.dispatchEvent(new Event('toggle'));
    expect(onToggle).toHaveBeenCalledWith('Grid', true);

    section.open = true;
    section.dispatchEvent(new Event('toggle'));
    expect(onToggle).toHaveBeenLastCalledWith('Grid', false);
  });

  it('renders empty folder groups after the controls, with a remove button', () => {
    const onRemoveGroup = vi.fn();
    const list = renderControlList(controls, values, defaults, noop, noop, {
      emptyGroups: ['Colors'],
      onRemoveGroup,
    });

    const sections = [...list.querySelectorAll<HTMLElement>('.control-group')];
    expect(sections.map((s) => s.dataset.groupName)).toEqual(['Grid', 'Colors']);
    expect(list.lastElementChild).toBe(sections[1]);

    const empty = sections[1]!;
    expect(empty.querySelectorAll('.control-row')).toHaveLength(0);
    expect(empty.querySelector('.control-group-count')!.textContent).toBe('0');

    // Only the empty group offers removal
    expect(sections[0]!.querySelector('.control-group-remove')).toBeNull();
    const removeBtn = empty.querySelector<HTMLButtonElement>('.control-group-remove')!;
    removeBtn.click();
    expect(onRemoveGroup).toHaveBeenCalledWith('Colors');
  });

  it('does not duplicate a section when an empty group name already has members', () => {
    const list = renderControlList(controls, values, defaults, noop, noop, {
      emptyGroups: ['Grid'],
    });
    expect(list.querySelectorAll('.control-group')).toHaveLength(1);
    expect(
      list.querySelector('.control-group')!.querySelectorAll('.control-row')
    ).toHaveLength(2);
  });

  it('marks a group dirty when any member differs from file defaults', () => {
    const clean = render();
    expect(
      clean.querySelector('.control-group')!.classList.contains('has-dirty')
    ).toBe(false);

    const dirty = render({ ...values, gridRows: 20 });
    expect(
      dirty.querySelector('.control-group')!.classList.contains('has-dirty')
    ).toBe(true);
  });
});

describe('renderControlList drag-reorder', () => {
  function renderReorderable(onReorder: (o: unknown) => void) {
    return renderControlList(controls, values, defaults, noop, noop, {
      onReorder,
      emptyGroups: ['Colors'],
    });
  }

  it('gives member groups a drag grip but not empty folders', () => {
    const list = renderReorderable(noop);
    const [grid, colors] = [...list.querySelectorAll<HTMLElement>('.control-group')];
    expect(grid!.querySelector('.control-group-grip')).not.toBeNull();
    expect(colors!.querySelector('.control-group-grip')).toBeNull();
  });

  it('moves a whole group when its section is dropped after a top-level row', () => {
    const onReorder = vi.fn();
    const list = renderReorderable(onReorder);
    const section = list.querySelector<HTMLElement>('.control-group')!;
    const lineWidthRow = list.querySelector<HTMLElement>(
      '[data-control-id="lineWidth"]'
    )!;

    fakeDragStart(section);
    fakeDrop(lineWidthRow);

    expect(onReorder).toHaveBeenCalledWith([
      { id: 'seed', group: null },
      { id: 'lineWidth', group: null },
      { id: 'gridRows', group: 'Grid' },
      { id: 'showGrid', group: 'Grid' },
    ]);
    // The DOM reflects the move: section now follows the row
    expect(lineWidthRow.nextElementSibling).toBe(section);
  });

  it('treats a row inside a group as that group when targeting a section drop', () => {
    const onReorder = vi.fn();
    const list = renderReorderable(onReorder);
    const gridRowsRow = list.querySelector<HTMLElement>(
      '[data-control-id="gridRows"]'
    )!;
    const seedRow = list.querySelector<HTMLElement>('[data-control-id="seed"]')!;

    // Dragging the Grid section onto one of its own rows is a no-op
    fakeDragStart(list.querySelector<HTMLElement>('.control-group')!);
    fakeDrop(gridRowsRow);
    expect(onReorder).not.toHaveBeenCalled();

    // Dropping it on the seed row (top level) moves it after the row
    fakeDrop(seedRow);
    expect(onReorder).toHaveBeenCalledWith([
      { id: 'seed', group: null },
      { id: 'gridRows', group: 'Grid' },
      { id: 'showGrid', group: 'Grid' },
      { id: 'lineWidth', group: null },
    ]);
  });

  it('moves a row into a group when dropped on its section', () => {
    const onReorder = vi.fn();
    const list = renderReorderable(onReorder);
    const lineWidthRow = list.querySelector<HTMLElement>(
      '[data-control-id="lineWidth"]'
    )!;
    const gridHeader = list.querySelector<HTMLElement>('.control-group-header')!;

    fakeDragStart(lineWidthRow);
    fakeDrop(gridHeader);

    expect(onReorder).toHaveBeenCalledWith([
      { id: 'seed', group: null },
      { id: 'gridRows', group: 'Grid' },
      { id: 'showGrid', group: 'Grid' },
      { id: 'lineWidth', group: 'Grid' },
    ]);
  });
});
