import type { RectangleControl, Rectangle } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderRectangle(
  control: RectangleControl,
  value: Rectangle,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-rectangle';

  let currentValue = { ...value };

  const row1 = document.createElement('div');
  row1.className = 'rectangle-row';

  const row2 = document.createElement('div');
  row2.className = 'rectangle-row';

  const xInput = createNumberInput('X', value.x, (x) => {
    currentValue = { ...currentValue, x };
    onChange(control.id, currentValue);
  });

  const yInput = createNumberInput('Y', value.y, (y) => {
    currentValue = { ...currentValue, y };
    onChange(control.id, currentValue);
  });

  const wInput = createNumberInput('W', value.width, (width) => {
    currentValue = { ...currentValue, width };
    onChange(control.id, currentValue);
  });

  const hInput = createNumberInput('H', value.height, (height) => {
    currentValue = { ...currentValue, height };
    onChange(control.id, currentValue);
  });

  row1.append(xInput, yInput);
  row2.append(wInput, hInput);
  container.append(row1, row2);

  return container;
}

function createNumberInput(
  label: string,
  value: number,
  onChange: (value: number) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'number-input';

  const labelEl = document.createElement('span');
  labelEl.className = 'number-label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);

  input.addEventListener('change', () => {
    const newValue = parseFloat(input.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  });

  wrapper.append(labelEl, input);
  return wrapper;
}
