import type { NumericControl } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderNumeric(
  control: NumericControl,
  value: number,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-numeric';

  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);

  if (control.min !== undefined) {
    input.min = String(control.min);
  }
  if (control.max !== undefined) {
    input.max = String(control.max);
  }
  if (control.step !== undefined) {
    input.step = String(control.step);
  }

  input.addEventListener('change', () => {
    let newValue = parseFloat(input.value);
    if (isNaN(newValue)) {
      newValue = control.default;
      input.value = String(newValue);
    }
    onChange(control.id, newValue);
  });

  container.appendChild(input);
  return container;
}
