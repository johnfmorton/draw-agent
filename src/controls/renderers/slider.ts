import type { SliderControl } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderSlider(
  control: SliderControl,
  value: number,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-slider';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step ?? 'any');
  input.value = String(value);

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'value-display';
  valueDisplay.textContent = formatNumber(value, control.step);

  input.addEventListener('input', () => {
    const newValue = parseFloat(input.value);
    valueDisplay.textContent = formatNumber(newValue, control.step);
    onChange(control.id, newValue);
  });

  container.append(input, valueDisplay);
  return container;
}

function formatNumber(value: number, step?: number): string {
  if (step !== undefined && step >= 1) {
    return String(Math.round(value));
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
}
