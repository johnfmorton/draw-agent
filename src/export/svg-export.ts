/**
 * SVG export functionality for pen plotter output.
 */

import { extractPaths, optimizePaths, generateCleanSVG } from './axidraw-optimizer';
import type { CanvasConfig } from '../controls/schema';

export interface ExportOptions {
  optimize: boolean;
  reverseStrokes: boolean;
}

export interface ExportDialogResult {
  filename: string;
  options: ExportOptions;
}

/**
 * Open export dialog to customize filename and options.
 */
export function openExportDialog(
  defaultFilename: string
): Promise<ExportDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'control-dialog export-dialog';

    // Remove .svg extension if present for editing
    const baseName = defaultFilename.replace(/\.svg$/i, '');

    dialog.innerHTML = `
      <h2>Export SVG</h2>

      <div class="dialog-field">
        <label>Filename</label>
        <div class="filename-input-row">
          <input type="text" id="export-filename" value="${baseName}" placeholder="artwork-name">
          <span class="filename-ext">.svg</span>
        </div>
      </div>

      <div class="dialog-field">
        <label>Optimization</label>
        <div class="checkbox-field">
          <input type="checkbox" id="export-optimize" checked>
          <label for="export-optimize">Optimize path order for AxiDraw</label>
        </div>
        <div class="checkbox-field">
          <input type="checkbox" id="export-reverse" checked>
          <label for="export-reverse">Allow stroke direction reversal</label>
        </div>
      </div>

      <div class="dialog-actions">
        <div></div>
        <div class="dialog-actions-right">
          <button type="button" id="dialog-cancel" class="dialog-btn-secondary">Cancel</button>
          <button type="button" id="dialog-export" class="dialog-btn-primary">Export</button>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const filenameInput = dialog.querySelector('#export-filename') as HTMLInputElement;
    const optimizeCheckbox = dialog.querySelector('#export-optimize') as HTMLInputElement;
    const reverseCheckbox = dialog.querySelector('#export-reverse') as HTMLInputElement;

    // Focus and select filename
    filenameInput.focus();
    filenameInput.select();

    // Close handler
    const close = (result: ExportDialogResult | null) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    // Escape to close, Enter to export
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(null);
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter') {
        doExport();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Export handler
    const doExport = () => {
      const filename = filenameInput.value.trim();
      if (!filename) {
        filenameInput.focus();
        return;
      }

      close({
        filename: filename + '.svg',
        options: {
          optimize: optimizeCheckbox.checked,
          reverseStrokes: reverseCheckbox.checked,
        },
      });
    };

    // Button handlers
    dialog.querySelector('#dialog-cancel')!.addEventListener('click', () => close(null));
    dialog.querySelector('#dialog-export')!.addEventListener('click', doExport);
  });
}

/**
 * Export SVG with optional AxiDraw optimization.
 */
export function exportSVG(
  svgElement: SVGSVGElement,
  canvas: CanvasConfig,
  filename: string,
  options: ExportOptions
): void {
  let svgContent: string;

  if (options.optimize) {
    const paths = extractPaths(svgElement);

    if (paths.length === 0) {
      console.warn('No paths found in SVG to export');
      svgContent = cleanSVG(svgElement, canvas);
    } else {
      const optimized = optimizePaths(paths, {
        reverseStrokes: options.reverseStrokes,
      });
      svgContent = generateCleanSVG(optimized, canvas);
    }
  } else {
    svgContent = cleanSVG(svgElement, canvas);
  }

  downloadSVG(svgContent, filename);
}

/**
 * Clean SVG without optimization (remove browser display styles).
 */
function cleanSVG(svg: SVGSVGElement, canvas: CanvasConfig): string {
  // Clone the SVG
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Remove pixel-based inline styles added for browser preview
  clone.style.removeProperty('width');
  clone.style.removeProperty('height');

  // Ensure proper dimensions and namespace
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', `${canvas.width}${canvas.unit}`);
  clone.setAttribute('height', `${canvas.height}${canvas.unit}`);

  // Add XML declaration
  const serialized = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

/**
 * Trigger browser download of SVG content.
 */
function downloadSVG(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
