import type { Point2DControl, Point2D } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderPoint2D(
  control: Point2DControl,
  value: Point2D,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-point2d';

  // Current value for updates
  let currentValue = { ...value };

  // Numeric inputs row
  const inputsRow = document.createElement('div');
  inputsRow.className = 'point2d-inputs';

  const xInput = createNumberInput('X', value.x, (x) => {
    currentValue = { ...currentValue, x };
    onChange(control.id, currentValue);
    if (marker) updateMarker(currentValue.x, currentValue.y);
  });

  const yInput = createNumberInput('Y', value.y, (y) => {
    currentValue = { ...currentValue, y };
    onChange(control.id, currentValue);
    if (marker) updateMarker(currentValue.x, currentValue.y);
  });

  inputsRow.append(xInput, yInput);
  container.appendChild(inputsRow);

  // Optional XY pad if bounds are provided
  let marker: HTMLElement | null = null;
  let updateMarker: (x: number, y: number) => void = () => {};

  if (control.bounds) {
    const { minX, maxX, minY, maxY } = control.bounds;

    const pad = document.createElement('div');
    pad.className = 'xy-pad';

    marker = document.createElement('div');
    marker.className = 'xy-marker';

    updateMarker = (x: number, y: number) => {
      const pctX = ((x - minX) / (maxX - minX)) * 100;
      const pctY = ((y - minY) / (maxY - minY)) * 100;
      marker!.style.left = `${Math.max(0, Math.min(100, pctX))}%`;
      marker!.style.top = `${Math.max(0, Math.min(100, pctY))}%`;
    };

    updateMarker(value.x, value.y);

    const handlePointerMove = (e: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      const pctX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const pctY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const x = Math.round(minX + pctX * (maxX - minX));
      const y = Math.round(minY + pctY * (maxY - minY));
      currentValue = { x, y };
      updateMarker(x, y);

      // Update inputs
      const xInputEl = xInput.querySelector('input') as HTMLInputElement;
      const yInputEl = yInput.querySelector('input') as HTMLInputElement;
      xInputEl.value = String(x);
      yInputEl.value = String(y);

      onChange(control.id, currentValue);
    };

    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      pad.addEventListener('pointermove', handlePointerMove);
      pad.addEventListener(
        'pointerup',
        () => {
          pad.removeEventListener('pointermove', handlePointerMove);
        },
        { once: true }
      );
      handlePointerMove(e);
    });

    pad.appendChild(marker);
    container.appendChild(pad);
  }

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
  input.value = String(Math.round(value));

  input.addEventListener('change', () => {
    const newValue = parseFloat(input.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  });

  wrapper.append(labelEl, input);
  return wrapper;
}
