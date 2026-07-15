import type {
  ControlSchema,
  ControlDefinition,
  Point2D,
  Rectangle,
  CanvasConfig,
  CanvasUnit,
} from '../controls/schema';

/**
 * URL state management.
 * Encodes/decodes control values and canvas to/from the URL hash.
 */

export interface UrlState {
  artwork: string | null;
  values: Record<string, unknown>;
  canvas: CanvasConfig | null;
}

/**
 * Parse URL hash into state object.
 */
export function parseUrlState(hash: string, schema: ControlSchema): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const artwork = params.get('artwork');
  const values: Record<string, unknown> = {};

  // Parse control values
  for (const control of schema) {
    const rawValue = params.get(control.id);
    if (rawValue !== null) {
      values[control.id] = parseValue(rawValue, control);
    }
  }

  // Parse canvas
  let canvas: CanvasConfig | null = null;
  const canvasWidth = params.get('cw');
  const canvasHeight = params.get('ch');
  const canvasUnit = params.get('cu');

  if (canvasWidth && canvasHeight && canvasUnit) {
    canvas = {
      width: parseFloat(canvasWidth),
      height: parseFloat(canvasHeight),
      unit: canvasUnit as CanvasUnit,
    };
  }

  return { artwork, values, canvas };
}

/**
 * Encode state into URL hash string.
 */
export function encodeUrlState(
  artwork: string,
  values: Record<string, unknown>,
  canvas: CanvasConfig,
  schema: ControlSchema
): string {
  const params = new URLSearchParams();
  params.set('artwork', artwork);

  // Encode canvas
  params.set('cw', String(canvas.width));
  params.set('ch', String(canvas.height));
  params.set('cu', canvas.unit);

  // Encode control values
  for (const control of schema) {
    const value = values[control.id];
    if (value !== undefined) {
      params.set(control.id, encodeValue(value, control));
    }
  }

  return '#' + params.toString();
}

/**
 * Update the URL hash without triggering a page reload.
 */
export function updateUrl(hash: string, replace = true): void {
  if (replace) {
    history.replaceState(null, '', hash);
  } else {
    history.pushState(null, '', hash);
  }
}

/**
 * Parse a string value based on control type.
 */
function parseValue(raw: string, control: ControlDefinition): unknown {
  switch (control.type) {
    case 'slider':
    case 'numeric':
    case 'seed':
      return parseFloat(raw);

    case 'toggle':
      return raw === 'true' || raw === '1';

    case 'dropdown':
      return raw;

    case 'point2d':
    case 'vector': {
      const [x, y] = raw.split(',').map(Number);
      return { x: x ?? 0, y: y ?? 0 };
    }

    case 'rectangle': {
      const [x, y, width, height] = raw.split(',').map(Number);
      return {
        x: x ?? 0,
        y: y ?? 0,
        width: width ?? 0,
        height: height ?? 0,
      };
    }

    default:
      return raw;
  }
}

/**
 * Encode a value to string based on control type.
 */
function encodeValue(value: unknown, control: ControlDefinition): string {
  switch (control.type) {
    case 'slider':
    case 'numeric':
    case 'seed':
      return String(value);

    case 'toggle':
      return value ? 'true' : 'false';

    case 'dropdown':
      return String(value);

    case 'point2d':
    case 'vector': {
      const p = value as Point2D;
      return `${p.x},${p.y}`;
    }

    case 'rectangle': {
      const r = value as Rectangle;
      return `${r.x},${r.y},${r.width},${r.height}`;
    }

    default:
      return String(value);
  }
}

/**
 * Get current URL hash.
 */
export function getUrlHash(): string {
  return window.location.hash;
}

/**
 * Debounced URL update to avoid excessive history entries.
 */
let urlUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedUpdateUrl(hash: string, delay = 300): void {
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
  }
  urlUpdateTimeout = setTimeout(() => {
    updateUrl(hash);
    urlUpdateTimeout = null;
  }, delay);
}

/**
 * Cancel a pending debounced update, so a hash set directly afterwards
 * isn't clobbered when the stale timeout fires.
 */
export function cancelPendingUrlUpdate(): void {
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
    urlUpdateTimeout = null;
  }
}
