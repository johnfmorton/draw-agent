/**
 * Drag-to-resize behavior shared by the side panes (editor, controls).
 *
 * The resizer is a thin vertical gutter next to the pane; dragging it
 * sets an inline width on the pane, clamped to [minWidth, maxWidth()],
 * and the result persists in localStorage.
 */

export interface PaneResizerOptions {
  /** The pane whose width the gutter controls. */
  pane: HTMLElement;
  /** The gutter element the user drags. */
  resizer: HTMLElement;
  /** localStorage key the width persists under. */
  storageKey: string;
  minWidth: number;
  /** Width applied when nothing (valid) is stored. */
  defaultWidth: number;
  /** Live upper bound (typically a fraction of the window width). */
  maxWidth: () => number;
  /**
   * Which side of the pane the gutter sits on: 'right' for a pane on
   * the left of the layout (editor), 'left' for one on the right
   * (controls). Determines which drag direction grows the pane.
   */
  edge: 'left' | 'right';
}

export interface PaneResizer {
  /** Apply the stored (or default) width to the pane. */
  applyWidth(): void;
}

export function initPaneResizer(options: PaneResizerOptions): PaneResizer {
  const { pane, resizer, storageKey, minWidth, defaultWidth, maxWidth, edge } =
    options;
  const sign = edge === 'right' ? 1 : -1;

  function applyWidth(): void {
    const stored = Number(localStorage.getItem(storageKey));
    const width =
      Number.isFinite(stored) && stored >= minWidth ? stored : defaultWidth;
    pane.style.width = `${Math.min(width, maxWidth())}px`;
  }

  // Handlers are assigned (not added) so HMR re-runs stay idempotent
  resizer.onpointerdown = (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = pane.getBoundingClientRect().width;
    resizer.classList.add('is-dragging');

    resizer.onpointermove = (ev) => {
      const width = Math.max(
        minWidth,
        Math.min(maxWidth(), startWidth + sign * (ev.clientX - startX))
      );
      pane.style.width = `${width}px`;
    };
    resizer.onpointerup = (ev) => {
      resizer.classList.remove('is-dragging');
      resizer.onpointermove = null;
      resizer.onpointerup = null;
      resizer.releasePointerCapture(ev.pointerId);
      localStorage.setItem(
        storageKey,
        String(Math.round(pane.getBoundingClientRect().width))
      );
    };
  };

  return { applyWidth };
}
