import {
  type CanvasConfig,
  type CanvasUnit,
  CANVAS_PRESETS,
  formatCanvasSize,
} from './schema';

export type CanvasChangeHandler = (canvas: CanvasConfig) => void;

/**
 * Create the canvas size controls for the header.
 */
export function createCanvasControls(
  canvas: CanvasConfig,
  fileCanvas: CanvasConfig,
  onChange: CanvasChangeHandler,
  onReset: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'canvas-controls';

  // Preset selector
  const presetSelect = document.createElement('select');
  presetSelect.className = 'canvas-preset';
  presetSelect.title = 'Canvas presets';

  const customOption = document.createElement('option');
  customOption.value = '';
  customOption.textContent = 'Custom';
  presetSelect.appendChild(customOption);

  for (const [name, preset] of Object.entries(CANVAS_PRESETS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    // Check if current canvas matches this preset
    if (
      canvas.width === preset.width &&
      canvas.height === preset.height &&
      canvas.unit === preset.unit
    ) {
      option.selected = true;
    }
    presetSelect.appendChild(option);
  }

  presetSelect.addEventListener('change', () => {
    const preset = CANVAS_PRESETS[presetSelect.value];
    if (preset) {
      onChange({ ...preset });
    }
  });

  // Width input
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.className = 'canvas-dimension';
  widthInput.value = String(canvas.width);
  widthInput.min = '0.1';
  widthInput.step = '0.1';
  widthInput.title = 'Width';

  widthInput.addEventListener('change', () => {
    const width = parseFloat(widthInput.value);
    if (!isNaN(width) && width > 0) {
      presetSelect.value = '';
      onChange({ ...canvas, width });
    }
  });

  // × separator
  const separator = document.createElement('span');
  separator.className = 'canvas-separator';
  separator.textContent = '×';

  // Height input
  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.className = 'canvas-dimension';
  heightInput.value = String(canvas.height);
  heightInput.min = '0.1';
  heightInput.step = '0.1';
  heightInput.title = 'Height';

  heightInput.addEventListener('change', () => {
    const height = parseFloat(heightInput.value);
    if (!isNaN(height) && height > 0) {
      presetSelect.value = '';
      onChange({ ...canvas, height });
    }
  });

  // Unit selector
  const unitSelect = document.createElement('select');
  unitSelect.className = 'canvas-unit';
  unitSelect.title = 'Unit';

  const units: { value: CanvasUnit; label: string }[] = [
    { value: 'in', label: 'in' },
    { value: 'mm', label: 'mm' },
    { value: 'cm', label: 'cm' },
    { value: 'px', label: 'px' },
  ];

  for (const { value, label } of units) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = canvas.unit === value;
    unitSelect.appendChild(option);
  }

  unitSelect.addEventListener('change', () => {
    presetSelect.value = '';
    onChange({ ...canvas, unit: unitSelect.value as CanvasUnit });
  });

  // Reset button (shows when different from file)
  const isDirty =
    canvas.width !== fileCanvas.width ||
    canvas.height !== fileCanvas.height ||
    canvas.unit !== fileCanvas.unit;

  const resetBtn = document.createElement('button');
  resetBtn.className = `canvas-reset ${isDirty ? 'is-visible' : ''}`;
  resetBtn.innerHTML = '↩';
  resetBtn.title = `Reset to ${formatCanvasSize(fileCanvas)}`;
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', onReset);

  container.append(
    presetSelect,
    widthInput,
    separator,
    heightInput,
    unitSelect,
    resetBtn
  );

  return container;
}
