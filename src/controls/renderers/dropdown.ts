import type { DropdownControl } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderDropdown(
  control: DropdownControl,
  value: string,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-dropdown';

  const select = document.createElement('select');

  for (const option of control.options) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = option.value === value;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    onChange(control.id, select.value);
  });

  container.appendChild(select);
  return container;
}
