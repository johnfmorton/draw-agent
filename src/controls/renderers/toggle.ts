import type { ToggleControl } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderToggle(
  control: ToggleControl,
  value: boolean,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.id = `control-${control.id}`;

  const toggle = document.createElement('label');
  toggle.className = 'toggle-switch';
  toggle.htmlFor = input.id;

  input.addEventListener('change', () => {
    onChange(control.id, input.checked);
  });

  container.append(input, toggle);
  return container;
}
