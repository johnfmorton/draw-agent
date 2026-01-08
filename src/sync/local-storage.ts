import type { CanvasConfig } from '../controls/schema';

/**
 * Local storage management for working values and canvas.
 * Persists state across page refreshes.
 */

const STORAGE_PREFIX = 'draw-agent:';

/**
 * Get the storage key for an artwork's values.
 */
function getValuesKey(artworkName: string): string {
  return `${STORAGE_PREFIX}values:${artworkName}`;
}

/**
 * Get the storage key for an artwork's canvas.
 */
function getCanvasKey(artworkName: string): string {
  return `${STORAGE_PREFIX}canvas:${artworkName}`;
}

/**
 * Load working values from localStorage.
 */
export function loadWorkingValues(
  artworkName: string
): Record<string, unknown> | null {
  try {
    const stored = localStorage.getItem(getValuesKey(artworkName));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load values from localStorage:', e);
  }
  return null;
}

/**
 * Save working values to localStorage.
 */
export function saveWorkingValues(
  artworkName: string,
  values: Record<string, unknown>
): void {
  try {
    localStorage.setItem(getValuesKey(artworkName), JSON.stringify(values));
  } catch (e) {
    console.warn('Failed to save values to localStorage:', e);
  }
}

/**
 * Clear working values from localStorage.
 */
export function clearWorkingValues(artworkName: string): void {
  try {
    localStorage.removeItem(getValuesKey(artworkName));
  } catch (e) {
    console.warn('Failed to clear values from localStorage:', e);
  }
}

/**
 * Load working canvas from localStorage.
 */
export function loadWorkingCanvas(artworkName: string): CanvasConfig | null {
  try {
    const stored = localStorage.getItem(getCanvasKey(artworkName));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load canvas from localStorage:', e);
  }
  return null;
}

/**
 * Save working canvas to localStorage.
 */
export function saveWorkingCanvas(
  artworkName: string,
  canvas: CanvasConfig
): void {
  try {
    localStorage.setItem(getCanvasKey(artworkName), JSON.stringify(canvas));
  } catch (e) {
    console.warn('Failed to save canvas to localStorage:', e);
  }
}

/**
 * Clear working canvas from localStorage.
 */
export function clearWorkingCanvas(artworkName: string): void {
  try {
    localStorage.removeItem(getCanvasKey(artworkName));
  } catch (e) {
    console.warn('Failed to clear canvas from localStorage:', e);
  }
}

/**
 * Get the last selected artwork name.
 */
export function getLastArtwork(): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}lastArtwork`);
  } catch {
    return null;
  }
}

/**
 * Save the last selected artwork name.
 */
export function setLastArtwork(artworkName: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}lastArtwork`, artworkName);
  } catch {
    // Ignore
  }
}
