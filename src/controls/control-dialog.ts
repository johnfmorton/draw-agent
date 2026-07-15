import type {
  ControlDefinition,
  ControlSchema,
  SliderControl,
  NumericControl,
  ToggleControl,
  DropdownControl,
  SeedControl,
  Point2DControl,
  VectorControl,
  RectangleControl,
} from './schema';
import { generateControlsBlock } from '../artwork-template';

export type ControlDialogResult =
  | { action: 'create'; control: ControlDefinition; writeToFile: boolean }
  | { action: 'update'; control: ControlDefinition; writeToFile: boolean }
  | { action: 'delete'; controlId: string; writeToFile: boolean };

export interface ControlDialogOptions {
  /**
   * Artwork name whose file can receive the change. When set, the
   * dialog offers a "Write to art/<name>.ts" checkbox; when omitted
   * (no dev server), changes stay browser-only.
   */
  fileTarget?: string;
}

const WRITE_TO_FILE_KEY = 'draw-agent:controls-write-to-file';

/**
 * The user's last "write control changes to file" choice (default: on).
 * Shared with actions that have no dialog, like drag-reordering.
 */
export function getWriteControlsToFilePreference(): boolean {
  return localStorage.getItem(WRITE_TO_FILE_KEY) !== 'false';
}

type ControlType = ControlDefinition['type'];

const CONTROL_TYPES: { value: ControlType; label: string }[] = [
  { value: 'slider', label: 'Slider' },
  { value: 'numeric', label: 'Numeric Input' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'seed', label: 'Seed / Randomize' },
  { value: 'point2d', label: '2D Point' },
  { value: 'vector', label: 'Vector' },
  { value: 'rectangle', label: 'Rectangle' },
];

/**
 * Open a dialog to add or edit a control.
 */
export function openControlDialog(
  existing?: ControlDefinition,
  options?: ControlDialogOptions
): Promise<ControlDialogResult | null> {
  return new Promise((resolve) => {
    const isEdit = !!existing;
    const fileTarget = options?.fileTarget;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'control-dialog';

    dialog.innerHTML = `
      <h2>${isEdit ? 'Edit Control' : 'Add Control'}</h2>

      <div class="dialog-field">
        <label>Type</label>
        <select id="dialog-type" ${isEdit ? 'disabled' : ''}>
          ${CONTROL_TYPES.map(
            (t) =>
              `<option value="${t.value}" ${existing?.type === t.value ? 'selected' : ''}>${t.label}</option>`
          ).join('')}
        </select>
      </div>

      <div class="dialog-field">
        <label>ID <span class="dialog-hint">(variable name, e.g., lineWidth)</span></label>
        <input type="text" id="dialog-id" pattern="[a-zA-Z_][a-zA-Z0-9_]*"
               placeholder="lineWidth" value="${existing?.id ?? ''}" ${isEdit ? 'disabled' : ''}>
      </div>

      <div class="dialog-field">
        <label>Label <span class="dialog-hint">(display name)</span></label>
        <input type="text" id="dialog-label" placeholder="Line Width" value="${existing?.label ?? ''}">
      </div>

      <div class="dialog-field">
        <label>Description <span class="dialog-hint">(optional tooltip)</span></label>
        <input type="text" id="dialog-description" placeholder="Controls the stroke width"
               value="${existing?.description ?? ''}">
      </div>

      <div id="dialog-type-fields"></div>

      ${
        fileTarget
          ? `<div class="checkbox-field dialog-write-file">
               <input type="checkbox" id="dialog-write-file" />
               <label for="dialog-write-file">Write to <strong>art/${fileTarget}.ts</strong> <span class="dialog-hint">(updates the controls block in the file)</span></label>
             </div>`
          : ''
      }

      <div class="dialog-actions">
        ${isEdit ? '<button type="button" id="dialog-delete" class="dialog-btn-danger">Delete</button>' : ''}
        <div class="dialog-actions-right">
          <button type="button" id="dialog-cancel" class="dialog-btn-secondary">Cancel</button>
          <button type="button" id="dialog-save" class="dialog-btn-primary">${isEdit ? 'Update' : 'Add'}</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Elements
    const typeSelect = dialog.querySelector('#dialog-type') as HTMLSelectElement;
    const idInput = dialog.querySelector('#dialog-id') as HTMLInputElement;
    const labelInput = dialog.querySelector('#dialog-label') as HTMLInputElement;
    const typeFieldsContainer = dialog.querySelector('#dialog-type-fields') as HTMLDivElement;
    const writeFileCheckbox = dialog.querySelector('#dialog-write-file') as HTMLInputElement | null;

    // Restore the last write-to-file choice (default: on)
    if (writeFileCheckbox) {
      writeFileCheckbox.checked = localStorage.getItem(WRITE_TO_FILE_KEY) !== 'false';
    }

    function shouldWriteToFile(): boolean {
      if (!writeFileCheckbox) return false;
      localStorage.setItem(WRITE_TO_FILE_KEY, String(writeFileCheckbox.checked));
      return writeFileCheckbox.checked;
    }

    // Render type-specific fields
    function renderTypeFields() {
      const type = typeSelect.value as ControlType;
      typeFieldsContainer.innerHTML = getTypeFieldsHtml(type, existing);
      setupDropdownOptionsHandlers(typeFieldsContainer);
    }

    typeSelect.addEventListener('change', renderTypeFields);
    renderTypeFields();

    // Close handler
    const close = (result: ControlDialogResult | null) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    // Escape to close
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(null);
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Button handlers
    dialog.querySelector('#dialog-cancel')!.addEventListener('click', () => close(null));

    dialog.querySelector('#dialog-delete')?.addEventListener('click', () => {
      if (confirm(`Delete control "${existing!.label}"?`)) {
        close({
          action: 'delete',
          controlId: existing!.id,
          writeToFile: shouldWriteToFile(),
        });
      }
    });

    dialog.querySelector('#dialog-save')!.addEventListener('click', () => {
      const id = idInput.value.trim();
      const label = labelInput.value.trim();

      if (!id) {
        alert('ID is required');
        return;
      }
      if (!label) {
        alert('Label is required');
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
        alert('ID must be a valid variable name (letters, numbers, underscores, not starting with a number)');
        return;
      }

      const control = buildControlFromDialog(dialog);
      if (control) {
        close({
          action: isEdit ? 'update' : 'create',
          control,
          writeToFile: shouldWriteToFile(),
        });
      }
    });
  });
}

/**
 * Get HTML for type-specific fields.
 */
function getTypeFieldsHtml(type: ControlType, existing?: ControlDefinition): string {
  switch (type) {
    case 'slider': {
      const ctrl = existing as SliderControl | undefined;
      return `
        <div class="dialog-field-row">
          <div class="dialog-field">
            <label>Min</label>
            <input type="number" id="field-min" value="${ctrl?.min ?? 0}" step="any">
          </div>
          <div class="dialog-field">
            <label>Max</label>
            <input type="number" id="field-max" value="${ctrl?.max ?? 100}" step="any">
          </div>
          <div class="dialog-field">
            <label>Step</label>
            <input type="number" id="field-step" value="${ctrl?.step ?? 1}" step="any">
          </div>
        </div>
        <div class="dialog-field">
          <label>Default</label>
          <input type="number" id="field-default" value="${ctrl?.default ?? 50}" step="any">
        </div>
      `;
    }

    case 'numeric': {
      const ctrl = existing as NumericControl | undefined;
      return `
        <div class="dialog-field-row">
          <div class="dialog-field">
            <label>Min <span class="dialog-hint">(optional)</span></label>
            <input type="number" id="field-min" value="${ctrl?.min ?? ''}" step="any">
          </div>
          <div class="dialog-field">
            <label>Max <span class="dialog-hint">(optional)</span></label>
            <input type="number" id="field-max" value="${ctrl?.max ?? ''}" step="any">
          </div>
          <div class="dialog-field">
            <label>Step <span class="dialog-hint">(optional)</span></label>
            <input type="number" id="field-step" value="${ctrl?.step ?? ''}" step="any">
          </div>
        </div>
        <div class="dialog-field">
          <label>Default</label>
          <input type="number" id="field-default" value="${ctrl?.default ?? 0}" step="any">
        </div>
      `;
    }

    case 'toggle': {
      const ctrl = existing as ToggleControl | undefined;
      return `
        <div class="dialog-field">
          <label>Default</label>
          <select id="field-default">
            <option value="false" ${ctrl?.default === false ? 'selected' : ''}>Off (false)</option>
            <option value="true" ${ctrl?.default === true ? 'selected' : ''}>On (true)</option>
          </select>
        </div>
      `;
    }

    case 'dropdown': {
      const ctrl = existing as DropdownControl | undefined;
      const options = ctrl?.options ?? [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ];
      return `
        <div class="dialog-field">
          <label>Options</label>
          <div id="dropdown-options" class="dropdown-options-list">
            ${options
              .map(
                (opt, i) => `
              <div class="dropdown-option-row" data-index="${i}">
                <input type="text" placeholder="value" value="${opt.value}" class="opt-value">
                <input type="text" placeholder="label" value="${opt.label}" class="opt-label">
                <button type="button" class="remove-option" title="Remove">×</button>
              </div>
            `
              )
              .join('')}
          </div>
          <button type="button" id="add-option" class="dialog-btn-secondary">+ Add Option</button>
        </div>
        <div class="dialog-field">
          <label>Default</label>
          <input type="text" id="field-default" value="${ctrl?.default ?? options[0]?.value ?? ''}"
                 placeholder="Must match an option value">
        </div>
      `;
    }

    case 'seed': {
      const ctrl = existing as SeedControl | undefined;
      return `
        <div class="dialog-field">
          <label>Default Seed</label>
          <input type="number" id="field-default" value="${ctrl?.default ?? Math.floor(Math.random() * 100000)}" min="0" max="2147483647">
        </div>
      `;
    }

    case 'point2d': {
      const ctrl = existing as Point2DControl | undefined;
      return `
        <div class="dialog-field">
          <label>Default Position</label>
          <div class="dialog-field-row">
            <div class="dialog-field">
              <label>X</label>
              <input type="number" id="field-default-x" value="${ctrl?.default.x ?? 0}" step="any">
            </div>
            <div class="dialog-field">
              <label>Y</label>
              <input type="number" id="field-default-y" value="${ctrl?.default.y ?? 0}" step="any">
            </div>
          </div>
        </div>
        <div class="dialog-field">
          <label>Bounds <span class="dialog-hint">(optional, enables XY pad)</span></label>
          <div class="dialog-field-row">
            <input type="number" id="field-min-x" value="${ctrl?.bounds?.minX ?? ''}" placeholder="Min X" step="any">
            <input type="number" id="field-max-x" value="${ctrl?.bounds?.maxX ?? ''}" placeholder="Max X" step="any">
            <input type="number" id="field-min-y" value="${ctrl?.bounds?.minY ?? ''}" placeholder="Min Y" step="any">
            <input type="number" id="field-max-y" value="${ctrl?.bounds?.maxY ?? ''}" placeholder="Max Y" step="any">
          </div>
        </div>
      `;
    }

    case 'vector': {
      const ctrl = existing as VectorControl | undefined;
      return `
        <div class="dialog-field">
          <label>Default Vector</label>
          <div class="dialog-field-row">
            <div class="dialog-field">
              <label>X</label>
              <input type="number" id="field-default-x" value="${ctrl?.default.x ?? 0}" step="any">
            </div>
            <div class="dialog-field">
              <label>Y</label>
              <input type="number" id="field-default-y" value="${ctrl?.default.y ?? 0}" step="any">
            </div>
          </div>
        </div>
      `;
    }

    case 'rectangle': {
      const ctrl = existing as RectangleControl | undefined;
      return `
        <div class="dialog-field">
          <label>Default Rectangle</label>
          <div class="dialog-field-row">
            <div class="dialog-field">
              <label>X</label>
              <input type="number" id="field-default-x" value="${ctrl?.default.x ?? 0}" step="any">
            </div>
            <div class="dialog-field">
              <label>Y</label>
              <input type="number" id="field-default-y" value="${ctrl?.default.y ?? 0}" step="any">
            </div>
            <div class="dialog-field">
              <label>Width</label>
              <input type="number" id="field-default-w" value="${ctrl?.default.width ?? 100}" step="any">
            </div>
            <div class="dialog-field">
              <label>Height</label>
              <input type="number" id="field-default-h" value="${ctrl?.default.height ?? 100}" step="any">
            </div>
          </div>
        </div>
      `;
    }

    default:
      return '';
  }
}

/**
 * Set up handlers for dropdown options add/remove.
 */
function setupDropdownOptionsHandlers(container: HTMLElement) {
  const optionsList = container.querySelector('#dropdown-options');
  const addBtn = container.querySelector('#add-option');

  if (!optionsList || !addBtn) return;

  addBtn.addEventListener('click', () => {
    const index = optionsList.children.length;
    const row = document.createElement('div');
    row.className = 'dropdown-option-row';
    row.dataset.index = String(index);
    row.innerHTML = `
      <input type="text" placeholder="value" value="" class="opt-value">
      <input type="text" placeholder="label" value="" class="opt-label">
      <button type="button" class="remove-option" title="Remove">×</button>
    `;
    optionsList.appendChild(row);
  });

  optionsList.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('remove-option')) {
      const row = (e.target as HTMLElement).closest('.dropdown-option-row');
      if (row && optionsList.children.length > 1) {
        row.remove();
      }
    }
  });
}

/**
 * Build a control definition from dialog inputs.
 */
function buildControlFromDialog(dialog: HTMLElement): ControlDefinition | null {
  const type = (dialog.querySelector('#dialog-type') as HTMLSelectElement).value as ControlType;
  const id = (dialog.querySelector('#dialog-id') as HTMLInputElement).value.trim();
  const label = (dialog.querySelector('#dialog-label') as HTMLInputElement).value.trim();
  const descriptionValue = (dialog.querySelector('#dialog-description') as HTMLInputElement).value.trim();

  // Only include description if it has a value (exactOptionalPropertyTypes)
  const base = descriptionValue
    ? { id, label, description: descriptionValue }
    : { id, label };

  switch (type) {
    case 'slider': {
      const min = parseFloat((dialog.querySelector('#field-min') as HTMLInputElement).value);
      const max = parseFloat((dialog.querySelector('#field-max') as HTMLInputElement).value);
      const stepVal = parseFloat((dialog.querySelector('#field-step') as HTMLInputElement).value);
      const defaultVal = parseFloat((dialog.querySelector('#field-default') as HTMLInputElement).value);
      const result: SliderControl = { type: 'slider', ...base, min, max, default: defaultVal };
      if (!isNaN(stepVal) && stepVal > 0) result.step = stepVal;
      return result;
    }

    case 'numeric': {
      const minVal = (dialog.querySelector('#field-min') as HTMLInputElement).value;
      const maxVal = (dialog.querySelector('#field-max') as HTMLInputElement).value;
      const stepVal = (dialog.querySelector('#field-step') as HTMLInputElement).value;
      const defaultVal = parseFloat((dialog.querySelector('#field-default') as HTMLInputElement).value);
      const result: NumericControl = { type: 'numeric', ...base, default: defaultVal };
      if (minVal) result.min = parseFloat(minVal);
      if (maxVal) result.max = parseFloat(maxVal);
      if (stepVal) result.step = parseFloat(stepVal);
      return result;
    }

    case 'toggle': {
      const defaultVal = (dialog.querySelector('#field-default') as HTMLSelectElement).value === 'true';
      return { type: 'toggle', ...base, default: defaultVal } as ToggleControl;
    }

    case 'dropdown': {
      const optionRows = dialog.querySelectorAll('.dropdown-option-row');
      const options: { value: string; label: string }[] = [];
      optionRows.forEach((row) => {
        const value = (row.querySelector('.opt-value') as HTMLInputElement).value.trim();
        const optLabel = (row.querySelector('.opt-label') as HTMLInputElement).value.trim();
        if (value && optLabel) {
          options.push({ value, label: optLabel });
        }
      });
      if (options.length === 0) {
        alert('At least one option is required');
        return null;
      }
      const defaultVal = (dialog.querySelector('#field-default') as HTMLInputElement).value.trim();
      return { type: 'dropdown', ...base, options, default: defaultVal || options[0].value } as DropdownControl;
    }

    case 'seed': {
      const defaultVal = parseInt((dialog.querySelector('#field-default') as HTMLInputElement).value, 10);
      return { type: 'seed', ...base, default: defaultVal } as SeedControl;
    }

    case 'point2d': {
      const x = parseFloat((dialog.querySelector('#field-default-x') as HTMLInputElement).value);
      const y = parseFloat((dialog.querySelector('#field-default-y') as HTMLInputElement).value);
      const minX = (dialog.querySelector('#field-min-x') as HTMLInputElement).value;
      const maxX = (dialog.querySelector('#field-max-x') as HTMLInputElement).value;
      const minY = (dialog.querySelector('#field-min-y') as HTMLInputElement).value;
      const maxY = (dialog.querySelector('#field-max-y') as HTMLInputElement).value;
      const result: Point2DControl = { type: 'point2d', ...base, default: { x, y } };
      if (minX && maxX && minY && maxY) {
        result.bounds = {
          minX: parseFloat(minX),
          maxX: parseFloat(maxX),
          minY: parseFloat(minY),
          maxY: parseFloat(maxY),
        };
      }
      return result;
    }

    case 'vector': {
      const x = parseFloat((dialog.querySelector('#field-default-x') as HTMLInputElement).value);
      const y = parseFloat((dialog.querySelector('#field-default-y') as HTMLInputElement).value);
      return { type: 'vector', ...base, default: { x, y } } as VectorControl;
    }

    case 'rectangle': {
      const x = parseFloat((dialog.querySelector('#field-default-x') as HTMLInputElement).value);
      const y = parseFloat((dialog.querySelector('#field-default-y') as HTMLInputElement).value);
      const width = parseFloat((dialog.querySelector('#field-default-w') as HTMLInputElement).value);
      const height = parseFloat((dialog.querySelector('#field-default-h') as HTMLInputElement).value);
      return { type: 'rectangle', ...base, default: { x, y, width, height } } as RectangleControl;
    }

    default:
      return null;
  }
}

/**
 * Generate TypeScript code for controls schema.
 * Delegates to the shared serializer, which escapes string values
 * correctly (the old JSON-based approach broke on apostrophes).
 */
export function generateControlsCode(controls: ControlSchema): string {
  return generateControlsBlock(controls);
}
