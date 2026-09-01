import type { ControlDefinition, ControlSchema } from './schema';
import { deepEqual, formatValue } from './schema';
import { renderControl, type ControlChangeHandler } from './renderers';

/**
 * One entry of the order reported after a drag-reorder: the control's
 * id and the group section it now sits in (null = ungrouped).
 */
export interface ReorderedControl {
  id: string;
  group: string | null;
}

export interface ControlListOptions {
  /** Open a control's editor when its label is clicked. */
  onEdit?: (id: string) => void;
  /**
   * Enable drag-reordering. Dropping a row calls back with the full
   * order, including the group each row landed in — dropping onto a
   * group section (its header, or the body of an empty group) moves
   * the control into that group.
   */
  onReorder?: (order: ReorderedControl[]) => void;
  /** Group names currently collapsed. */
  collapsedGroups?: ReadonlySet<string>;
  /** Fires when the user opens or closes a group section. */
  onGroupToggle?: (group: string, collapsed: boolean) => void;
  /**
   * Groups to render even though no control belongs to them yet —
   * empty "folders" created via the New Group button, waiting for
   * controls to be dragged in. Rendered after all controls.
   */
  emptyGroups?: readonly string[];
  /** Remove an empty group (only offered on groups with no members). */
  onRemoveGroup?: (group: string) => void;
}

/**
 * Render the full control list with dirty state indicators.
 *
 * Controls that share a `group` name render inside a collapsible
 * section, placed where the group's first member appears in the schema.
 */
export function renderControlList(
  controls: ControlSchema,
  currentValues: Record<string, unknown>,
  fileDefaults: Record<string, unknown>,
  onChange: ControlChangeHandler,
  onReset: (id: string) => void,
  options: ControlListOptions = {}
): HTMLElement {
  const {
    onEdit,
    onReorder,
    collapsedGroups = new Set<string>(),
    onGroupToggle,
    emptyGroups = [],
    onRemoveGroup,
  } = options;

  const list = document.createElement('div');
  list.className = 'control-list';

  let draggedRow: HTMLElement | null = null;
  let draggedSection: HTMLElement | null = null;

  function clearDropIndicators() {
    for (const el of list.querySelectorAll(
      '.control-row, .control-group, .control-group-header'
    )) {
      el.classList.remove('drop-before', 'drop-after', 'drop-into');
    }
  }

  /** The direct child of the list (row or group section) containing el. */
  function topLevelOf(el: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = el;
    while (node && node.parentElement !== list) node = node.parentElement;
    return node;
  }

  function reportOrder() {
    const order = [...list.querySelectorAll<HTMLElement>('.control-row')].map(
      (row) => ({
        id: row.dataset.controlId!,
        group:
          row.closest<HTMLElement>('.control-group')?.dataset.groupName ??
          null,
      })
    );
    onReorder!(order);
  }

  if (onReorder) {
    list.addEventListener('dragover', (e) => {
      if (!draggedRow && !draggedSection) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      clearDropIndicators();

      // A dragged group moves whole, at the top level — it lands
      // before or after a row or another group, never inside one.
      if (draggedSection) {
        const target = topLevelOf(e.target as HTMLElement);
        if (target && target !== draggedSection) {
          const rect = target.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          target.classList.add(before ? 'drop-before' : 'drop-after');
        }
        return;
      }

      const target = (e.target as HTMLElement).closest('.control-row');
      if (target && target !== draggedRow) {
        const rect = target.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        target.classList.add(before ? 'drop-before' : 'drop-after');
        return;
      }
      // Hovering a group section (header, or an empty body) means
      // "add to this group" — the only way into a collapsed one.
      const section = (e.target as HTMLElement).closest('.control-group');
      if (section && !section.contains(draggedRow)) {
        section.querySelector('.control-group-header')!.classList.add('drop-into');
      }
    });

    list.addEventListener('drop', (e) => {
      if (!draggedRow && !draggedSection) return;
      e.preventDefault();

      if (draggedSection) {
        const target = topLevelOf(e.target as HTMLElement);
        if (!target || target === draggedSection) {
          clearDropIndicators();
          return;
        }
        const rect = target.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.insertBefore(
          draggedSection,
          before ? target : target.nextSibling
        );
        reportOrder();
        clearDropIndicators();
        return;
      }

      if (!draggedRow) return;
      const target = (e.target as HTMLElement).closest('.control-row');
      const section = (e.target as HTMLElement).closest('.control-group');
      if (target && target !== draggedRow) {
        // Insert next to the target row, inside whatever container
        // (top level or group body) the target lives in.
        const rect = target.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        target.parentElement!.insertBefore(
          draggedRow,
          before ? target : target.nextSibling
        );
      } else if (section && !section.contains(draggedRow)) {
        section.querySelector('.control-group-body')!.appendChild(draggedRow);
      } else {
        clearDropIndicators();
        return;
      }
      reportOrder();
      clearDropIndicators();
    });
  }

  function buildRow(control: ControlDefinition): HTMLElement {
    const value = currentValues[control.id];
    const fileDefault = fileDefaults[control.id];
    const isDirty = fileDefault !== undefined && !deepEqual(value, fileDefault);

    const row = document.createElement('div');
    row.className = `control-row ${isDirty ? 'is-dirty' : ''}`;
    row.dataset.controlId = control.id;

    // Drag grip. The row only becomes draggable while the pointer is on
    // the grip, so slider/input drags inside the row are unaffected.
    if (onReorder) {
      row.classList.add('is-reorderable');

      const grip = document.createElement('span');
      grip.className = 'control-grip';
      grip.title = 'Drag to reorder';
      grip.textContent = '⠿';

      grip.addEventListener('pointerdown', () => {
        row.draggable = true;
      });
      grip.addEventListener('pointerup', () => {
        row.draggable = false;
      });

      row.addEventListener('dragstart', (e) => {
        draggedRow = row;
        row.classList.add('is-dragging');
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', control.id);
      });
      row.addEventListener('dragend', () => {
        row.draggable = false;
        row.classList.remove('is-dragging');
        draggedRow = null;
        clearDropIndicators();
      });

      row.appendChild(grip);
    }

    // Label (clickable to edit)
    const label = document.createElement('label');
    label.className = 'control-label';
    label.textContent = control.label;
    if (control.description) {
      label.title = control.description + (onEdit ? ' (click to edit)' : '');
    } else if (onEdit) {
      label.title = 'Click to edit';
    }
    if (onEdit) {
      label.classList.add('control-label-editable');
      label.addEventListener('click', () => onEdit(control.id));
    }

    // The control itself
    const controlEl = renderControl(control, value, onChange);

    // Reset button (always present, visibility controlled by CSS)
    const resetBtn = document.createElement('button');
    resetBtn.className = 'control-reset';
    resetBtn.innerHTML = '&#8617;'; // ↩
    resetBtn.title = `Reset to ${formatValue(fileDefault)}`;
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => onReset(control.id));

    row.append(label, controlEl, resetBtn);
    return row;
  }

  function buildGroupSection(
    name: string,
    members: ControlDefinition[]
  ): HTMLElement {
    const section = document.createElement('details');
    section.className = 'control-group';
    section.dataset.groupName = name;
    section.open = !collapsedGroups.has(name);

    const summary = document.createElement('summary');
    summary.className = 'control-group-header';

    // Drag grip: the whole group (members included) can be reordered
    // among top-level rows and other groups. Empty folders get none —
    // their position isn't backed by control order, so it couldn't
    // survive a re-render.
    if (onReorder && members.length > 0) {
      const grip = document.createElement('span');
      grip.className = 'control-grip control-group-grip';
      grip.title = 'Drag to reorder group';
      grip.textContent = '⠿';

      // Don't let a click on the grip toggle the <details>
      grip.addEventListener('click', (e) => e.preventDefault());
      grip.addEventListener('pointerdown', () => {
        section.draggable = true;
      });
      grip.addEventListener('pointerup', () => {
        section.draggable = false;
      });

      // Row drags inside the section bubble up here; only react when
      // the section itself is the drag source.
      section.addEventListener('dragstart', (e) => {
        if (e.target !== section) return;
        draggedSection = section;
        section.classList.add('is-dragging');
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', `group:${name}`);
      });
      section.addEventListener('dragend', (e) => {
        if (e.target !== section) return;
        section.draggable = false;
        section.classList.remove('is-dragging');
        draggedSection = null;
        clearDropIndicators();
      });

      summary.appendChild(grip);
    }

    const title = document.createElement('span');
    title.className = 'control-group-title';
    title.textContent = name;

    const count = document.createElement('span');
    count.className = 'control-group-count';
    count.textContent = String(members.length);

    summary.append(title, count);

    // An empty group can be removed; one with members disbands by
    // moving its controls out.
    if (members.length === 0 && onRemoveGroup) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'control-group-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.title = `Remove empty group "${name}"`;
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault(); // don't toggle the <details>
        onRemoveGroup(name);
      });
      summary.appendChild(removeBtn);
    }

    section.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'control-group-body';
    for (const member of members) {
      body.appendChild(buildRow(member));
    }
    section.appendChild(body);

    const anyDirty = members.some((m) => {
      const fileDefault = fileDefaults[m.id];
      return (
        fileDefault !== undefined &&
        !deepEqual(currentValues[m.id], fileDefault)
      );
    });
    section.classList.toggle('has-dirty', anyDirty);

    // Setting `open` above queues a toggle event; only report changes
    // the user actually made.
    let lastOpen = section.open;
    section.addEventListener('toggle', () => {
      if (section.open === lastOpen) return;
      lastOpen = section.open;
      onGroupToggle?.(name, !section.open);
    });

    return section;
  }

  const renderedGroups = new Set<string>();
  for (const control of controls) {
    if (control.group) {
      if (renderedGroups.has(control.group)) continue;
      renderedGroups.add(control.group);
      const members = controls.filter((c) => c.group === control.group);
      list.appendChild(buildGroupSection(control.group, members));
    } else {
      list.appendChild(buildRow(control));
    }
  }

  // Empty folders awaiting their first control, newest last
  for (const name of emptyGroups) {
    if (renderedGroups.has(name)) continue;
    renderedGroups.add(name);
    list.appendChild(buildGroupSection(name, []));
  }

  return list;
}

/**
 * Create the artwork selector dropdown.
 */
export function createArtworkSelector(
  artworks: { path: string; name: string }[],
  currentName: string,
  onSelect: (path: string) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'artwork-selector';

  const select = document.createElement('select');
  select.id = 'artwork-select';

  for (const { path, name } of artworks) {
    const option = document.createElement('option');
    option.value = path;
    option.textContent = name;
    option.selected = name === currentName;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    onSelect(select.value);
  });

  container.appendChild(select);
  return container;
}
