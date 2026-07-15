import type { ControlSchema } from './schema';
import { deepEqual, formatValue } from './schema';
import { renderControl, type ControlChangeHandler } from './renderers';

/**
 * Render the full control list with dirty state indicators.
 * When onReorder is provided, rows get a drag grip; dropping a row in a
 * new position calls onReorder with the full id order.
 */
export function renderControlList(
  controls: ControlSchema,
  currentValues: Record<string, unknown>,
  fileDefaults: Record<string, unknown>,
  onChange: ControlChangeHandler,
  onReset: (id: string) => void,
  onEdit?: (id: string) => void,
  onReorder?: (orderedIds: string[]) => void
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'control-list';

  let draggedRow: HTMLElement | null = null;

  function clearDropIndicators() {
    for (const row of list.querySelectorAll('.control-row')) {
      row.classList.remove('drop-before', 'drop-after');
    }
  }

  if (onReorder) {
    list.addEventListener('dragover', (e) => {
      if (!draggedRow) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      clearDropIndicators();
      const target = (e.target as HTMLElement).closest('.control-row');
      if (target && target !== draggedRow) {
        const rect = target.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        target.classList.add(before ? 'drop-before' : 'drop-after');
      }
    });

    list.addEventListener('drop', (e) => {
      if (!draggedRow) return;
      e.preventDefault();
      const target = (e.target as HTMLElement).closest('.control-row');
      if (target && target !== draggedRow) {
        const rect = target.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.insertBefore(draggedRow, before ? target : target.nextSibling);
        const orderedIds = [...list.querySelectorAll<HTMLElement>('.control-row')].map(
          (row) => row.dataset.controlId!
        );
        onReorder(orderedIds);
      }
      clearDropIndicators();
    });
  }

  for (const control of controls) {
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
    list.appendChild(row);
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
