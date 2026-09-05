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
import {
  renderControlList,
  createArtworkSelector,
  type ReorderedControl,
} from './controls/control-list';
import { createCanvasControls } from './controls/canvas-controls';
import {
  openControlDialog,
  openGroupNameDialog,
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
  loadCollapsedGroups,
  saveCollapsedGroups,
} from './sync/local-storage';
import {
  buildExportSvg,
  exportSVG,
  openExportDialog,
} from './export/svg-export';
import { openPlotDialog } from './plot/plot-dialog';
import {
  installConsoleCapture,
  initConsolePanel,
} from './console/console-panel';
import { initEditorPane } from './editor/editor-pane';
import { initPaneResizer } from './pane-resize';

// Capture console output before anything else logs
installConsoleCapture();

declare global {
  interface Window {
    /** Set after the wizard creates a file, until the HMR re-run lands. */
    __drawAgentPendingCreate?: { name: string; timer: number };
    /** Preview refit observer; replaced on each HMR re-run of main.ts. */
    __drawAgentPreviewObserver?: ResizeObserver;
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
// Groups created via the 📁 button that have no member controls yet.
// Session-only: a group becomes real (and file-persistable) once a
// control is dragged in; an empty one vanishes on reload.
let pendingGroups: string[] = [];

// DOM elements
const previewEl = document.getElementById('preview')!;
const previewPaneEl = document.getElementById('preview-pane')!;
const artworkCaptionEl = document.getElementById('artwork-caption')!;
const controlListEl = document.getElementById('control-list')!;
const artworkSelectorEl = document.getElementById('artwork-selector')!;
const headerActionsEl = document.getElementById('header-actions')!;
const resetBtn = document.getElementById('reset-btn')!;
const copyUrlBtn = document.getElementById('copy-url-btn')!;
const exportSvgBtn = document.getElementById('export-svg-btn')!;
const plotBtn = document.getElementById('plot-btn')!;
const addControlBtn = document.getElementById('add-control-btn')!;
const addGroupBtn = document.getElementById('add-group-btn')!;
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

// Control pane width: draggable via the gutter, like the editor pane
initPaneResizer({
  pane: document.getElementById('control-pane')!,
  resizer: document.getElementById('control-resizer')!,
  storageKey: 'draw-agent:controls-width',
  minWidth: 320,
  defaultWidth: 360,
  maxWidth: () => Math.round(window.innerWidth * 0.7),
  edge: 'left',
}).applyWidth();

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
  plotBtn.onclick = handlePlot;
  addControlBtn.onclick = handleAddControl;
  addGroupBtn.onclick = handleNewGroup;
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
    pendingGroups = [];

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

  // Keep the enclosing group's dirty indicator in sync
  const section = row.closest('.control-group');
  if (section) {
    section.classList.toggle(
      'has-dirty',
      section.querySelector('.control-row.is-dirty') !== null
    );
  }
}

/**
 * Persist a control group's collapsed/expanded state for this artwork.
 */
function handleGroupToggle(group: string, collapsed: boolean) {
  const set = new Set(loadCollapsedGroups(currentArtworkName));
  if (collapsed) {
    set.add(group);
  } else {
    set.delete(group);
  }
  saveCollapsedGroups(currentArtworkName, [...set]);
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
 * Handle sending the artwork to the CursivePlotter queue. The SVG is
 * built from the live preview at send time, exactly as an export would
 * be, so lettering that arrived after the initial draw is included and
 * the string never lives in app state.
 */
async function handlePlot() {
  if (!previewEl.querySelector('svg')) {
    console.error('No SVG to plot');
    return;
  }

  await openPlotDialog({
    artworkTitle: currentArtwork?.meta.title ?? currentArtworkName,
    canvas: currentCanvas,
    defaultLabel: currentArtworkName,
    buildSvg: (options) => {
      const svg = previewEl.querySelector('svg') as SVGSVGElement | null;
      if (!svg) throw new Error('The preview is empty — nothing to send');
      return buildExportSvg(svg, currentCanvas, options);
    },
    onQueued: () => {
      plotBtn.textContent = 'Queued!';
      setTimeout(() => {
        plotBtn.textContent = 'Plot';
      }, 2000);
    },
  });
}

/**
 * Options for the control dialog: offer write-to-file when the dev
 * server (and thus the /__art endpoint) is available.
 */
function controlDialogOptions() {
  const existingGroups = [
    ...new Set(
      currentControls
        .map((c) => c.group)
        .filter((g): g is string => g !== undefined)
    ),
  ];
  return import.meta.env.DEV && currentArtworkName
    ? { fileTarget: currentArtworkName, existingGroups }
    : { existingGroups };
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
 * Handle the 📁 button: create an empty group section, ready to have
 * controls dragged into it.
 */
async function handleNewGroup() {
  const existing = [
    ...new Set([
      ...currentControls
        .map((c) => c.group)
        .filter((g): g is string => g !== undefined),
      ...pendingGroups,
    ]),
  ];
  const name = await openGroupNameDialog(existing);
  if (!name) return;

  pendingGroups = [...pendingGroups, name];
  renderControls();
}

/**
 * Remove an empty group (its × button; only rendered when memberless).
 */
function handleRemoveGroup(name: string) {
  pendingGroups = pendingGroups.filter((g) => g !== name);
  saveCollapsedGroups(
    currentArtworkName,
    loadCollapsedGroups(currentArtworkName).filter((g) => g !== name)
  );
  renderControls();
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
 * new order; update state (including group membership when a row was
 * dropped into a different section), re-render so group counts and
 * emptied sections stay accurate, and persist to the file per the
 * user's write-to-file preference.
 */
function handleReorderControls(order: ReorderedControl[]) {
  const byId = new Map(currentControls.map((c) => [c.id, c]));
  const reordered: ControlDefinition[] = [];
  for (const { id, group } of order) {
    const control = byId.get(id);
    if (!control) continue;
    if ((control.group ?? null) === group) {
      reordered.push(control);
    } else {
      const updated = { ...control };
      if (group === null) {
        delete updated.group;
      } else {
        updated.group = group;
      }
      reordered.push(updated);
    }
  }
  if (reordered.length !== currentControls.length) return;

  // Group bookkeeping: a pending folder that gained its first member
  // is now defined by control membership; a group whose last member
  // was dragged out lives on as an empty folder instead of vanishing.
  const hadMembers = new Set(
    currentControls.map((c) => c.group).filter((g): g is string => g !== undefined)
  );
  currentControls = reordered;
  const hasMembers = new Set(
    currentControls.map((c) => c.group).filter((g): g is string => g !== undefined)
  );
  pendingGroups = [
    ...pendingGroups.filter((g) => !hasMembers.has(g)),
    ...[...hadMembers].filter((g) => !hasMembers.has(g) && !pendingGroups.includes(g)),
  ];

  renderControls();

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
      {
        onEdit: handleEditControl,
        onReorder: handleReorderControls,
        collapsedGroups: new Set(loadCollapsedGroups(currentArtworkName)),
        onGroupToggle: handleGroupToggle,
        emptyGroups: pendingGroups,
        onRemoveGroup: handleRemoveGroup,
      }
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

    previewSvgEl = svg;
    fitPreviewSvg();
  } catch (e) {
    console.error('Draw error:', e);
    previewSvgEl = null;
    previewEl.innerHTML = `<p class="error">Draw error: ${e}</p>`;
  }
}

/** The svg currently in the preview, for refitting on pane resize. */
let previewSvgEl: SVGElement | null = null;

/**
 * Size the preview svg to fit the pane at the canvas's aspect ratio.
 * CSS max-width/max-height clamp each axis independently, which distorts
 * the element box and letterboxes the drawing inside it — worst on tall
 * canvases, where the top of the artwork (calibration marks included)
 * ended up hidden behind the header.
 */
function fitPreviewSvg() {
  if (!previewSvgEl) return;

  const pixels = canvasToPixels(currentCanvas);
  const paneStyle = getComputedStyle(previewPaneEl);
  const availWidth =
    previewPaneEl.clientWidth -
    parseFloat(paneStyle.paddingLeft) -
    parseFloat(paneStyle.paddingRight);
  const captionHeight = artworkCaptionEl.offsetHeight;
  const availHeight =
    previewPaneEl.clientHeight -
    parseFloat(paneStyle.paddingTop) -
    parseFloat(paneStyle.paddingBottom) -
    (captionHeight > 0 ? captionHeight + 12 : 0); // 12 = wrapper gap

  // Scale down to fit; never scale up past actual size
  const scale = Math.min(
    availWidth / pixels.width,
    availHeight / pixels.height,
    1
  );
  previewSvgEl.style.width = `${pixels.width * scale}px`;
  previewSvgEl.style.height = `${pixels.height * scale}px`;
}

// Refit when the pane resizes (window resize, editor/console toggling).
// main.ts re-executes on HMR, so replace any observer from a prior run.
window.__drawAgentPreviewObserver?.disconnect();
window.__drawAgentPreviewObserver = new ResizeObserver(fitPreviewSvg);
window.__drawAgentPreviewObserver.observe(previewPaneEl);

// Start the app
init();
