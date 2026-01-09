import type { ControlSchema } from './schema';
import { deepEqual, formatValue } from './schema';
import { renderControl, type ControlChangeHandler } from './renderers';

/**
 * Render the full control list with dirty state indicators.
 */
export function renderControlList(
  controls: ControlSchema,
  currentValues: Record<string, unknown>,
  fileDefaults: Record<string, unknown>,
  onChange: ControlChangeHandler,
  onReset: (id: string) => void,
  onEdit?: (id: string) => void
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'control-list';

  for (const control of controls) {
    const value = currentValues[control.id];
    const fileDefault = fileDefaults[control.id];
    const isDirty = fileDefault !== undefined && !deepEqual(value, fileDefault);

    const row = document.createElement('div');
    row.className = `control-row ${isDirty ? 'is-dirty' : ''}`;
    row.dataset.controlId = control.id;

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
