import {
  getAvailableArtworks,
  loadArtwork,
  getArtworkName,
  getArtworkPath,
  getArtworkCanvas,
  type ArtworkModule,
} from './artwork-loader';
import {
  getDefaults,
  deepEqual,
  formatValue,
  type CanvasConfig,
  DEFAULT_CANVAS,
  canvasToPixels,
} from './controls/schema';
import { renderControlList, createArtworkSelector } from './controls/control-list';
import { createCanvasControls } from './controls/canvas-controls';
import {
  openControlDialog,
  generateControlsCode,
  getWriteControlsToFilePreference,
} from './controls/control-dialog';
import type { ControlDefinition } from './controls/schema';
import {
  parseUrlState,
  encodeUrlState,
  getUrlHash,
  debouncedUpdateUrl,
  updateUrl,
  cancelPendingUrlUpdate,
} from './sync/url-state';
import { openNewArtworkDialog } from './wizard/new-artwork-dialog';
import {
  loadWorkingValues,
  saveWorkingValues,
  clearWorkingValues,
  getLastArtwork,
  setLastArtwork,
  loadWorkingCanvas,
  saveWorkingCanvas,
  clearWorkingCanvas,
} from './sync/local-storage';
import { exportSVG, openExportDialog } from './export/svg-export';
import {
  installConsoleCapture,
  initConsolePanel,
} from './console/console-panel';
import { initEditorPane } from './editor/editor-pane';

// Capture console output before anything else logs
installConsoleCapture();

declare global {
  interface Window {
    /** Set after the wizard creates a file, until the HMR re-run lands. */
    __drawAgentPendingCreate?: { name: string; timer: number };
  }
}

// App state
let currentArtwork: ArtworkModule | null = null;
let currentArtworkName: string = '';
let currentValues: Record<string, unknown> = {};
let currentCanvas: CanvasConfig = { ...DEFAULT_CANVAS };
let currentControls: ControlDefinition[] = [];  // Mutable copy of controls
let fileDefaults: Record<string, unknown> = {};
let fileCanvas: CanvasConfig = { ...DEFAULT_CANVAS };

// DOM elements
const previewEl = document.getElementById('preview')!;
const artworkCaptionEl = document.getElementById('artwork-caption')!;
const controlListEl = document.getElementById('control-list')!;
const artworkSelectorEl = document.getElementById('artwork-selector')!;
const headerActionsEl = document.getElementById('header-actions')!;
const resetBtn = document.getElementById('reset-btn')!;
const copyUrlBtn = document.getElementById('copy-url-btn')!;
const exportSvgBtn = document.getElementById('export-svg-btn')!;
const addControlBtn = document.getElementById('add-control-btn')!;
const exportControlsBtn = document.getElementById('export-controls-btn')!;
const newArtworkBtn = document.getElementById('new-artwork-btn')!;

// Canvas controls container (inserted before header actions).
// Reuse an existing container: main.ts re-executes on every HMR update,
// and unconditionally creating one would insert a duplicate each time.
const canvasControlsEl = (() => {
  const existing = document.getElementById('canvas-controls-container');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'canvas-controls-container';
  headerActionsEl.parentElement!.insertBefore(el, headerActionsEl);
  return el;
})();

// Console panel and code editor (state survives HMR re-runs)
initConsolePanel(document.getElementById('console-panel')!);
const editorPane = initEditorPane(
  document.getElementById('editor-pane')!,
  document.getElementById('editor-resizer')!
);

/**
 * Initialize the app.
 */
async function init() {
  const artworks = getAvailableArtworks();

  // A wizard-created file arrived via the glob update — cancel the
  // full-reload fallback.
  const pending = window.__drawAgentPendingCreate;
  if (pending && artworks.some((a) => a.name === pending.name)) {
    window.clearTimeout(pending.timer);
    delete window.__drawAgentPendingCreate;
  }

  if (artworks.length === 0) {
    previewEl.innerHTML = '<p class="no-artworks">No artworks found in art/ directory</p>';
    return;
  }

  // Determine which artwork to load
  const urlState = parseUrlState(getUrlHash(), []);
  let artworkToLoad = urlState.artwork
    ? getArtworkPath(urlState.artwork)
    : null;

  // Fall back to localStorage, then first artwork
  if (!artworkToLoad || !artworks.find((a) => a.path === artworkToLoad)) {
    const lastArtwork = getLastArtwork();
    artworkToLoad = lastArtwork
      ? getArtworkPath(lastArtwork)
      : artworks[0].path;
  }

  // Load the artwork
  await selectArtwork(artworkToLoad);

  // Set up event listeners. Handlers are assigned (not added) so they
  // stay singular when main.ts re-executes on HMR updates.
  resetBtn.onclick = handleResetAll;
  copyUrlBtn.onclick = handleCopyUrl;
  exportSvgBtn.onclick = handleExportSvg;
  addControlBtn.onclick = handleAddControl;
  exportControlsBtn.onclick = handleExportControls;
  newArtworkBtn.onclick = handleNewArtwork;

  // The wizard writes through the dev-server endpoint, which only
  // exists under `vite dev` — hide the button in built output.
  if (!import.meta.env.DEV) {
    (newArtworkBtn as HTMLElement).style.display = 'none';
  }

  // Listen for URL changes (back/forward)
  window.onpopstate = handlePopState;

  // Set up HMR
  if (import.meta.hot) {
    import.meta.hot.accept();

    // Sent by the art-files plugin when a file in art/ changes on disk
    import.meta.hot.on('art-file-changed', (data: { name: string }) => {
      void editorPane.handleExternalChange(data.name);
    });
  }
}

/**
 * Select and load an artwork.
 */
async function selectArtwork(path: string) {
  try {
    const artwork = await loadArtwork(path);
    const artworkName = getArtworkName(path);

    currentArtwork = artwork;
    currentArtworkName = artworkName;
    fileDefaults = getDefaults(artwork.controls);
    fileCanvas = getArtworkCanvas(artwork);
    currentControls = [...artwork.controls];  // Mutable copy

    // Determine initial values (URL > localStorage > file defaults)
    const urlState = parseUrlState(getUrlHash(), artwork.controls);
    const storedValues = loadWorkingValues(artworkName);
    const storedCanvas = loadWorkingCanvas(artworkName);

    if (urlState.artwork === artworkName && Object.keys(urlState.values).length > 0) {
      currentValues = { ...fileDefaults, ...urlState.values };
      currentCanvas = urlState.canvas ?? storedCanvas ?? { ...fileCanvas };
    } else if (storedValues) {
      currentValues = { ...fileDefaults, ...storedValues };
      currentCanvas = storedCanvas ?? { ...fileCanvas };
    } else {
      currentValues = { ...fileDefaults };
      currentCanvas = { ...fileCanvas };
    }

    // Update localStorage
    setLastArtwork(artworkName);
    saveWorkingValues(artworkName, currentValues);
    saveWorkingCanvas(artworkName, currentCanvas);

    // Update URL
    updateUrlFromState();

    // Render UI
    renderArtworkSelector();
    renderCanvasControls();
    renderControls();
    renderCaption();
    renderPreview();

    // Load source into the code editor
    void editorPane.setArtwork(artworkName);
  } catch (e) {
    console.error('Failed to load artwork:', e);
    showLoadError(path);
  }
}

/**
 * Handle artwork selection from the dropdown, guarding against losing
 * unsaved editor changes.
 */
async function handleSelectArtwork(path: string) {
  if (
    getArtworkName(path) !== currentArtworkName &&
    !editorPane.confirmDiscard()
  ) {
    // Restore the dropdown to the current artwork
    renderArtworkSelector();
    return;
  }
  await selectArtwork(path);
}

/**
 * Handle creating a new artwork via the wizard dialog.
 */
async function handleNewArtwork() {
  // Creating navigates away from the current artwork
  if (!editorPane.confirmDiscard()) return;

  const existingNames = getAvailableArtworks().map((a) => a.name);
  const result = await openNewArtworkDialog(existingNames);
  if (!result) return;

  // The new file invalidates artwork-loader's import.meta.glob; the HMR
  // update re-runs main.ts and init() picks the artwork from the hash.
  cancelPendingUrlUpdate();
  updateUrl(`#artwork=${encodeURIComponent(result.name)}`);

  // If the glob update never arrives, fall back to a full reload.
  const timer = window.setTimeout(() => window.location.reload(), 1500);
  window.__drawAgentPendingCreate = { name: result.name, timer };
}

/**
 * Show an error state with recovery options when artwork loading fails.
 */
function showLoadError(failedPath: string) {
  const failedName = getArtworkName(failedPath);
  const artworks = getAvailableArtworks().filter((a) => a.path !== failedPath);

  // Build error UI
  const errorContainer = document.createElement('div');
  errorContainer.className = 'error-container';

  const errorMsg = document.createElement('p');
  errorMsg.className = 'error';
  errorMsg.textContent = `Failed to load artwork "${failedName}"`;
  errorContainer.appendChild(errorMsg);

  const errorDetail = document.createElement('p');
  errorDetail.className = 'error-detail';
  errorDetail.textContent = 'The file may have been moved or deleted.';
  errorContainer.appendChild(errorDetail);

  const actions = document.createElement('div');
  actions.className = 'error-actions';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload App';
  reloadBtn.addEventListener('click', () => window.location.reload());
  actions.appendChild(reloadBtn);

  // If other artworks exist, offer to load one
  if (artworks.length > 0) {
    const loadOtherBtn = document.createElement('button');
    loadOtherBtn.textContent = `Load "${artworks[0].name}"`;
    loadOtherBtn.addEventListener('click', () => {
      // Clear the failed artwork from URL and localStorage
      clearWorkingValues(failedName);
      clearWorkingCanvas(failedName);
      window.location.hash = '';
      selectArtwork(artworks[0].path);
    });
    actions.appendChild(loadOtherBtn);
  }

  errorContainer.appendChild(actions);
  previewEl.innerHTML = '';
  previewEl.appendChild(errorContainer);

  // Clear the control list and caption since we have no valid artwork
  controlListEl.innerHTML = '';
  canvasControlsEl.innerHTML = '';
  artworkCaptionEl.innerHTML = '';
}

/**
 * Handle value changes from controls.
 */
function handleValueChange(id: string, value: unknown) {
  currentValues = { ...currentValues, [id]: value };

  // Persist and update URL
  saveWorkingValues(currentArtworkName, currentValues);
  updateUrlFromState();

  // Update dirty state in place (don't re-render to preserve drag state)
  updateDirtyState(id);
  renderPreview();
}

/**
 * Update dirty state for a specific control row without re-rendering.
 */
function updateDirtyState(id: string) {
  const row = controlListEl.querySelector(`[data-control-id="${id}"]`);
  if (!row) return;

  const fileDefault = fileDefaults[id];
  const value = currentValues[id];
  const isDirty = fileDefault !== undefined && !deepEqual(value, fileDefault);

  row.classList.toggle('is-dirty', isDirty);

  // Update reset button tooltip
  const resetBtn = row.querySelector('.control-reset') as HTMLButtonElement | null;
  if (resetBtn) {
    resetBtn.title = `Reset to ${formatValue(fileDefault)}`;
  }
}

/**
 * Handle canvas changes.
 */
function handleCanvasChange(canvas: CanvasConfig) {
  currentCanvas = canvas;

  // Persist and update URL
  saveWorkingCanvas(currentArtworkName, currentCanvas);
  updateUrlFromState();

  // Re-render
  renderCanvasControls();
  renderPreview();
}

/**
 * Handle resetting canvas to file default.
 */
function handleCanvasReset() {
  currentCanvas = { ...fileCanvas };

  clearWorkingCanvas(currentArtworkName);
  updateUrlFromState();

  renderCanvasControls();
  renderPreview();
}

/**
 * Handle resetting a single control to file default.
 */
function handleResetControl(id: string) {
  currentValues = { ...currentValues, [id]: fileDefaults[id] };

  saveWorkingValues(currentArtworkName, currentValues);
  updateUrlFromState();

  renderControls();
  renderPreview();
}

/**
 * Handle resetting all controls and canvas to file defaults.
 */
function handleResetAll() {
  currentValues = { ...fileDefaults };
  currentCanvas = { ...fileCanvas };

  clearWorkingValues(currentArtworkName);
  clearWorkingCanvas(currentArtworkName);
  updateUrlFromState();

  renderCanvasControls();
  renderControls();
  renderPreview();
}

/**
 * Handle copying URL to clipboard.
 */
async function handleCopyUrl() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    copyUrlBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyUrlBtn.textContent = 'Copy URL';
    }, 2000);
  } catch (e) {
    console.error('Failed to copy URL:', e);
  }
}

/**
 * Handle exporting SVG for AxiDraw.
 */
async function handleExportSvg() {
  const svg = previewEl.querySelector('svg') as SVGSVGElement | null;
  if (!svg) {
    console.error('No SVG to export');
    return;
  }

  const result = await openExportDialog(currentArtworkName);
  if (!result) return;

  exportSVG(svg, currentCanvas, result.filename, result.options);

  // Visual feedback
  exportSvgBtn.textContent = 'Exported!';
  setTimeout(() => {
    exportSvgBtn.textContent = 'Export SVG';
  }, 2000);
}

/**
 * Options for the control dialog: offer write-to-file when the dev
 * server (and thus the /__art endpoint) is available.
 */
function controlDialogOptions() {
  return import.meta.env.DEV && currentArtworkName
    ? { fileTarget: currentArtworkName }
    : {};
}

/**
 * Write the current controls into the artwork file's controls block,
 * keeping draw()'s `const { ... } = values;` line in sync so the values
 * are immediately usable. Falls back to the clipboard if the block
 * can't be updated in place.
 */
async function syncControlsToFile() {
  const code = generateControlsCode(currentControls);
  const status = await editorPane.updateControlsBlock(code, currentControls);
  if (status === 'saved') return;

  try {
    await navigator.clipboard.writeText(code);
    alert(
      'Could not update the file automatically — the controls code was copied to your clipboard instead. Paste it over the controls block in your artwork file.'
    );
  } catch {
    alert(
      'Could not update the file automatically. Use the Export button to copy the controls code.'
    );
  }
}

/**
 * Handle adding a new control.
 */
async function handleAddControl() {
  const result = await openControlDialog(undefined, controlDialogOptions());
  if (!result || result.action !== 'create') return;

  // Check for duplicate ID
  if (currentControls.some((c) => c.id === result.control.id)) {
    alert(`A control with ID "${result.control.id}" already exists`);
    return;
  }

  // Add control
  currentControls = [...currentControls, result.control];
  currentValues = { ...currentValues, [result.control.id]: result.control.default };

  saveWorkingValues(currentArtworkName, currentValues);
  updateUrlFromState();
  renderControls();
  renderPreview();

  if (result.writeToFile) {
    await syncControlsToFile();
  }
}

/**
 * Handle editing a control (called when clicking on a control label).
 */
async function handleEditControl(controlId: string) {
  const control = currentControls.find((c) => c.id === controlId);
  if (!control) return;

  const result = await openControlDialog(control, controlDialogOptions());
  if (!result) return;

  if (result.action === 'delete') {
    // Remove control
    currentControls = currentControls.filter((c) => c.id !== controlId);
    const { [controlId]: _, ...restValues } = currentValues;
    currentValues = restValues;
  } else if (result.action === 'update') {
    // Update control
    currentControls = currentControls.map((c) =>
      c.id === controlId ? result.control : c
    );
    // Update value if default changed and current value equals old default
    const oldControl = control;
    if (currentValues[controlId] === oldControl.default) {
      currentValues = { ...currentValues, [controlId]: result.control.default };
    }
  }

  saveWorkingValues(currentArtworkName, currentValues);
  updateUrlFromState();
  renderControls();
  renderPreview();

  if (result.writeToFile) {
    await syncControlsToFile();
  }
}

/**
 * Handle drag-reordering of controls. The list DOM already reflects the
 * new order; update state and persist to the file per the user's
 * write-to-file preference.
 */
function handleReorderControls(orderedIds: string[]) {
  const byId = new Map(currentControls.map((c) => [c.id, c]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((c): c is ControlDefinition => c !== undefined);
  if (reordered.length !== currentControls.length) return;
  currentControls = reordered;

  if (import.meta.env.DEV && getWriteControlsToFilePreference()) {
    void syncControlsToFile();
  }
}

/**
 * Handle exporting controls to clipboard.
 */
async function handleExportControls() {
  const code = generateControlsCode(currentControls);
  try {
    await navigator.clipboard.writeText(code);
    exportControlsBtn.textContent = 'Copied!';
    setTimeout(() => {
      exportControlsBtn.textContent = 'Export';
    }, 2000);
  } catch (e) {
    console.error('Failed to copy controls:', e);
    // Fallback: show in alert
    alert('Controls code:\n\n' + code);
  }
}

/**
 * Handle browser back/forward.
 */
async function handlePopState() {
  if (!currentArtwork) return;

  const urlState = parseUrlState(getUrlHash(), currentArtwork.controls);

  if (urlState.artwork && urlState.artwork !== currentArtworkName) {
    await selectArtwork(getArtworkPath(urlState.artwork));
  } else {
    if (Object.keys(urlState.values).length > 0) {
      currentValues = { ...fileDefaults, ...urlState.values };
      saveWorkingValues(currentArtworkName, currentValues);
    }
    if (urlState.canvas) {
      currentCanvas = urlState.canvas;
      saveWorkingCanvas(currentArtworkName, currentCanvas);
    }
    renderCanvasControls();
    renderControls();
    renderPreview();
  }
}

/**
 * Update URL from current state.
 */
function updateUrlFromState() {
  if (!currentArtwork) return;
  const hash = encodeUrlState(
    currentArtworkName,
    currentValues,
    currentCanvas,
    currentArtwork.controls
  );
  debouncedUpdateUrl(hash);
}

/**
 * Render the artwork selector dropdown.
 */
function renderArtworkSelector() {
  const artworks = getAvailableArtworks();
  artworkSelectorEl.innerHTML = '';
  artworkSelectorEl.appendChild(
    createArtworkSelector(artworks, currentArtworkName, handleSelectArtwork)
  );
}

/**
 * Render the canvas size controls.
 */
function renderCanvasControls() {
  canvasControlsEl.innerHTML = '';
  canvasControlsEl.appendChild(
    createCanvasControls(
      currentCanvas,
      fileCanvas,
      handleCanvasChange,
      handleCanvasReset
    )
  );
}

/**
 * Render the control list.
 */
function renderControls() {
  if (!currentArtwork) return;

  controlListEl.innerHTML = '';
  controlListEl.appendChild(
    renderControlList(
      currentControls,
      currentValues,
      fileDefaults,
      handleValueChange,
      handleResetControl,
      handleEditControl,
      handleReorderControls
    )
  );
}

/**
 * Render the artwork caption (title and description).
 */
function renderCaption() {
  if (!currentArtwork) {
    artworkCaptionEl.innerHTML = '';
    return;
  }

  const { title, description } = currentArtwork.meta;
  artworkCaptionEl.innerHTML = '';

  const titleEl = document.createElement('p');
  titleEl.className = 'artwork-title';
  titleEl.textContent = title;
  artworkCaptionEl.appendChild(titleEl);

  if (description) {
    const descEl = document.createElement('p');
    descEl.className = 'artwork-description';
    descEl.textContent = description;
    artworkCaptionEl.appendChild(descEl);
  }
}

/**
 * Render the SVG preview.
 */
function renderPreview() {
  if (!currentArtwork) return;

  try {
    const svg = currentArtwork.draw(currentValues, currentCanvas);
    previewEl.innerHTML = '';
    previewEl.appendChild(svg);

    // Apply pixel dimensions for display scaling
    const pixels = canvasToPixels(currentCanvas);
    svg.style.width = `${pixels.width}px`;
    svg.style.height = `${pixels.height}px`;
  } catch (e) {
    console.error('Draw error:', e);
    previewEl.innerHTML = `<p class="error">Draw error: ${e}</p>`;
  }
}

// Start the app
init();
