import type { VectorControl, Point2D } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderVector(
  control: VectorControl,
  value: Point2D,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-vector';

  let currentValue = { ...value };

  const inputsRow = document.createElement('div');
  inputsRow.className = 'vector-inputs';

  const xWrapper = createNumberInput('X', value.x, (x) => {
    currentValue = { ...currentValue, x };
    onChange(control.id, currentValue);
    updateMagnitude();
  });

  const yWrapper = createNumberInput('Y', value.y, (y) => {
    currentValue = { ...currentValue, y };
    onChange(control.id, currentValue);
    updateMagnitude();
  });

  inputsRow.append(xWrapper, yWrapper);

  // Magnitude display
  const magnitudeDisplay = document.createElement('span');
  magnitudeDisplay.className = 'vector-magnitude';

  const updateMagnitude = () => {
    const mag = Math.sqrt(
      currentValue.x * currentValue.x + currentValue.y * currentValue.y
    );
    magnitudeDisplay.textContent = `|${mag.toFixed(1)}|`;
  };
  updateMagnitude();

  container.append(inputsRow, magnitudeDisplay);
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
  input.step = 'any';

  input.addEventListener('change', () => {
    const newValue = parseFloat(input.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  });

  wrapper.append(labelEl, input);
  return wrapper;
}
