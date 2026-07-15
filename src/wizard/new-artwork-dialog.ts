/**
 * "New Artwork" wizard dialog.
 *
 * Multi-step dialog that collects the essentials for a new artwork —
 * filename/title, paper size, drawing approach, optional helpers — then
 * generates the file via the shared template (src/artwork-template.ts)
 * and writes it through the art-files dev-server endpoint.
 *
 * Follows the overlay/panel dialog pattern from controls/control-dialog.ts.
 */

import {
  CANVAS_PRESETS,
  DEFAULT_CANVAS,
  formatCanvasSize,
  type CanvasConfig,
  type CanvasUnit,
} from '../controls/schema';
import {
  generateArtworkSource,
  makeSeedControl,
  isValidArtworkName,
  normalizeArtworkName,
  titleFromName,
  HELPER_GROUPS,
  type ArtworkApi,
  type HelperGroupId,
} from '../artwork-template';

export interface NewArtworkResult {
  name: string;
}

/**
 * Create art/<name>.ts on disk via the dev-server endpoint.
 * Uses ?create=1 so an existing file yields a 409 instead of being
 * overwritten.
 */
export async function createArtworkFile(
  name: string,
  source: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(`/__art/${encodeURIComponent(name)}?create=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: source,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, message: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

interface WizardState {
  name: string;
  title: string;
  titleTouched: boolean;
  description: string;
  preset: string; // key into CANVAS_PRESETS, '' = custom
  canvas: CanvasConfig;
  api: ArtworkApi;
  helpers: Set<HelperGroupId>;
}

const STEP_TITLES = ['Name', 'Paper size', 'Drawing approach', 'Optional helpers'];

/**
 * Open the wizard. Resolves with the created artwork's name after the
 * file has been written to disk, or null if cancelled.
 */
export function openNewArtworkDialog(
  existingNames: readonly string[]
): Promise<NewArtworkResult | null> {
  return new Promise((resolve) => {
    const state: WizardState = {
      name: '',
      title: '',
      titleTouched: false,
      description: '',
      preset: 'US Letter',
      canvas: { ...DEFAULT_CANVAS },
      api: 'svgjs',
      helpers: new Set(),
    };
    let step = 0;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'control-dialog wizard-dialog';
    dialog.innerHTML = `
      <h2>New Artwork</h2>
      <p class="wizard-step-indicator"></p>
      <div class="wizard-step-body"></div>
      <div class="dialog-actions">
        <button id="wiz-cancel" class="dialog-btn-secondary">Cancel</button>
        <div class="dialog-actions-right">
          <button id="wiz-back" class="dialog-btn-secondary">Back</button>
          <button id="wiz-next" class="dialog-btn-primary">Next</button>
          <button id="wiz-create" class="dialog-btn-primary">Create</button>
        </div>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const indicatorEl = dialog.querySelector<HTMLElement>('.wizard-step-indicator')!;
    const bodyEl = dialog.querySelector<HTMLElement>('.wizard-step-body')!;
    const cancelBtn = dialog.querySelector<HTMLButtonElement>('#wiz-cancel')!;
    const backBtn = dialog.querySelector<HTMLButtonElement>('#wiz-back')!;
    const nextBtn = dialog.querySelector<HTMLButtonElement>('#wiz-next')!;
    const createBtn = dialog.querySelector<HTMLButtonElement>('#wiz-create')!;

    function close(result: NewArtworkResult | null) {
      document.removeEventListener('keydown', handleKeydown);
      document.body.removeChild(overlay);
      resolve(result);
    }

    function isDirty(): boolean {
      return (
        state.name !== '' || state.titleTouched || state.description !== ''
      );
    }

    function requestCancel() {
      if (isDirty() && !confirm('Discard new artwork?')) return;
      close(null);
    }

    /** Error for step 1's name field, or null if it's valid. */
    function nameError(): string | null {
      if (!state.name) return 'Filename is required';
      if (!isValidArtworkName(state.name)) {
        return 'Use lowercase letters, numbers, and hyphens only';
      }
      if (existingNames.includes(state.name)) {
        return `art/${state.name}.ts already exists`;
      }
      return null;
    }

    function stepValid(): boolean {
      if (step === 0) return nameError() === null;
      if (step === 1) {
        return state.canvas.width > 0 && state.canvas.height > 0;
      }
      return true;
    }

    function updateFooter() {
      backBtn.style.display = step === 0 ? 'none' : '';
      nextBtn.style.display = step === STEP_TITLES.length - 1 ? 'none' : '';
      createBtn.style.display = step === STEP_TITLES.length - 1 ? '' : 'none';
      nextBtn.disabled = !stepValid();
    }

    function goToStep(target: number) {
      step = target;
      renderStep();
    }

    // --- Step renderers ---

    function renderNameStep() {
      bodyEl.innerHTML = `
        <div class="dialog-field">
          <label for="wiz-name">Filename</label>
          <div class="filename-input-row">
            <input type="text" id="wiz-name" placeholder="my-artwork" autocomplete="off" spellcheck="false" />
            <span class="filename-ext">.ts</span>
          </div>
          <p class="dialog-hint" id="wiz-name-hint"></p>
        </div>
        <div class="dialog-field">
          <label for="wiz-title">Title</label>
          <input type="text" id="wiz-title" autocomplete="off" />
        </div>
        <div class="dialog-field">
          <label for="wiz-desc">Description <span class="dialog-hint">(optional)</span></label>
          <input type="text" id="wiz-desc" autocomplete="off" />
        </div>
      `;

      const nameInput = bodyEl.querySelector<HTMLInputElement>('#wiz-name')!;
      const titleInput = bodyEl.querySelector<HTMLInputElement>('#wiz-title')!;
      const descInput = bodyEl.querySelector<HTMLInputElement>('#wiz-desc')!;
      const hintEl = bodyEl.querySelector<HTMLElement>('#wiz-name-hint')!;

      // Values set programmatically — user text never goes through innerHTML
      nameInput.value = state.name;
      titleInput.value = state.titleTouched ? state.title : titleFromName(state.name);
      descInput.value = state.description;

      function refreshNameFeedback() {
        const error = state.name ? nameError() : null;
        hintEl.textContent =
          error ??
          (state.name
            ? `Will create art/${state.name}.ts`
            : 'Lowercase letters, numbers, and hyphens');
        hintEl.classList.toggle('is-error', error !== null);
        updateFooter();
      }
      refreshNameFeedback();

      nameInput.addEventListener('input', () => {
        state.name = normalizeArtworkName(nameInput.value);
        if (!state.titleTouched) {
          titleInput.value = titleFromName(state.name);
          state.title = titleInput.value;
        }
        refreshNameFeedback();
      });
      titleInput.addEventListener('input', () => {
        state.titleTouched = true;
        state.title = titleInput.value;
      });
      descInput.addEventListener('input', () => {
        state.description = descInput.value;
      });

      nameInput.focus();
    }

    function renderPaperStep() {
      const presetOptions = Object.entries(CANVAS_PRESETS)
        .map(
          ([key, preset]) =>
            `<option value="${key}">${key} (${formatCanvasSize(preset)})</option>`
        )
        .join('');

      bodyEl.innerHTML = `
        <div class="dialog-field">
          <label for="wiz-preset">Preset</label>
          <select id="wiz-preset">
            <option value="">Custom</option>
            ${presetOptions}
          </select>
        </div>
        <div class="dialog-field">
          <label>Size</label>
          <div class="dialog-field-row">
            <input type="number" id="wiz-width" min="0" step="any" title="Width" />
            <input type="number" id="wiz-height" min="0" step="any" title="Height" />
            <select id="wiz-unit" title="Unit">
              <option value="in">in</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="px">px</option>
            </select>
          </div>
        </div>
      `;

      const presetSelect = bodyEl.querySelector<HTMLSelectElement>('#wiz-preset')!;
      const widthInput = bodyEl.querySelector<HTMLInputElement>('#wiz-width')!;
      const heightInput = bodyEl.querySelector<HTMLInputElement>('#wiz-height')!;
      const unitSelect = bodyEl.querySelector<HTMLSelectElement>('#wiz-unit')!;

      function applyCanvasToInputs() {
        presetSelect.value = state.preset;
        widthInput.value = String(state.canvas.width);
        heightInput.value = String(state.canvas.height);
        unitSelect.value = state.canvas.unit;
      }
      applyCanvasToInputs();

      presetSelect.addEventListener('change', () => {
        state.preset = presetSelect.value;
        const preset = CANVAS_PRESETS[state.preset];
        if (preset) {
          state.canvas = { ...preset };
          applyCanvasToInputs();
        }
        updateFooter();
      });

      function handleDimensionChange() {
        state.preset = '';
        presetSelect.value = '';
        state.canvas = {
          width: parseFloat(widthInput.value) || 0,
          height: parseFloat(heightInput.value) || 0,
          unit: unitSelect.value as CanvasUnit,
        };
        updateFooter();
      }
      widthInput.addEventListener('input', handleDimensionChange);
      heightInput.addEventListener('input', handleDimensionChange);
      unitSelect.addEventListener('change', handleDimensionChange);
    }

    function renderApproachStep() {
      bodyEl.innerHTML = `
        <div class="checkbox-field wizard-option">
          <input type="radio" name="wiz-api" id="wiz-api-svgjs" value="svgjs" />
          <label for="wiz-api-svgjs"><strong>SVG.js</strong> — chainable API, cleaner code (recommended)</label>
        </div>
        <div class="checkbox-field wizard-option">
          <input type="radio" name="wiz-api" id="wiz-api-raw" value="raw" />
          <label for="wiz-api-raw"><strong>Raw DOM</strong> — no dependencies, maximum control</label>
        </div>
      `;

      for (const input of bodyEl.querySelectorAll<HTMLInputElement>('input[name="wiz-api"]')) {
        input.checked = input.value === state.api;
        input.addEventListener('change', () => {
          if (input.checked) state.api = input.value as ArtworkApi;
        });
      }
    }

    function renderHelpersStep() {
      const renderGroup = (group: (typeof HELPER_GROUPS)[number]) => `
        <div class="checkbox-field wizard-option">
          <input type="checkbox" id="wiz-helper-${group.id}" value="${group.id}" />
          <label for="wiz-helper-${group.id}"><strong>${group.label}</strong> — ${group.hint}</label>
        </div>
      `;

      const gu = HELPER_GROUPS.filter((g) => g.id.startsWith('gu-'));
      const pkgs = HELPER_GROUPS.filter((g) => g.id.startsWith('pkg-'));

      bodyEl.innerHTML = `
        <p class="dialog-hint">Selected helpers are added as commented, ready-to-uncomment examples.</p>
        <p class="wizard-section-title">@johnfmorton/generative-utils</p>
        ${gu.map(renderGroup).join('')}
        <p class="wizard-section-title">Additional packages</p>
        ${pkgs.map(renderGroup).join('')}
      `;

      for (const input of bodyEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
        const id = input.value as HelperGroupId;
        input.checked = state.helpers.has(id);
        input.addEventListener('change', () => {
          if (input.checked) state.helpers.add(id);
          else state.helpers.delete(id);
        });
      }
    }

    function renderStep() {
      indicatorEl.textContent = `Step ${step + 1} of ${STEP_TITLES.length} — ${STEP_TITLES[step]}`;
      switch (step) {
        case 0:
          renderNameStep();
          break;
        case 1:
          renderPaperStep();
          break;
        case 2:
          renderApproachStep();
          break;
        case 3:
          renderHelpersStep();
          break;
      }
      updateFooter();
    }

    async function handleCreate() {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating…';

      const title = state.title.trim() || titleFromName(state.name);
      const description = state.description.trim();
      const source = generateArtworkSource({
        title,
        canvas: state.canvas,
        api: state.api,
        helpers: [...state.helpers],
        controls: [makeSeedControl(Math.floor(Math.random() * 2147483647))],
        ...(description ? { description } : {}),
      });

      const result = await createArtworkFile(state.name, source);
      if (result.ok) {
        close({ name: state.name });
        return;
      }

      createBtn.disabled = false;
      createBtn.textContent = 'Create';
      if (result.status === 409) {
        // Name got taken since the wizard opened — back to the name step
        existingNames = [...existingNames, state.name];
        goToStep(0);
      } else {
        alert(`Failed to create artwork: ${result.message}`);
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        requestCancel();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) {
        if (step < STEP_TITLES.length - 1) {
          if (stepValid()) goToStep(step + 1);
        } else if (!createBtn.disabled) {
          void handleCreate();
        }
      }
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) requestCancel();
    });
    document.addEventListener('keydown', handleKeydown);
    cancelBtn.addEventListener('click', requestCancel);
    backBtn.addEventListener('click', () => goToStep(step - 1));
    nextBtn.addEventListener('click', () => goToStep(step + 1));
    createBtn.addEventListener('click', () => void handleCreate());

    renderStep();
  });
}
