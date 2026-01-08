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
  type CanvasConfig,
  DEFAULT_CANVAS,
  canvasToPixels,
} from './controls/schema';
import { renderControlList, createArtworkSelector } from './controls/control-list';
import { createCanvasControls } from './controls/canvas-controls';
import { openControlDialog, generateControlsCode } from './controls/control-dialog';
import type { ControlDefinition } from './controls/schema';
import {
  parseUrlState,
  encodeUrlState,
  getUrlHash,
  debouncedUpdateUrl,
} from './sync/url-state';
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
const controlListEl = document.getElementById('control-list')!;
const artworkSelectorEl = document.getElementById('artwork-selector')!;
const headerActionsEl = document.getElementById('header-actions')!;
const resetBtn = document.getElementById('reset-btn')!;
const copyUrlBtn = document.getElementById('copy-url-btn')!;
const addControlBtn = document.getElementById('add-control-btn')!;
const exportControlsBtn = document.getElementById('export-controls-btn')!;

// Canvas controls container (inserted before header actions)
const canvasControlsEl = document.createElement('div');
canvasControlsEl.id = 'canvas-controls-container';
headerActionsEl.parentElement!.insertBefore(canvasControlsEl, headerActionsEl);

/**
 * Initialize the app.
 */
async function init() {
  const artworks = getAvailableArtworks();

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

  // Set up event listeners
  resetBtn.addEventListener('click', handleResetAll);
  copyUrlBtn.addEventListener('click', handleCopyUrl);
  addControlBtn.addEventListener('click', handleAddControl);
  exportControlsBtn.addEventListener('click', handleExportControls);

  // Listen for URL changes (back/forward)
  window.addEventListener('popstate', handlePopState);

  // Set up HMR
  if (import.meta.hot) {
    import.meta.hot.accept();
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
    renderPreview();
  } catch (e) {
    console.error('Failed to load artwork:', e);
    previewEl.innerHTML = `<p class="error">Failed to load artwork: ${e}</p>`;
  }
}

/**
 * Handle value changes from controls.
 */
function handleValueChange(id: string, value: unknown) {
  currentValues = { ...currentValues, [id]: value };

  // Persist and update URL
  saveWorkingValues(currentArtworkName, currentValues);
  updateUrlFromState();

  // Re-render
  renderControls();
  renderPreview();
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
 * Handle adding a new control.
 */
async function handleAddControl() {
  const result = await openControlDialog();
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
}

/**
 * Handle editing a control (called when clicking on a control label).
 */
async function handleEditControl(controlId: string) {
  const control = currentControls.find((c) => c.id === controlId);
  if (!control) return;

  const result = await openControlDialog(control);
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
    createArtworkSelector(artworks, currentArtworkName, selectArtwork)
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
      handleEditControl
    )
  );
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
